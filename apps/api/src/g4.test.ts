import 'reflect-metadata';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { importCalendarTemplates } from './calendar';
import { importCropCatalog } from './crops';
import { migrate, PgliteDb, systemTx } from './db/db';
import { Places } from './places';

const NOW = new Date('2026-10-20T09:00:00Z');
const db = new PgliteDb();
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

let gaziantep: Awaited<ReturnType<typeof login>>;
let urfa: Awaited<ReturnType<typeof login>>;
let inst: Awaited<ReturnType<typeof login>>;
let expert: Awaited<ReturnType<typeof login>>;
let fGaziantep: string;
let fUrfa: string;
let fGpsOnly: string;
let fNoCrop: string;

const ann = (over: Record<string, unknown> = {}) => ({
  sourceOrg: 'Gaziantep İl Tarım ve Orman Müdürlüğü',
  title: 'Bahçe toplantısı',
  body: 'Toplantı il müdürlüğünde yapılacak.',
  sourceUrl: 'https://example.org/duyuru/1',
  publishedAt: '2026-10-19T00:00:00Z',
  expiresAt: '2026-11-30T00:00:00Z',
  targeting: { places: [{ province: 'Gaziantep' }], circle: null, cropIds: [] },
  ...over,
});

beforeAll(async () => {
  await migrate(db);
  await importCropCatalog(db);
  app = await NestFactory.create(
    AppModule.register({
      db,
      sms,
      auth: { otpSecret: 'test' },
      places: Places.load(),
      now: () => NOW,
    }),
    { logger: false },
  );
  await app.listen(0);
  base = await app.getUrl();
  gaziantep = await login('+905321120101');
  urfa = await login('+905321120102');
  inst = await login('+905321120103');
  expert = await login('+905321120104');
  await grant(inst.userId, 'institution_admin');
  await grant(expert.userId, 'expert');

  const mk = async (t: string, body: object) => (await call('POST', '/fields', t, body)).body.id;
  fGaziantep = await mk(gaziantep.token, {
    name: 'Nizip bahçe',
    province: 'Gaziantep',
    district: 'Nizip',
    lat: 37.01,
    lon: 37.79,
    cropId: 'antep-fistigi',
  });
  fUrfa = await mk(urfa.token, {
    name: 'Harran tarla',
    province: 'Şanlıurfa',
    district: 'Harran',
    lat: 36.86,
    lon: 39.0,
    cropId: 'pamuk',
  });
  // Yalnız GPS: il yazılmamış, en yakın yerleşimden çıkarılır.
  fGpsOnly = await mk(gaziantep.token, {
    name: 'GPS ile eklenen',
    lat: 37.01,
    lon: 37.79,
    cropId: 'antep-fistigi',
  });
  fNoCrop = await mk(gaziantep.token, {
    name: 'Ürünsüz',
    province: 'Gaziantep',
    lat: 37.0,
    lon: 37.8,
  });
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('duyuru ekleme yetkisi', () => {
  it('çiftçi duyuru ekleyemez; giriş şart', async () => {
    expect((await call('POST', '/announcements', undefined, ann())).status).toBe(401);
    expect((await call('POST', '/announcements', gaziantep.token, ann())).status).toBe(403);
    expect((await call('POST', '/announcements/x/approve', gaziantep.token)).status).toBe(403);
  });
  it('kaynak kurum ve tarih zorunlu; bitiş yayından sonra olmalı', async () => {
    expect((await call('POST', '/announcements', inst.token, ann({ sourceOrg: '' }))).status).toBe(
      400,
    );
    expect(
      (await call('POST', '/announcements', inst.token, ann({ publishedAt: undefined }))).status,
    ).toBe(400);
    expect(
      (await call('POST', '/announcements', inst.token, ann({ expiresAt: '2026-10-01T00:00:00Z' })))
        .status,
    ).toBe(400);
  });
  it('kurum yöneticisi ekler; taslak başlar; onayı yalnız uzman verir', async () => {
    const r = await call('POST', '/announcements', inst.token, ann());
    expect(r.status).toBe(201);
    expect(r.body.reviewStatus).toBe('taslak-uzman-onayi-bekliyor');
    expect((await call('POST', `/announcements/${r.body.id}/approve`, inst.token)).status).toBe(
      403,
    );
    const ok = await call('POST', `/announcements/${r.body.id}/approve`, expert.token);
    expect(ok.status).toBe(200);
    const [row] = await sql<{ review_status: string; reviewed_by: string }>(
      'SELECT review_status, reviewed_by FROM announcements WHERE id = $1',
      [r.body.id],
    );
    expect(row).toMatchObject({ review_status: 'uzman-onayli', reviewed_by: expert.userId });
  });
  it('kurum yöneticisi yalnız kendi duyurularını listeler', async () => {
    const mine = await call('GET', '/announcements/managed', inst.token);
    expect(mine.status).toBe(200);
    expect(mine.body.length).toBeGreaterThan(0);
    const other = await call('GET', '/announcements/managed', (await login('+905321120105')).token);
    expect(other.status).toBe(403);
  });
});

describe('GET /fields/:id/announcements — hedefleme', () => {
  beforeAll(async () => {
    const add = async (key: string, body: object) =>
      [key, (await call('POST', '/announcements', inst.token, body)).body.id as string] as const;
    await Promise.all([
      await add(
        'urfa',
        ann({
          title: 'Şanlıurfa duyurusu',
          sourceOrg: 'Şanlıurfa İl Müdürlüğü',
          targeting: { places: [{ province: 'Şanlıurfa' }], circle: null, cropIds: [] },
        }),
      ),
      await add('ulusal', ann({ title: 'Ulusal duyuru', targeting: undefined })),
      await add(
        'gaziPamuk',
        ann({
          title: 'Gaziantep pamuk',
          targeting: { places: [{ province: 'Gaziantep' }], circle: null, cropIds: ['pamuk'] },
        }),
      ),
      await add(
        'nizipFistik',
        ann({
          title: 'Nizip fıstık',
          targeting: {
            places: [{ province: 'Gaziantep', district: 'Nizip' }],
            circle: null,
            cropIds: ['antep-fistigi'],
          },
        }),
      ),
      await add(
        'bitmis',
        ann({
          title: 'Süresi geçmiş',
          expiresAt: '2026-10-10T00:00:00Z',
          publishedAt: '2026-10-01T00:00:00Z',
        }),
      ),
      await add(
        'gelecek',
        ann({
          title: 'Henüz yayınlanmadı',
          publishedAt: '2026-11-01T00:00:00Z',
          expiresAt: undefined,
        }),
      ),
      await add(
        'daire',
        ann({
          title: 'Çevre duyurusu',
          targeting: { places: [], circle: { lat: 37.0, lon: 37.8, radiusKm: 5 }, cropIds: [] },
        }),
      ),
    ]);
  });

  const titles = async (token: string, fid: string) =>
    (
      (await call('GET', `/fields/${fid}/announcements`, token)).body.announcements as {
        title: string;
      }[]
    )
      .map((a) => a.title)
      .sort();

  it('BAŞKA İLİN DUYURUSU GÖRÜNMEZ: Gaziantepli Şanlıurfa duyurusunu görmez', async () => {
    const t = await titles(gaziantep.token, fGaziantep);
    expect(t).not.toContain('Şanlıurfa duyurusu');
    expect(t).toContain('Bahçe toplantısı');
  });

  it('BAŞKA İLİN DUYURUSU GÖRÜNMEZ: Şanlıurfalı Gaziantep duyurularını görmez', async () => {
    const t = await titles(urfa.token, fUrfa);
    expect(t).toEqual(['Şanlıurfa duyurusu', 'Ulusal duyuru'].sort());
  });

  it('il + ürün + ilçe + daire hedeflemesi', async () => {
    const t = await titles(gaziantep.token, fGaziantep);
    expect(t).toEqual(
      ['Bahçe toplantısı', 'Çevre duyurusu', 'Nizip fıstık', 'Ulusal duyuru'].sort(),
    );
    expect(t).not.toContain('Gaziantep pamuk'); // ürün farklı
  });

  it('süresi geçmiş ve henüz yayınlanmamış duyuru görünmez', async () => {
    const all = [
      ...(await titles(gaziantep.token, fGaziantep)),
      ...(await titles(urfa.token, fUrfa)),
    ];
    expect(all).not.toContain('Süresi geçmiş');
    expect(all).not.toContain('Henüz yayınlanmadı');
  });

  it('ili yazılmamış (yalnız GPS) tarla en yakın yerleşimden eşleşir', async () => {
    const t = await titles(gaziantep.token, fGpsOnly);
    expect(t).toContain('Bahçe toplantısı');
    expect(t).not.toContain('Şanlıurfa duyurusu');
  });

  it('ürünü olmayan tarla ürün hedefli duyuruyu görmez', async () => {
    const t = await titles(gaziantep.token, fNoCrop);
    expect(t).not.toContain('Nizip fıstık');
    expect(t).not.toContain('Gaziantep pamuk');
    expect(t).toContain('Bahçe toplantısı');
  });

  it('kart kaynak, tarih, sürüm, rozet ve "Neden?" metni taşır', async () => {
    const r = await call('GET', `/fields/${fGaziantep}/announcements`, gaziantep.token);
    const card = r.body.announcements.find(
      (a: { title: string }) => a.title === 'Bahçe toplantısı',
    );
    expect(card).toMatchObject({
      sourceOrg: 'Gaziantep İl Tarım ve Orman Müdürlüğü',
      sourceUrl: 'https://example.org/duyuru/1',
      publishedAt: '2026-10-19T00:00:00.000Z',
      version: 1,
      needsBadge: false, // bir önceki testte onaylandı
    });
    expect(card.why).toContain('Gaziantep');
    const draft = r.body.announcements.find((a: { title: string }) => a.title === 'Nizip fıstık');
    expect(draft.needsBadge).toBe(true);
  });

  it('başkasının tarlasının duyurusu istenemez (403)', async () => {
    expect((await call('GET', `/fields/${fGaziantep}/announcements`, urfa.token)).status).toBe(403);
    expect((await call('GET', `/fields/${fGaziantep}/announcements`)).status).toBe(401);
  });
});

describe('takvim', () => {
  let dir: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'takvim-'));
    const header =
      'crop_id,title,detail,stage,start,end,provinces,source,source_version,source_date\n';
    writeFileSync(
      join(dir, 'takvim_sablon.csv'),
      header +
        'antep-fistigi,Deneme etkinliği,Yalnız sınama içindir,Dinlenme,10-25,11-10,Gaziantep,Test kaynağı,v1,2026-10-01\n' +
        'antep-fistigi,Şanlıurfa etkinliği,Sınama,,10-01,12-31,Şanlıurfa,Test kaynağı,v1,2026-10-01\n' +
        'pamuk,Pamuk etkinliği,Sınama,,10-01,12-31,,Test kaynağı,v1,2026-10-01\n',
      'utf8',
    );
  });

  it('içe aktarma: taslak girer, tekrar çalışınca çift kayıt açmaz', async () => {
    expect(await importCalendarTemplates(db, dir)).toEqual({ created: 3, unchanged: 0 });
    expect(await importCalendarTemplates(db, dir)).toEqual({ created: 0, unchanged: 3 });
    const rows = await sql<{ review_status: string }>(
      'SELECT review_status FROM calendar_templates',
    );
    expect(rows.every((r) => r.review_status === 'taslak-uzman-onayi-bekliyor')).toBe(true);
  });

  it('kaynak, sürüm ya da tarih eksik satır reddedilir', async () => {
    const bad = mkdtempSync(join(tmpdir(), 'takvim-bad-'));
    const header =
      'crop_id,title,detail,stage,start,end,provinces,source,source_version,source_date\n';
    writeFileSync(
      join(bad, 'takvim_sablon.csv'),
      header + 'pamuk,X,Y,,10-01,10-02,,,v1,2026-10-01\n',
    );
    await expect(importCalendarTemplates(db, bad)).rejects.toThrow(/kaynak/);
    writeFileSync(
      join(bad, 'takvim_sablon.csv'),
      header + 'pamuk,X,Y,,13-01,10-02,,S,v1,2026-10-01\n',
    );
    await expect(importCalendarTemplates(db, bad)).rejects.toThrow(/AA-GG/);
  });

  it('veritabanı da atıfsız şablonu reddeder', async () => {
    await expect(
      sql(
        `INSERT INTO calendar_templates(crop_id,title,detail,start_month,start_day,end_month,end_day,source,source_version,source_date)
         VALUES ('pamuk','a','b',1,1,1,2,'','v','2026-01-01')`,
      ),
    ).rejects.toThrow();
  });

  it('uygulama rolü şablon yazamaz', async () => {
    await expect(
      systemTx(db, async (q) => {
        await q.exec('SET LOCAL ROLE tp_app');
        await q.exec(
          `INSERT INTO calendar_templates(crop_id,title,detail,start_month,start_day,end_month,end_day,source,source_version,source_date)
           VALUES ('pamuk','z','b',1,1,1,2,'s','v','2026-01-01')`,
        );
      }),
    ).rejects.toThrow();
  });

  it('tarla takvimi ürün ve ile göre süzülür; etkinlik kaynak, tarih ve "Neden?" taşır', async () => {
    const r = await call('GET', `/fields/${fGaziantep}/calendar?days=30`, gaziantep.token);
    expect(r.status).toBe(200);
    expect(r.body.today).toBe('2026-10-20');
    const titles = r.body.events.map((e: { title: string }) => e.title);
    expect(titles).toEqual(['Deneme etkinliği']); // Şanlıurfa'ya özel olan ve pamuk olan yok
    expect(r.body.events[0]).toMatchObject({
      start: '2026-10-25',
      end: '2026-11-10',
      source: 'Test kaynağı',
      sourceVersion: 'v1',
      sourceDate: '2026-10-01',
      needsBadge: true,
      actionable: false,
    });
    expect(r.body.events[0].why).toContain('Test kaynağı');
  });

  it('Şanlıurfa tarlası (pamuk) kendi ilinin şablonunu değil pamuk şablonunu görür', async () => {
    const r = await call('GET', `/fields/${fUrfa}/calendar`, urfa.token);
    expect(r.body.events.map((e: { title: string }) => e.title)).toEqual(['Pamuk etkinliği']);
    expect(r.body.events[0].ongoing).toBe(true);
  });

  it('ürünü olmayan tarlada takvim boş ve nedenini söyler', async () => {
    const r = await call('GET', `/fields/${fNoCrop}/calendar`, gaziantep.token);
    expect(r.body.events).toEqual([]);
    expect(r.body.note).toContain('ürün');
  });

  it('yetki ve girdi denetimi', async () => {
    expect((await call('GET', `/fields/${fGaziantep}/calendar`, urfa.token)).status).toBe(403);
    expect((await call('GET', `/fields/${fGaziantep}/calendar`)).status).toBe(401);
    expect(
      (await call('GET', `/fields/${fGaziantep}/calendar?days=0`, gaziantep.token)).status,
    ).toBe(400);
  });
});

describe('Places.nearest', () => {
  it('yakın nokta yerleşim verir; denizin ortası vermez', () => {
    const p = Places.load();
    expect(p.nearest(37.01, 37.79)?.province).toBe('Gaziantep');
    expect(p.nearest(35.0, 28.0)).toBeUndefined();
  });
});
