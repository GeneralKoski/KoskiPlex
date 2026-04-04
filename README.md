# KoskiPlex

Low-latency voice AI prototype powered by Groq. Speak → transcribe → LLM reply → hear it back instantly.

## Architecture

- **Backend**: Python FastAPI — orchestrates Groq STT (whisper-large-v3) + LLM (llama3-70b-8192)
- **Frontend**: React (Vite) — MediaRecorder for mic capture, Web Speech API for instant TTS
- **Latency**: Groq inference (~200ms) + browser-native TTS (zero network latency)

## Prerequisites

- Python 3.10+
- Node.js 18+
- A Groq API key from [console.groq.com](https://console.groq.com)

## Quick Start

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and add your Groq API key:

```
GROQ_API_KEY=gsk_your_actual_key_here
```

Start the server:

```bash
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

1. Open `http://localhost:5173`
2. **Hold** the button and speak
3. **Release** to send — you'll see your transcript and hear the AI reply
4. Press the button while the AI is speaking to **interrupt** it
5. Toggle **Auto-Voice** for continuous hands-free conversation

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Healthcheck |
| `/transcribe` | POST | Speech-to-text only (accepts audio file) |
| `/chat` | POST | LLM chat only (accepts JSON with text + history) |
| `/voice` | POST | Full pipeline: audio → STT → LLM → text reply |

## TTS Options

The frontend uses the browser's Web Speech API for zero-latency TTS. The backend also includes commented-out server-side TTS options:

- **Option A (Local)**: pyttsx3 — offline, no API key needed
- **Option B (Cloud)**: ElevenLabs — higher quality, requires API key

See the commented section at the bottom of `backend/app.py`.
