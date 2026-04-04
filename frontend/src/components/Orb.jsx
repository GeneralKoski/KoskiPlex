import React, { useRef, useEffect } from 'react';

const VIZ_BARS = 64;
const VIZ_INNER_RADIUS = 88;
const VIZ_MAX_BAR = 50;

const Orb = ({ isActive, status, accent, analyserNode, onClick }) => {
  const canvasRef = useRef(null);
  const vizFrameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserNode) return;

    const ctx = canvas.getContext('2d');
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
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      vizFrameRef.current = requestAnimationFrame(draw);
    };

    vizFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(vizFrameRef.current);
  }, [accent, analyserNode]);

  return (
    <div className="orb-area">
      <canvas ref={canvasRef} className="viz-canvas" width="320" height="320" />
      <div className="orb-rings">
        <div className="ring ring-1" />
        <div className="ring ring-2" />
        <div className="ring ring-3" />
      </div>
      <button className="orb" onClick={onClick}>
        <div className="orb-icon">
          {isActive ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </div>
      </button>
    </div>
  );
};

export default Orb;
