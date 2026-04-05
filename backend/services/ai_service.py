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

def generate_practice_phrase(lang: str = "it", n_chars: int = 300) -> str:
    """Generate a linguistically beautiful, evocative, and challenging sentence in the requested language for practice."""
    lang_map = {
        "it": "italiana",
        "en": "inglese",
        "es": "spagnola",
        "fr": "francese",
        "de": "tedesca",
        "pt": "portoghese",
        "nl": "olandese",
        "ru": "russa",
        "ja": "giapponese",
        "zh": "cinese",
        "ko": "coreana",
        "ar": "araba",
        "hi": "hindi",
        "tr": "turca",
        "pl": "polacca",
        "sv": "svedese"
    }
    target_lang = lang_map.get(lang, "italiana")

    prompt = (
        f"Genera una singola frase in lingua {target_lang} che sia un capolavoro di musicalità, eleganza e profondità poetica, "
        f"ideale per chi vuole perfezionare la propria dizione in questa lingua. "
        f"La frase deve essere lunga circa {n_chars} caratteri. "
        f"Cerca di tessere una prosa che includa suoni caratteristici e complessi di questa lingua. "
        f"Non creare uno scioglilingua meccanico, ma un pensiero evocativo, quasi letterario, "
        f"che sia un piacere sia per l'orecchio che per la mente. "
        f"Rispondi SOLO con il testo della frase, senza commenti, introduzioni o virgolette."
    )
    completion = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return completion.choices[0].message.content.strip()
