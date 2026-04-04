import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
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
LLM_MODEL = "llama3-70b-8192"
SYSTEM_PROMPT = (
    "You are KoskiPlex, a fast voice assistant. "
    "Always respond in 1-2 short sentences. Be direct and concise. "
    "Never use lists, markdown, or formatting — you are being read aloud."
)
MAX_HISTORY = 20


class ChatRequest(BaseModel):
    text: str
    history: list[dict] = []


async def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    transcription = client.audio.transcriptions.create(
        model=STT_MODEL,
        file=(filename, audio_bytes),
    )
    return transcription.text


def get_llm_reply(user_text: str, history: list[dict]) -> str:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-MAX_HISTORY:])
    messages.append({"role": "user", "content": user_text})

    completion = client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
    )
    return completion.choices[0].message.content


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    text = await transcribe_audio(audio_bytes, file.filename)
    return {"text": text}


@app.post("/chat")
async def chat(req: ChatRequest):
    reply = get_llm_reply(req.text, req.history)
    return {"reply": reply}


@app.post("/voice")
async def voice(
    file: UploadFile = File(...),
    history: str = Form("[]"),
):
    audio_bytes = await file.read()
    parsed_history = json.loads(history)

    transcript = await transcribe_audio(audio_bytes, file.filename)
    reply = get_llm_reply(transcript, parsed_history)

    return {"transcript": transcript, "reply": reply}


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
