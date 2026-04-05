import { motion } from "framer-motion";
import { Trash2, Upload, X } from "lucide-react";
import React from "react";
import { SelectedVoice, VoicesState } from "../types";

interface VoicePanelProps {
  voices: VoicesState;
  selectedVoice: SelectedVoice;
  onVoiceSelect: (voice: SelectedVoice) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const EDGE_VOICES_LIST = [
  { id: "en-US-JennyNeural", label: "Jenny (English US)", icon: "🇺🇸" },
  { id: "it-IT-IsabellaNeural", label: "Isabella (Italian)", icon: "🇮🇹" },
  { id: "es-ES-ElviraNeural", label: "Elvira (Spanish)", icon: "🇪🇸" },
  { id: "fr-FR-DeniseNeural", label: "Denise (French)", icon: "🇫🇷" },
  { id: "de-DE-KatjaNeural", label: "Katja (German)", icon: "🇩🇪" },
];

const VoicePanel: React.FC<VoicePanelProps> = ({
  voices,
  selectedVoice,
  onVoiceSelect,
  onUpload,
  onDelete,
  onClose,
  fileInputRef,
}) => {
  return (
    <motion.div
      className="voice-panel"
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="voice-panel-header">
        <h3 className="voice-panel-title">Voice Settings</h3>
        <button
          className="voice-panel-close"
          onClick={onClose}
          title="Close panel"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      <div className="voice-section">
        <span className="voice-section-label">Premium Clone Voices</span>
        {voices.custom.length === 0 ? (
          <div className="text-xs text-slate-500 py-2 italic text-center">
            No cloned voices available
          </div>
        ) : (
          voices.custom.map((v) => (
            <motion.div
              key={v.name}
              className="voice-option"
              whileHover={{ x: 4 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="voice-option-main"
                onClick={() => onVoiceSelect({ engine: "xtts", voice: v.name })}
              >
                <div
                  className={`voice-radio ${selectedVoice.engine === "xtts" && selectedVoice.voice === v.name ? "active" : ""}`}
                />
                <span className="voice-name">{v.name}</span>
              </div>
              <button
                className="voice-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(v.name);
                }}
                title="Delete voice"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          ))
        )}
      </div>

      <div className="voice-section">
        <span className="voice-section-label">Standard Voices</span>
        {EDGE_VOICES_LIST.map((v) => (
          <motion.div
            key={v.id}
            className="voice-option"
            onClick={() => onVoiceSelect({ engine: "edge", voice: v.id })}
            whileHover={{ x: 4 }}
            transition={{ duration: 0.2 }}
          >
            <div className="voice-option-main">
              <div
                className={`voice-radio ${selectedVoice.engine === "edge" && selectedVoice.voice === v.id ? "active" : ""}`}
              />
              <span className="voice-name">
                {v.icon} {v.label}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={onUpload}
        accept="audio/*"
        style={{ display: "none" }}
      />
      <motion.button
        className="voice-upload-btn"
        onClick={() => fileInputRef.current?.click()}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Upload size={16} />
        Upload New Voice Clone
      </motion.button>
    </motion.div>
  );
};

export default VoicePanel;
