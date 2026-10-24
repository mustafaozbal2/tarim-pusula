import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  distanceMeters,
  haversineKm,
  pointInPolygon,
  polygonAreaSquareMeters,
} from '@tarim/agro-core';
import { migrate, systemTx } from '../src/db/db';
import { createTestDb } from '../src/db/testdb';

// PostGIS koşullu SQL'leri gerçek PostGIS'te çalışır; sonuç TS çekirdeğiyle (agro-core) karşılaştırılır.
const db = createTestDb();
let owner: string;

// Belirlenimli sözde rastgele (mulberry32): test her koşuda aynı noktaları üretir.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261020);
// Türkiye kutusu (yaklaşık): enlem 36–42, boylam 26–45.
const pts = Array.from({ length: 400 }, () => ({
  lat: 36 + rand() * 6,
  lon: 26 + rand() * 19,
}));
const ids: string[] = [];

beforeAll(async () => {
  await migrate(db);
  await systemTx(db, async (q) => {
    const [u] = await q.query<{ id: string }>(
      "INSERT INTO users(phone) VALUES ('+905320009999') RETURNING id",
    );
    owner = u!.id;
    for (const [i, p] of pts.entries()) {
      const [f] = await q.query<{ id: string }>(
        'INSERT INTO fields(owner_id, name, lat, lon) VALUES ($1,$2,$3,$4) RETURNING id',
        [owner, `t${i}`, p.lat, p.lon],
      );
      ids.push(f!.id);
    }
  });
});
afterAll(() => db.close());

describe('PostGIS: şema', () => {
  it('geom ve boundary_geom sütunları ve GiST dizinleri oluşur (koşullu SQL çalıştı)', async () => {
    const cols = await systemTx(db, (q) =>
      q.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name='fields' AND column_name IN ('geom','boundary_geom')`,
      ),
    );
    expect(cols.map((c) => c.column_name).sort()).toEqual(['boundary_geom', 'geom']);
    const idx = await systemTx(db, (q) =>
      q.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE tablename='fields' AND indexdef ILIKE '%gist%'`,
      ),
    );
    expect(idx.map((i) => i.indexname).sort()).toEqual([
      'fields_boundary_geom_idx',
      'fields_geom_idx',
    ]);
  });
});

describe('PostGIS ST_DWithin ↔ TS haversine', () => {
  const circles = [
    { lat: 37.06, lon: 37.38, km: 50 }, // Gaziantep
    { lat: 39.92, lon: 32.85, km: 120 }, // Ankara
    { lat: 38.42, lon: 27.14, km: 25 }, // İzmir
    { lat: 41.0, lon: 39.7, km: 300 }, // Trabzon
  ];

  it('küre modelinde (use_spheroid=false) eşleşen tarla kümeleri birebir aynıdır', async () => {
    for (const c of circles) {
      const rows = await systemTx(db, (q) =>
        q.query<{ name: string }>(
          `SELECT name FROM fields WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, $3, false)`,
          [c.lat, c.lon, c.km * 1000],
        ),
      );
      const sql = new Set(rows.map((r) => r.name));
      const ts = new Set<string>();
      let nearEdge = 0;
      for (const [i, p] of pts.entries()) {
        const d = haversineKm(c.lat, c.lon, p.lat, p.lon);
        if (d <= c.km) ts.add(`t${i}`);
        // Küre yarıçapı PostGIS'te 6371008.7714, bizde 6371008.8: yalnız ~1 m'lik kenar farkı tolere edilir.
        if (Math.abs(d - c.km) < 0.002) nearEdge++;
      }
      expect(ts.size, 'daire boş kalmamalı').toBeGreaterThan(0);
      expect(nearEdge).toBe(0);
      expect([...sql].sort()).toEqual([...ts].sort());
    }
  });

  it('elipsoid (varsayılan) ile TS küre mesafesi arasındaki fark %0,5 içindedir', async () => {
    const rows = await systemTx(db, (q) =>
      q.query<{ name: string; d: number }>(
        `SELECT name, ST_Distance(geom, ST_SetSRID(ST_MakePoint(37.38,37.06),4326)::geography) AS d FROM fields`,
      ),
    );
    let worst = 0;
    for (const r of rows) {
      const i = Number(r.name.slice(1));
      const ts = distanceMeters({ lat: 37.06, lon: 37.38 }, pts[i]!);
      worst = Math.max(worst, Math.abs(r.d - ts) / ts);
    }
    expect(worst).toBeLessThan(0.005);
  });
});

describe('PostGIS sınır poligonu ↔ TS', () => {
  // Kenarları eksenlere paralel olmayan, ~1 km'lik bir parsel (Şanlıurfa civarı).
  const ring = [
    { lon: 38.8, lat: 37.1 },
    { lon: 38.808, lat: 37.1015 },
    { lon: 38.809, lat: 37.108 },
    { lon: 38.7995, lat: 37.107 },
  ];

  it('alan: ST_Area ile polygonAreaSquareMeters %0,5 içinde uyuşur; geometri tetikleyiciyle dolar', async () => {
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [[...ring, ring[0]!].map((p) => [p.lon, p.lat])],
    });
    const [row] = await systemTx(db, async (q) => {
      await q.query('UPDATE fields SET boundary = $2::jsonb WHERE id = $1', [ids[0], geojson]);
      return q.query<{ a: number }>(
        'SELECT ST_Area(boundary_geom) AS a FROM fields WHERE id = $1',
        [ids[0]],
      );
    });
    const ts = polygonAreaSquareMeters(ring);
    expect(Math.abs(row!.a - ts) / ts).toBeLessThan(0.005);
  });

  it('nokta-çokgen: ST_Covers ile pointInPolygon rastgele noktalarda aynı sonucu verir', async () => {
    const r = rng(7);
    let inside = 0;
    for (let k = 0; k < 300; k++) {
      const p = { lon: 38.795 + r() * 0.02, lat: 37.098 + r() * 0.014 };
      const [row] = await systemTx(db, (q) =>
        q.query<{ c: boolean }>(
          `SELECT ST_Covers(boundary_geom, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) AS c
           FROM fields WHERE id = $1`,
          [ids[0], p.lon, p.lat],
        ),
      );
      const ts = pointInPolygon(p, ring);
      // geography çokgeninde kenarlar jeodeziktir (büyük daire), TS düzlemseldir: ~1 km parselde sapma
      // metre altıdır; yalnız kenara 1 m'den yakın noktalar karşılaştırma dışı bırakılır (aşağıda sayılır).
      if (row!.c !== ts) {
        const [d] = await systemTx(db, (q) =>
          q.query<{ d: number }>(
            `SELECT ST_Distance(ST_Boundary(boundary_geom::geometry)::geography,
                    ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) AS d
             FROM fields WHERE id = $1`,
            [ids[0], p.lon, p.lat],
          ),
        );
        expect(d!.d, `kenar dışı uyuşmazlık (${p.lon},${p.lat})`).toBeLessThan(1.5);
      }
      if (ts) inside++;
    }
    expect(inside).toBeGreaterThan(30);
    expect(inside).toBeLessThan(270);
  });
});
