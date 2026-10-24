import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { importCropCatalog } from './crops';
import { migrate, systemTx } from './db/db';
import { createTestDb } from './db/testdb';
import { parsePackTable } from './ingest/cropPack';
import { docxToContent } from './ingest/docx';
import { extractContent } from './ingest/extract';
import { ingestFolder } from './ingest/pipeline';
import { makeDocx, makePdf, makeZip } from './ingest/testkit';
import { readZip } from './ingest/zip';
import { searchLibrary } from './library';

const db = createTestDb();
const sms = new FakeSmsProvider();
const sql = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  systemTx(db, (q) => q.query<T>(text, params));

const kunye = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    title: 'Zeytin Budama Notları',
    publisher: 'Örnek İl Tarım Müdürlüğü',
    sourceDate: '2025-02-10',
    sourceVersion: 'v1',
    licenseNote: 'Kurum izniyle, atıfla kullanılır',
    tier: 'kurum',
    ...over,
  });

const PACK_TABLE = {
  table: [
    ['Alan', 'Değer'],
    ['Kc başlangıç', '0,65'],
    ['Kc orta', '0,70'],
    ['Kc son', '0,70'],
    ['En yüksek boy (m)', '4'],
  ],
};

describe('docx çıkarma', () => {
  it('paragraf, tablo, özel karakter ve açık sayfa sonunu okur', () => {
    const d = docxToContent(
      makeDocx([
        'Zeytinde budama & seyreltme <kış sonu>.',
        {
          table: [
            ['Evre', 'Not'],
            ['Çiçeklenme', 'Don riski'],
          ],
        },
        { pageBreak: true },
        'İkinci sayfa metni.',
      ]),
    );
    expect(d.pages).toHaveLength(2);
    expect(d.pages[0]!.text).toContain('Zeytinde budama & seyreltme <kış sonu>.');
    expect(d.pages[0]!.text).toContain('Çiçeklenme | Don riski');
    expect(d.pages[1]).toEqual({ page: 2, text: 'İkinci sayfa metni.' });
    expect(d.tables[0]).toEqual([
      ['Evre', 'Not'],
      ['Çiçeklenme', 'Don riski'],
    ]);
  });

  it('stored (sıkıştırmasız) zip de okunur', () => {
    expect(docxToContent(makeDocx(['Merhaba'], 0)).pages[0]!.text).toBe('Merhaba');
  });

  it('Word olmayan zip, bozuk zip ve eksik merkez dizini hata verir', () => {
    expect(() => docxToContent(makeZip({ 'a.txt': 'x' }))).toThrow(/Word belgesi değil/);
    expect(() => docxToContent(new Uint8Array([1, 2, 3, 4]))).toThrow(/ZIP/);
    const z = makeDocx(['x']);
    expect(() => readZip(z.subarray(0, z.length - 30), () => true)).toThrow();
  });

  it('zip bombası: açılmış boyut sınırı aşılırsa reddedilir', () => {
    const big = makeZip({ 'word/document.xml': 'a'.repeat(1_000_000) });
    expect(readZip(big, () => true).get('word/document.xml')!.length).toBe(1_000_000);
    const z = Buffer.from(makeZip({ 'word/document.xml': 'abc' }));
    const cd = z.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    z.writeUInt32LE(200 * 1024 * 1024, cd + 24);
    expect(() => readZip(z, () => true)).toThrow(/çok büyük/);
  });
});

