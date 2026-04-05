import asyncio
import os
import re
import subprocess
import time
import uuid
import tempfile
import traceback
from pathlib import Path
import edge_tts
from config import VOICES_DIR, DEFAULT_EDGE_VOICE, EDGE_VOICES

def split_text_into_segments(text: str):
    """Split text by strong punctuation (. ! ?) and group them into segments."""
    # Split by the punctuation marks but keep them using capture groups
    parts = re.split(r'([.!?])', text)
    segments = []
    
    current_segment = ""
    for part in parts:
        if not part: continue
        if part in ".!?":
            segments.append(current_segment.strip() + part)
            current_segment = ""
        else:
            current_segment += part
            
    if current_segment.strip():
        segments.append(current_segment.strip())
        
    return [s for s in segments if s.strip()]

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
    """Entry point for audio generation across multiple engines with intelligent pauses and fallback."""
    segments = split_text_into_segments(text)
    
    # If it's a single short sentence, keep original logic for efficiency
    if len(segments) <= 1:
        return await _generate_single_chunk(text, engine, voice, language)
    
    # Multi-segment generation with pauses
    print(f"📡 [Audio] Multi-segment Request ({len(segments)} parts): engine={engine}, voice={voice}")
    
    temp_files = []
    try:
        # 1. Create a silence file (0.5s)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as silence_tmp:
            silence_path = silence_tmp.name
            temp_files.append(silence_path)
            # Generate 0.5s of silence at 24kHz (standard for most TTS)
            subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.5", silence_path],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )

        # 2. Generate each segment and save to temp files
        segment_paths = []
        for i, seg in enumerate(segments):
            audio_data = await _generate_single_chunk(seg, engine, voice, language)
            if audio_data:
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as seg_tmp:
                    seg_tmp.write(audio_data)
                    segment_paths.append(seg_tmp.name)
                    temp_files.append(seg_tmp.name)
                
                # Add silence after every segment EXCEPT the last one
                if i < len(segments) - 1:
                    segment_paths.append(silence_path)
            
        if not segment_paths:
            return b""

        # 3. Concatenate all segments with ffmpeg
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as final_tmp:
            final_path = final_tmp.name
            temp_files.append(final_path)
            
            # Build ffmpeg concat command
            inputs = []
            for p in segment_paths:
                inputs.extend(["-i", p])
            
            filter_complex = "".join([f"[{i}:a]" for i in range(len(segment_paths))]) + f"concat=n={len(segment_paths)}:v=0:a=1[outa]"
            
            subprocess.run(
                ["ffmpeg", "-y", *inputs, "-filter_complex", filter_complex, "-map", "[outa]", final_path],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            
            with open(final_path, "rb") as f:
                return f.read()

    except Exception as e:
        print(f"❌ [Audio] Multi-segment generation failed: {e}")
        traceback.print_exc()
        # Direct fallback to single-pass if concatenation fails
        return await _generate_single_chunk(text, engine, voice, language)
    finally:
        for p in temp_files:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass

async def _generate_single_chunk(text: str, engine: str, voice: str, language: str) -> bytes:
    """Internal helper for single audio chunk generation."""
    lang_iso = str(language)[:2] if language else "it"
    
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
            return await tts_edge(text, EDGE_VOICES.get(lang_iso, DEFAULT_EDGE_VOICE))

        audio = await asyncio.to_thread(tts_xtts_sync, text, str(voice_path), lang_iso)
        if not audio:
            return await tts_edge(text, EDGE_VOICES.get(lang_iso, DEFAULT_EDGE_VOICE))
        return audio
    else:
        edge_voice = voice if (voice and "-" in str(voice)) else EDGE_VOICES.get(lang_iso, DEFAULT_EDGE_VOICE)
        return await tts_edge(text, edge_voice)
