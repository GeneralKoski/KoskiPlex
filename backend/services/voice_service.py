import asyncio
import time
from pathlib import Path
import edge_tts
from config import VOICES_DIR, DEFAULT_EDGE_VOICE, EDGE_VOICES

xtts_model = None

def get_xtts():
    """Lazily load the XTTS model."""
    global xtts_model
    if xtts_model is None:
        start_t = time.time()
        print("🚀 [XTTS] Loading model tts_models/multilingual/multi-dataset/xtts_v2...")
        try:
            from TTS.api import TTS as CoquiTTS
            xtts_model = CoquiTTS("tts_models/multilingual/multi-dataset/xtts_v2")
            elapsed = time.time() - start_t
            print(f"✅ [XTTS] Model loaded successfully in {elapsed:.2f}s.")
        except ImportError as e:
            print(f"⚠️  [XTTS] Module 'TTS' or its dependencies not found: {e}")
            print("   Hint: Try installing: pip install bangla==0.0.2 gruut")
        except Exception as e:
            print(f"❌ [XTTS] Error loading model: {e}")
    return xtts_model

async def tts_edge(text: str, voice: str = DEFAULT_EDGE_VOICE) -> bytes:
    """Generate audio using Edge TTS."""
    communicate = edge_tts.Communicate(text, voice)
    audio = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    return audio

def tts_xtts_sync(text: str, speaker_wav: str, language: str = "en") -> bytes:
    """Synchronous XTTS generation, should be run in a thread."""
    model = get_xtts()
    if not model:
        return b""

    import uuid
    unique_id = uuid.uuid4().hex
    wav_path = f"/tmp/koskiplex_tts_{unique_id}.wav"

    try:
        model.tts_to_file(
            text=text,
            speaker_wav=speaker_wav,
            language=language,
            file_path=wav_path,
        )
        with open(wav_path, "rb") as f:
            data = f.read()
        return data
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)

async def generate_audio(text: str, engine: str, voice: str, language: str) -> bytes:
    """Entry point for audio generation across multiple engines."""
    if engine == "xtts":
        # Search for any file with this stem and a common audio extension
        voice_path = None
        for ext in [".wav", ".mp3", ".webm", ".m4a"]:
            p = VOICES_DIR / f"{voice}{ext}"
            if p.exists():
                voice_path = p
                break

        if not voice_path:
            return b""
        lang_code = language[:2] if language else "en"
        return await asyncio.to_thread(tts_xtts_sync, text, str(voice_path), lang_code)
    else:
        edge_voice = voice or EDGE_VOICES.get(language, DEFAULT_EDGE_VOICE)
        return await tts_edge(text, edge_voice)
