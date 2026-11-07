import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { DataService } from '../data.service';
import { migrate, PgliteDb, systemTx } from '../db/db';
import { NuviaBeklemeService } from './bekleme';
import { HttpNuviaClient, KapaliNuvia, UYARI, type NuviaClient } from './client';

const ok = (b: unknown) =>
  (async () => new Response(JSON.stringify({ ok: true, veri: b }))) as unknown as typeof fetch;

describe('Nuvia istemcisi', () => {
  it('geçerli cevap alınır, yapay zekâ uyarısı eklenir', async () => {
    const c = new HttpNuviaClient(
      { url: 'https://n.example', projeAnahtari: 'tarim_pusula.nvp_t' },
      ok({
        cevap: 'Yaprak lekesi nem fazlasından olabilir; yaprakları toplayıp uzmana göster.',
        kaynaklar: ['TAGEM'],
      }),
    );
    const r = await c.soruCevapla({ soru: 'yaprakta leke' });
    expect(r!.metin).toContain('yaprak');
    expect(r!.metin.endsWith(UYARI)).toBe(true);
    expect(r!.kaynak).toContain('Nuvia');
  });
  it('dozlu cevap, bozuk şema, HTTP hatası ve ağ hatasında null (kural 2)', async () => {
    const doz = new HttpNuviaClient(
      { url: 'https://n.example', projeAnahtari: 'nvp_t' },
      ok({ cevap: 'Litreye 5 ml ilaç karıştırıp sıkın, kesin işe yarar.' }),
    );
    expect(await doz.soruCevapla({ soru: 'x' })).toBeNull();
    expect(
      await new HttpNuviaClient(
        { url: 'https://n.example', projeAnahtari: 'nvp_t' },
        ok({ yok: 1 }),
      ).soruCevapla({
        soru: 'x',
      }),
    ).toBeNull();
    const h500 = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    expect(
      await new HttpNuviaClient(
        { url: 'https://n.example', projeAnahtari: 'nvp_t' },
        h500,
      ).soruCevapla({ soru: 'x' }),
    ).toBeNull();
    const yok = (async () => {
      throw new Error('ağ');
    }) as unknown as typeof fetch;
    expect(
      await new HttpNuviaClient(
        { url: 'https://n.example', projeAnahtari: 'nvp_t' },
        yok,
      ).soruCevapla({ soru: 'x' }),
    ).toBeNull();
    expect(await new KapaliNuvia().soruCevapla()).toBeNull();
  });
});

describe('Nuvia geçidi (/v1/proje/sor)', () => {
  it('anahtar varsa proje başlığı ve {islev, girdi} gönderilir; veri alanı okunur', async () => {
    let gor: {
      url: string;
      h: Record<string, string>;
      b: { islev: string; girdi: string; gorsel: { base64: string } };
    } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      gor = {
        url,
        h: init.headers as Record<string, string>,
        b: JSON.parse(String(init.body)),
      };
      return new Response(
        JSON.stringify({
          ok: true,
          veri: { cevap: 'Yaprak lekesi için örnekleri uzmana göster.' },
        }),
      );
    }) as unknown as typeof fetch;
    const c = new HttpNuviaClient({ url: 'https://n.example/', projeAnahtari: 'nvp_abc' }, f);
    const r = await c.soruCevapla({
      soru: 'yaprakta leke',
      gorsel: { mime: 'image/jpeg', base64: 'AAAA' },
    });
    expect(r!.metin).toContain('uzmana');
    expect(gor!.url).toBe('https://n.example/v1/proje/sor');
    expect(gor!.h['x-nuvia-proje']).toBe('tarim_pusula.nvp_abc');
    expect(gor!.b.islev).toBe('foto_analiz'); // 32: görüntü artık Nuvia'ya gerçekten gider
    expect(gor!.b.girdi).not.toContain('AAAA'); // görüntü girdi metnine değil gorsel alanına konur
    expect(gor!.b.gorsel.base64).toBe('AAAA');
    expect(JSON.parse(gor!.b.girdi).soru).toBe('yaprakta leke');
  });
  it('ok:false ya da veri yoksa null', async () => {
    const c = new HttpNuviaClient(
      { url: 'https://n.example', projeAnahtari: 'k' },
      (async () => new Response(JSON.stringify({ ok: false }))) as unknown as typeof fetch,
    );
    expect(await c.soruCevapla({ soru: 'x' })).toBeNull();
  });
});

describe('uzman beklerken Nuvia geçici cevabı', () => {
  async function kur(nuvia: NuviaClient) {
    const db = new PgliteDb();
    await migrate(db);
    const t0 = new Date('2026-11-07T10:00:00Z');
    const u = await systemTx(db, (q) =>
      q.query<{ id: string }>(`INSERT INTO users(phone) VALUES ('+905320009999') RETURNING id`),
    );
    const ekle = (saatOnce: number) =>
      systemTx(db, async (q) => {
        const r = await q.query<{ id: string }>(
          `INSERT INTO expert_questions(user_id, question, question_norm, reason, status, created_at)
           VALUES ($1,'Zeytinde yaprak sararıyor','zeytinde yaprak sariyor','uzman','bekliyor',$2) RETURNING id`,
          [u[0]!.id, new Date(t0.getTime() - saatOnce * 3_600_000)],
        );
        return r[0]!.id;
      });
    const svc = new NuviaBeklemeService(new DataService(db as never), () => t0, nuvia);
    return { db, svc, ekle };
  }
  const iyi: NuviaClient = {
    id: 'nuvia',
    soruCevapla: async () => ({ metin: 'Geçici cevap. ' + UYARI, kaynak: 'Nuvia (yapay zekâ)' }),
  };

  it('12 saati geçen soruya cevap yazar; yeni soruya ve cevaplanmışa dokunmaz; ikinci tur tekrar yazmaz', async () => {
    const { db, svc, ekle } = await kur(iyi);
    const eski = await ekle(20);
    const yeni = await ekle(2);
    const r = await svc.run(12);
    expect(r).toEqual({ denendi: 1, yazildi: 1 });
    const rows = await systemTx(db, (q) =>
      q.query<{ id: string; ai_answer: string | null; status: string }>(
        `SELECT id, ai_answer, status FROM expert_questions`,
      ),
    );
    expect(rows.find((x) => x.id === eski)!.ai_answer).toContain('Geçici cevap');
    expect(rows.find((x) => x.id === eski)!.status).toBe('bekliyor'); // uzman kuyruğunda kalır
    expect(rows.find((x) => x.id === yeni)!.ai_answer).toBeNull();
    expect(await svc.run(12)).toEqual({ denendi: 0, yazildi: 0 });
  }, 60_000);

  it('Nuvia cevap vermezse (null) kayıt yazılmaz; 6 saat içinde tekrar denenmez', async () => {
    let n = 0;
    const { svc, ekle } = await kur({ id: 'nuvia', soruCevapla: async () => (n++, null) });
    await ekle(30);
    expect(await svc.run(12)).toEqual({ denendi: 1, yazildi: 0 });
    expect(await svc.run(12)).toEqual({ denendi: 0, yazildi: 0 });
    expect(n).toBe(1);
  }, 60_000);
});
