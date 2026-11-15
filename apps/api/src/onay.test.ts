import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { importCropCatalog } from './crops';
import { DataService } from './data.service';
import { migrate, PgliteDb, systemTx } from './db/db';
import {
  bekleyenleriYayinla,
  etkinDurum,
  ONAY_TABLOLARI,
  onayZorunlu,
  TASLAK,
  YAYINDA,
  yeniKayitDurumu,
} from './onay';
import { KuralAnalizci } from './tarama/analiz';
import { TaramaService } from './tarama/servis';

/**
 * G36: uzman onayı aşaması kapalı (canlıdaki durum). Diğer test dosyaları UZMAN_ONAYI=1 ile onay düzeneğini
 * sınar; burada ayar kaldırılıp kapalı kipin davranışı sınanır.
 */
describe('uzman onayı politikası', () => {
  const eski = process.env['UZMAN_ONAYI'];
  afterEach(() => {
    if (eski === undefined) delete process.env['UZMAN_ONAYI'];
    else process.env['UZMAN_ONAYI'] = eski;
  });

  it('ayar yokken onay kapalıdır: yeni kayıt doğrudan yayında; UZMAN_ONAYI=1 ile taslak başlar', () => {
    expect(onayZorunlu({})).toBe(false);
    expect(yeniKayitDurumu({})).toBe(YAYINDA);
    expect(onayZorunlu({ UZMAN_ONAYI: '1' })).toBe(true);
    expect(yeniKayitDurumu({ UZMAN_ONAYI: '1' })).toBe(TASLAK);
    // Yalnız "1" açar: yanlış yazılmış ayar onayı sessizce açmaz.
    expect(onayZorunlu({ UZMAN_ONAYI: 'true' })).toBe(false);
  });

  it('etkin durum: taslak kaynaklı değer yayında sayılır; reddedilen ve onaylı durum değişmez', () => {
    expect(etkinDurum(TASLAK, {})).toBe(YAYINDA);
    expect(etkinDurum(TASLAK, { UZMAN_ONAYI: '1' })).toBe(TASLAK);
    expect(etkinDurum('reddedildi', {})).toBe('reddedildi');
    expect(etkinDurum(YAYINDA, { UZMAN_ONAYI: '1' })).toBe(YAYINDA);
  });

  it('bekleyenleri yayına alır: bütün onay tablolarında taslak kalmaz; reddedilen kayda dokunmaz; onay açıkken hiçbir şey yapmaz', async () => {
    const db = new PgliteDb();
    await migrate(db);
    await importCropCatalog(db);
    await systemTx(db, async (q) => {
      await q.query(
        `INSERT INTO announcements(source_org, title, body, published_at, targeting, review_status)
         VALUES ('Kurum','Taslak duyuru','Metin', now(), '{"places":[],"circle":null,"cropIds":[]}', $1),
                ('Kurum','Reddedilen duyuru','Metin', now(), '{"places":[],"circle":null,"cropIds":[]}', 'reddedildi')`,
        [TASLAK],
      );
    });
    const taslakSay = async () => {
      let n = 0;
      await systemTx(db, async (q) => {
        for (const t of ONAY_TABLOLARI) {
          const [r] = await q.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM ${t} WHERE review_status = '${TASLAK}'`,
          );
          n += Number(r!.n);
        }
      });
      return n;
    };
    const once = await taslakSay();
    expect(once).toBeGreaterThan(10); // Kc paketleri ve toprak türleri taslak tohumlanır
    expect(await bekleyenleriYayinla(db, { UZMAN_ONAYI: '1' })).toBe(0);
    expect(await taslakSay()).toBe(once);
    expect(await bekleyenleriYayinla(db, {})).toBe(once);
    expect(await taslakSay()).toBe(0);
    const [red] = await systemTx(db, (q) =>
      q.query<{ review_status: string }>(
        `SELECT review_status FROM announcements WHERE title = 'Reddedilen duyuru'`,
      ),
    );
    expect(red!.review_status).toBe('reddedildi');
    // İkinci çağrı boş döner (yinelenebilir).
    expect(await bekleyenleriYayinla(db, {})).toBe(0);
  }, 90_000);

  it('onay kapalıyken taranan resmî haber doğrudan yayındadır (çiftçi ekranına ve bildirime girer)', async () => {
    delete process.env['UZMAN_ONAYI'];
    const db = new PgliteDb();
    await migrate(db);
    await importCropCatalog(db);
    await systemTx(db, (q) =>
      q.query(
        `INSERT INTO official_sources(name, kind, province, url)
         VALUES ('Test İl Müdürlüğü','il_mudurlugu','Gaziantep','https://gaziantep.tarimorman.gov.tr/')`,
      ),
    );
    const f = (async (u: string | URL) => {
      const url = String(u);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
      if (url.endsWith('/'))
        return new Response(
          `<a Yayin="12.11.2026" href="/Duyuru/9/Fidan">Antep fıstığı fidanı dağıtımı başvuruları</a>`,
        );
      return new Response(
        '<html><title>t</title><p>Antep fıstığı üreticilerine sertifikalı fidan dağıtımı için başvurular alınmaktadır.</p></html>',
      );
    }) as unknown as typeof fetch;
    const svc = new TaramaService(
      new DataService(db as never),
      () => new Date('2026-11-15T07:00:00Z'),
      f,
      new KuralAnalizci(),
    );
    svc.pauseMs = 0;
    expect((await svc.runAll())[0]!.yeni).toBe(1);
    const [d] = await systemTx(db, (q) =>
      q.query<{ review_status: string; auto: boolean }>(
        `SELECT review_status, auto FROM announcements WHERE auto`,
      ),
    );
    expect(d).toEqual({ review_status: YAYINDA, auto: true });
  }, 60_000);
});
