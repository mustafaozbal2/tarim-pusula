import { describe, expect, it } from 'vitest';
import { MemoryKV } from '../offline/kv';
import { baslikUret, EN_COK_SOHBET, sohbetKaydet, sohbetleriOku, sohbetSil } from './gecmis';

const m = (kimden: 'ben' | 'robot', metin: string, gorsel?: string) => ({
  id: Math.random(),
  kimden,
  metin,
  gorsel,
});

describe('yapay zekâ sohbet geçmişi', () => {
  it('başlık ilk sorudan; fotoğraf verisi geçmişe yazılmaz; en yeni üstte; sınır 30', async () => {
    const kv = new MemoryKV();
    expect(baslikUret([m('robot', 'Merhaba'), m('ben', 'Zeytin ne zaman budanır?')])).toBe(
      'Zeytin ne zaman budanır?',
    );
    await sohbetKaydet(kv, {
      id: 'a',
      baslik: '',
      zaman: '2026-11-09T10:00:00Z',
      mesajlar: [m('ben', 'Yaprakta leke', 'data:image/jpeg;base64,AAAA')],
    });
    const l = await sohbetleriOku(kv);
    expect(l[0]!.baslik).toBe('Yaprakta leke');
    expect(l[0]!.mesajlar[0]!.gorsel).toBeUndefined();
    for (let i = 0; i < 35; i++)
      await sohbetKaydet(kv, { id: `s${i}`, baslik: `S${i}`, zaman: '', mesajlar: [] });
    const l2 = await sohbetleriOku(kv);
    expect(l2).toHaveLength(EN_COK_SOHBET);
    expect(l2[0]!.id).toBe('s34');
    expect((await sohbetSil(kv, 's34'))[0]!.id).toBe('s33');
  });
});