describe('biçim tanıma', () => {
  it('imzaya bakar: PDF, docx, txt; eski .doc ve uzantısı yanlış zip reddedilir', async () => {
    expect((await extractContent('a.pdf', makePdf(['Merhaba dunya']))).format).toBe('pdf');
    expect((await extractContent('a.docx', makeDocx(['x']))).format).toBe('docx');
    expect((await extractContent('a.txt', Buffer.from('Düz metin'))).format).toBe('txt');
    expect((await extractContent('a.txt', makePdf(['Merhaba']))).format).toBe('pdf');
    await expect(extractContent('a.zip', makeDocx(['x']))).rejects.toThrow(/\.docx/);
    await expect(
      extractContent('a.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3])),
    ).rejects.toThrow(/\.doc/);
    await expect(extractContent('a.txt', Buffer.from([0xff, 0xfe, 0xfa]))).rejects.toThrow(/UTF-8/);
    await expect(extractContent('a.txt', Buffer.alloc(0))).rejects.toThrow(/boş/);
    await expect(extractContent('a.exe', Buffer.from('MZ....'))).rejects.toThrow(/Desteklenmeyen/);
  });
});

describe('bitki paketi tablosu', () => {
  it('Türkçe etiketler ve virgüllü ondalıkla taslak değerleri çıkarır', () => {
    expect(parsePackTable([PACK_TABLE.table])).toEqual({
      kcIni: 0.65,
      kcMid: 0.7,
      kcEnd: 0.7,
      kcEndMax: null,
      maxHeightM: 4,
    });
    const withMax = [[...PACK_TABLE.table, ['Kc son (en yüksek)', '0.9']]];
    expect(parsePackTable(withMax).kcEndMax).toBe(0.9);
  });

  it('eksik, aralık dışı ya da tekrarlı satır hatadır; değer uydurulmaz', () => {
    const rows = PACK_TABLE.table;
    expect(() => parsePackTable([rows.filter((r) => r[0] !== 'Kc orta')])).toThrow(/Kc orta/);
    expect(() => parsePackTable([[...rows.slice(0, 3), ['Kc son', 'yok']]])).toThrow(/Kc son/);
    expect(() =>
      parsePackTable([rows.map((r) => (r[0] === 'Kc orta' ? ['Kc orta', '3'] : r))]),
    ).toThrow(/0 ile 2/);
    expect(() => parsePackTable([[...rows, ['Kc orta', '0,8']]])).toThrow(/birden fazla/);
    expect(() => parsePackTable([[...rows, ['Kc son (en yüksek)', '0,5']]])).toThrow(/küçük/);
  });
});

describe('klasörden uçtan uca içe aktarma', () => {
  let dir: string;
  beforeAll(async () => {
    await migrate(db);
    await importCropCatalog(db);
    dir = mkdtempSync(join(tmpdir(), 'icerik-'));
    mkdirSync(join(dir, 'alt'));
    const put = (name: string, data: Buffer | string, k?: string) => {
      writeFileSync(join(dir, name), data);
      if (k !== undefined) writeFileSync(join(dir, name + '.kunye.json'), k);
    };
    put(
      'zeytin-budama.docx',
      makeDocx([
        'Zeytin ağacında budama kış sonunda yapılır. Budama ile ağacın içi güneş ışığı alır.',
        { pageBreak: true },
        'Damla sulama suyu bitkinin kök bölgesine yavaş yavaş verir.',
      ]),
      kunye(),
    );
    put('damla.pdf', makePdf(['Damla sulama su tasarrufu saglar']), kunye({ title: 'Damla PDF' }));
    put(
      'alt/not.txt',
      'Buğdayda ekim zamanı bölgeye göre değişir.',
      kunye({ title: 'Buğday notu' }),
    );
    put('kunyesiz.docx', makeDocx(['Kaynağı belli olmayan metin.']));
    put('eksik-kunye.docx', makeDocx(['Metin']), JSON.stringify({ title: 'Sadece başlık' }));
    put('sahte.docx', 'bu bir zip değil', kunye({ title: 'Sahte' }));
    put('eski.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), kunye({ title: 'Eski' }));
    put('taranmis.pdf', makePdf(['']), kunye({ title: 'Taranmış' }));
    put(
      'zeytin-paket.docx',
      makeDocx(['Zeytin Kc değerleri', PACK_TABLE]),
      kunye({
        title: 'Zeytin Kc Tablosu',
        kind: 'bitki-paketi',
        cropId: 'zeytin',
        sourceVersion: '2025-ek-1',
      }),
    );
    put('onay-denemesi.txt', 'Metin', kunye({ reviewStatus: 'uzman-onayli' }));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('her dosya künyesiyle taslak girer; künyesiz/bozuk dosya sebebiyle atlanır', async () => {
    const r = await ingestFolder(db, dir);
    const by = Object.fromEntries(r.files.map((f) => [f.file, f]));
    expect(by['zeytin-budama.docx']).toMatchObject({ outcome: 'yuklendi', format: 'docx' });
    expect(by['damla.pdf']).toMatchObject({ outcome: 'yuklendi', format: 'pdf' });
    expect(by['alt/not.txt']).toMatchObject({ outcome: 'yuklendi', format: 'txt' });
    expect(by['zeytin-paket.docx']).toMatchObject({ outcome: 'yuklendi', kind: 'bitki-paketi' });
    expect(by['kunyesiz.docx']).toMatchObject({ outcome: 'atlandi' });
    expect(by['kunyesiz.docx']!.reason).toMatch(/Künye dosyası yok/);
    expect(by['eksik-kunye.docx']!.reason).toMatch(/Künye geçersiz/);
    expect(by['sahte.docx']).toMatchObject({ outcome: 'hata' });
    expect(by['eski.doc']).toMatchObject({ outcome: 'atlandi' });
    expect(by['taranmis.pdf']).toMatchObject({ outcome: 'atlandi' });
    // Künyede onay durumu alanı tanınmaz: kesin (strict) şema reddeder.
    expect(by['onay-denemesi.txt']!.reason).toMatch(/Künye geçersiz/);
    expect(r.counts).toEqual({ yuklendi: 4, 'ayni-icerik': 0, atlandi: 5, hata: 1 });

    const docs = await sql<{ review_status: string }>(
      'SELECT review_status FROM library_documents',
    );
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.review_status === 'taslak-uzman-onayi-bekliyor')).toBe(true);
    const packs = await sql<{ review_status: string; source: string }>(
      `SELECT review_status, source FROM crop_pack_versions
       WHERE crop_id = 'zeytin' ORDER BY version`,
    );
    const last = packs[packs.length - 1]!;
    expect(last.review_status).toBe('taslak-uzman-onayi-bekliyor');
    expect(last.source).toContain('Zeytin Kc Tablosu');
  });

  it('kayıtlar künyeyle aranır; onaylanana dek rozetli (needsBadge)', async () => {
    const hits = await systemTx(db, (q) => searchLibrary(q, 'zeytin ağacında budama', 3));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.needsBadge).toBe(true);
    expect(hits[0]!.source).toMatchObject({
      title: 'Zeytin Budama Notları',
      publisher: 'Örnek İl Tarım Müdürlüğü',
      date: '2025-02-10',
      version: 'v1',
    });
    expect(hits[0]!.page).toBe(1);
    const second = await systemTx(db, (q) => searchLibrary(q, 'damla sulama kök bölgesine', 3));
    expect(second.find((h) => h.text.includes('kök bölgesine'))!.page).toBe(2);
  });

  it('günlük kaydı her dosyayı ve sonucu tutar; yüklenen hep taslak', async () => {
    const log = await sql<{ outcome: string; review_status: string | null }>(
      'SELECT outcome, review_status FROM ingest_log ORDER BY id',
    );
    expect(log).toHaveLength(10);
    for (const l of log) {
      expect(l.review_status).toBe(l.outcome === 'yuklendi' ? 'taslak-uzman-onayi-bekliyor' : null);
    }
    // Künyesi eksik "yuklendi" kaydı veritabanında bile yazılamaz.
    await expect(
      sql(
        `INSERT INTO ingest_log(file_name, file_sha256, outcome, review_status)
         VALUES ('x','y','yuklendi','taslak-uzman-onayi-bekliyor')`,
      ),
    ).rejects.toThrow();
  });

  it('ikinci çalıştırma yinelemez; içerik aynı kalır', async () => {
    const r = await ingestFolder(db, dir);
    expect(r.counts.yuklendi).toBe(0);
    expect(r.counts['ayni-icerik']).toBe(4);
    expect((await sql('SELECT 1 FROM library_documents')).length).toBe(3);
  });

  it('paket değeri değişirse yeni sürüm, eski sürüm kalır; hepsi taslak', async () => {
    const before = await sql<{ kc_mid: string }>(
      `SELECT kc_mid FROM crop_pack_versions WHERE crop_id = 'zeytin' ORDER BY version`,
    );
    const changed = JSON.parse(JSON.stringify(PACK_TABLE)) as typeof PACK_TABLE;
    changed.table[2] = ['Kc orta', '0,72'];
    writeFileSync(join(dir, 'zeytin-paket.docx'), makeDocx(['Zeytin Kc değerleri', changed]));
    writeFileSync(
      join(dir, 'zeytin-paket.docx.kunye.json'),
      kunye({
        title: 'Zeytin Kc Tablosu',
        kind: 'bitki-paketi',
        cropId: 'zeytin',
        sourceVersion: '2025-ek-2',
      }),
    );
    const r = await ingestFolder(db, dir);
    expect(r.files.find((f) => f.file === 'zeytin-paket.docx')!.outcome).toBe('yuklendi');
    const after = await sql<{ kc_mid: string; review_status: string }>(
      `SELECT kc_mid, review_status FROM crop_pack_versions WHERE crop_id = 'zeytin' ORDER BY version`,
    );
    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(0, before.length).map((p) => p.kc_mid)).toEqual(before.map((p) => p.kc_mid));
    expect(Number(after.at(-1)!.kc_mid)).toBe(0.72);
    expect(after.at(-1)!.review_status).toBe('taslak-uzman-onayi-bekliyor');
  });

  it('bilinmeyen ürüne paket yüklenmez; sembolik bağlantı izlenmez', async () => {
    const d2 = mkdtempSync(join(tmpdir(), 'icerik2-'));
    try {
      writeFileSync(join(d2, 'p.docx'), makeDocx([PACK_TABLE]));
      writeFileSync(
        join(d2, 'p.docx.kunye.json'),
        kunye({ kind: 'bitki-paketi', cropId: 'olmayan-urun' }),
      );
      try {
        symlinkSync(join(dir, 'damla.pdf'), join(d2, 'link.pdf'));
      } catch {
        /* sembolik bağlantı izni yoksa (Windows) bu kontrol atlanır */
      }
      const r = await ingestFolder(db, d2);
      expect(r.files).toHaveLength(1);
      expect(r.files[0]).toMatchObject({ outcome: 'hata' });
      expect(r.files[0]!.reason).toMatch(/Ürün bulunamadı/);
    } finally {
      rmSync(d2, { recursive: true, force: true });
    }
  });
});

