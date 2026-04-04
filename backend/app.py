import asyncio
import base64
import io
import json
import time
import os
from pathlib import Path

import edge_tts
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

VOICES_DIR = Path(__file__).parent / "voices"
VOICES_DIR.mkdir(exist_ok=True)

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

EDGE_VOICES = {
    "italian": "it-IT-IsabellaNeural",
    "english": "en-US-JennyNeural",
    "spanish": "es-ES-ElviraNeural",
    "french": "fr-FR-DeniseNeural",
    "german": "de-DE-KatjaNeural",
    "portuguese": "pt-BR-FranciscaNeural",
    "dutch": "nl-NL-ColetteNeural",
    "russian": "ru-RU-SvetlanaNeural",
    "japanese": "ja-JP-NanamiNeural",
    "chinese": "zh-CN-XiaoxiaoNeural",
    "korean": "ko-KR-SunHiNeural",
    "arabic": "ar-SA-ZariyahNeural",
    "hindi": "hi-IN-SwaraNeural",
    "turkish": "tr-TR-EmelNeural",
    "polish": "pl-PL-AgnieszkaNeural",
    "swedish": "sv-SE-SofieNeural",
}
DEFAULT_EDGE_VOICE = "en-US-JennyNeural"

xtts_model = None


def get_xtts():
    global xtts_model
    if xtts_model is None:
        from TTS.api import TTS as CoquiTTS
        xtts_model = CoquiTTS("tts_models/multilingual/multi-dataset/xtts_v2")
    return xtts_model


class ChatRequest(BaseModel):
    text: str
    history: list[dict] = []


# ── TTS engines ──────────────────────────────────

async def tts_edge(text: str, voice: str = DEFAULT_EDGE_VOICE) -> bytes:
    communicate = edge_tts.Communicate(text, voice)
    audio = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    return audio


def tts_xtts_sync(text: str, speaker_wav: str, language: str = "en") -> bytes:
    model = get_xtts()
    wav_path = "/tmp/koskiplex_tts_out.wav"
    model.tts_to_file(
        text=text,
        speaker_wav=speaker_wav,
        language=language,
        file_path=wav_path,
    )
    with open(wav_path, "rb") as f:
        return f.read()


async def generate_audio(text: str, engine: str, voice: str, language: str) -> bytes:
    if engine == "xtts":
        voice_path = VOICES_DIR / f"{voice}.wav"
        if not voice_path.exists():
            return b""
        lang_code = language[:2] if language else "en"
        return await asyncio.to_thread(tts_xtts_sync, text, str(voice_path), lang_code)
    else:
        edge_voice = voice or EDGE_VOICES.get(language, DEFAULT_EDGE_VOICE)
        return await tts_edge(text, edge_voice)


# ── STT + LLM ───────────────────────────────────

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


# ── Voice management endpoints ───────────────────

@app.get("/voices")
async def list_voices():
    custom = []
    for f in VOICES_DIR.glob("*.wav"):
        custom.append({"name": f.stem, "engine": "xtts"})

    default = []
    for lang, voice_id in EDGE_VOICES.items():
        default.append({"name": voice_id, "language": lang, "engine": "edge"})

    return {"default": default, "custom": custom}


@app.post("/voices/upload")
async def upload_voice(name: str = Form(...), file: UploadFile = File(...)):
    safe_name = "".join(c for c in name if c.isalnum() or c in "-_").strip()
    if not safe_name:
        return {"error": "Invalid name"}

    audio_bytes = await file.read()
    voice_path = VOICES_DIR / f"{safe_name}.wav"
    voice_path.write_bytes(audio_bytes)

    return {"name": safe_name, "engine": "xtts"}


@app.delete("/voices/{name}")
async def delete_voice(name: str):
    voice_path = VOICES_DIR / f"{name}.wav"
    if voice_path.exists():
        voice_path.unlink()
        return {"deleted": name}
    return {"error": "Not found"}


# ── WebSocket voice endpoint ──────────────────────

@app.websocket("/ws/voice")
async def ws_voice(ws: WebSocket):
    await ws.accept()
    history = []
    interrupted = False
    tts_engine = "edge"
    tts_voice = ""

    try:
        while True:
            msg = await ws.receive_json()

            if msg["type"] == "set_voice":
                tts_engine = msg.get("engine", "edge")
                tts_voice = msg.get("voice", "")
                continue

            if msg["type"] == "audio":
                interrupted = False
                audio_bytes = bytes.fromhex(msg["data"])
                ext = msg.get("ext", "webm")
                t_start = time.perf_counter()

                stt_result = await transcribe_audio(audio_bytes, f"recording.{ext}")

                if stt_result["text"].strip().lower() in WHISPER_HALLUCINATIONS:
                    await ws.send_json({"type": "reply_done", "full_reply": "", "language": stt_result["language"], "timing": {"stt_ms": stt_result["stt_ms"], "llm_first_token_ms": 0, "llm_total_ms": 0, "total_ms": stt_result["stt_ms"]}, "interrupted": False})
                    continue

                detected_lang = stt_result["language"]

                await ws.send_json({
                    "type": "transcript",
                    "text": stt_result["text"],
                    "language": detected_lang,
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
                        sentence_text = sentence_buffer.strip()
                        await ws.send_json({
                            "type": "reply_chunk",
                            "text": sentence_text,
                        })

                        try:
                            audio_data = await generate_audio(sentence_text, tts_engine, tts_voice, detected_lang)
                            if audio_data:
                                await ws.send_json({
                                    "type": "audio_chunk",
                                    "data": base64.b64encode(audio_data).decode(),
                                })
                        except Exception:
                            pass

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
                    sentence_text = sentence_buffer.strip()
                    await ws.send_json({
                        "type": "reply_chunk",
                        "text": sentence_text,
                    })
                    try:
                        audio_data = await generate_audio(sentence_text, tts_engine, tts_voice, detected_lang)
                        if audio_data:
                            await ws.send_json({
                                "type": "audio_chunk",
                                "data": base64.b64encode(audio_data).decode(),
                            })
                    except Exception:
                        pass

                total_ms = round((time.perf_counter() - t_start) * 1000)
                llm_ms = round((time.perf_counter() - t_llm_start) * 1000)

                await ws.send_json({
                    "type": "reply_done",
                    "full_reply": full_reply.strip(),
                    "language": detected_lang,
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
