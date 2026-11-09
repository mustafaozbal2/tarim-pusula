import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { MemoryKV } from '../offline/kv';
import { hatirlatmalar, notEkle, notlariOku, notSil } from './notlar';

describe('takvim notları', () => {
  it('o gün, 1 ve 2 gün önce 09:00 hatırlatma; geçmişte kalan kurulmaz', () => {
    const h = hatirlatmalar({ tarih: '2026-11-20', metin: 'Zeytin hasadı' }, '2026-11-09T10:00:00');
    expect(h.map((x) => x.zaman)).toEqual([
      '2026-11-18T09:00:00',
      '2026-11-19T09:00:00',
      '2026-11-20T09:00:00',
    ]);
    expect(h[0]!.baslik).toBe('İşinize 2 gün kaldı');
    expect(h[2]!.baslik).toBe('Bugün yapılacak işiniz');
    expect(
      hatirlatmalar({ tarih: '2026-11-10', metin: 'x' }, '2026-11-09T10:00:00').map((x) => x.zaman),
    ).toEqual(['2026-11-10T09:00:00']);
  });
  it('ekle, tarihe göre sırala, sil; boş not eklenmez', async () => {
    const kv = new MemoryKV();
    await notEkle(kv, '2026-12-01', 'Budama');
    await notEkle(kv, '2026-11-20', '  Gübre  ');
    await notEkle(kv, '2026-11-21', '   ');
    const l = await notlariOku(kv);
    expect(l.map((n) => n.metin)).toEqual(['Gübre', 'Budama']);
    expect((await notSil(kv, l[0]!.id)).map((n) => n.metin)).toEqual(['Budama']);
  });
});
