import asyncio
import base64
import json
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Project Imports
from config import (
    VOICES_DIR, PRELOAD_XTTS, WHISPER_HALLUCINATIONS,
    EDGE_VOICES, MAX_HISTORY
)
from services.voice_service import generate_audio, get_xtts
from services.ai_service import (
    transcribe_audio, get_llm_reply, stream_llm_reply
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    if PRELOAD_XTTS:
        print("💡 [Startup] Triggering XTTS pre-load task...")
        asyncio.create_task(asyncio.to_thread(get_xtts))
    yield

app = FastAPI(title="KoskiPlex", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Voice management endpoints ───────────────────

@app.get("/voices")
async def list_voices():
    custom = []
    # Support multiple extensions
    extensions = ("*.wav", "*.mp3", "*.webm", "*.m4a")
    found_stems = set()
    for ext in extensions:
        for f in VOICES_DIR.glob(ext):
            if f.stem not in found_stems:
                custom.append({"name": f.stem, "engine": "xtts"})
                found_stems.add(f.stem)

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
    # Keep original extension or default to .wav
    ext = Path(file.filename).suffix if file.filename else ".wav"
    if not ext: ext = ".wav"

    voice_path = VOICES_DIR / f"{safe_name}{ext}"
    voice_path.write_bytes(audio_bytes)

    return {"name": safe_name, "engine": "xtts"}

@app.delete("/voices/{name}")
async def delete_voice(name: str):
    # Find any file with that name stem
    for f in VOICES_DIR.glob(f"{name}.*"):
        f.unlink()
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
            try:
                data = await ws.receive()
            except (WebSocketDisconnect, RuntimeError):
                print("Client disconnected.")
                break

            if "text" in data:
                msg = json.loads(data["text"])
                if msg["type"] == "set_voice":
                    tts_engine = msg.get("engine", "edge")
                    tts_voice = msg.get("voice", "")
                elif msg["type"] == "interrupt":
                    interrupted = True
                elif msg["type"] == "clear":
                    history = []
                continue

            if "bytes" not in data:
                continue

            # Binary audio message
            interrupted = False
            audio_bytes = data["bytes"]

            stt_result = await transcribe_audio(audio_bytes, "recording.webm")

            if stt_result["text"].strip().lower() in WHISPER_HALLUCINATIONS:
                await ws.send_json({
                    "type": "reply_done",
                    "full_reply": "",
                    "language": stt_result["language"],
                    "timing": {
                        "stt_ms": stt_result["stt_ms"],
                        "llm_first_token_ms": 0,
                        "llm_total_ms": 0,
                        "total_ms": stt_result["stt_ms"]
                    },
                    "interrupted": False
                })
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
            import time
            t_start = time.perf_counter()
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
                    await ws.send_json({"type": "reply_chunk", "text": sentence_text})

                    try:
                        audio_data = await generate_audio(sentence_text, tts_engine, tts_voice, detected_lang)
                        if audio_data:
                            await ws.send_bytes(audio_data)
                    except Exception:
                        pass

                    sentence_buffer = ""

                # Check for interruption during streaming
                try:
                    raw = await asyncio.wait_for(ws.receive(), timeout=0.001)
                    if "text" in raw:
                        peek = json.loads(raw["text"])
                        if peek.get("type") == "interrupt":
                            interrupted = True
                            stream.close()
                            break
                    elif "bytes" in raw:
                        # If user sends audio while we're talking, we could interrupt
                        # but for now we just skip or handle it as an interruption
                        interrupted = True
                        stream.close()
                        break
                except asyncio.TimeoutError:
                    pass
                except (WebSocketDisconnect, RuntimeError):
                    interrupted = True
                    stream.close()
                    break

            if sentence_buffer.strip() and not interrupted:
                sentence_text = sentence_buffer.strip()
                await ws.send_json({"type": "reply_chunk", "text": sentence_text})
                try:
                    audio_data = await generate_audio(sentence_text, tts_engine, tts_voice, detected_lang)
                    if audio_data:
                        await ws.send_bytes(audio_data)
                except Exception:
                    pass

            if not interrupted:
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
                    "interrupted": False,
                })

                history.append({"role": "user", "content": stt_result["text"]})
                history.append({"role": "assistant", "content": full_reply.strip()})
                if len(history) > MAX_HISTORY:
                    history = history[-MAX_HISTORY:]

    except Exception as e:
        print(f"WS Error: {e}")
    finally:
        try:
            await ws.close()
        except:
            pass

@app.get("/practice/reference")
async def practice_reference(text: str, engine: str = "edge", voice: str = "", lang: str = "en"):
    audio_data = await generate_audio(text, engine, voice, lang)
    if audio_data:
        from fastapi.responses import Response
        return Response(content=audio_data, media_type="audio/mpeg")
    return {"error": "Failed to generate audio"}

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
async def chat(text: str, history: str = "[]"):
    parsed_history = json.loads(history)
    result = get_llm_reply(text, parsed_history)
    return {"reply": result["text"], "llm_ms": result["llm_ms"]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
