import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { guvenYuzde, HttpNuviaClient, KapaliNuvia } from './client';
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
    // Model güven vermediyse bilinmiyor (null): telefon "Emin değilim" der.
    expect(r!.guven).toBeNull();
  });
  it('fotoğraf teşhisi: güven 0-100e çevrilir, olası sebepler en çok 3, dozlu sebep cevabı düşürür', async () => {
    const cevapla = (veri: object) =>
      new HttpNuviaClient(AYAR, yanit({ ok: true, veri })).soruCevapla({
        soru: 'leke',
        gorsel: { mime: 'image/jpeg', base64: 'QUJD' },
      });
    const r = await cevapla({
      cevap: 'Yaprakta mantar lekesi olabilir; uzmana göster.',
      guven: 0.42,
      olasi_nedenler: ['Mantar', 'Güneş yanığı', 'Besin eksikliği', 'Böcek'],
    });
    expect(r!.guven).toBe(42);
    expect(r!.olasilar).toEqual(['Mantar', 'Güneş yanığı', 'Besin eksikliği']);
    expect((await cevapla({ cevap: 'Yaprakta mantar lekesi olabilir.', guven: 85 }))!.guven).toBe(
      85,
    );
    expect(
      (await cevapla({ cevap: 'Yaprakta mantar lekesi olabilir.', guven: 250 }))!.guven,
    ).toBeNull();
    expect(
      await cevapla({
        cevap: 'Yaprakta mantar lekesi olabilir.',
        olasi_nedenler: ['Dekara 50 ml ilaç at'],
      }),
    ).toBeNull();
    expect(guvenYuzde(undefined)).toBeNull();
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

describe('yapay zekâ cevabını bildirme (G36, Play politikası)', () => {
  it('bildirim kaydedilir; yalnız sahibi ve yönetici okur; dakikada 6 bildirimden sonrası alınmaz', async () => {
    const { DataService } = await import('../data.service');
    const { migrate, PgliteDb, systemTx, userTx } = await import('../db/db');
    const db = new PgliteDb();
    await migrate(db);
    const [ali, veli] = await systemTx(db, (q) =>
      q.query<{ id: string }>(
        `INSERT INTO users(phone) VALUES ('+905320000091'), ('+905320000092') RETURNING id`,
      ),
    );
    const c = new RobotController(new KapaliNuvia(), new DataService(db as never));
    const aliMe = { userId: ali!.id, roles: ['farmer'] };
    const r = await c.bildir(aliMe, {
      mesaj: 'Zeytine şu ilacı at.',
      neden: 'yanlis',
      not: 'İlaç adı vermemeliydi',
    });
    expect(r).toEqual({ alindi: true });
    const satirlar = await systemTx(db, (q) =>
      q.query<{ user_id: string; reason: string; message: string }>(
        `SELECT user_id, reason, message FROM yz_bildirimleri`,
      ),
    );
    expect(satirlar).toEqual([
      { user_id: ali!.id, reason: 'yanlis', message: 'Zeytine şu ilacı at.' },
    ]);
    // Başka çiftçi bu kaydı göremez (satır güvenliği).
    const baskasi = await userTx(db, { userId: veli!.id, roles: ['farmer'] }, (q) =>
      q.query(`SELECT id FROM yz_bildirimleri`),
    );
    expect(baskasi).toEqual([]);
    // Geçersiz neden reddedilir.
    await expect(c.bildir(aliMe, { mesaj: 'x', neden: 'keyfi' })).rejects.toThrow();
    // Sınır: aynı dakikada 6 bildirim (ilki yukarıda), yedincisi alınmaz.
    for (let i = 0; i < 5; i++)
      expect((await c.bildir(aliMe, { mesaj: `m${i}`, neden: 'diger' })).alindi).toBe(true);
    expect((await c.bildir(aliMe, { mesaj: 'fazla', neden: 'diger' })).alindi).toBe(false);
  }, 60_000);
});
