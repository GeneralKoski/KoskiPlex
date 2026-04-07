import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AppStatus } from "../types";

const SILENCE_THRESHOLD = 50;
const SILENCE_DURATION = 1500;
const MIN_SPEECH_MS = 800;

interface UseVoiceRecorderProps {
  onAudioStop: (blob: Blob | null) => void;
  onStatusChange: (status: AppStatus, errMsg?: string) => void;
  analyserRef: RefObject<AnalyserNode | null>;
}

interface VoiceRecorderHook {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

export function useVoiceRecorder({
  onAudioStop,
  onStatusChange,
  analyserRef,
}: UseVoiceRecorderProps): VoiceRecorderHook {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceCheckRef = useRef<number | null>(null);
  const hadSpeechRef = useRef(false);
  const speechStartRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const stopRecording = useCallback(() => {
    if (silenceCheckRef.current !== null) {
      cancelAnimationFrame(silenceCheckRef.current);
      silenceCheckRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    hadSpeechRef.current = false;
    speechStartRef.current = null;
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const speechDuration = speechStartRef.current
          ? Date.now() - speechStartRef.current
          : 0;
        if (hadSpeechRef.current && speechDuration >= MIN_SPEECH_MS) {
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType,
          });
          onAudioStop?.(blob);
        } else {
          onAudioStop?.(null); // Re-trigger recording if active
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      onStatusChange?.("listening");

      const analyserNode = analyserRef.current;
      if (analyserNode) {
        const source = (analyserNode.context as AudioContext).createMediaStreamSource(stream);
        source.connect(analyserNode);
        sourceNodeRef.current = source;

        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        let silentSince: number | null = null;

        const check = () => {
          analyserNode.getByteFrequencyData(dataArray);
          const avg =
            dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;

          if (avg >= SILENCE_THRESHOLD) {
            if (!hadSpeechRef.current) speechStartRef.current = Date.now();
            hadSpeechRef.current = true;
            silentSince = null;
          } else if (hadSpeechRef.current) {
            if (!silentSince) silentSince = Date.now();
            if (Date.now() - silentSince! > SILENCE_DURATION) {
              stopRecording();
              return;
            }
          }
          silenceCheckRef.current = requestAnimationFrame(check);
        };
        silenceCheckRef.current = requestAnimationFrame(check);
      }
    } catch (err) {
      console.error("Microphone error:", err);
      onStatusChange?.("error", "Microphone access denied");
    }
  }, [onAudioStop, onStatusChange, analyserRef, stopRecording]);

  useEffect(() => {
    return () => stopRecording();
  }, [stopRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
}
