import { motion } from "framer-motion";
import { Mic, Play, Square, X } from "lucide-react";
import React, { useRef, useState } from "react";
import { SelectedVoice } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const PRACTICE_PHRASE =
  "The sophisticated artificial intelligence system demonstrated remarkable versatility in processing complex linguistic patterns and generating human-like responses with exceptional precision.";

interface PracticePanelProps {
  selectedVoice: SelectedVoice;
  onClose: () => void;
}

const PracticePanel: React.FC<PracticePanelProps> = ({
  selectedVoice,
  onClose,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [isPlayingReference, setIsPlayingReference] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const referenceAudioRef = useRef<HTMLAudioElement | null>(null);
  const userAudioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordedBlob(null);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playReference = () => {
    if (referenceAudioRef.current) {
      referenceAudioRef.current.pause();
    }

    // Construct reference URL
    const url = `${API_URL}/practice/reference?text=${encodeURIComponent(PRACTICE_PHRASE)}&engine=${selectedVoice.engine}&voice=${encodeURIComponent(selectedVoice.voice)}&lang=en`;

    const audio = new Audio(url);
    referenceAudioRef.current = audio;
    audio.onplay = () => setIsPlayingReference(true);
    audio.onended = () => setIsPlayingReference(false);
    audio.play().catch((e) => console.error("Reference play failed:", e));
  };

  const playUserRecording = () => {
    if (!recordedBlob) return;

    const url = URL.createObjectURL(recordedBlob);
    const audio = new Audio(url);
    userAudioRef.current = audio;
    audio.onplay = () => setIsPlayingRecording(true);
    audio.onended = () => {
      setIsPlayingRecording(false);
      URL.revokeObjectURL(url);
    };
    audio.play().catch((e) => console.error("User recording play failed:", e));
  };

  return (
    <motion.div
      className="voice-panel practice-panel"
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="voice-panel-header">
        <h3 className="voice-panel-title">PRONUNCIATION PRACTICE</h3>
        <button className="voice-panel-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="practice-content">
        <p className="practice-label">PHRASE TO READ:</p>
        <div className="practice-phrase">"{PRACTICE_PHRASE}"</div>

        <div className="practice-actions">
          <div className="practice-action-group">
            <span className="practice-action-label">REFERENCE EXAMPLE</span>
            <button
              className={`practice-btn ${isPlayingReference ? "active" : ""}`}
              onClick={playReference}
              disabled={isPlayingReference}
            >
              {isPlayingReference ? (
                <div className="loading-spinner-small" />
              ) : (
                <Play size={20} />
              )}
              <span>LISTEN TO REFERENCE</span>
            </button>
          </div>

          <div className="practice-action-group">
            <span className="practice-action-label">YOUR RECORDING</span>
            <div className="flex gap-2">
              <button
                className={`practice-btn ${isRecording ? "recording" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? <Square size={20} /> : <Mic size={20} />}
                <span>
                  {isRecording ? "STOP RECORDING" : "START RECORDING"}
                </span>
              </button>

              {recordedBlob && !isRecording && (
                <button
                  className={`practice-btn ${isPlayingRecording ? "active" : ""}`}
                  onClick={playUserRecording}
                  disabled={isPlayingRecording}
                >
                  {isPlayingRecording ? (
                    <div className="loading-spinner-small" />
                  ) : (
                    <Play size={20} />
                  )}
                  <span>PLAYBACK</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PracticePanel;
