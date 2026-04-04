# KoskiPlex

## Project Overview
Low-latency voice AI prototype. User speaks → Groq STT (whisper-large-v3) → Groq LLM (llama-3.3-70b-versatile) → server-side TTS (edge-tts / XTTS voice cloning) reads reply aloud.

## Architecture
- **Backend**: Python 3.9+, FastAPI, Groq SDK — runs on port 8000
- **Frontend**: React (Vite) — runs on port 5173
- **Communication**: WebSocket (`/ws/voice`) for real-time streaming, HTTP endpoints kept for compatibility
- **No database, no auth** — local prototype

## Key Files
- `backend/app.py` — FastAPI server with WebSocket voice endpoint, TTS engines, voice management, HTTP fallbacks
- `backend/voices/` — Uploaded WAV samples for XTTS voice cloning
- `frontend/src/App.jsx` — Main React component (recording, audio playback queue, voice selector)
- `frontend/src/App.css` — Styling (sci-fi void console aesthetic)

## Backend
- Groq API key in `backend/.env` (not committed)
- `python-multipart` required for FastAPI file uploads
- CORS allows all origins (local dev)
- STT returns detected language for TTS voice matching
- LLM streaming: tokens sent to client as they arrive
- Server-side barge-in: client sends `interrupt` → streaming aborted
- Latency tracking: stt_ms, llm_first_token_ms, llm_total_ms, total_ms
- **TTS**: edge-tts (default, free Microsoft voices, auto-selects by detected language across 16 languages)
- **Voice cloning**: Coqui XTTS v2 (optional, `pip install TTS`, lazy-loaded ~2GB model). Upload a ~10s WAV sample to clone any voice
- Voice management: `GET /voices`, `POST /voices/upload`, `DELETE /voices/{name}`
- Always validate with venv active (`source .venv/bin/activate`) — bare `python` may not exist on the system

## WebSocket Protocol (`/ws/voice`)
- Client sends: `audio` (hex-encoded), `interrupt`, `clear`, `set_voice` (engine + voice name)
- Server sends: `transcript`, `reply_chunk` (per sentence), `audio_chunk` (base64 mp3), `reply_done` (with timing)
- History managed server-side per WebSocket connection
- Per-sentence flow: `reply_chunk` (text, immediate) → `audio_chunk` (audio, ~200ms later)

## Frontend
- Continuous conversation with silence detection (threshold 50, 1.5s silence, 800ms min speech)
- Whisper hallucination filtering (backend blocklist for "thank you" etc. from ambient noise)
- Audio playback queue: receives base64 mp3 from server, plays sequentially via Audio elements
- Voice selector panel: switch between edge-tts auto (by language) and custom XTTS voices
- Voice upload: WAV/MP3/M4A samples for XTTS cloning, stored in `backend/voices/`
- Selected voice persisted in localStorage
- MediaRecorder API for mic capture (webm/opus on Chrome, mp4 on Safari)
- Canvas-based circular audio visualizer (64 bars)
- State-driven UI: accent colors change by state (idle=blue, listening=red, processing=amber, speaking=purple)
- Latency display in header

## Conventions
- Keep responses short: LLM system prompt enforces 1-2 sentences
- Conversation history capped at 20 messages server-side
- LLM responds in the same language the user speaks

## Build & Validation
- **Never** use `py_compile` or bare `python` to check for errors — syntax checks miss import/runtime failures
- Always validate backend inside the venv: `source .venv/bin/activate && python -c "from app import app"`
- Frontend: `npm run build` catches compile errors
- Check real imports, not just syntax

## Running
```bash
# Backend
cd backend && source .venv/bin/activate && python app.py

# Frontend
cd frontend && npm run dev
```
