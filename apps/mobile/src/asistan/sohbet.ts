import type { FieldCreate } from '@tarim/schemas';
import type { PusulaCardDto } from '../api/client';
import { centroid } from '../flow/draft';
import { medyaBul, type Gorsel, type Video } from './medya';
import { EYLEMLER, niyetBul, sadelestir, type Eylem, type EylemKey } from './niyet';

/**
 * Robot sohbet motoru: çiftçi sayfa değiştirmeden, küçük bir sohbet kartında iş görür. Tarla ekleme
 * sırayla sorulur (konum, ürün, ad) ve arka planda kaydedilir; bilgi soruları Pusula'ya (kaynaklı, doz
 * vermeyen) gider, uygun video/fotoğraf eklenir. Motor saf mantıktır: ağ, konum ve kayıt `Ortam` ile verilir.
 */
export interface Secenek {
  etiket: string;
  deger: string;
}

export type Kart =
  | { tur: 'video'; video: Video }
  | { tur: 'gorsel'; gorsel: Gorsel }
  | { tur: 'baglanti'; baslik: string; adres: string }
  | { tur: 'kaynak'; satir: string };

export interface Mesaj {
  id: number;
  kimden: 'robot' | 'ben';
  metin: string;
  secenekler?: Secenek[];
  kartlar?: Kart[];
  /** İstenirse açılabilecek ekran (sohbet kartından çıkmaz; yalnız çiftçi dokunursa). */
  eylem?: Eylem;
  /** Gönderilen fotoğraf (yalnız ekranda; geçmişe yazılmaz). */
  gorsel?: string;
  /** Fotoğraf gönderildi notu (geçmişte görünür). */
  fotoNotu?: boolean;
}

interface Taslak {
  lat?: number;
  lon?: number;
  kaynak?: FieldCreate['locationSource'];
  il?: string;
  ilce?: string;
  koy?: string;
  cropId?: string;
  cropAd?: string;
}

export type Durum =
  | { k: 'bos'; son?: string }
  | { k: 'konum'; t: Taslak }
  | { k: 'il'; t: Taslak }
  | { k: 'ilce'; t: Taslak }
  | { k: 'koy'; t: Taslak }
  | { k: 'urun'; t: Taslak }
  | { k: 'ad'; t: Taslak };

export interface Ortam {
  konumAl(): Promise<{ lat: number; lon: number } | null>;
  iller(): Promise<string[]>;
  ilceler(il: string): Promise<string[]>;
  koyler(
    il: string,
    ilce: string,
    ara?: string,
  ): Promise<{ name: string; lat: number; lon: number }[]>;
  urunler(): Promise<{ id: string; nameTr: string; commonRank: number | null }[]>;
  kaydet(
    p: FieldCreate,
  ): Promise<{ durum: 'gonderildi' | 'sirada' | 'reddedildi'; mesaj?: string; id?: string }>;
  tarlalar(): Promise<{ id: string; name: string; il?: string | null; ilce?: string | null }[]>;
  /** Seçili tarlanın bugünkü hava özeti (tek cümle); yoksa null. */
  bugun(): Promise<string | null>;
  /** Seçili tarlanın yaklaşan işleri (satır satır). */
  takvim(): Promise<string[]>;
  sor(soru: string): Promise<PusulaCardDto>;
  /** 32: Pusula'nın kaynaklı cevap veremediği serbest sohbet için Nuvia (robot_sohbet); yoksa/çökerse null. */
  robot?(
    soru: string,
    onceki?: string,
  ): Promise<{ cevap: string; yonlendir: EylemKey | null } | null>;
  /** Seçili tarlanın ürün kimliği (video seçimi için). */
  urunKimligi(): Promise<string | null>;
}

export const SORU_UYARISI =
  'Nuvia yalnızca bir yapay zekâdır; cevapları hata içerebilir. Tüm risk size aittir. İlaç ve gübre miktarı için ziraat mühendisine ve ilaç etiketine danışın.';

const IPTAL = /\b(iptal|vazgec|vazgectim|bos ver|kapat)\b/;

let sayac = 0;
export const robot = (metin: string, ek: Partial<Mesaj> = {}): Mesaj => ({
  id: ++sayac,
  kimden: 'robot',
  metin,
  ...ek,
});
export const ben = (metin: string): Mesaj => ({ id: ++sayac, kimden: 'ben', metin });

