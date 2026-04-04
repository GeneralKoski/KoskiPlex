# KoskiPlex

## Project Overview
Low-latency voice AI prototype. User speaks → Groq STT (whisper-large-v3) → Groq LLM (llama-3.3-70b-versatile) → browser TTS reads reply aloud.

## Architecture
- **Backend**: Python 3.9+, FastAPI, Groq SDK — runs on port 8000
- **Frontend**: React (Vite) — runs on port 5173
- **Communication**: WebSocket (`/ws/voice`) for real-time streaming, HTTP endpoints kept for compatibility
- **No database, no auth** — local prototype

## Key Files
- `backend/app.py` — FastAPI server with WebSocket voice endpoint + HTTP fallbacks
- `frontend/src/App.jsx` — Main React component (recording, API calls, Web Speech TTS)
- `frontend/src/App.css` — Styling

## Backend
- Groq API key in `backend/.env` (not committed)
- `python-multipart` required for FastAPI file uploads
- CORS allows all origins (local dev)
- STT returns detected language for TTS voice matching
- LLM streaming: tokens sent to client as they arrive
- Server-side barge-in: client sends `interrupt` → streaming aborted
- Latency tracking: stt_ms, llm_first_token_ms, llm_total_ms, total_ms

## WebSocket Protocol (`/ws/voice`)
- Client sends: `audio` (hex-encoded), `interrupt`, `clear`
- Server sends: `transcript`, `reply_chunk` (per sentence), `reply_done` (with timing)
- History managed server-side per WebSocket connection

## Frontend
- Default mode: continuous conversation with silence detection
- Push-to-talk: optional toggle
- Web Speech API for TTS — voice selected by detected language
- MediaRecorder API for mic capture (webm/opus on Chrome, mp4 on Safari)
- Sentence-level TTS: starts speaking first sentence while LLM generates the rest
- Latency display in header

## Conventions
- Keep responses short: LLM system prompt enforces 1-2 sentences
- Conversation history capped at 20 messages server-side
- LLM responds in the same language the user speaks

## Running
```bash
# Backend
cd backend && source .venv/bin/activate && python app.py

# Frontend
cd frontend && npm run dev
```
