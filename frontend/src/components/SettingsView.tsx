import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Music, Play, Plus, Trash2, Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import { SelectedVoice, VoicesState } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface SettingsViewProps {
  voices: VoicesState;
  selectedVoice: SelectedVoice;
  onVoiceSelect: (voice: SelectedVoice) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (name: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const EDGE_VOICES_LIST = [
  {
    id: "en-US-JennyNeural",
    label: "Jenny (English US)",
    icon: "🇺🇸",
    lang: "en",
  },
  {
    id: "it-IT-IsabellaNeural",
    label: "Isabella (Italian)",
    icon: "🇮🇹",
    lang: "it",
  },
  {
    id: "es-ES-ElviraNeural",
    label: "Elvira (Spanish)",
    icon: "🇪🇸",
    lang: "es",
  },
  {
    id: "fr-FR-DeniseNeural",
    label: "Denise (French)",
    icon: "🇫🇷",
    lang: "fr",
  },
  { id: "de-DE-KatjaNeural", label: "Katja (German)", icon: "🇩🇪", lang: "de" },
];

const PREVIEW_PHRASES: Record<string, string> = {
  en: "Hello! I am your KoskiPlex AI voice. How do I sound to you?",
  it: "Ciao! Sono la tua voce AI di KoskiPlex. Come ti sembro?",
  es: "¡Hola! Soy tu voz de IA de KoskiPlex. ¿Qué te parezco?",
  fr: "Bonjour! Je suis votre voix IA KoskiPlex. Qu'en pensez-vous?",
  de: "Hallo! Ich bin deine KoskiPlex KI-Stimme. Wie finde ich mich an?",
};

const SettingsView: React.FC<SettingsViewProps> = ({
  voices,
  selectedVoice,
  onVoiceSelect,
  onUpload,
  onDelete,
  fileInputRef,
}) => {
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = async (
    e: React.MouseEvent,
    engine: string,
    voice: string,
    lang: string = "it",
  ) => {
    e.stopPropagation();

    if (playingVoice === voice) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }

    setPlayingVoice(voice);
    const textSnippet = PREVIEW_PHRASES[lang] || PREVIEW_PHRASES["it"];
    const url = `${API_URL}/practice/reference?text=${encodeURIComponent(textSnippet)}&engine=${engine}&voice=${encodeURIComponent(voice)}&lang=${lang}`;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingVoice(null);
    audio.onerror = () => setPlayingVoice(null);

    try {
      await audio.play();
    } catch (err) {
      console.error("Preview failed:", err);
      setPlayingVoice(null);
    }
  };

  return (
    <motion.div
      className="settings-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="settings-container-split">
        {/* Left: Uploader & Context */}
        <aside className="settings-sidebar">
          <div className="settings-header">
            <h2 className="settings-title">Voice Settings</h2>
            <p className="settings-subtitle">
              Customize the AI's personality and voice performance
            </p>
          </div>

          <div className="uploader-area-inline">
            <div className="section-header small">
              <Upload size={14} className="section-icon text-indigo-400" />
              <h3 className="section-title">Clone New Voice</h3>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={onUpload}
              accept="audio/*"
              className="hidden"
            />
            <motion.div
              className="uploader-capsule-compact"
              onClick={() => fileInputRef.current?.click()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="uploader-icon-wrapper">
                <Plus size={20} />
              </div>
              <div className="uploader-text-container">
                <span className="uploader-text-main">Choose File</span>
                <span className="uploader-text-sub">
                  Support for .wav, .mp3, .webm
                </span>
              </div>
            </motion.div>
          </div>
        </aside>

        {/* Right: Scrollable Unified List */}
        <main className="settings-content-scrollable">
          <div className="section-header sticky-header">
            <Music size={18} className="section-icon text-blue-400" />
            <h3 className="section-title">Available Models</h3>
          </div>

          <div className="voice-list-unified">
            <AnimatePresence mode="popLayout">
              {/* Custom Clones First */}
              {voices.custom.map((v) => {
                const isSelected =
                  selectedVoice.engine === "xtts" &&
                  selectedVoice.voice === v.name;
                const isPlaying = playingVoice === v.name;
                return (
                  <motion.div
                    key={v.name}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`voice-card ${isSelected ? "selected" : ""}`}
                    onClick={() =>
                      onVoiceSelect({
                        engine: "xtts",
                        voice: v.name,
                        lang: "it",
                      })
                    }
                  >
                    <div className="voice-card-content">
                      <button
                        className={`btn-preview ${isPlaying ? "playing" : ""}`}
                        onClick={(e) => handlePreview(e, "xtts", v.name)}
                        title="Preview voice"
                      >
                        {isPlaying ? (
                          <Loader2 className="spinning" size={14} />
                        ) : (
                          <Play size={14} />
                        )}
                      </button>
                      <div className="voice-info">
                        <span className="voice-name">{v.name}</span>
                      </div>
                      <div className="voice-actions">
                        <button
                          className="btn-icon-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(v.name);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {isSelected && <div className="selected-indicator" />}
                  </motion.div>
                );
              })}

              {/* Standard Voices */}
              {EDGE_VOICES_LIST.map((v) => {
                const isSelected =
                  selectedVoice.engine === "edge" &&
                  selectedVoice.voice === v.id;
                const isPlaying = playingVoice === v.id;
                return (
                  <motion.div
                    key={v.id}
                    layout
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={`voice-card standard ${isSelected ? "selected" : ""}`}
                    onClick={() =>
                      onVoiceSelect({
                        engine: "edge",
                        voice: v.id,
                        lang: v.lang,
                      })
                    }
                  >
                    <div className="voice-card-content">
                      <button
                        className={`btn-preview ${isPlaying ? "playing" : ""}`}
                        onClick={(e) => handlePreview(e, "edge", v.id, v.lang)}
                        title="Preview voice"
                      >
                        {isPlaying ? (
                          <Loader2 className="spinning" size={14} />
                        ) : (
                          <Play size={14} />
                        )}
                      </button>
                      <span className="voice-flag">{v.icon}</span>
                      <div className="voice-info">
                        <span className="voice-name">{v.label}</span>
                      </div>
                    </div>
                    {isSelected && <div className="selected-indicator" />}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </motion.div>
  );
};

export default SettingsView;
