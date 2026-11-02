import { describe, expect, it } from 'vitest';
import { announcementBody } from './announcementText';

describe('duyuru metni', () => {
  it('sondaki kaynak satırı çıkar (kart altında zaten var)', () => {
    expect(
      announcementBody('Tarlanızı gezin.\n\nKaynak: Tarım Pusula uzman ekibi (test verisi)'),
    ).toBe('Tarlanızı gezin.');
    expect(announcementBody('Metin\nKAYNAK: X\n')).toBe('Metin');
  });
  it('kaynak satırı yoksa ya da tek satırsa metne dokunmaz', () => {
    expect(announcementBody('Kaynak suyu ile sulama yapmayın.\nDevam.')).toBe(
      'Kaynak suyu ile sulama yapmayın.\nDevam.',
    );
    expect(announcementBody('Kaynak: yalnız bu')).toBe('Kaynak: yalnız bu');
  });
});
