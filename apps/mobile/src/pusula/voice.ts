import { Platform } from 'react-native';
import type { ListenOutcome } from './voiceTypes';

export type { ListenOutcome } from './voiceTypes';

interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | undefined {
  if (Platform.OS !== 'web') return undefined;
  const w = globalThis as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Web: tarayıcının konuşma tanıması (Türkçe). Cihazdaki yerel tanıma `voice.native.ts` içindedir. */
export const voiceSupported = () => ctor() !== undefined;

export function listen(): Promise<ListenOutcome> {
  const R = ctor();
  if (!R) return Promise.resolve({ kind: 'unsupported' });
  return new Promise((resolve) => {
    const r = new R();
    r.lang = 'tr-TR';
    r.interimResults = false;
    let text: string | null = null;
    let denied = false;
    r.onresult = (e) => {
      text = e.results[0]?.[0]?.transcript?.trim() || null;
    };
    r.onerror = (e) => {
      denied = e?.error === 'not-allowed' || e?.error === 'service-not-allowed';
    };
    r.onend = () =>
      resolve(text ? { kind: 'text', text } : denied ? { kind: 'denied' } : { kind: 'none' });
    r.start();
  });
}
