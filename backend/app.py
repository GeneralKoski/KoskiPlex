import asyncio
import json
import time
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="KoskiPlex")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq()

STT_MODEL = "whisper-large-v3"
LLM_MODEL = "llama-3.3-70b-versatile"
SYSTEM_PROMPT = (
    "You are KoskiPlex, a fast voice assistant. "
    "Always respond in 1-2 short sentences. Be direct and concise. "
    "Never use lists, markdown, or formatting — you are being read aloud. "
    "Respond in the same language the user speaks to you."
)
MAX_HISTORY = 20
WHISPER_HALLUCINATIONS = {
    "thank you", "thanks", "thank you.", "thanks.", "thank you for watching",
    "thanks for watching", "thank you for watching.", "thanks for watching.",
    "like and subscribe", "subscribe", "bye", "bye.", "you",
    "the end", "the end.", "...", "", " ",
}



class ChatRequest(BaseModel):
    text: str
    history: list[dict] = []


async def transcribe_audio(audio_bytes: bytes, filename: str) -> dict:
    t0 = time.perf_counter()
    transcription = client.audio.transcriptions.create(
        model=STT_MODEL,
        file=(filename, audio_bytes),
        response_format="verbose_json",
    )
    stt_ms = round((time.perf_counter() - t0) * 1000)
    return {
        "text": transcription.text,
        "language": transcription.language,
        "stt_ms": stt_ms,
    }


def get_llm_reply(user_text: str, history: list[dict]) -> dict:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-MAX_HISTORY:])
    messages.append({"role": "user", "content": user_text})

    t0 = time.perf_counter()
    completion = client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
    )
    llm_ms = round((time.perf_counter() - t0) * 1000)
    return {"text": completion.choices[0].message.content, "llm_ms": llm_ms}


def stream_llm_reply(user_text: str, history: list[dict]):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-MAX_HISTORY:])
    messages.append({"role": "user", "content": user_text})

    return client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
        stream=True,
    )


# ── WebSocket voice endpoint ──────────────────────

@app.websocket("/ws/voice")
async def ws_voice(ws: WebSocket):
    await ws.accept()
    history = []
    interrupted = False

    try:
        while True:
            msg = await ws.receive_json()

            if msg["type"] == "audio":
                interrupted = False
                audio_bytes = bytes.fromhex(msg["data"])
                ext = msg.get("ext", "webm")
                t_start = time.perf_counter()

                stt_result = await transcribe_audio(audio_bytes, f"recording.{ext}")

                if stt_result["text"].strip().lower() in WHISPER_HALLUCINATIONS:
                    await ws.send_json({"type": "reply_done", "full_reply": "", "language": stt_result["language"], "timing": {"stt_ms": stt_result["stt_ms"], "llm_first_token_ms": 0, "llm_total_ms": 0, "total_ms": stt_result["stt_ms"]}, "interrupted": False})
                    continue

                await ws.send_json({
                    "type": "transcript",
                    "text": stt_result["text"],
                    "language": stt_result["language"],
                    "stt_ms": stt_result["stt_ms"],
                })

                stream = stream_llm_reply(stt_result["text"], history)
                full_reply = ""
                sentence_buffer = ""
                first_token_ms = None
                t_llm_start = time.perf_counter()

                for chunk in stream:
                    if interrupted:
                        stream.close()
                        break

                    token = chunk.choices[0].delta.content or ""
                    if not token:
                        continue

                    if first_token_ms is None:
                        first_token_ms = round((time.perf_counter() - t_llm_start) * 1000)

                    full_reply += token
                    sentence_buffer += token

                    if any(sentence_buffer.rstrip().endswith(p) for p in ['.', '!', '?', '。', '！', '？']):
                        await ws.send_json({
                            "type": "reply_chunk",
                            "text": sentence_buffer.strip(),
                        })
                        sentence_buffer = ""

                    try:
                        raw = await asyncio.wait_for(ws.receive_text(), timeout=0.001)
                        peek = json.loads(raw)
                        if peek.get("type") == "interrupt":
                            interrupted = True
                            stream.close()
                            break
                    except (asyncio.TimeoutError, Exception):
                        pass

                if sentence_buffer.strip() and not interrupted:
                    await ws.send_json({
                        "type": "reply_chunk",
                        "text": sentence_buffer.strip(),
                    })

                total_ms = round((time.perf_counter() - t_start) * 1000)
                llm_ms = round((time.perf_counter() - t_llm_start) * 1000)

                await ws.send_json({
                    "type": "reply_done",
                    "full_reply": full_reply.strip(),
                    "language": stt_result["language"],
                    "timing": {
                        "stt_ms": stt_result["stt_ms"],
                        "llm_first_token_ms": first_token_ms or 0,
                        "llm_total_ms": llm_ms,
                        "total_ms": total_ms,
                    },
                    "interrupted": interrupted,
                })

                if not interrupted:
                    history.append({"role": "user", "content": stt_result["text"]})
                    history.append({"role": "assistant", "content": full_reply.strip()})
                    if len(history) > MAX_HISTORY:
                        history = history[-MAX_HISTORY:]

            elif msg["type"] == "interrupt":
                interrupted = True

            elif msg["type"] == "clear":
                history = []

    except WebSocketDisconnect:
        pass


# ── HTTP endpoints (kept for compatibility) ───────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    result = await transcribe_audio(audio_bytes, file.filename)
    return result


@app.post("/chat")
async def chat(req: ChatRequest):
    result = get_llm_reply(req.text, req.history)
    return {"reply": result["text"], "llm_ms": result["llm_ms"]}


@app.post("/voice")
async def voice(
    file: UploadFile = File(...),
    history: str = Form("[]"),
):
    audio_bytes = await file.read()
    parsed_history = json.loads(history)

    stt_result = await transcribe_audio(audio_bytes, file.filename)
    llm_result = get_llm_reply(stt_result["text"], parsed_history)

    return {
        "transcript": stt_result["text"],
        "reply": llm_result["text"],
        "language": stt_result["language"],
        "timing": {
            "stt_ms": stt_result["stt_ms"],
            "llm_ms": llm_result["llm_ms"],
        },
    }


# ============================================================
# TTS OPTIONS (uncomment one to enable server-side TTS)
# ============================================================

# --- Option A: Local TTS with pyttsx3 ---
# import pyttsx3
# engine = pyttsx3.init()
#
# @app.post("/speak")
# async def speak(text: str = Form(...)):
#     engine.say(text)
#     engine.runAndWait()
#     return {"status": "spoken"}

# --- Option B: Cloud TTS skeleton (ElevenLabs) ---
# import httpx
#
# ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
# ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel
#
# @app.post("/tts")
# async def tts(text: str = Form(...)):
#     async with httpx.AsyncClient() as http:
#         resp = await http.post(
#             f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
#             headers={"xi-api-key": ELEVENLABS_API_KEY},
#             json={"text": text, "model_id": "eleven_turbo_v2"},
#         )
#     from fastapi.responses import Response
#     return Response(content=resp.content, media_type="audio/mpeg")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
