import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { migrate, systemTx } from './db/db';
import { createTestDb } from './db/testdb';
import { pdfToPages } from './library';

const db = createTestDb();
const sms = new FakeSmsProvider();
let app: INestApplication;
let base: string;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as any) : undefined }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function login(phone: string) {
  await call('POST', '/auth/otp/request', undefined, { phone });
  const r = await call('POST', '/auth/otp/verify', undefined, { phone, code: sms.lastCode(phone) });
  return r.body as { token: string; userId: string };
}
const sql = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  systemTx(db, (q) => q.query<T>(text, params));
const grant = (userId: string, role: string) =>
  sql('INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$1)', [userId, role]);

/** Elle üretilmiş, her sayfada tek satır Helvetica metni olan küçük PDF (xref ofsetleri hesaplı). */
function makePdf(pageTexts: string[]): Buffer {
  const objs: string[] = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(
    `<< /Type /Pages /Kids [${pageTexts.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,
  );
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pageTexts.forEach((t, i) => {
    const stream = `BT /F1 12 Tf 50 700 Td (${t}) Tj ET`;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

let farmer: Awaited<ReturnType<typeof login>>;
let inst: Awaited<ReturnType<typeof login>>;
let expert: Awaited<ReturnType<typeof login>>;

const meta = (over: Record<string, unknown> = {}) => ({
  title: 'Damla Sulama Rehberi',
  publisher: 'Örnek Tarım Kurumu',
  sourceDate: '2025-03-01',
  sourceVersion: 'v1',
  licenseNote: 'Kurum izniyle, atıfla kullanılır',
  tier: 'kurum',
  ...over,
});
const GOLD_TEXT =
  'Damla sulama suyu bitkinin kök bölgesine yavaş yavaş verir. Yağmurlamaya göre su tasarrufu sağlar.\f' +
  'Zeytin ağacında budama kış sonunda yapılır. Budama ile ağacın içi güneş ışığı alır.';
const DAMLA =
  'Damla sulama suyu bitkinin kök bölgesine yavaş yavaş verir. Yağmurlamaya göre su tasarrufu sağlar.';
const TIERS = ['uzman-onayli', 'kurum', 'genel'];

const upload = (token: string, body: object) => call('POST', '/library/documents', token, body);
const search = (q: string, token = farmer.token) =>
  call('GET', '/library/search?q=' + encodeURIComponent(q), token);

beforeAll(async () => {
  await migrate(db);
  app = await NestFactory.create(AppModule.register({ db, sms, auth: { otpSecret: 'test' } }), {
    logger: false,
  });
  await app.listen(0);
  base = await app.getUrl();
  farmer = await login('+905321130101');
  inst = await login('+905321130102');
  expert = await login('+905321130103');
  await grant(inst.userId, 'institution_admin');
  await grant(expert.userId, 'expert');
  await sql('UPDATE sessions SET mfa_at = now() WHERE user_id = ANY($1::uuid[])', [
    [inst.userId, expert.userId],
  ]);
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('doküman yükleme', () => {
  it('çiftçi yükleyemez; MFA’sız oturum yükleyemez', async () => {
    expect((await upload(farmer.token, { ...meta(), text: GOLD_TEXT })).status).toBe(403);
    await sql('UPDATE sessions SET mfa_at = NULL WHERE user_id = $1', [inst.userId]);
    expect((await upload(inst.token, { ...meta(), text: GOLD_TEXT })).status).toBe(403);
    await sql('UPDATE sessions SET mfa_at = now() WHERE user_id = $1', [inst.userId]);
  });

  it('kaynak künyesi eksikse reddedilir (atıfsız doküman yok)', async () => {
    for (const k of ['title', 'publisher', 'sourceDate', 'sourceVersion', 'licenseNote']) {
      const m = meta() as Record<string, unknown>;
      delete m[k];
      expect((await upload(inst.token, { ...m, text: GOLD_TEXT })).status, k).toBe(400);
    }
    const blank = await upload(inst.token, { ...meta({ publisher: '  ' }), text: GOLD_TEXT });
    expect(blank.status).toBe(400);
    const both = await upload(inst.token, { ...meta(), text: 'x', pdfBase64: 'eA==' });
    expect(both.status).toBe(400);
  });

  it('metin yüklenir, sayfa atfıyla parçalanır; aynı içerik ikinci kez 409', async () => {
    const r = await upload(inst.token, { ...meta(), text: GOLD_TEXT });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ chunks: 2, reviewStatus: 'taslak-uzman-onayi-bekliyor' });
    const pages = await sql<{ page: number }>('SELECT page FROM library_chunks ORDER BY seq');
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect((await upload(inst.token, { ...meta(), text: GOLD_TEXT })).status).toBe(409);
  });

  it('PDF yüklenir ve sayfa sayfa okunur; PDF olmayan ve metinsiz dosya 400', async () => {
    const pdf = makePdf([
      'Pamukta capa ve seyreltme fide cikisindan sonra yapilir.',
      'Azotlu gubre parcali verilir.',
    ]);
    const pages = await pdfToPages(new Uint8Array(pdf));
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages[0]!.text).toContain('Pamukta capa');
    const r = await upload(expert.token, {
      ...meta({ title: 'Pamuk El Kitabı', sourceVersion: '2024', tier: 'genel' }),
      pdfBase64: pdf.toString('base64'),
    });
    expect(r.status).toBe(201);
    expect(r.body.chunks).toBe(2);
    const notPdf = await upload(inst.token, {
      ...meta(),
      pdfBase64: Buffer.from('merhaba').toString('base64'),
    });
    expect(notPdf.status).toBe(400);
    const empty = await upload(inst.token, {
      ...meta({ sourceVersion: 'e' }),
      pdfBase64: makePdf(['']).toString('base64'),
    });
    expect(empty.status).toBe(400);
  });
});

describe('arama', () => {
  it('giriş şart', async () => {
    expect((await call('GET', '/library/search?q=damla')).status).toBe(401);
  });

  it('altın küme: doğru parça, sayfa ve künye ile döner; onaysız olan rozetli', async () => {
    const zeytin = await search('zeytin ne zaman budanır');
    expect(zeytin.status).toBe(200);
    const top = zeytin.body.hits[0];
    expect(top.text).toContain('Zeytin ağacında budama');
    expect(top.page).toBe(2);
    expect(top.needsBadge).toBe(true);
    expect(top.source).toMatchObject({
      title: 'Damla Sulama Rehberi',
      publisher: 'Örnek Tarım Kurumu',
      date: '2025-03-01',
      version: 'v1',
    });
    expect((await search('damla sulama ne işe yarar')).body.hits[0].page).toBe(1);
    expect((await search('pamuk çapası')).body.hits[0].source.title).toBe('Pamuk El Kitabı');
  });

  it('ilgisiz soruda boş döner', async () => {
    expect((await search('bitcoin fiyatı')).body.hits).toEqual([]);
  });

  it('kaynaksız parça yok: künye veritabanında zorunlu, parça belgesiz eklenemez', async () => {
    await expect(
      sql(`INSERT INTO library_documents(title, publisher, source_date, source_version, license_note, tier, page_count, content_hash, embedder)
           VALUES ('a', ' ', '2025-01-01', 'v', 'l', 'genel', 1, 'h1', 'e')`),
    ).rejects.toThrow();
    await expect(
      sql(`INSERT INTO library_chunks(document_id, seq, page, content, embedding)
           VALUES (gen_random_uuid(), 0, 1, 'x', '{0.1}')`),
    ).rejects.toThrow();
  });

  it('uzman onayı sonrası düzey yükselir, rozet kalkar ve hiyerarşide öne geçer', async () => {
    const gen = await upload(inst.token, {
      ...meta({ title: 'Genel Not', sourceVersion: 'g1', tier: 'genel' }),
      text: DAMLA,
    });
    const kur = await upload(inst.token, {
      ...meta({ title: 'Kurum Notu', sourceVersion: 'k1' }),
      text: DAMLA + ' Ek bilgi.',
    });
    expect(kur.status).toBe(201);
    const q = 'damla sulama su tasarrufu';
    const before = (await search(q)).body.hits.map((h: { tier: string }) => h.tier);
    expect(before).toEqual([...before].sort((a, b) => TIERS.indexOf(a) - TIERS.indexOf(b)));
    expect(before.at(-1)).toBe('genel');

    // Kurum yöneticisi onaylayamaz; uzman onaylar.
    expect(
      (await call('POST', `/library/documents/${gen.body.id}/approve`, inst.token)).status,
    ).toBe(403);
    expect(
      (await call('POST', `/library/documents/${gen.body.id}/approve`, expert.token)).status,
    ).toBe(200);
    const first = (await search(q)).body.hits[0];
    expect(first.tier).toBe('uzman-onayli');
    expect(first.source.title).toBe('Genel Not');
    expect(first.needsBadge).toBe(false);
  });

  it('yükleme ve onay denetim kaydına düşer', async () => {
    const rows = await sql<{ n: string }>(
      "SELECT count(*) AS n FROM audit_log WHERE entity = 'library_documents'",
    );
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(4);
  });
});
