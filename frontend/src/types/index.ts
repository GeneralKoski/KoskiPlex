export interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export interface Timing {
  stt_ms: number;
  llm_first_token_ms: number;
  llm_total_ms: number;
  total_ms: number;
}

export interface Voice {
  name: string;
  engine: 'edge' | 'xtts';
  language?: string;
}

export interface VoicesState {
  default: Voice[];
  custom: Voice[];
}

export interface SelectedVoice {
  engine: 'edge' | 'xtts';
  voice: string;
}

export interface WSMessage {
  type: 'transcript' | 'reply_chunk' | 'audio_chunk' | 'reply_done' | 'interrupt' | 'clear' | 'set_voice';
  text?: string;
  data?: string; // hex for audio in, base64 for audio out
  language?: string;
  full_reply?: string;
  timing?: Timing;
  engine?: string;
  voice?: string;
  ext?: string;
}

export type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface AccentColor {
  r: number;
  g: number;
  b: number;
}
