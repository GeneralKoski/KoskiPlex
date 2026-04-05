import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import React from "react";
import { Timing } from "../types";

interface HeaderProps {
  detectedLang: string | null;
  timing: Timing | null;
  onClearHistory: () => void;
}

const Header: React.FC<HeaderProps> = ({
  detectedLang,
  timing,
  onClearHistory,
}) => {
  return (
    <motion.header
      className="header"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="header-left">
        <h1 className="logo">
          KOSKI<span className="logo-accent">PLEX</span>
        </h1>
        <div className="header-badges">
          {detectedLang && (
            <motion.span
              className="lang-pill"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {detectedLang}
            </motion.span>
          )}
          {timing && (
            <motion.span
              className="timing-pill"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              STT {timing.stt_ms}ms · LLM {timing.llm_first_token_ms}ms · Total{" "}
              {timing.total_ms}ms
            </motion.span>
          )}
        </div>
      </div>

      <button
        className="header-clear-btn"
        onClick={onClearHistory}
        title="Clear conversation"
      >
        <Trash2 size={16} />
        <span>CLEAR</span>
      </button>
    </motion.header>
  );
};

export default Header;
