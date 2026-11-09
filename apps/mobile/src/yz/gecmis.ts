import type { KV } from '../offline/kv';
import type { Mesaj } from '../asistan/sohbet';

/** Yapay zekâ sohbet geçmişi: yalnız telefonda saklanır (KVKK: sunucuya sohbet arşivi yazılmaz). */
export interface Sohbet {
  id: string;
  baslik: string;
  /** Son ileti zamanı (ISO). */
  zaman: string;
  mesajlar: Mesaj[];
}

export const GECMIS_ANAHTAR = 'yz.sohbetler.v1';
export const EN_COK_SOHBET = 30;
export const EN_COK_MESAJ = 80;

/** İlk kullanıcı iletisinden kısa başlık. */
export function baslikUret(mesajlar: Mesaj[]): string {
  const ilk =
    mesajlar.find((m) => m.kimden === 'ben' && m.metin.trim())?.metin.trim() ?? 'Yeni sohbet';
  return ilk.length > 48 ? `${ilk.slice(0, 47)}…` : ilk;
}

export async function sohbetleriOku(kv: KV): Promise<Sohbet[]> {
  try {
    const raw = await kv.get(GECMIS_ANAHTAR);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as Sohbet[]) : [];
  } catch {
    return [];
  }
}

/** Sohbeti en üste yazar; fotoğraf verisi (base64) geçmişe yazılmaz, yalnız "fotoğraf" notu kalır. */
export async function sohbetKaydet(kv: KV, s: Sohbet): Promise<Sohbet[]> {
  const temiz: Sohbet = {
    ...s,
    baslik: s.baslik || baslikUret(s.mesajlar),
    mesajlar: s.mesajlar
      .slice(-EN_COK_MESAJ)
      .map((m) => ({ ...m, gorsel: undefined, secenekler: undefined })),
  };
  const liste = [temiz, ...(await sohbetleriOku(kv)).filter((x) => x.id !== s.id)].slice(
    0,
    EN_COK_SOHBET,
  );
  await kv.set(GECMIS_ANAHTAR, JSON.stringify(liste));
  return liste;
}

export async function sohbetSil(kv: KV, id: string): Promise<Sohbet[]> {
  const liste = (await sohbetleriOku(kv)).filter((x) => x.id !== id);
  await kv.set(GECMIS_ANAHTAR, JSON.stringify(liste));
  return liste;
}
