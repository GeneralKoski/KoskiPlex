import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AppStatus, SelectedVoice, WSMessage } from "../types";

const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_SAMPLES = 5;

interface UseVoiceWebSocketProps {
  onTranscript: (msg: WSMessage) => void;
  onReplyChunk: (msg: WSMessage) => void;
  onAudioChunk: (data: string) => void;
  onReplyDone: (msg: WSMessage) => void;
  onStatusChange: (status: AppStatus, errMsg?: string) => void;
  selectedVoice: SelectedVoice;
}

interface VoiceWebSocketHook {
  isConnected: boolean;
  sendAudio: (blob: Blob) => void;
  sendCommand: (cmd: Partial<WSMessage>) => void;
  ws: RefObject<WebSocket | null>;
}

export function useVoiceWebSocket({
  onTranscript,
  onReplyChunk,
  onAudioChunk,
  onReplyDone,
  onStatusChange,
  selectedVoice,
}: UseVoiceWebSocketProps): VoiceWebSocketHook {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const wasManuallyClosedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    wasManuallyClosedRef.current = false;

    const WS_URL =
      import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/voice";
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Voice WebSocket connected");
      setIsConnected(true);
      reconnectCountRef.current = 0;
      onStatusChange?.("idle");
      ws.send(JSON.stringify({ type: "set_voice", ...selectedVoice }));
    };

    ws.onmessage = (e) => {
      if (typeof e.data !== "string") {
        // Binary data is always an audio chunk
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result instanceof ArrayBuffer) {
            onAudioChunk?.(reader.result as any);
          }
        };
        reader.readAsArrayBuffer(e.data);
        return;
      }

      try {
        const msg: WSMessage = JSON.parse(e.data);
        switch (msg.type) {
          case "transcript":
            onTranscript?.(msg);
            break;
          case "reply_chunk":
            onReplyChunk?.(msg);
            break;
          case "reply_done":
            onReplyDone?.(msg);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("WS message error:", err);
      }
    };

    ws.onclose = () => {
      console.log("Voice WebSocket closed");
      setIsConnected(false);
      wsRef.current = null;

      if (!wasManuallyClosedRef.current && reconnectCountRef.current < MAX_RECONNECT_SAMPLES) {
        const delay =
          RECONNECT_DELAY * Math.pow(1.5, reconnectCountRef.current);
        console.log(`Reconnecting in ${Math.round(delay)}ms...`);
        setTimeout(connect, delay);
        reconnectCountRef.current++;
      }
    };

    ws.onerror = (e) => {
      console.error("WS error:", e);
      onStatusChange?.("error", "Connection failed");
    };
  }, [
    selectedVoice,
    onTranscript,
    onReplyChunk,
    onAudioChunk,
    onReplyDone,
    onStatusChange,
  ]);

  const sendAudio = useCallback((blob: Blob) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Send the blob directly as binary
    ws.send(blob);
  }, []);

  const sendCommand = useCallback((cmd: Partial<WSMessage>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wasManuallyClosedRef.current = true;
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Update voice if selectedVoice changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "set_voice", ...selectedVoice }),
      );
    }
  }, [selectedVoice]);

  return {
    isConnected,
    sendAudio,
    sendCommand,
    ws: wsRef,
  };
}
