import { describe, expect, it } from 'vitest';
import type { FieldCreate } from '@tarim/schemas';
import type { PusulaCardDto } from '../api/client';
import { medyaBul, videoAdresi } from './medya';
import {
  SORU_UYARISI,
  eslesenler,
  ilerle,
  urunEslestir,
  type Durum,
  type Mesaj,
  type Ortam,
} from './sohbet';

const URUNLER = [
  { id: 'antep-fistigi', nameTr: 'Antep fıstığı', commonRank: 1 },
  { id: 'zeytin', nameTr: 'Zeytin', commonRank: 2 },
  { id: 'misir-tane', nameTr: 'Mısır (tane)', commonRank: null },
  { id: 'misir-tatli', nameTr: 'Mısır (tatlı)', commonRank: null },
  { id: 'elma-kiraz-armut', nameTr: 'Elma, kiraz, armut (örtüsüz; don olmaz)', commonRank: null },
  {
    id: 'elma-kiraz-armut-ortulu',
    nameTr: 'Elma, kiraz, armut (yeşil örtülü; don olmaz)',
    commonRank: null,
  },
];

function ortam(over: Partial<Ortam> = {}): Ortam & { kayitlar: FieldCreate[]; sorular: string[] } {
  const kayitlar: FieldCreate[] = [];
  const sorular: string[] = [];
  return {
    kayitlar,
    sorular,
    konumAl: async () => ({ lat: 37.1, lon: 37.4 }),
    iller: async () => ['Gaziantep', 'Isparta', 'Şanlıurfa'],
    ilceler: async (il) =>
      il === 'Isparta' ? ['Eğirdir', 'Sultandağı'] : ['Şahinbey', 'Şehitkamil'],
    koyler: async (_il, _ilce, ara) =>
      [
        { name: 'Ağılköy', lat: 37.8, lon: 30.9 },
        { name: 'Akbelenli', lat: 37.7, lon: 30.8 },
      ].filter((k) => !ara || k.name.toLowerCase().startsWith(ara.toLowerCase())),
    urunler: async () => URUNLER,
    kaydet: async (p) => {
      kayitlar.push(p);
      return { durum: 'gonderildi' };
    },
    tarlalar: async () => [{ id: '1', name: 'Evim', ilce: 'Şahinbey' }],
    bugun: async () => 'Bugün hava parçalı bulutlu, 13°.',
    takvim: async () => ['Budama: 11 Kasım'],
    sor: async (q) => {
      sorular.push(q);
      return {
        kind: 'answer',
        title: 'Sorunun cevabı',
        steps: ['Kalın dalları hasattan sonra kes.'],
        sources: [{ title: 'Kaynak A', date: '2026-01-01', needsBadge: false }],
        why: 'Kaynaklardan.',
      } as PusulaCardDto;
    },
    urunKimligi: async () => 'antep-fistigi',
    ...over,
  };
}

async function sohbet(
  o: Ortam,
  ...girdiler: string[]
): Promise<{ durum: Durum; mesajlar: Mesaj[] }> {
  let durum: Durum = { k: 'bos' };
  let mesajlar: Mesaj[] = [];
  for (const g of girdiler) {
    const a = await ilerle(durum, g, o);
    durum = a.durum;
    mesajlar = a.mesajlar;
  }
  return { durum, mesajlar };
}

describe('robot sohbeti: tarla ekleme (sayfa değiştirmeden)', () => {
  it('arazimdeyim → GPS → ürün → ad → arka planda kaydeder', async () => {
    const o = ortam();
    const a = await sohbet(o, 'tarla ekle', 'evet', 'fıstık', 'Evim');
    expect(o.kayitlar).toHaveLength(1);
    expect(o.kayitlar[0]).toMatchObject({
      name: 'Evim',
      lat: 37.1,
      lon: 37.4,
      cropId: 'antep-fistigi',
      locationSource: 'gps',
    });
    expect(a.durum.k).toBe('bos');
    expect(a.mesajlar[0]!.metin).toContain('kaydettim');
  });

  it('arazimde değilim → il, ilçe, köy sorulur; konum köyden gelir', async () => {
    const o = ortam();
    const a = await sohbet(
      o,
      'arazi ekle',
      'hayır',
      'ısparta',
      'eğirdir',
      'ağılköy',
      'zeytin',
      'ad:otomatik',
    );
    expect(o.kayitlar[0]).toMatchObject({
      province: 'Isparta',
      district: 'Eğirdir',
      village: 'Ağılköy',
      lat: 37.8,
      cropId: 'zeytin',
      name: 'Ağılköy Bahçesi',
      locationSource: 'koy',
    });
    expect(a.mesajlar[0]!.metin).toContain('Ağılköy Bahçesi');
  });

  it('konum izni yoksa il sorusuna düşer', async () => {
    const o = ortam({ konumAl: async () => null });
    const a = await sohbet(o, 'tarla ekle', 'evet');
    expect(a.durum.k).toBe('il');
    expect(a.mesajlar[0]!.metin).toContain('hangi ilde');
  });

  it('bilinmeyen il/ilçe/ürün tekrar sorulur, kaydedilmez', async () => {
    const o = ortam();
    expect((await sohbet(o, 'tarla ekle', 'hayır', 'xyzabc')).durum.k).toBe('il');
    expect((await sohbet(o, 'tarla ekle', 'hayır', 'isparta', 'yokilce')).durum.k).toBe('ilce');
    expect((await sohbet(o, 'tarla ekle', 'evet', 'xyzxyz')).durum.k).toBe('urun');
    expect(o.kayitlar).toHaveLength(0);
  });

  it('kiraz → elma-kiraz-armut ailesinin ana kimliği; mısır iki seçenek sunar', async () => {
    expect(urunEslestir('kiraz', URUNLER).map((u) => u.id)).toEqual(['elma-kiraz-armut']);
    expect(urunEslestir('mısır', URUNLER).map((u) => u.id)).toEqual(['misir-tane', 'misir-tatli']);
    expect(urunEslestir('fıstığım', URUNLER).map((u) => u.id)).toEqual(['antep-fistigi']);
  });

  it('seçenek düğmeleri (urun:id, ad:otomatik) çalışır; "vazgeç" akışı bırakır', async () => {
    const o = ortam();
    await sohbet(o, 'tarla ekle', 'evet', 'urun:zeytin', 'ad:otomatik');
    expect(o.kayitlar[0]).toMatchObject({ cropId: 'zeytin', name: 'Zeytin Arazim' });
    const v = await sohbet(ortam(), 'tarla ekle', 'evet', 'vazgeç');
    expect(v.durum.k).toBe('bos');
  });

  it('kayıt reddedilirse çiftçi dilinde söylenir', async () => {
    const o = ortam({ kaydet: async () => ({ durum: 'reddedildi', mesaj: 'Alan çok büyük.' }) });
    const a = await sohbet(o, 'tarla ekle', 'evet', 'zeytin', 'ad:otomatik');
    expect(a.mesajlar[0]!.metin).toContain('kaydedemedim');
    expect(a.mesajlar[0]!.metin).toContain('Alan çok büyük.');
  });

  it('çevrimdışı sıraya alınırsa bunu söyler', async () => {
    const o = ortam({ kaydet: async () => ({ durum: 'sirada' }) });
    const a = await sohbet(o, 'tarla ekle', 'evet', 'zeytin', 'ad:otomatik');
    expect(a.mesajlar[0]!.metin).toContain('İnternet gelince');
  });
});

