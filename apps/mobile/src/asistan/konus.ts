import * as Speech from 'expo-speech';

/**
 * Robotun sesi. Sıra: (1) Nuvia'nın kadın sesi (sunucudan WAV; expo-audio kuruluysa), (2) cihazın en iyi Türkçe sesi.
 * Hangisi çökerse sıradaki devreye girer; çiftçi hata görmez. Okunmayacak işaretler (madde noktası, satır sonu) temizlenir.
 */
export interface SesApi {
  robotSes(metin: string): Promise<{ ses: { mime: string; ses_b64: string } | null }>;
}

export function okunacakMetin(m: string): string {
  return m
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[•*_#>`]/g, ' ')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/([.:;!?])\s*\./g, '$1')
    .trim()
    .slice(0, 600);
}

/** Cihaz seslerinden en kaliteli Türkçe olanı (Enhanced > ağ sesi > diğer). */
export function enIyiSes(
  sesler: { identifier: string; language: string; quality?: string }[],
): string | undefined {
  const tr = sesler.filter((s) => /^tr[-_]TR$/i.test(s.language) || /^tr/i.test(s.language));
  const puan = (s: { identifier: string; quality?: string }) =>
    (s.quality === 'Enhanced' ? 4 : 0) + (/network|neural|wavenet/i.test(s.identifier) ? 2 : 0);
  return tr.sort((a, b) => puan(b) - puan(a))[0]?.identifier;
}

let oynatici: { pause(): void; remove(): void } | null = null;

export function sustur(): void {
  try {
    oynatici?.pause();
    oynatici?.remove();
  } catch {
    /* zaten durdu */
  }
  oynatici = null;
  void Speech.stop();
}

function cihazSesiyle(metin: string, bitince?: () => void): void {
  void (async () => {
    let ses: string | undefined;
    try {
      ses = enIyiSes(await Speech.getAvailableVoicesAsync());
    } catch {
      /* varsayılan ses */
    }
    Speech.speak(metin, {
      language: 'tr-TR',
      ...(ses ? { voice: ses } : {}),
      rate: 0.97,
      pitch: 1.05,
      onDone: bitince,
      onStopped: bitince,
      onError: bitince,
    });
  })();
}

function dosyayaYaz(b64: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('expo-file-system') as {
      File: new (...a: unknown[]) => {
        create(o?: { overwrite?: boolean }): void;
        write(b: Uint8Array): void;
        uri: string;
      };
      Paths: { cache: unknown };
    };
    const bin = globalThis.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const f = new fs.File(fs.Paths.cache, `robot-ses-${Date.now()}.wav`);
    f.create({ overwrite: true });
    f.write(bytes);
    return f.uri;
  } catch {
    return null;
  }
}

async function nuviaSesiyle(metin: string, api: SesApi, bitince?: () => void): Promise<boolean> {
  try {
    // expo-audio native modüldür; kurulu değilse require hata verir ve cihaz sesine düşülür.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAudioPlayer } = require('expo-audio') as {
      createAudioPlayer(src: { uri: string }): {
        play(): void;
        pause(): void;
        remove(): void;
        addListener(e: string, f: (s: { didJustFinish?: boolean }) => void): { remove(): void };
      };
    };
    const r = await api.robotSes(metin);
    if (!r.ses) return false;
    // Önce önbellek dosyasına yazılır (Android'de büyük data: adreslerinden daha güvenilir); olmazsa data: adresi.
    const p = createAudioPlayer({
      uri: dosyayaYaz(r.ses.ses_b64) ?? `data:${r.ses.mime};base64,${r.ses.ses_b64}`,
    });
    oynatici = p;
    p.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) {
        try {
          p.remove();
        } catch {
          /* kaldırıldı */
        }
        if (oynatici === p) oynatici = null;
        bitince?.();
      }
    });
    p.play();
    return true;
  } catch {
    return false;
  }
}

export async function konus(m: string, api: SesApi, bitince?: () => void): Promise<void> {
  const metin = okunacakMetin(m);
  if (!metin) return bitince?.();
  sustur();
  if (!(await nuviaSesiyle(metin, api, bitince))) cihazSesiyle(metin, bitince);
}
