import { Platform } from 'react-native';

interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
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

/** Sesle sorma: şimdilik tarayıcının konuşma tanıması (Türkçe). Cihazda yerel tanıma sonraki iş. */
export const voiceSupported = () => ctor() !== undefined;

export function listenOnce(): Promise<string | null> {
  const R = ctor();
  if (!R) return Promise.resolve(null);
  return new Promise((resolve) => {
    const r = new R();
    r.lang = 'tr-TR';
    r.interimResults = false;
    let text: string | null = null;
    r.onresult = (e) => {
      text = e.results[0]?.[0]?.transcript?.trim() || null;
    };
    r.onerror = () => resolve(null);
    r.onend = () => resolve(text);
    r.start();
  });
}
