import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryKV } from '../offline/kv';
import { sayfaAdimlari, sayfaAnahtari, sayfaHedefleri, tanitimliSayfalar } from './adimlar';
import {
  karsilamaAc,
  karsilamaKapat,
  KARSILAMA_ANAHTARI,
  SAYFA_ANAHTARI,
  tanitimDurumu,
  tanitimSifirla,
  tanitimTestSifirla,
  tanitimYukle,
  turAc,
  turAdim,
  turKapat,
} from './durum';
import { kartYeri, OK_BOSLUGU, okYolu, otomatikAcilir } from './geometri';
import {
  hedefOlc,
  hedefRef,
  hedefVar,
  kaydiriciEkle,
  etkinKaydirici,
  kaydirmaFarki,
} from './hedef';

const KOK = resolve(import.meta.dirname, '../..');

function dosyalar(dizin: string): string[] {
  const out: string[] = [];
  for (const ad of readdirSync(dizin)) {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) out.push(...dosyalar(yol));
    else if (/\.tsx?$/.test(ad) && !/\.test\./.test(ad)) out.push(yol);
  }
  return out;
}

describe('tanıtım adımları', () => {
  const kaynak = [...dosyalar(join(KOK, 'app')), ...dosyalar(join(KOK, 'src'))]
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  // hedefRef('kimlik') ve hedefRef(`on.${degisken}`) çağrıları.
  const sabit = new Set([...kaynak.matchAll(/hedefRef\('([^']+)'\)/g)].map((m) => m[1]!));
  const onEkler = [...kaynak.matchAll(/hedefRef\(`([^`$]+)\$\{/g)].map((m) => m[1]!);
  const bagli = (h: string) => sabit.has(h) || onEkler.some((o) => h.startsWith(o));

  it('her adımın gösterdiği hedef kodda bir bileşene bağlıdır (boşa ok çizilmez)', () => {
    const eksik: string[] = [];
    for (const s of tanitimliSayfalar())
      for (const h of sayfaHedefleri(s)) if (!bagli(h)) eksik.push(`${s}: ${h}`);
    expect(eksik).toEqual([]);
  });

  it('tanıtımı olan her sayfa gerçek bir ekrandır', () => {
    for (const s of tanitimliSayfalar()) {
      const ad = s === '/' ? '(tabs)/index' : s.slice(1);
      const adaylar = [`app/${ad}.tsx`, `app/${ad}/index.tsx`, `app/(tabs)/${ad}.tsx`];
      expect(
        adaylar.some((a) => existsSync(join(KOK, a))),
        `${s} için ekran dosyası yok`,
      ).toBe(true);
    }
  });

  it('çiftçinin gördüğü ana sayfaların hepsinin tanıtımı vardır', () => {
    const zorunlu = [
      '/',
      '/ikiz-tarim',
      '/ne-eksem',
      '/hava',
      '/yapay-zeka',
      '/tarlalarim',
      '/arazi-islemleri',
      '/takvim',
      '/pazar',
      '/bildirimler',
      '/sulama',
      '/soru-sor',
      '/sorularim',
      '/ayarlar',
      '/ndvi',
      '/tasarruf',
      '/verim-haritasi',
      '/uretim-plani',
      '/cihazlar',
      '/cihaz-ekle',
      '/hatirlaticilar',
      '/veri-cuzdani',
      '/kc-listesi',
      '/toprak-turleri',
      '/resmi-kaynaklar',
      '/entegrasyonlar',
      '/arazi-duzenle',
      '/tarla-ekle',
      '/haber',
    ];
    for (const s of zorunlu) expect(sayfaAdimlari(s).length, s).toBeGreaterThanOrEqual(2);
  });

  it('her sayfa genel bir açıklamayla başlar; metinler kısa, dolu ve emojisizdir', () => {
    for (const s of tanitimliSayfalar()) {
      const adimlar = sayfaAdimlari(s);
      expect(adimlar[0]!.hedef, `${s} ilk adım hedefsiz olmalı`).toBeUndefined();
      for (const a of adimlar) {
        expect(a.baslik.trim().length).toBeGreaterThan(2);
        expect(a.baslik.length).toBeLessThanOrEqual(40);
        expect(a.metin.trim().length).toBeGreaterThan(15);
        expect(a.metin.length, `${s} / ${a.baslik} çok uzun`).toBeLessThanOrEqual(240);
        expect(`${a.baslik}${a.metin}`).not.toMatch(/\p{Extended_Pictographic}/u);
        // Uzman onayı aşaması kapalı: tanıtım metni çiftçiye "onay bekliyor" demez.
        expect(a.metin).not.toMatch(/onay(ı)? bekl/i);
      }
      // Aynı hedef bir sayfada iki kez anlatılmaz.
      const h = sayfaHedefleri(s);
      expect(new Set(h).size, `${s} yinelenen hedef`).toBe(h.length);
    }
  });

  it('ana sayfa turu üst ikonları, sekmeleri ve alt çubuğun beş düğmesini anlatır', () => {
    const h = sayfaHedefleri('/');
    for (const k of [
      'arazilerim',
      'arazi-islemleri',
      'verim-haritasi',
      'hava',
      'uzman',
      'bildirim',
      'menu',
    ])
      expect(h).toContain(`ana.ikon.${k}`);
    for (const k of ['ana', 'ikiz', 'yz', 'hava', 'neeksem']) expect(h).toContain(`alt.${k}`);
    expect(h).toEqual(expect.arrayContaining(['ortak.yardim', 'ana.kartlar', 'ana.sekmeler']));
  });

  it('yol → sayfa anahtarı', () => {
    expect(sayfaAnahtari('/')).toBe('/');
    expect(sayfaAnahtari('')).toBe('/');
    expect(sayfaAnahtari('/index')).toBe('/');
    expect(sayfaAnahtari('/hava/')).toBe('/hava');
    expect(sayfaAnahtari('/haber?id=3')).toBe('/haber');
    expect(sayfaAdimlari('/olmayan-sayfa')).toEqual([]);
  });
});

describe('tanıtım durumu (bir kez gösterilir, ampulle yeniden açılır)', () => {
  beforeEach(() => tanitimTestSifirla());

  it('ilk açılışta hiçbir şey görülmemiştir; karşılama kapanınca kalıcı olarak görüldü sayılır', async () => {
    const kv = new MemoryKV();
    await tanitimYukle(kv);
    expect(tanitimDurumu()).toMatchObject({
      hazir: true,
      karsilamaGoruldu: false,
      gorulenSayfalar: [],
    });
    karsilamaAc();
    expect(tanitimDurumu().karsilamaAcik).toBe(true);
    karsilamaKapat();
    expect(tanitimDurumu()).toMatchObject({ karsilamaAcik: false, karsilamaGoruldu: true });
    expect(await kv.get(KARSILAMA_ANAHTARI)).toBe('1');
    // Uygulama yeniden açılınca karşılama yine görülmüş okunur.
    tanitimTestSifirla();
    await tanitimYukle(kv);
    expect(tanitimDurumu().karsilamaGoruldu).toBe(true);
  });

  it('sayfa turu: adım ilerler, kapanınca o sayfa görüldü olur ve depoya yazılır; yarıda bırakmak da sayılır', async () => {
    const kv = new MemoryKV();
    await tanitimYukle(kv);
    turAc('/hava');
    expect(tanitimDurumu().acik).toEqual({ sayfa: '/hava', adim: 0 });
    turAdim(2);
    expect(tanitimDurumu().acik).toEqual({ sayfa: '/hava', adim: 2 });
    turKapat();
    expect(tanitimDurumu().acik).toBeNull();
    expect(tanitimDurumu().gorulenSayfalar).toEqual(['/hava']);
    expect(JSON.parse((await kv.get(SAYFA_ANAHTARI))!)).toEqual(['/hava']);
    // Ampulle yeniden açıp kapatmak listeyi çoğaltmaz.
    turAc('/hava');
    turKapat();
    expect(tanitimDurumu().gorulenSayfalar).toEqual(['/hava']);
    turAc('/pazar');
    turKapat();
    tanitimTestSifirla();
    await tanitimYukle(kv);
    expect(tanitimDurumu().gorulenSayfalar).toEqual(['/hava', '/pazar']);
  });

  it('"Tanıtımı baştan göster" her şeyi ilk güne döndürür; bozuk depo verisi turu engellemez', async () => {
    const kv = new MemoryKV();
    await kv.set(KARSILAMA_ANAHTARI, '1');
    await kv.set(SAYFA_ANAHTARI, '{bozuk');
    await tanitimYukle(kv);
    expect(tanitimDurumu()).toMatchObject({ karsilamaGoruldu: true, gorulenSayfalar: [] });
    turAc('/');
    turKapat();
    await tanitimSifirla();
    expect(tanitimDurumu()).toMatchObject({
      karsilamaGoruldu: false,
      gorulenSayfalar: [],
      acik: null,
    });
    expect(await kv.get(KARSILAMA_ANAHTARI)).toBeNull();
    expect(await kv.get(SAYFA_ANAHTARI)).toBeNull();
  });

  it('adım değişikliği açık tur yokken yok sayılır', () => {
    turAdim(3);
    expect(tanitimDurumu().acik).toBeNull();
    turKapat();
    expect(tanitimDurumu().gorulenSayfalar).toEqual([]);
  });
});

describe('hedef kaydı ve ölçümü', () => {
  const dugum = (x: number, y: number, w: number, h: number) => ({
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(x, y, w, h),
  });

  it('bağlanan hedef ölçülür; sökülünce kaybolur; aynı kimlikte en son bağlanan (üstteki sayfa) ölçülür', async () => {
    expect(hedefVar('t.a')).toBe(false);
    expect(await hedefOlc('t.a')).toBeNull();
    const sok1 = hedefRef('t.a')(dugum(10, 20, 30, 40)) as () => void;
    expect(hedefVar('t.a')).toBe(true);
    expect(await hedefOlc('t.a')).toEqual({ x: 10, y: 20, w: 30, h: 40 });
    const sok2 = hedefRef('t.a')(dugum(1, 2, 3, 4)) as () => void;
    expect(await hedefOlc('t.a')).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    sok2();
    expect(await hedefOlc('t.a')).toEqual({ x: 10, y: 20, w: 30, h: 40 });
    sok1();
    expect(hedefVar('t.a')).toBe(false);
    // Aynı kimlik için ref işlevi sabittir (yeniden çizimde sök-tak olmaz).
    expect(hedefRef('t.a')).toBe(hedefRef('t.a'));
  });

  it('boyutsuz ya da ölçülemeyen düğüm null döner (yanlış yere ok çizilmez)', async () => {
    const s1 = hedefRef('t.b')(dugum(0, 0, 0, 0)) as () => void;
    expect(await hedefOlc('t.b')).toBeNull();
    s1();
    const s2 = hedefRef('t.b')({ measureInWindow: () => undefined }) as () => void;
    expect(await hedefOlc('t.b', 20)).toBeNull();
    s2();
    expect(hedefRef('t.b')(null)).toBeUndefined();
  });

  it('kaydırma farkı: görünürse 0; aşağıdaysa hedefi üst üçte bire getirir; yukarıdaysa geri kaydırır', () => {
    // 800 px ekran, üstte 40 px durum çubuğu, altta 90 px gezinme çubuğu.
    expect(kaydirmaFarki({ x: 0, y: 200, w: 100, h: 50 }, 800, 40, 90)).toBe(0);
    const asagi = kaydirmaFarki({ x: 0, y: 760, w: 100, h: 60 }, 800, 40, 90);
    expect(asagi).toBeGreaterThan(400);
    expect(kaydirmaFarki({ x: 0, y: -120, w: 100, h: 50 }, 800, 40, 90)).toBeLessThan(0);
    // Alt çubuğun arkasında kalan hedef de görünmez sayılır.
    expect(kaydirmaFarki({ x: 0, y: 700, w: 100, h: 60 }, 800, 40, 90)).toBeGreaterThan(0);
  });

  it('yalnız en son eklenen (odaktaki) sayfanın kaydırıcısı etkindir', () => {
    const a = { kaydir: () => undefined, konum: () => 1 };
    const b = { kaydir: () => undefined, konum: () => 2 };
    const cikarA = kaydiriciEkle(a);
    const cikarB = kaydiriciEkle(b);
    expect(etkinKaydirici()).toBe(b);
    cikarB();
    expect(etkinKaydirici()).toBe(a);
    cikarA();
    expect(etkinKaydirici()).toBeNull();
  });
});

describe('kart yeri ve ok', () => {
  const ekran = { w: 390, h: 844 };
  const kart = { w: 340, h: 160 };

  it('hedef yoksa kart ekranın ortasında, oksuz', () => {
    const y = kartYeri(null, ekran, kart, 40, 20);
    expect(y).toMatchObject({ yon: 'orta', ok: false, x: 25 });
    expect(y.y).toBeCloseTo((844 - 160) / 2);
  });

  it('üstteki düğmede kart altta, alttaki düğmede kart üstte; kart hep ekranın içinde', () => {
    const ust = { x: 330, y: 50, w: 44, h: 44 };
    const y1 = kartYeri(ust, ekran, kart, 40, 20);
    expect(y1.yon).toBe('alt');
    expect(y1.y).toBe(50 + 44 + OK_BOSLUGU);
    expect(y1.x + kart.w).toBeLessThanOrEqual(390 - 14);
    const alt = { x: 20, y: 770, w: 60, h: 56 };
    const y2 = kartYeri(alt, ekran, kart, 40, 20);
    expect(y2.yon).toBe('ust');
    expect(y2.y + kart.h).toBe(770 - OK_BOSLUGU);
    expect(y2.x).toBeGreaterThanOrEqual(14);
  });

  it('ekranın çoğunu kaplayan hedefte kart hedefin üstüne biner ve ok çizilmez', () => {
    const y = kartYeri({ x: 10, y: 120, w: 370, h: 640 }, ekran, kart, 40, 20);
    expect(y.ok).toBe(false);
    expect(y.y).toBeGreaterThanOrEqual(40);
    expect(y.y + kart.h).toBeLessThanOrEqual(844);
  });

  it('ok karttan başlar, hedefin kenarına 14 px kala biter ve uç üçgeni vardır', () => {
    const hedef = { x: 330, y: 50, w: 44, h: 44 };
    const yer = kartYeri(hedef, ekran, kart, 40, 20);
    const ok = okYolu(hedef, yer, kart);
    const [, basX, basY] = /^M([\d.]+) ([\d.]+)Q/.exec(ok.govde)!.map(Number);
    const son = /([\d.]+) ([\d.]+)$/.exec(ok.govde)!;
    expect(basY).toBeCloseTo(yer.y - 4);
    expect(basX).toBeGreaterThanOrEqual(yer.x + 30);
    expect(basX).toBeLessThanOrEqual(yer.x + kart.w - 30);
    expect(Number(son[1])).toBeCloseTo(hedef.x + hedef.w / 2);
    expect(Number(son[2])).toBeCloseTo(hedef.y + hedef.h + 14);
    expect(ok.uc).toMatch(/^M[\d. -]+L[\d. -]+L[\d. -]+Z$/);
  });

  it('otomatik tarayıcıda (uçtan uca test) tur kendiliğinden açılmaz; zorlama anahtarı açar; telefonda açılır', () => {
    expect(otomatikAcilir({})).toBe(true);
    expect(otomatikAcilir({ navigator: { webdriver: true } })).toBe(false);
    expect(
      otomatikAcilir({
        navigator: { webdriver: true },
        localStorage: { getItem: (k) => (k === 'tanitim.zorla' ? '1' : null) },
      }),
    ).toBe(true);
    expect(
      otomatikAcilir({
        navigator: { webdriver: true },
        localStorage: {
          getItem: () => {
            throw new Error('kapalı');
          },
        },
      }),
    ).toBe(false);
  });
});
