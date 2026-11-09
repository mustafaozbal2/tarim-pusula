import { Platform } from 'react-native';
import type { KV } from '../offline/kv';

/**
 * Çiftçinin takvim notları: telefonda saklanır. Her not için o gün, 1 gün önce ve 2 gün önce saat 09:00'da
 * telefon bildirimi kurulur ("Şu işinize 2 gün kaldı").
 */
export interface Not {
  id: string;
  /** YYYY-MM-DD */
  tarih: string;
  metin: string;
  /** Kurulan bildirimlerin kimlikleri (silmede iptal için). */
  bildirimler?: string[];
}

export const NOT_ANAHTAR = 'takvim.notlar.v1';
export const HATIRLATMA_SAATI = 9;

export interface Hatirlatma {
  /** Yerel saat ISO (YYYY-MM-DDTHH:00:00). */
  zaman: string;
  baslik: string;
  govde: string;
}

const gunEkle = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** O gün, 1 ve 2 gün öncesi 09:00; geçmişte kalanlar kurulmaz. `simdi` yerel ISO. */
export function hatirlatmalar(not: Pick<Not, 'tarih' | 'metin'>, simdi: string): Hatirlatma[] {
  const saat = String(HATIRLATMA_SAATI).padStart(2, '0');
  const kisa = not.metin.length > 80 ? `${not.metin.slice(0, 79)}…` : not.metin;
  return [2, 1, 0]
    .map((once) => ({
      zaman: `${gunEkle(not.tarih, -once)}T${saat}:00:00`,
      baslik: once === 0 ? 'Bugün yapılacak işiniz' : `İşinize ${once} gün kaldı`,
      govde: kisa,
    }))
    .filter((h) => h.zaman > simdi);
}

export async function notlariOku(kv: KV): Promise<Not[]> {
  try {
    const raw = await kv.get(NOT_ANAHTAR);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as Not[]) : [];
  } catch {
    return [];
  }
}

async function yaz(kv: KV, l: Not[]): Promise<Not[]> {
  const sirali = [...l].sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0));
  await kv.set(NOT_ANAHTAR, JSON.stringify(sirali));
  return sirali;
}

/** Telefon bildirimlerini kurar; web'de ya da izin yoksa boş döner (not yine kaydedilir). */
async function kur(h: Hatirlatma[]): Promise<string[]> {
  if (Platform.OS === 'web' || h.length === 0) return [];
  try {
    const N = await import('expo-notifications');
    let izin = await N.getPermissionsAsync();
    if (!izin.granted) izin = await N.requestPermissionsAsync();
    if (!izin.granted) return [];
    const ids: string[] = [];
    for (const x of h) {
      ids.push(
        await N.scheduleNotificationAsync({
          content: { title: x.baslik, body: x.govde, data: { tur: 'takvim-notu' } },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(x.zaman) },
        }),
      );
    }
    return ids;
  } catch {
    return [];
  }
}

async function iptal(ids: string[] | undefined): Promise<void> {
  if (Platform.OS === 'web' || !ids?.length) return;
  try {
    const N = await import('expo-notifications');
    for (const id of ids) await N.cancelScheduledNotificationAsync(id);
  } catch {
    // Bildirim zaten gitmiş olabilir.
  }
}

const yerelSimdi = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
};

export async function notEkle(kv: KV, tarih: string, metin: string): Promise<Not[]> {
  const temiz = metin.trim().slice(0, 300);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || !temiz) return notlariOku(kv);
  const not: Not = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    tarih,
    metin: temiz,
  };
  not.bildirimler = await kur(hatirlatmalar(not, yerelSimdi()));
  return yaz(kv, [...(await notlariOku(kv)), not]);
}

export async function notSil(kv: KV, id: string): Promise<Not[]> {
  const l = await notlariOku(kv);
  await iptal(l.find((n) => n.id === id)?.bildirimler);
  return yaz(
    kv,
    l.filter((n) => n.id !== id),
  );
}
