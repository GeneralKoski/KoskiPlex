import { RefObject, useCallback, useEffect, useRef } from "react";

export interface AudioContextHook {
  initAudioContext: () => { ctx: AudioContext; analyser: AnalyserNode };
  queueAudio: (base64: string) => void;
  stopPlayback: () => void;
  analyser: RefObject<AnalyserNode | null>;
  audioContext: RefObject<AudioContext | null>;
  isPlaying: RefObject<boolean>;
}

export function useAudioContext(): AudioContextHook {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const queueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = (window.AudioContext ||
        (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(ctx.destination);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
    }

    if (audioContextRef.current!.state === "suspended") {
      audioContextRef.current!.resume();
    }

    return { ctx: audioContextRef.current!, analyser: analyserRef.current! };
  }, []);

  const playNext = useCallback(async () => {
    if (queueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const { ctx, analyser } = initAudioContext();
    const base64 = queueRef.current.shift();
    if (!base64) return;

    try {
      const binaryString = window.atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);

      sourceRef.current = source;
      source.onended = () => playNext();
      source.start(0);
    } catch (err) {
      console.error("Audio playback error:", err);
      playNext();
    }
  }, [initAudioContext]);

  const queueAudio = useCallback(
    (base64: string) => {
      queueRef.current.push(base64);
      if (!isPlayingRef.current) {
        playNext();
      }
    },
    [playNext],
  );

  const stopPlayback = useCallback(() => {
    queueRef.current = [];
    isPlayingRef.current = false;
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch (e) {}
      sourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopPlayback]);

  return {
    initAudioContext,
    queueAudio,
    stopPlayback,
    analyser: analyserRef,
    audioContext: audioContextRef,
    isPlaying: isPlayingRef,
  };
}