/** Girdiyle eşleşen adaylar: tam eşleşme → önek → içerir. En çok 6. */
export function eslesenler<T>(girdi: string, liste: T[], ad: (x: T) => string): T[] {
  const n = sadelestir(girdi);
  if (!n) return [];
  const norm = liste.map((x) => ({ x, a: sadelestir(ad(x)) }));
  const tam = norm.filter((o) => o.a === n);
  if (tam.length) return tam.slice(0, 6).map((o) => o.x);
  const onek = norm.filter((o) => o.a.startsWith(n));
  if (onek.length) return onek.slice(0, 6).map((o) => o.x);
  return norm
    .filter((o) => o.a.includes(n))
    .slice(0, 6)
    .map((o) => o.x);
}

/** Ürün adını kataloğa eşler ("fıstık" → Antep fıstığı). Aynı ailenin varyantları arasında en kısa kimlik seçilir. */
export function urunEslestir(
  girdi: string,
  urunler: { id: string; nameTr: string }[],
): { id: string; nameTr: string }[] {
  const n = sadelestir(girdi);
  if (n.length < 3) return [];
  const hit = urunler.filter((u) => {
    const ad = sadelestir(u.nameTr.replace(/\(.*?\)/g, ' '));
    return ad.split(' ').some((w) => {
      if (w.length < 3) return false;
      const kok = w.slice(0, Math.min(w.length, Math.max(4, w.length - 2)));
      return n
        .split(' ')
        .some(
          (g) =>
            g.startsWith(kok) ||
            (g.length >= 4 && w.startsWith(g.slice(0, Math.max(4, g.length - 2)))),
        );
    });
  });
  if (hit.length <= 1) return hit;
  const kisa = [...hit].sort((a, b) => a.id.length - b.id.length)[0]!;
  if (hit.every((h) => h.id === kisa.id || h.id.startsWith(`${kisa.id}-`))) return [kisa];
  return hit.slice(0, 6);
}

const evetMi = (s: string) =>
  /^(evet|e|tamam|aynen|arazimdeyim|buradayim|evet arazimdeyim|ev)\b/.test(sadelestir(s)) ||
  sadelestir(s) === 'evet';
const hayirMi = (s: string) =>
  /^(hayir|h|degilim|yok|hayir degilim|baska yerdeyim)\b/.test(sadelestir(s));

export interface Adim {
  durum: Durum;
  mesajlar: Mesaj[];
}

const secenek = (...e: [string, string][]): Secenek[] =>
  e.map(([etiket, deger]) => ({ etiket, deger }));

function urunSor(
  t: Taslak,
  urunler: { id: string; nameTr: string; commonRank: number | null }[],
): Adim {
  const yaygin = urunler
    .filter((u) => u.commonRank !== null)
    .sort((a, b) => a.commonRank! - b.commonRank!)
    .slice(0, 6);
  return {
    durum: { k: 'urun', t },
    mesajlar: [
      robot('Arazinde hangi ürün ekili? Adını yazabilir ya da aşağıdan seçebilirsin.', {
        secenekler: yaygin.map((u) => ({ etiket: u.nameTr, deger: `urun:${u.id}` })),
      }),
    ],
  };
}

async function kaydetVeBitir(t: Taslak, ad: string, o: Ortam): Promise<Adim> {
  const payload: FieldCreate = {
    name: ad,
    lat: t.lat!,
    lon: t.lon!,
    ...(t.il ? { province: t.il } : {}),
    ...(t.ilce ? { district: t.ilce } : {}),
    ...(t.koy ? { village: t.koy } : {}),
    ...(t.cropId ? { cropId: t.cropId } : {}),
    ...(t.kaynak ? { locationSource: t.kaynak } : {}),
  };
  const r = await o.kaydet(payload);
  if (r.durum === 'reddedildi') {
    return {
      durum: { k: 'bos' },
      mesajlar: [robot(`Arazini kaydedemedim. ${r.mesaj ?? 'Biraz sonra yeniden dener misin?'}`)],
    };
  }
  const son =
    r.durum === 'sirada'
      ? `"${ad}" arazini kaydettim. İnternet gelince gönderilecek.`
      : `"${ad}" arazini kaydettim. Artık hava, takvim ve duyurular bu arazine göre gelecek.`;
  return {
    durum: { k: 'bos' },
    mesajlar: [
      robot(son, {
        secenekler: secenek(['Hava durumunu göster', 'hava'], ['Başka arazi ekle', 'tarla ekle']),
      }),
    ],
  };
}

