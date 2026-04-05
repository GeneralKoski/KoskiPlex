import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

// Components
import Chat from "./components/Chat";
import Header from "./components/Header";
import Navbar, { TabType } from "./components/Navbar";
import Orb from "./components/Orb";
import PracticePanel from "./components/PracticePanel";
import SettingsView from "./components/SettingsView";

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

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STATE_COLORS: Record<AppStatus, { r: number; g: number; b: number }> = {
  idle: { r: 59, g: 130, b: 246 },
  listening: { r: 239, g: 68, b: 68 },
  processing: { r: 245, g: 158, b: 11 },
  speaking: { r: 167, g: 139, b: 250 },
  error: { r: 185, g: 28, b: 28 },
};

function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<TabType>("chat");
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

  const sendAudioRef = useRef<((blob: Blob) => void) | null>(null);
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);

  const { isConnected, sendAudio, sendCommand } = useVoiceWebSocket({
    selectedVoice,
    onStatusChange: handleStatusChange,
    onTranscript: useCallback((msg: WSMessage) => {
      if (msg.text) {
        setMessages((prev) => [...prev, { role: "user", text: msg.text! }]);
      }
      if (msg.language) setDetectedLang(msg.language);
      setStatus("processing");
      setStreamingReply("");
    }, []),
    onReplyChunk: useCallback((msg: WSMessage) => {
      if (msg.text) {
        setStreamingReply((prev) => prev + (prev ? " " : "") + msg.text);
      }
    }, []),
    onAudioChunk: useCallback(
      (data: string) => {
        queueAudio(data);
      },
      [queueAudio],
    ),
    onReplyDone: useCallback(
      (msg: WSMessage) => {
        if (msg.timing) setTiming(msg.timing);
        setStreamingReply("");
        if (msg.full_reply) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: msg.full_reply! },
          ]);
        }
        if (!isPlaying.current && isActiveRef.current) {
          startRecordingRef.current?.();
        } else if (!isActiveRef.current) {
          setStatus("idle");
        }
      },
      [isPlaying],
    ),
  });

  const { isRecording, startRecording, stopRecording } = useVoiceRecorder({
    onStatusChange: handleStatusChange,
    analyserNode: analyser.current,
    onAudioStop: (blob) => {
      if (blob) {
        sendAudioRef.current?.(blob);
      } else if (isActiveRef.current) {
        startRecordingRef.current?.();
      }
    },
  });

  useEffect(() => {
    sendAudioRef.current = sendAudio;
    startRecordingRef.current = startRecording;
  }, [sendAudio, startRecording]);

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

  // Stop session if we leave the chat tab
  useEffect(() => {
    if (activeTab !== "chat" && isActive) {
      stopSession();
    }
  }, [activeTab, isActive, stopSession]);

  const statusLabel = {
    connecting: "",
    idle: isActive ? "READY" : "",
    listening: "LISTENING",
    processing: "THINKING",
    speaking: "SPEAKING",
    error: "ERROR",
  }[!isConnected ? "connecting" : status];

  const canStart = isConnected && status === "idle" && !error;

  return (
    <div className="app" data-state={!isConnected ? "processing" : stateKey}>
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="noise-overlay" />

      <Header
        detectedLang={detectedLang}
        timing={timing}
        onClearHistory={clearHistory}
      />

      <main className="main-container">
        <AnimatePresence mode="wait">
          {activeTab === "chat" && (
            <motion.div
              key="chat"
              className="chat-view-layout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="orb-wrapper-fixed">
                <Orb
                  isActive={isActive}
                  status={status}
                  accent={accent}
                  analyserNode={analyser.current}
                  onClick={() => {
                    if (!canStart && !isActive) return;
                    isActive ? stopSession() : startSession();
                  }}
                />

                {statusLabel && (
                  <div className="status-container-fixed">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={status}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.2 }}
                      >
                        <span className="status-text">{statusLabel}</span>
                          <p className="error-text">{error}</p>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}
              </div>

              <div className="chat-viewport-bottom">
                <Chat messages={messages} streamingReply={streamingReply} />
              </div>
            </motion.div>
          )}

          {activeTab === "practice" && (
            <motion.div
              key="practice"
              className="view-container"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <PracticePanel selectedVoice={selectedVoice} />
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div
              key="settings"
              className="view-container"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <SettingsView
                voices={voices}
                selectedVoice={selectedVoice}
                onVoiceSelect={setSelectedVoice}
                onUpload={handleVoiceUpload}
                onDelete={handleDeleteVoice}
                fileInputRef={fileInputRef}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export default App;
