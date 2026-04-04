import { motion } from "framer-motion";
import { Settings, Trash2 } from "lucide-react";
import React from "react";

interface ControlsProps {
  onShowVoicePanel: () => void;
  onClearHistory: () => void;
}

const Controls: React.FC<ControlsProps> = ({
  onShowVoicePanel,
  onClearHistory,
}) => {
  return (
    <motion.footer
      className="controls"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <motion.button
        className="ctrl-btn"
        onClick={onShowVoicePanel}
        title="Voice settings"
        type="button"
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
      >
        <Settings size={20} strokeWidth={1.8} />
      </motion.button>
      <motion.button
        className="ctrl-btn"
        onClick={onClearHistory}
        title="Clear conversation"
        type="button"
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
      >
        <Trash2 size={20} strokeWidth={1.8} />
      </motion.button>
    </motion.footer>
  );
};

export default Controls;
