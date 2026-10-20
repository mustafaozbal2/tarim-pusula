import { describe, expect, it } from 'vitest';
import {
  buildAnnouncement,
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
  cropIds: ['antep-fistigi'],
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
