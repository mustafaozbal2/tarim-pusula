import { sadelestir } from './niyet';

/**
 * Robot sohbetinde gösterilen eğitim videoları ve fotoğraflar. Videolar elle seçilip YouTube'un kendi
 * doğrulama ucuyla (oEmbed) sınanmış gerçek videolardır (başlık ve kanal oradan alındı, 2026-11-07);
 * kimlik uydurulmaz. Nuvia bağlanınca aynı biçimde dinamik video/görsel döndürebilir.
 * Videolar çiftçinin YouTube'da kendi başına izleyeceği bilgidir: uygulama içeriğini onaylamış sayılmaz.
 */
export interface Video {
  id: string;
  baslik: string;
  kanal: string;
}

export interface Gorsel {
  adres: string;
  baslik: string;
  atif: string;
}

export type MedyaKonu = 'budama';
export type MedyaUrun = 'antep-fistigi' | 'zeytin' | 'kiraz';

const V = (id: string, baslik: string, kanal: string): Video => ({ id, baslik, kanal });

const VIDEOLAR: Record<`${MedyaUrun}:${MedyaKonu}`, Video[]> = {
  'antep-fistigi:budama': [
    V(
      'QGPB4ajoSzI',
      'Antepfıstığında Budama Zamanı ve Budama Mantığı',
      'Zir. Yük. Müh. Mehmet Şirin Yıldırım',
    ),
    V(
      'S_KHq9cVrvM',
      'Antepfıstığında Gençleştirme Budaması',
      'Zir. Yük. Müh. Mehmet Şirin Yıldırım',
    ),
  ],
  'zeytin:budama': [
    V('9AI3m0_t7gA', 'Tüm Ayrıntılarıyla Zeytin Budama Eğitimi', 'Yunusun Çiftliği'),
    V('wNVucjamSac', '20 Yaş Zeytin Ağacında Budama: Gençleştirme ve Ürün Budaması', 'Eren Vural'),
  ],
  'kiraz:budama': [
    V('8vy9itqIRfs', 'Kiraz (Vişne) Budaması, Bodur Ağaç, 1. Bölüm', 'BirBilen'),
    V('_GfhCE_DeVU', 'Aşılanan Büyük Kiraz Ağacının İlk Yıl Budaması', 'ahmet meşe'),
  ],
};

const FILE = (ad: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(ad)}?width=640`;

const GORSELLER: Partial<Record<`${MedyaUrun}:${MedyaKonu}`, Gorsel[]>> = {
  'kiraz:budama': [
    {
      adres: FILE('Dried sap from cut tree in a cherry orchard in East Wenatchee Washington.jpg'),
      baslik: 'Kirazda kalın kesim yeri: yara, zamk akıntısı bırakmasın diye kuru havada kesilir.',
      atif: 'Thayne Tuason, Wikimedia Commons (CC BY-SA 4.0)',
    },
  ],
  'zeytin:budama': [
    {
      adres: FILE('Olive Grove prunings in neat rows. Ostuni, Puglia.jpg'),
      baslik: 'Budanmış zeytinlik: kesilen dallar sıra arasına toplanmış.',
      atif: 'Ian Alexander, Wikimedia Commons (CC BY-SA 4.0)',
    },
  ],
};

export interface Medya {
  videolar: Video[];
  gorseller: Gorsel[];
  /** "YouTube'da ara" adresi (öğretici bir soruysa). */
  aramaAdresi: string | null;
}

export const videoAdresi = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const videoKucuk = (id: string) => `https://img.youtube.com/vi/${id}/mqdefault.jpg`;

function urunBul(n: string, urunId?: string | null): MedyaUrun | null {
  if (/\bfistik|\bfistig/.test(n)) return 'antep-fistigi';
  if (/\bzeytin/.test(n)) return 'zeytin';
  if (/\bkiraz|\bvisne/.test(n)) return 'kiraz';
  if (urunId === 'antep-fistigi' || urunId === 'zeytin') return urunId;
  if (urunId?.startsWith('elma-kiraz-armut')) return 'kiraz';
  return null;
}

/** Soruya uygun video/görsel; yoksa boş. Öğretici soruya YouTube arama bağlantısı eklenir. */
export function medyaBul(soru: string, urunId?: string | null): Medya {
  const n = sadelestir(soru);
  const konu: MedyaKonu | null = /\bbudam|\bbudan|\bkesim\b|\bkesilir/.test(n) ? 'budama' : null;
  const urun = urunBul(n, urunId);
  const key = konu && urun ? (`${urun}:${konu}` as const) : null;
  const ogretici = /\bnasil|\bvideo|\bizle|\bgoster|\bogren|\bbudam/.test(n);
  return {
    videolar: key ? (VIDEOLAR[key] ?? []).slice(0, 2) : [],
    gorseller: key ? (GORSELLER[key] ?? []).slice(0, 2) : [],
    aramaAdresi: ogretici
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(soru.trim().slice(0, 100))}`
      : null,
  };
}
