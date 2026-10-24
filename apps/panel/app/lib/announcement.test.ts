import { describe, expect, it } from 'vitest';
import {
  buildAnnouncement,
  formFromManaged,
  imageFits,
  targetLabel,
  trDate,
  describeTarget,
  trMidnightIso,
  type AnnouncementForm,
} from './announcement';

const form: AnnouncementForm = {
  sourceOrg: 'Gaziantep İl Tarım ve Orman Müdürlüğü',
  title: 'Don uyarısı toplantısı',
  body: 'Toplantı il müdürlüğünde.',
  sourceUrl: '',
  publishDate: '2026-10-20',
  expireDate: '',
  province: 'Gaziantep',
  district: '',
  village: '',
  cropIds: ['antep-fistigi'],
  imageDataUrl: null,
};

describe('duyuru formu', () => {
  it('Türkiye gününü UTC’ye çevirir', () => {
    expect(trMidnightIso('2026-10-20')).toBe('2026-10-19T21:00:00.000Z');
  });

  it('geçerli formdan hedefli gövde üretir', () => {
    const r = buildAnnouncement(form);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.targeting).toEqual({
        places: [{ province: 'Gaziantep' }],
        circle: null,
        cropIds: ['antep-fistigi'],
      });
      expect(r.value.expiresAt).toBeUndefined();
    }
  });

  it('il seçilmezse ulusal, ilçe ilsiz olmaz', () => {
    const nat = buildAnnouncement({ ...form, province: '', cropIds: [] });
    expect(nat.ok && nat.value.targeting.places).toEqual([]);
    expect(buildAnnouncement({ ...form, province: '', district: 'Nizip' }).ok).toBe(false);
  });

  it('kaynak kurum ve başlık zorunlu; bitiş yayından önce olamaz', () => {
    expect(buildAnnouncement({ ...form, sourceOrg: ' ' }).ok).toBe(false);
    expect(buildAnnouncement({ ...form, title: '' }).ok).toBe(false);
    expect(buildAnnouncement({ ...form, expireDate: '2026-10-01' }).ok).toBe(false);
    expect(buildAnnouncement({ ...form, publishDate: '' }).ok).toBe(false);
  });

  it('hedef özeti', () => {
    expect(describeTarget(form, ['Antep fıstığı'])).toBe('Gaziantep · Antep fıstığı');
    expect(describeTarget({ province: '', district: '', cropIds: [] }, [])).toBe(
      'Tüm Türkiye · tüm ürünler',
    );
  });
});

describe('köy hedefi, görsel ve düzenleme', () => {
  it('köy için ilçe gerekir; il/ilçe/köy hedefe girer', () => {
    expect(buildAnnouncement({ ...form, district: '', village: 'Burç' }).ok).toBe(false);
    const r = buildAnnouncement({ ...form, district: 'Nizip', village: 'Burç', cropIds: [] });
    expect(r.ok && r.value.targeting.places).toEqual([
      { province: 'Gaziantep', district: 'Nizip', village: 'Burç' },
    ]);
    expect(describeTarget({ ...form, district: 'Nizip', village: 'Burç', cropIds: [] }, [])).toBe(
      'Gaziantep / Nizip / Burç · tüm ürünler',
    );
  });

  it('görsel gövdeye girer; geçersiz tür reddedilir', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const ok = buildAnnouncement({ ...form, imageDataUrl: png });
    expect(ok.ok && ok.value.imageDataUrl).toBe(png);
    expect(
      buildAnnouncement({ ...form, imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }).ok,
    ).toBe(false);
    expect(imageFits('a'.repeat(280_000))).toBe(true);
    expect(imageFits('a'.repeat(280_001))).toBe(false);
  });

  it('kayıtlı duyuru → form → gövde gidiş-dönüşü aynı hedefi verir', () => {
    const managed = {
      sourceOrg: 'Kurum',
      title: 'Başlık',
      body: 'Metin',
      sourceUrl: null,
      publishedAt: '2026-10-19T21:00:00.000Z',
      expiresAt: '2026-11-19T21:00:00.000Z',
      targeting: { places: [{ province: 'Aydın', district: 'Efeler' }], cropIds: ['zeytin'] },
    };
    const f = formFromManaged(managed);
    expect(f).toMatchObject({
      publishDate: '2026-10-20',
      expireDate: '2026-11-20',
      province: 'Aydın',
      village: '',
    });
    const back = buildAnnouncement(f);
    expect(back.ok && back.value.publishedAt).toBe(managed.publishedAt);
    expect(back.ok && back.value.targeting.places).toEqual(managed.targeting.places);
    expect(trDate('2026-10-19T21:00:00.000Z')).toBe('2026-10-20');
  });

  it('liste hedef yazısı: boş hedef Tümü demektir', () => {
    expect(targetLabel({ places: [], cropIds: [] }, {})).toBe('Tüm Türkiye · tüm ürünler');
    expect(
      targetLabel({ places: [{ province: 'Aydın' }], cropIds: ['zeytin'] }, { zeytin: 'Zeytin' }),
    ).toBe('Aydın · Zeytin');
  });
});