describe('yönetici ucu', () => {
  let app: INestApplication;
  let base: string;
  let dir: string;
  const post = (path: string, token?: string, body: object = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  const call = async (path: string, token?: string) => {
    const res = await post(path, token);
    const t = await res.text();
    return { status: res.status, body: t ? (JSON.parse(t) as any) : undefined }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  async function login(phone: string) {
    await post('/auth/otp/request', undefined, { phone });
    const r = await post('/auth/otp/verify', undefined, { phone, code: sms.lastCode(phone) });
    return (await r.json()) as { token: string; userId: string };
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'icerik3-'));
    writeFileSync(join(dir, 'a.txt'), 'Arpa ekimi sonbaharda yapılır.');
    writeFileSync(join(dir, 'a.txt.kunye.json'), kunye({ title: 'Arpa notu' }));
    app = await NestFactory.create(
      AppModule.register({ db, sms, auth: { otpSecret: 'test' }, ingestDir: dir }),
      { logger: false },
    );
    await app.listen(0);
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    await db.close();
  });

  it('çiftçi 403, MFA’sız yönetici 403, MFA’lı yönetici 200 ve sonuç raporu alır', async () => {
    const farmer = await login('+905321120001');
    expect((await call('/admin/jobs/content-ingest', farmer.token)).status).toBe(403);
    expect((await call('/admin/jobs/content-ingest')).status).toBe(401);
    const admin = await login('+905321120002');
    await sql('INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$1)', [
      admin.userId,
      'admin',
    ]);
    expect((await call('/admin/jobs/content-ingest', admin.token)).status).toBe(403);
    await sql('UPDATE sessions SET mfa_at = now() WHERE user_id = $1', [admin.userId]);
    const ok = await call('/admin/jobs/content-ingest', admin.token);
    expect(ok.status).toBe(200);
    expect(ok.body.counts).toMatchObject({ yuklendi: 1, hata: 0 });
    expect((await call('/admin/jobs/content-ingest', admin.token)).body.counts.yuklendi).toBe(0);
  });
});
