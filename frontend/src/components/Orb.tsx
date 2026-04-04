import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { AccentColor, AppStatus } from "../types";

const VIZ_BARS = 64;
const VIZ_INNER_RADIUS = 88;
const VIZ_MAX_BAR = 50;

interface OrbProps {
  isActive: boolean;
  status: AppStatus;
  accent: AccentColor;
  analyserNode: AnalyserNode | null;
  onClick: () => void;
}

const Orb: React.FC<OrbProps> = ({
  isActive,
  status,
  accent,
  analyserNode,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserNode) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 320;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    const smoothed = new Float32Array(VIZ_BARS).fill(0);

    const draw = () => {
      analyserNode.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;

      for (let i = 0; i < VIZ_BARS; i++) {
        const dataIdx = Math.floor((i / VIZ_BARS) * dataArray.length);
        const raw = dataArray[dataIdx] / 255;
        smoothed[i] += (raw - smoothed[i]) * 0.3;

        const angle = (i / VIZ_BARS) * Math.PI * 2 - Math.PI / 2;
        const barH = smoothed[i] * VIZ_MAX_BAR + 2;
        const x1 = cx + Math.cos(angle) * VIZ_INNER_RADIUS;
        const y1 = cy + Math.sin(angle) * VIZ_INNER_RADIUS;
        const x2 = cx + Math.cos(angle) * (VIZ_INNER_RADIUS + barH);
        const y2 = cy + Math.sin(angle) * (VIZ_INNER_RADIUS + barH);

        const a = 0.2 + smoothed[i] * 0.8;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${a})`;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      vizFrameRef.current = requestAnimationFrame(draw);
    };

    vizFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (vizFrameRef.current !== null) {
        cancelAnimationFrame(vizFrameRef.current);
      }
    };
  }, [accent, analyserNode]);

  return (
    <div className="orb-area" data-status={status}>
      <canvas
        ref={canvasRef}
        className="viz-canvas"
        style={{ width: "320px", height: "320px" }}
      />
      <div className="orb-rings">
        <div className="ring ring-1" />
        <div className="ring ring-2" />
        <div className="ring ring-3" />
      </div>
      <motion.button
        className="orb"
        onClick={onClick}
        type="button"
        aria-label={isActive ? "Stop session" : "Start session"}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="orb-icon">
          <AnimatePresence mode="wait">
            {isActive ? (
              <motion.div
                key="stop"
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                transition={{ duration: 0.2 }}
                style={{ display: "flex" }}
              >
                <Square strokeWidth={3} size={28} fill="currentColor" />
              </motion.div>
            ) : (
              <motion.div
                key="mic"
                initial={{ opacity: 0, scale: 0.5, rotate: 90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: -90 }}
                transition={{ duration: 0.2 }}
                style={{ display: "flex" }}
              >
                <Mic strokeWidth={2} size={32} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    </div>
  );
};

export default Orb;