/** Tarla ekleme akışını başlatır. */
export function tarlaEkleBaslat(): Adim {
  return {
    durum: { k: 'konum', t: {} },
    mesajlar: [
      robot('Arazini ekleyelim. Şu an arazinde misin?', {
        secenekler: secenek(['Evet, arazimdeyim', 'evet'], ['Hayır, başka yerdeyim', 'hayir']),
      }),
    ],
  };
}

/** Bir girdiyi (yazı ya da seçenek değeri) işler; yeni durum ve robotun cevapları döner. */
export async function ilerle(durum: Durum, girdi: string, o: Ortam): Promise<Adim> {
  const g = girdi.trim();
  if (durum.k !== 'bos' && IPTAL.test(sadelestir(g))) {
    return {
      durum: { k: 'bos' },
      mesajlar: [robot('Tamam, vazgeçtim. Başka bir şey için buradayım.')],
    };
  }
  switch (durum.k) {
    case 'bos':
      return serbest(g, o, durum.son);
    case 'konum': {
      if (evetMi(g)) {
        const p = await o.konumAl().catch(() => null);
        if (p) {
          return urunSor({ lat: p.lat, lon: p.lon, kaynak: 'gps' }, await o.urunler());
        }
        return {
          durum: { k: 'il', t: {} },
          mesajlar: [
            robot(
              'Konumunu alamadım (izin verilmemiş ya da telefon bulamamış olabilir). Arazin hangi ilde?',
            ),
          ],
        };
      }
      if (hayirMi(g)) {
        return { durum: { k: 'il', t: {} }, mesajlar: [robot('Peki, araziniz hangi ilde?')] };
      }
      return {
        durum,
        mesajlar: [
          robot('Arazinde misin, değil misin? "Evet" ya da "hayır" yazabilirsin.', {
            secenekler: secenek(['Evet, arazimdeyim', 'evet'], ['Hayır', 'hayir']),
          }),
        ],
      };
    }
    case 'il': {
      const hit = eslesenler(g.replace(/^il:/, ''), await o.iller(), (x) => x);
      if (hit.length === 1) {
        return {
          durum: { k: 'ilce', t: { ...durum.t, il: hit[0]! } },
          mesajlar: [robot(`${hit[0]}. Hangi ilçede?`)],
        };
      }
      if (hit.length > 1) {
        return {
          durum,
          mesajlar: [
            robot('Hangisini kastettin?', {
              secenekler: hit.map((x) => ({ etiket: x, deger: `il:${x}` })),
            }),
          ],
        };
      }
      return { durum, mesajlar: [robot('Bu adda bir il bulamadım. İl adını yazar mısın?')] };
    }
    case 'ilce': {
      const il = durum.t.il!;
      const hit = eslesenler(g.replace(/^ilce:/, ''), await o.ilceler(il), (x) => x);
      if (hit.length === 1) {
        return {
          durum: { k: 'koy', t: { ...durum.t, ilce: hit[0]! } },
          mesajlar: [
            robot(`${il}, ${hit[0]}. Hangi köy ya da mahallede?`, {
              secenekler: secenek(['Bilmiyorum, ilçe merkezini kullan', 'koy:merkez']),
            }),
          ],
        };
      }
      if (hit.length > 1) {
        return {
          durum,
          mesajlar: [
            robot('Hangisini kastettin?', {
              secenekler: hit.map((x) => ({ etiket: x, deger: `ilce:${x}` })),
            }),
          ],
        };
      }
      return {
        durum,
        mesajlar: [robot(`${il} ilinde bu adda bir ilçe bulamadım. İlçe adını yazar mısın?`)],
      };
    }
    case 'koy': {
      const { il, ilce } = durum.t as Required<Pick<Taslak, 'il' | 'ilce'>> & Taslak;
      if (g === 'koy:merkez') {
        const c = centroid(await o.koyler(il, ilce));
        if (!c)
          return {
            durum,
            mesajlar: [robot('Bu ilçede köy listesi bulamadım. Köy adını yazar mısın?')],
          };
        return urunSor({ ...durum.t, lat: c.lat, lon: c.lon, kaynak: 'koy' }, await o.urunler());
      }
      const sec = /^koy:(\d+):(.+)$/.exec(g);
      if (sec) {
        const [, , ad] = sec;
        const list = await o.koyler(il, ilce, ad);
        const p = list.find((x) => x.name === ad) ?? list[0];
        if (p)
          return urunSor(
            { ...durum.t, koy: p.name, lat: p.lat, lon: p.lon, kaynak: 'koy' },
            await o.urunler(),
          );
      }
      const list = await o.koyler(il, ilce, g);
      if (list.length === 1) {
        const p = list[0]!;
        return urunSor(
          { ...durum.t, koy: p.name, lat: p.lat, lon: p.lon, kaynak: 'koy' },
          await o.urunler(),
        );
      }
      if (list.length > 1) {
        return {
          durum,
          mesajlar: [
            robot('Hangisi?', {
              secenekler: list
                .slice(0, 6)
                .map((p, i) => ({ etiket: p.name, deger: `koy:${i}:${p.name}` })),
            }),
          ],
        };
      }
      return {
        durum,
        mesajlar: [
          robot(
            'Bu adda köy ya da mahalle bulamadım. Başka yazar mısın ya da ilçe merkezini kullanalım mı?',
            { secenekler: secenek(['İlçe merkezini kullan', 'koy:merkez']) },
          ),
        ],
      };
    }
    case 'urun': {
      const urunler = await o.urunler();
      const dogrudan = /^urun:(.+)$/.exec(g);
      let secilen = dogrudan ? urunler.find((u) => u.id === dogrudan[1]) : undefined;
      if (!secilen) {
        const hit = urunEslestir(g, urunler);
        if (hit.length > 1) {
          return {
            durum,
            mesajlar: [
              robot('Hangisini kastettin?', {
                secenekler: hit.map((u) => ({ etiket: u.nameTr, deger: `urun:${u.id}` })),
              }),
            ],
          };
        }
        secilen = hit[0] ? urunler.find((u) => u.id === hit[0]!.id) : undefined;
      }
      if (!secilen) {
        return {
          durum,
          mesajlar: [
            robot('Bu ürünü listemde bulamadım. Başka bir adla yazar mısın ya da aşağıdan seç.', {
              secenekler: urunler
                .filter((u) => u.commonRank !== null)
                .sort((a, b) => a.commonRank! - b.commonRank!)
                .slice(0, 6)
                .map((u) => ({ etiket: u.nameTr, deger: `urun:${u.id}` })),
            }),
          ],
        };
      }
      const ad = secilen.nameTr.replace(/\s*\(.*?\)\s*/g, ' ').trim();
      return {
        durum: { k: 'ad', t: { ...durum.t, cropId: secilen.id, cropAd: ad } },
        mesajlar: [
          robot(`${ad} ekili. Arazine bir isim vermek ister misin?`, {
            secenekler: secenek(['İsim verme, ben seçeyim', 'ad:otomatik']),
          }),
        ],
      };
    }
    case 'ad': {
      const t = durum.t;
      const varsayilan = t.koy ? `${t.koy} Bahçesi` : t.cropAd ? `${t.cropAd} Arazim` : 'Arazim';
      const ad = g === 'ad:otomatik' || !g ? varsayilan : g.slice(0, 80);
      return kaydetVeBitir(t, ad, o);
    }
  }
}

