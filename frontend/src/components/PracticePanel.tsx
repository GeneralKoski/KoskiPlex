import { motion } from "framer-motion";
import {
  Check,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Save,
  Square,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../App";
import { SelectedVoice } from "../types";

interface PracticePanelProps {
  selectedVoice: SelectedVoice;
  onVoiceCreated?: () => void;
}

const PracticePanel: React.FC<PracticePanelProps> = ({
  selectedVoice,
  onVoiceCreated,
}) => {
  const [phrase, setPhrase] = useState("");
  const [isFetchingPhrase, setIsFetchingPhrase] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isPlayingReference, setIsPlayingReference] = useState(false);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );

  const hasFetchedRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const referenceAudioRef = useRef<HTMLAudioElement | null>(null);
  const userAudioRef = useRef<HTMLAudioElement | null>(null);

  const fetchPhrase = useCallback(async () => {
    setIsFetchingPhrase(true);
    try {
      const res = await fetch(
        `${API_URL}/practice/phrase?lang=${selectedVoice.lang}`,
      );
      const data = await res.json();
      if (data.phrase) setPhrase(data.phrase);
    } catch (err) {
      console.error("Failed to fetch phrase:", err);
    } finally {
      setIsFetchingPhrase(false);
    }
  }, [selectedVoice.lang]);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      fetchPhrase();
      hasFetchedRef.current = true;
    }
  }, [fetchPhrase]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        setRecordedBlob(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Recording error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
    }
  };

  const playReference = () => {
    if (isPlayingReference && referenceAudioRef.current) {
      referenceAudioRef.current.pause();
      setIsPlayingReference(false);
      return;
    }

    if (referenceAudioRef.current) {
      referenceAudioRef.current.pause();
    }

    const url = `${API_URL}/practice/reference?text=${encodeURIComponent(phrase)}&engine=${selectedVoice.engine}&voice=${encodeURIComponent(selectedVoice.voice)}&lang=${selectedVoice.lang}`;

    const audio = new Audio(url);
    referenceAudioRef.current = audio;
    audio.onplay = () => setIsPlayingReference(true);
    audio.onended = () => setIsPlayingReference(false);
    audio.onerror = () => setIsPlayingReference(false);
    audio.play().catch((e) => console.error("Reference play failed:", e));
  };

  const playUserRecording = () => {
    if (isPlayingRecording && userAudioRef.current) {
      userAudioRef.current.pause();
      setIsPlayingRecording(false);
      return;
    }

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

  const handleSaveVoice = async () => {
    if (!recordedBlob || !voiceName.trim()) return;

    setIsSaving(true);
    setSaveStatus("idle");

    try {
      const formData = new FormData();
      formData.append(
        "file",
        recordedBlob,
        `${voiceName.trim().replace(/\s+/g, "_")}.webm`,
      );
      formData.append("name", voiceName.trim());

      const res = await fetch(`${API_URL}/voices/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      setSaveStatus("success");
      setVoiceName("");
      if (onVoiceCreated) onVoiceCreated();

      // Reset after 3 seconds
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      console.error("Save voice error:", err);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      className="practice-panel"
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="voice-panel-header">
        <h3 className="voice-panel-title">PRONUNCIATION PRACTICE</h3>
      </div>

      <div className="practice-content">
        <div className="practice-label-container">
          <p className="practice-label m-0">PHRASE TO READ:</p>
          <button
            className={`phrase-refresh-btn ${isFetchingPhrase ? "spinning" : ""}`}
            onClick={fetchPhrase}
            disabled={isFetchingPhrase}
            title="Get new phrase"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className={`practice-phrase ${isFetchingPhrase ? "loading" : ""}`}>
          {isFetchingPhrase ? "Generating..." : `"${phrase}"`}
        </div>

        <div className="practice-actions">
          <div className="practice-action-group">
            <span className="practice-action-label">REFERENCE EXAMPLE</span>
            <button
              className={`practice-btn ${isPlayingReference ? "active" : ""}`}
              onClick={playReference}
              disabled={isFetchingPhrase}
            >
              {isPlayingReference ? (
                <Square size={20} className="text-red-400" />
              ) : (
                <Play size={20} />
              )}
              <span>
                {isPlayingReference ? "STOP REFERENCE" : "LISTEN TO REFERENCE"}
              </span>
            </button>
          </div>

          <div className="practice-action-group">
            <span className="practice-action-label">YOUR RECORDING</span>
            <div className="flex gap-2">
              <button
                className={`practice-btn ${isRecording ? "recording" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isFetchingPhrase}
              >
                {isRecording ? <Square size={20} /> : <Mic size={20} />}
                <span>{isRecording ? "STOP" : "RECORD"}</span>
              </button>

              {recordedBlob && !isRecording && (
                <button
                  className={`practice-btn ${isPlayingRecording ? "active" : ""}`}
                  onClick={playUserRecording}
                  disabled={isFetchingPhrase}
                >
                  {isPlayingRecording ? (
                    <Square size={20} className="text-red-400" />
                  ) : (
                    <Play size={20} />
                  )}
                  <span>{isPlayingRecording ? "STOP" : "PLAYBACK"}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {recordedBlob && !isRecording && (
          <motion.div
            className="practice-save-section"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            <div className="practice-action-label">SAVE AS CUSTOM VOICE</div>
            <div className="save-voice-controls">
              <input
                type="text"
                placeholder="Name of your voice..."
                className="voice-name-input"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                disabled={isSaving || saveStatus === "success"}
              />
              <button
                className={`save-voice-btn ${saveStatus}`}
                onClick={handleSaveVoice}
                disabled={
                  isSaving || !voiceName.trim() || saveStatus === "success"
                }
              >
                {isSaving ? (
                  <Loader2 className="spinning" size={18} />
                ) : saveStatus === "success" ? (
                  <Check size={18} />
                ) : (
                  <Save size={18} />
                )}
                <span>
                  {isSaving
                    ? "SAVING..."
                    : saveStatus === "success"
                      ? "VOICE SAVED!"
                      : "SAVE VOICE"}
                </span>
              </button>
            </div>
            {saveStatus === "error" && (
              <p className="save-error-msg">Failed to save voice. Try again.</p>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default PracticePanel;
