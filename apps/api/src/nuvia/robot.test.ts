import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HttpNuviaClient, KapaliNuvia } from './client';
import { RobotController, ROBOT_YEDEK, sinirli } from './robot.controller';

const AYAR = { url: 'https://n.example', projeAnahtari: 'tarim_pusula.nvp_t' };
const yanit = (b: unknown) =>
  (async () => new Response(JSON.stringify(b))) as unknown as typeof fetch;
const me = { userId: 'u1', roles: ['farmer'] } as never;

describe('robot sohbeti (Nuvia)', () => {
  it('geçerli cevap alınır; "yok" yönlendirmesi null olur', async () => {
    const c = new HttpNuviaClient(
      AYAR,
      yanit({
        ok: true,
        veri: { cevap: 'Don gecesi örtü ve sulama işe yarar.', yonlendir: 'yok' },
      }),
    );
    expect(await c.robotSohbet({ soru: 'don' })).toEqual({
      cevap: 'Don gecesi örtü ve sulama işe yarar.',
      yonlendir: null,
    });
    const d = new HttpNuviaClient(
      AYAR,
      yanit({ ok: true, veri: { cevap: 'Bugün sayfasına bak.', yonlendir: 'bugun' } }),
    );
    expect((await d.robotSohbet({ soru: 'hava' }))!.yonlendir).toBe('bugun');
  });
  it('dozlu cevap atılır (kural 2); bozuk şema ve ağ hatası null', async () => {
    const doz = new HttpNuviaClient(
      AYAR,
      yanit({ ok: true, veri: { cevap: 'Litreye 5 ml ilaç karıştır.' } }),
    );
    expect(await doz.robotSohbet({ soru: 'ilaç' })).toBeNull();
    expect(
      await new HttpNuviaClient(AYAR, yanit({ ok: true, veri: { x: 1 } })).robotSohbet({
        soru: 'x?',
      }),
    ).toBeNull();
    const ag = (async () => {
      throw new Error('ağ');
    }) as unknown as typeof fetch;
    expect(await new HttpNuviaClient(AYAR, ag).robotSohbet({ soru: 'x?' })).toBeNull();
  });
  it('fotoğraflı soru foto_analiz ile gerçek görüntüyü gönderir', async () => {
    const gidenler: { islev: string; girdi: string; gorsel: { base64: string } }[] = [];
    const f = (async (_u: string, i: RequestInit) => {
      gidenler.push(JSON.parse(String(i.body)));
      return new Response(
        JSON.stringify({
          ok: true,
          veri: { cevap: 'Yaprakta mantar lekesi olabilir; uzmana göster.', gorulen: 'sarı leke' },
        }),
      );
    }) as unknown as typeof fetch;
    const r = await new HttpNuviaClient(AYAR, f).soruCevapla({
      soru: 'leke',
      gorsel: { mime: 'image/jpeg', base64: 'QUJD' },
    });
    expect(r!.metin).toContain('mantar');
    expect(gidenler[0]!.islev).toBe('foto_analiz');
    expect(gidenler[0]!.gorsel.base64).toBe('QUJD');
  });
  it('ses: başarılıysa WAV döner, değilse null', async () => {
    const ok = new HttpNuviaClient(AYAR, yanit({ ok: true, mime: 'audio/wav', ses_b64: 'AAAA' }));
    expect(await ok.ses('merhaba')).toEqual({ mime: 'audio/wav', ses_b64: 'AAAA' });
    expect(await new HttpNuviaClient(AYAR, yanit({ ok: false })).ses('merhaba')).toBeNull();
  });
});

describe('RobotController', () => {
  it('Nuvia kapalıyken çiftçi hata görmez: yedek cümle', async () => {
    const c = new RobotController(new KapaliNuvia());
    expect((await c.sohbet(me, { soru: 'toprak nasıl olmalı' })).cevap).toBe(ROBOT_YEDEK);
    expect(await c.ses(me, { metin: 'merhaba' })).toEqual({ ses: null });
  });
  it('kullanıcı başına dakikalık sınır', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(sinirli('k', 3, t)).toBe(false);
    expect(sinirli('k', 3, t + 100)).toBe(true);
    expect(sinirli('k', 3, t + 61_000)).toBe(false);
  });
});

describe('robot/foto', () => {
  it("fotoğraf Nuvia'ya gerçek görüntüyle gider; Nuvia yoksa yedek cümle", async () => {
    const { RobotController } = await import('./robot.controller');
    let giden: unknown = null;
    const nuvia = {
      id: 'nuvia',
      soruCevapla: async (s: unknown) => (
        (giden = s),
        { metin: 'Yaprakta leke var. UYARI', kaynak: 'Nuvia' }
      ),
    };
    const c = new RobotController(nuvia as never);
    const me = { userId: 'u-foto', roles: ['farmer'] } as never;
    const b64 = 'A'.repeat(200);
    const r = await c.foto(me, { gorsel: { mime: 'image/jpeg', base64: b64 } });
    expect(r.cevap).toContain('Yaprakta');
    expect((giden as { gorsel: { base64: string } }).gorsel.base64).toBe(b64);
    const yok = new RobotController({ id: 'kapali', soruCevapla: async () => null } as never);
    expect(
      (
        await yok.foto({ userId: 'u2', roles: [] } as never, {
          gorsel: { mime: 'image/png', base64: b64 },
        })
      ).kaynak,
    ).toBe('yedek');
  });
});