describe('robot sohbeti: bilgi ve sorular', () => {
  it('hava ve takvim sayfa açmadan cevaplanır', async () => {
    const o = ortam();
    expect((await sohbet(o, 'hava nasıl')).mesajlar[0]!.metin).toContain('13°');
    expect((await sohbet(o, 'iş takvimim')).mesajlar[0]!.metin).toContain('Budama');
  });

  it("bilgi sorusu Pusula'ya gider; video, fotoğraf, YouTube araması, kaynak ve yapay zekâ uyarısı eklenir", async () => {
    const o = ortam();
    const a = await sohbet(o, 'fıstık ağacı budaması nasıl yapılır');
    expect(o.sorular).toHaveLength(1);
    const [cevap, uyari] = a.mesajlar;
    expect(cevap!.metin).toContain('Kalın dalları');
    const turler = cevap!.kartlar!.map((k) => k.tur);
    expect(turler).toContain('video');
    expect(turler).toContain('baglanti');
    expect(turler).toContain('kaynak');
    expect(uyari!.metin).toBe(SORU_UYARISI);
    expect(SORU_UYARISI).toMatch(/Tüm risk size aittir/);
  });

  it('cevap "answer" değilse "Uzmana da sor" düğmesi; basınca son soru uzmana iletilir', async () => {
    const o = ortam({
      sor: async () =>
        ({
          kind: 'handoff',
          title: 'Bunu kesin bilmiyorum',
          steps: [],
          sources: [],
          why: 'Kaynak yok.',
        }) as PusulaCardDto,
    });
    const a1 = await ilerle({ k: 'bos' }, 'yaprağım sarardı ne yapayım', o);
    expect(a1.mesajlar[0]!.secenekler?.[0]?.etiket).toBe('Uzmana da sor');
    const sorular: string[] = [];
    const o2 = { ...o, sor: async (q: string) => (sorular.push(q), o.sor(q)) };
    await ilerle(a1.durum, 'uzmana sor', o2);
    expect(sorular[0]).toContain('yaprağım sarardı');
    expect(sorular[0]).toContain('uzmana iletin');
  });

  it('ağ yoksa dürüst mesaj, çökme yok', async () => {
    const o = ortam({
      sor: async () => {
        throw new Error('ağ');
      },
    });
    const a = await sohbet(o, 'zeytine ne zaman su verilir');
    expect(a.mesajlar[0]!.metin).toContain('cevap alamadım');
  });
});

describe('medya ve eşleştirme', () => {
  it('video kimlikleri YouTube adresine çevrilir; ürün bilinmiyorsa video önermez ama arama bağlantısı verir', () => {
    const m = medyaBul('zeytin budama nasıl yapılır', null);
    expect(m.videolar.length).toBeGreaterThan(0);
    expect(videoAdresi(m.videolar[0]!.id)).toMatch(
      /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/,
    );
    const g = medyaBul('budama nasıl yapılır', null);
    expect(g.videolar).toEqual([]);
    expect(g.aramaAdresi).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
  });
  it('eslesenler: tam > önek > içerir', () => {
    expect(eslesenler('isp', ['Isparta', 'Kırşehir'], (x) => x)).toEqual(['Isparta']);
    expect(eslesenler('şehir', ['Kırşehir', 'Nevşehir'], (x) => x)).toEqual([
      'Kırşehir',
      'Nevşehir',
    ]);
  });
});
