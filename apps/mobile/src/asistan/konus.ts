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
/** Her konuşmaya artan bir jeton verilir; susturulunca eski konuşmanın bekleyen adımları iptal olur. */
let seri = 0;
let sesleniyor = false;

/** Robot şu an konuşuyor mu (mikrofon açılmadan önce susturulmalı: robot kendi sesini duymasın; MP-5d). */
export const konusuyor = (): boolean => sesleniyor;

export function sustur(): void {
  seri++;
  sesleniyor = false;
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
  const benim = seri;
  void (async () => {
    let ses: string | undefined;
    try {
      ses = enIyiSes(await Speech.getAvailableVoicesAsync());
    } catch {
      /* varsayılan ses */
    }
    if (benim !== seri) return;
    const bitti = () => {
      if (benim === seri) sesleniyor = false;
      bitince?.();
    };
    sesleniyor = true;
    Speech.speak(metin, {
      language: 'tr-TR',
      ...(ses ? { voice: ses } : {}),
      rate: 0.97,
      pitch: 1.05,
      onDone: bitti,
      onStopped: bitti,
      onError: bitti,
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

/** Nuvia sesini arka planda getirir (dosya ya da data: adresi); expo-audio yoksa ya da ses gelmezse null. */
async function nuviaSesiHazirla(metin: string, api: SesApi): Promise<string | null> {
  try {
    // expo-audio native modüldür; kurulu değilse require hata verir ve cihaz sesine düşülür.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-audio');
    const r = await api.robotSes(metin);
    if (!r.ses) return null;
    return dosyayaYaz(r.ses.ses_b64) ?? `data:${r.ses.mime};base64,${r.ses.ses_b64}`;
  } catch {
    return null;
  }
}

function nuviaSesiOynat(uri: string, bitince?: () => void): boolean {
  const benim = seri;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAudioPlayer } = require('expo-audio') as {
      createAudioPlayer(src: { uri: string }): {
        play(): void;
        pause(): void;
        remove(): void;
        addListener(e: string, f: (s: { didJustFinish?: boolean }) => void): { remove(): void };
      };
    };
    const p = createAudioPlayer({ uri });
    oynatici = p;
    sesleniyor = true;
    p.addListener('playbackStatusUpdate', (s) => {
      if (!s.didJustFinish) return;
      try {
        p.remove();
      } catch {
        /* kaldırıldı */
      }
      if (oynatici === p) oynatici = null;
      if (benim === seri) sesleniyor = false;
      bitince?.();
    });
    p.play();
    return true;
  } catch {
    return false;
  }
}

/** İlk cümle (en çok ~140 karakter) ve kalanı. */
export function ilkCumleyiAyir(metin: string): [string, string] {
  const m = /^(.{12,140}?[.!?])\s+(.+)$/s.exec(metin);
  return m ? [m[1]!, m[2]!] : [metin, ''];
}

/**
 * Robot konuşması (MP-5c: bekletmez). İlk cümle cihaz sesiyle HEMEN başlar; kalan metnin Nuvia kadın sesi
 * bu sırada arka planda hazırlanır ve ilk cümle bitince devreye girer (gelmezse cihaz sesi sürer). Tek
 * cümlelik cevaplar doğrudan cihaz sesiyle okunur.
 */
export async function konus(m: string, api: SesApi, bitince?: () => void): Promise<void> {
  const metin = okunacakMetin(m);
  if (!metin) return bitince?.();
  sustur();
  const benim = seri;
  const [ilk, kalan] = ilkCumleyiAyir(metin);
  if (!kalan) return cihazSesiyle(metin, bitince);
  const hazir = nuviaSesiHazirla(kalan, api);
  cihazSesiyle(ilk, () => {
    void (async () => {
      if (benim !== seri) return;
      const uri = await Promise.race([
        hazir,
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]);
      if (benim !== seri) return;
      if (uri && nuviaSesiOynat(uri, bitince)) return;
      cihazSesiyle(kalan, bitince);
    })();
  });
}
