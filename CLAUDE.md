# KoskiPlex

## Project Overview
Low-latency voice AI prototype. User speaks → Groq STT (whisper-large-v3) → Groq LLM (llama-3.3-70b-versatile) → browser TTS reads reply aloud.

## Architecture
- **Backend**: Python 3.9+, FastAPI, Groq SDK — runs on port 8000
- **Frontend**: React (Vite) — runs on port 5173
- **No database, no auth** — local prototype

## Key Files
- `backend/app.py` — FastAPI server with /transcribe, /chat, /voice endpoints
- `frontend/src/App.jsx` — Main React component (recording, API calls, Web Speech TTS)
- `frontend/src/App.css` — Styling

## Backend
- Groq API key in `backend/.env` (not committed)
- `python-multipart` required for FastAPI file uploads
- CORS allows all origins (local dev)
- STT returns detected language for TTS voice matching

## Frontend
- Default mode: continuous conversation with silence detection
- Push-to-talk: optional toggle
- Web Speech API for TTS — voice selected by detected language
- MediaRecorder API for mic capture (webm/opus on Chrome, mp4 on Safari)

## Conventions
- Keep responses short: LLM system prompt enforces 1-2 sentences
- Conversation history capped at 20 messages client-side
- No server-side session state — history passed with each request

## Running
```bash
# Backend
cd backend && source .venv/bin/activate && python app.py

# Frontend
cd frontend && npm run dev
```
