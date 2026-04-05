import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# --- Project Paths ---
BASE_DIR = Path(__file__).parent
VOICES_DIR = BASE_DIR / "voices"
VOICES_DIR.mkdir(exist_ok=True)

# --- AI Models ---
STT_MODEL = os.getenv("STT_MODEL", "whisper-large-v3")
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = (
    "You are KoskiPlex, a fast voice assistant. "
    "Always respond in 1-2 short sentences. Be direct and concise. "
    "Never use lists, markdown, or formatting — you are being read aloud. "
    "Respond in the same language the user speaks to you."
)

MAX_HISTORY = 20

# --- Noise Filtering ---
WHISPER_HALLUCINATIONS = {
    "thank you", "thanks", "thank you.", "thanks.", "thank you for watching",
    "thanks for watching", "thank you for watching.", "thanks for watching.",
    "like and subscribe", "subscribe", "bye", "bye.", "you",
    "the end", "the end.", "...", "", " ",
}

# --- TTS Settings ---
EDGE_VOICES = {
    "it": "it-IT-IsabellaNeural",
    "en": "en-US-JennyNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "pt": "pt-BR-FranciscaNeural",
    "nl": "nl-NL-ColetteNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "ja": "ja-JP-NanamiNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ko": "ko-KR-SunHiNeural",
    "ar": "ar-SA-ZariyahNeural",
    "hi": "hi-IN-SwaraNeural",
    "tr": "tr-TR-EmelNeural",
    "pl": "pl-PL-AgnieszkaNeural",
    "sv": "sv-SE-SofieNeural",
}
DEFAULT_EDGE_VOICE = "en-US-JennyNeural"

# --- Feature Flags ---
PRELOAD_XTTS = os.getenv("PRELOAD_XTTS", "true").lower() == "true"
