import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AppStatus, SelectedVoice, WSMessage } from "../types";

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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [isConnected, setIsConnected] = useState(false);

  const callbacks = useRef({
    onTranscript,
    onReplyChunk,
    onAudioChunk,
    onReplyDone,
    onStatusChange,
  });

  useEffect(() => {
    callbacks.current = {
      onTranscript,
      onReplyChunk,
      onAudioChunk,
      onReplyDone,
      onStatusChange,
    };
  }, [onTranscript, onReplyChunk, onAudioChunk, onReplyDone, onStatusChange]);

  const selectedVoiceRef = useRef(selectedVoice);
  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  const connect = useCallback(() => {
    // Detach and close any previous WS so stale handlers can't interfere
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const WS_URL =
      import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws/voice";

    console.log("WS: Connecting to", WS_URL);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      console.log("WS: Connected successfully");
      setIsConnected(true);
      callbacks.current.onStatusChange?.("idle");
      ws.send(
        JSON.stringify({
          type: "set_voice",
          engine: selectedVoiceRef.current.engine,
          voice: selectedVoiceRef.current.voice,
        }),
      );
    };

    ws.onmessage = (e) => {
      if (wsRef.current !== ws) return;

      if (typeof e.data !== "string") {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result instanceof ArrayBuffer) {
            callbacks.current.onAudioChunk?.(reader.result as any);
          }
        };
        reader.readAsArrayBuffer(e.data);
        return;
      }

      try {
        const msg: WSMessage = JSON.parse(e.data);
        switch (msg.type) {
          case "transcript":
            callbacks.current.onTranscript?.(msg);
            break;
          case "reply_chunk":
            callbacks.current.onReplyChunk?.(msg);
            break;
          case "reply_done":
            callbacks.current.onReplyDone?.(msg);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("WS message error:", err);
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      console.log(
        `WS: Connection closed (code: ${event.code}, reason: ${event.reason}), reconnecting in 2s...`,
      );
      setIsConnected(false);
      wsRef.current = null;
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = (e) => {
      if (wsRef.current !== ws) return;
      console.error("WS error:", e);
      callbacks.current.onStatusChange?.("error", "Connection failed");
    };
  }, []);

  const sendAudio = useCallback((blob: Blob) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(blob);
    }
  }, []);

  const sendCommand = useCallback((cmd: Partial<WSMessage>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  // Main lifecycle
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [connect]);

  // Dynamic voice update WITHOUT reconnecting
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("WS: Syncing voice settings...");
      wsRef.current.send(
        JSON.stringify({
          type: "set_voice",
          engine: selectedVoice.engine,
          voice: selectedVoice.voice,
        }),
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
