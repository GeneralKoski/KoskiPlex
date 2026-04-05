import time
from groq import Groq
from config import STT_MODEL, LLM_MODEL, SYSTEM_PROMPT, MAX_HISTORY

client = Groq()

async def transcribe_audio(audio_bytes: bytes, filename: str) -> dict:
    """Transcribe audio using Groq Whisper."""
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
    """Get a simple non-streaming LLM reply."""
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
    """Stream an LLM reply for low-latency responses."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-MAX_HISTORY:])
    messages.append({"role": "user", "content": user_text})

    return client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
        stream=True,
    )
