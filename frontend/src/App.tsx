import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

// Components
import Chat from "./components/Chat";
import Controls from "./components/Controls";
import Header from "./components/Header";
import Orb from "./components/Orb";
import VoicePanel from "./components/VoicePanel";

// Hooks
import { useAudioContext } from "./hooks/useAudioContext";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { useVoiceWebSocket } from "./hooks/useVoiceWebSocket";

// Types
import {
  AppStatus,
  Message,
  SelectedVoice,
  Timing,
  VoicesState,
  WSMessage,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STATE_COLORS: Record<AppStatus, { r: number; g: number; b: number }> = {
  idle: { r: 59, g: 130, b: 246 },
  listening: { r: 239, g: 68, b: 68 },
  processing: { r: 245, g: 158, b: 11 },
  speaking: { r: 167, g: 139, b: 250 },
  error: { r: 185, g: 28, b: 28 }, // Darker red for error to distinguish from listening
};

function App() {
  // --- State ---
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<AppStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [streamingReply, setStreamingReply] = useState("");
  const [voices, setVoices] = useState<VoicesState>({
    default: [],
    custom: [],
  });
  const [showVoicePanel, setShowVoicePanel] = useState(false);

  const [selectedVoice, setSelectedVoice] = useState<SelectedVoice>(() => {
    const saved = localStorage.getItem("koskiplex_voice");
    return saved ? JSON.parse(saved) : { engine: "edge", voice: "" };
  });

  // --- Refs ---
  const isActiveRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Custom Hooks ---
  const { queueAudio, stopPlayback, analyser, isPlaying } = useAudioContext();

  const handleStatusChange = useCallback(
    (newStatus: AppStatus, errMsg?: string) => {
      setStatus(newStatus);
      if (errMsg) setError(errMsg);
    },
    [],
  );

  const { sendAudio, sendCommand } = useVoiceWebSocket({
    selectedVoice,
    onStatusChange: handleStatusChange,
    onTranscript: (msg: WSMessage) => {
      if (msg.text) {
        setMessages((prev) => [...prev, { role: "user", text: msg.text! }]);
      }
      if (msg.language) setDetectedLang(msg.language);
      setStatus("processing");
      setStreamingReply("");
    },
    onReplyChunk: (msg: WSMessage) => {
      if (msg.text) {
        setStreamingReply((prev) => prev + (prev ? " " : "") + msg.text);
      }
    },
    onAudioChunk: (data: string) => {
      queueAudio(data);
    },
    onReplyDone: (msg: WSMessage) => {
      if (msg.timing) setTiming(msg.timing);
      setStreamingReply("");
      if (msg.full_reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: msg.full_reply! },
        ]);
      }

      // If we are in active session and done playing/thinking, resume listening
      if (!isPlaying.current && isActiveRef.current) {
        startRecording();
      } else if (!isActiveRef.current) {
        setStatus("idle");
      }
    },
  });

  const { isRecording, startRecording, stopRecording } = useVoiceRecorder({
    onStatusChange: handleStatusChange,
    analyserNode: analyser.current,
    onAudioStop: (blob) => {
      if (blob) {
        sendAudio(blob);
      } else if (isActiveRef.current) {
        // Re-start if it was a false trigger (too short or no speech)
        startRecording();
      }
    },
  });

  // --- Effects ---
  const stateKey: AppStatus = isRecording
    ? "listening"
    : status === "speaking"
      ? "speaking"
      : status === "processing"
        ? "processing"
        : status === "error"
          ? "error"
          : "idle";
  const accent = STATE_COLORS[stateKey];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent-r", accent.r.toString());
    root.style.setProperty("--accent-g", accent.g.toString());
    root.style.setProperty("--accent-b", accent.b.toString());
  }, [accent]);

  useEffect(() => {
    localStorage.setItem("koskiplex_voice", JSON.stringify(selectedVoice));
  }, [selectedVoice]);

  const fetchVoices = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/voices`);
      const data = await res.json();
      setVoices(data);
    } catch (err) {
      console.error("Failed to fetch voices", err);
    }
  }, []);

  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  // --- Actions ---
  const startSession = useCallback(() => {
    isActiveRef.current = true;
    setIsActive(true);
    setError(null);
    startRecording();
  }, [startRecording]);

  const stopSession = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
    stopRecording();
    stopPlayback();
    setStatus("idle");
    setStreamingReply("");
  }, [stopRecording, stopPlayback]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    setDetectedLang(null);
    setTiming(null);
    setStreamingReply("");
    sendCommand({ type: "clear" });
  }, [sendCommand]);

  const handleVoiceUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const name = prompt("Voice name:");
      if (!name) return;

      const formData = new FormData();
      formData.append("name", name);
      formData.append("file", file);

      try {
        setStatus("processing");
        await fetch(`${API_URL}/voices/upload`, {
          method: "POST",
          body: formData,
        });
        fetchVoices();
        setStatus("idle");
      } catch {
        setError("Upload failed");
        setStatus("idle");
      }
      e.target.value = "";
    },
    [fetchVoices],
  );

  const handleDeleteVoice = useCallback(
    async (name: string) => {
      try {
        await fetch(`${API_URL}/voices/${name}`, { method: "DELETE" });
        fetchVoices();
        if (selectedVoice.voice === name) {
          setSelectedVoice({ engine: "edge", voice: "" });
        }
      } catch (err) {
        console.error("Delete failed", err);
      }
    },
    [fetchVoices, selectedVoice],
  );

  // Sync speaking status with audio context
  useEffect(() => {
    if (isPlaying.current && status !== "speaking") {
      setStatus("speaking");
    } else if (!isPlaying.current && status === "speaking") {
      if (isActiveRef.current) {
        startRecording();
      } else {
        setStatus("idle");
      }
    }
  }, [isPlaying.current, status, startRecording]);

  const statusLabel = {
    idle: isActive ? "READY" : "TAP TO BEGIN",
    listening: "LISTENING",
    processing: "THINKING",
    speaking: "SPEAKING",
    error: "ERROR",
  }[status];

  return (
    <div className="app" data-state={stateKey}>
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="noise-overlay" />

      <Header detectedLang={detectedLang} timing={timing} />

      <main className="main">
        <div className="flex-1 overflow-hidden relative flex flex-col w-full max-w-2xl mx-auto">
          <div className="flex-1 overflow-visible relative flex flex-col items-center justify-center min-h-[350px]">
            <Orb
              isActive={isActive}
              status={status}
              accent={accent}
              analyserNode={analyser.current}
              onClick={isActive ? stopSession : startSession}
            />

            <div className="mt-8 text-center min-h-[60px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={status}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="status-text m-0">{statusLabel}</span>
                  {error && <p className="error-text m-0">{error}</p>}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="h-[40vh] w-full relative flex flex-col">
            <Chat messages={messages} streamingReply={streamingReply} />
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showVoicePanel && (
          <VoicePanel
            voices={voices}
            selectedVoice={selectedVoice}
            onVoiceSelect={setSelectedVoice}
            onUpload={handleVoiceUpload}
            onDelete={handleDeleteVoice}
            onClose={() => setShowVoicePanel(false)}
            fileInputRef={fileInputRef}
          />
        )}
      </AnimatePresence>

      <Controls
        onShowVoicePanel={() => {
          setShowVoicePanel((p) => !p);
          fetchVoices();
        }}
        onClearHistory={clearHistory}
      />
    </div>
  );
}

export default App;
