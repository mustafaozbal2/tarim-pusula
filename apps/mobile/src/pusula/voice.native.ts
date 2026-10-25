import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { ListenOutcome } from './voiceTypes';

export type { ListenOutcome } from './voiceTypes';

/**
 * Cihazda yerel ses tanıma (Android/iOS, expo-speech-recognition; Türkçe). Telefon desteklemiyorsa
 * (tanıma servisi yok) false döner ve arayüz dürüst mesaj verir. İzin istenir, reddedilirse yazarak
 * sorulabilir.
 */
export function voiceSupported(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export async function listen(): Promise<ListenOutcome> {
  if (!voiceSupported()) return { kind: 'unsupported' };
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) return { kind: 'denied' };
  return new Promise((resolve) => {
    let text: string | null = null;
    let failure: ListenOutcome | null = null;
    const subs: { remove(): void }[] = [];
    const done = (o: ListenOutcome) => {
      subs.forEach((s) => s.remove());
      resolve(o);
    };
    subs.push(
      ExpoSpeechRecognitionModule.addListener('result', (e) => {
        if (e.isFinal) text = e.results[0]?.transcript?.trim() || null;
      }),
      ExpoSpeechRecognitionModule.addListener('error', (e) => {
        failure =
          e.error === 'not-allowed' || e.error === 'service-not-allowed'
            ? { kind: 'denied' }
            : e.error === 'no-speech' || e.error === 'speech-timeout'
              ? { kind: 'none' }
              : { kind: 'error', code: e.error };
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        done(text ? { kind: 'text', text } : (failure ?? { kind: 'none' }));
      }),
    );
    ExpoSpeechRecognitionModule.start({ lang: 'tr-TR', interimResults: false, maxAlternatives: 1 });
  });
}
