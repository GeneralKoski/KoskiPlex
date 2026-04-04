# KoskiPlex

Low-latency voice AI prototype powered by Groq. Speak → transcribe → LLM reply → hear it back instantly.

## Architecture

- **Backend**: Python FastAPI — orchestrates Groq STT (whisper-large-v3) + LLM (llama3-70b-8192)
- **Frontend**: React (Vite) — MediaRecorder for mic capture, Web Speech API for instant TTS
- **Latency**: Groq inference (~200ms) + browser-native TTS (zero network latency)

## Quick Start

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your GROQ_API_KEY from https://console.groq.com
python app.py
```

Backend runs on `http://localhost:8000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

### 3. Use it

Open `http://localhost:5173`, hold the button, speak, release, and hear the reply.

## TTS Options

The frontend uses the browser's Web Speech API for zero-latency TTS. The backend also includes commented-out server-side TTS options:

- **Option A (Local)**: pyttsx3 — offline, no API key needed
- **Option B (Cloud)**: ElevenLabs — higher quality, requires API key

See the commented section at the bottom of `backend/app.py`.
