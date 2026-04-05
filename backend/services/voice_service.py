import asyncio
import os
import time
import uuid
import tempfile
import traceback
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
    """Synchronous XTTS generation with robust error handling and logging."""
    wav_path = None
    try:
        model = get_xtts()
        if not model:
            print("❌ [XTTS] Model not loaded, cannot generate audio.")
            return b""

        # Use a temporary file that works across all OS (including macOS)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            wav_path = tmp_file.name

        print(f"🎙️ [XTTS] Generating audio for: '{text[:50]}...' using {speaker_wav}")

        model.tts_to_file(
            text=text,
            speaker_wav=speaker_wav,
            language=language[:2] if language else "en",
            file_path=wav_path,
        )

        if not os.path.exists(wav_path):
            print(f"❌ [XTTS] Output file was NOT created at {wav_path}")
            return b""

        with open(wav_path, "rb") as f:
            data = f.read()

        print(f"✅ [XTTS] Generation successful ({len(data)} bytes)")
        return data

    except Exception as e:
        print(f"🔥 [XTTS] CRITICAL ERROR during generation: {e}")
        traceback.print_exc()
        return b""
    finally:
        # Cleanup
        if wav_path and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except:
                pass

async def generate_audio(text: str, engine: str, voice: str, language: str) -> bytes:
    """Entry point for audio generation across multiple engines with intelligent fallback."""
    lang_iso = str(language)[:2] if language else "it"
    print(f"📡 [Audio] Request: engine={engine}, voice={voice}, lang_iso={lang_iso}")

    if engine == "xtts":
        model = get_xtts()
        if not model:
            print(f"⚠️ [XTTS] Model not available. Falling back to Edge-TTS ({lang_iso}).")
            return await tts_edge(text, EDGE_VOICES.get(lang_iso, DEFAULT_EDGE_VOICE))

        voice_path = None
        for ext in [".wav", ".mp3", ".webm", ".m4a"]:
            p = VOICES_DIR / f"{voice}{ext}"
            if p.exists():
                voice_path = p
                break

        if not voice_path:
            print(f"⚠️ [XTTS] Reference '{voice}' not found. Falling back to Edge-TTS ({lang_iso}).")
            return await tts_edge(text, EDGE_VOICES.get(lang_iso, DEFAULT_EDGE_VOICE))

        print(f"🎯 [XTTS] Attempting generation for: {voice}")
        audio = await asyncio.to_thread(tts_xtts_sync, text, str(voice_path), lang_iso)
        
        if not audio:
            print(f"⚠️ [XTTS] Generation failed. Final fallback to Edge-TTS ({lang_iso}).")
            return await tts_edge(text, EDGE_VOICES.get(lang_iso, DEFAULT_EDGE_VOICE))
            
        return audio
    else:
        # Standard engine: use provided voice ID or lookup by ISO code
        edge_voice = voice if (voice and "-" in str(voice)) else EDGE_VOICES.get(lang_iso, DEFAULT_EDGE_VOICE)
        return await tts_edge(text, edge_voice)