/** Serbest cümle: tarla ekleme, kısa bilgi (hava, takvim, araziler) ya da Pusula'ya soru. */
async function serbest(g: string, o: Ortam, son?: string): Promise<Adim> {
  const bos: Durum = { k: 'bos' };
  if (!g) return { durum: bos, mesajlar: [] };
  const n = sadelestir(g);
  const e = niyetBul(g);
  // "Uzmana da sor": son soruyu uzmana iletir (Pusula uzman isteğini kuyruğa alır).
  if (e?.key === 'uzmana-sor' && son && n.split(' ').length <= 3) {
    return serbest(`${son} Bunu uzmana iletin.`, o);
  }
  if (e?.key === 'tarla-ekle') return tarlaEkleBaslat();
  if (e?.key === 'hava' && !/\b(don|yagmur|kar)\b.*\b(olur mu|olacak mi|yarin)\b/.test(n)) {
    const b = await o.bugun().catch(() => null);
    return {
      durum: bos,
      mesajlar: [
        robot(
          b ??
            'Hava bilgisini şu an alamadım. Arazin kayıtlı mı? Kayıtlı değilse "tarla ekle" yazabilirsin.',
          b ? {} : { secenekler: secenek(['Tarla ekle', 'tarla ekle']) },
        ),
      ],
    };
  }
  if (e?.key === 'takvim' && /\b(takvim|yapilacak|is\b|isler)/.test(n)) {
    const t = await o.takvim().catch(() => [] as string[]);
    return {
      durum: bos,
      mesajlar: [
        robot(
          t.length
            ? `Yaklaşan işlerin:\n${t.map((x) => `• ${x}`).join('\n')}`
            : 'Şu an için onaylı bir iş kaydı yok. İstersen uzmana sorabilirsin.',
        ),
      ],
    };
  }
  if (e?.key === 'tarlalarim') {
    const l = await o.tarlalar().catch(() => []);
    return {
      durum: bos,
      mesajlar: [
        robot(
          l.length
            ? `Arazilerin:\n${l.map((x) => `• ${x.name}${x.ilce ? ` (${x.ilce})` : ''}`).join('\n')}`
            : 'Henüz arazin yok. Ekleyelim mi?',
          l.length ? {} : { secenekler: secenek(['Tarla ekle', 'tarla ekle']) },
        ),
      ],
    };
  }
  if (e && ['sulama', 'pazar', 'bildirimler', 'ayarlar', 'sorularim'].includes(e.key)) {
    return { durum: bos, mesajlar: [robot(e.say, { eylem: e })] };
  }
  // Bilgi sorusu: Pusula (kaynaklı, doz vermez) + uygun video/fotoğraf.
  let card: PusulaCardDto;
  try {
    card = await o.sor(g);
  } catch {
    return {
      durum: bos,
      mesajlar: [
        robot('Şu an cevap alamadım. İnternet bağlantını kontrol edip tekrar dener misin?'),
      ],
    };
  }
  // Kaynaklı cevap yoksa çıkmaza girme: Nuvia robotu genel ve güvenli bir cevap verir (doz/teşhis yok), uygulama sayfasına yönlendirir.
  if (card.kind === 'handoff' && o.robot) {
    const r = await o.robot(g, son).catch(() => null);
    if (r) {
      const e2 = r.yonlendir ? EYLEMLER[r.yonlendir] : undefined;
      return {
        durum: { k: 'bos', son: g },
        mesajlar: [
          robot(r.cevap, {
            ...(e2 ? { eylem: e2 } : {}),
            secenekler: secenek(['Uzmana da sor', 'uzmana sor']),
          }),
        ],
      };
    }
  }
  const metin = [
    card.title,
    ...card.steps.map((s, i) => `${i + 1}. ${s}`),
    card.steps.length === 0 ? card.why : '',
  ]
    .filter(Boolean)
    .join('\n');
  const medya = medyaBul(g, await o.urunKimligi().catch(() => null));
  const kartlar: Kart[] = [];
  for (const v of medya.videolar) kartlar.push({ tur: 'video', video: v });
  for (const gr of medya.gorseller) kartlar.push({ tur: 'gorsel', gorsel: gr });
  if (medya.aramaAdresi)
    kartlar.push({ tur: 'baglanti', baslik: "YouTube'da ara", adres: medya.aramaAdresi });
  for (const s of card.sources) kartlar.push({ tur: 'kaynak', satir: `${s.title} · ${s.date}` });
  return {
    durum: { k: 'bos', son: g },
    mesajlar: [
      robot(metin, {
        kartlar,
        secenekler: card.kind === 'answer' ? undefined : secenek(['Uzmana da sor', 'uzmana sor']),
      }),
    ],
  };
}

/** Düğme değeri → cümle ("hava" gibi kısa komutlar serbest cümle gibi işlenir). */
export const secenekMetni = (s: Secenek): string => s.etiket;

export { EYLEMLER };
