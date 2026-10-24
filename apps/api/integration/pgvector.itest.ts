import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cosine } from '@tarim/agro-core';
import { migrate, systemTx } from '../src/db/db';
import { createTestDb } from '../src/db/testdb';
import { EMBEDDER, searchLibrary, storeDocument, textToPages } from '../src/library';

// pgvector yolu (embedding_vec, HNSW, <=>) gerçek sunucuda; sıralama TS kosinüsüyle karşılaştırılır.
const db = createTestDb();

const TEXTS = [
  'Damla sulama sistemi kurulumunda boru çapı ve basınç dikkatle seçilmelidir.',
  'Zeytin ağaçlarında budama kış sonunda, don tehlikesi geçtikten sonra yapılır.',
  'Buğday ekiminde toprak sıcaklığı sekiz derecenin üzerinde olmalıdır.',
  'Pamukta yaprak biti ile mücadelede önce doğal düşmanlar gözlemlenir.',
  'Don olayı çiçeklenme döneminde meyve ağaçlarında verimi düşürür.',
];

beforeAll(async () => {
  await migrate(db);
  await systemTx(db, async (q) => {
    await storeDocument(
      q,
      null,
      {
        title: 'Deneme Rehberi',
        publisher: 'Örnek Kurum',
        sourceDate: '2025-01-01',
        sourceVersion: 'v1',
        licenseNote: 'test',
        tier: 'kurum',
      },
      textToPages(TEXTS.join('\f')),
    );
  });
});
afterAll(() => db.close());

describe('pgvector', () => {
  it('vektör sütunu ve HNSW dizini oluşur, parçalar vektörle yazılır', async () => {
    const [col] = await systemTx(db, (q) =>
      q.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM information_schema.columns WHERE table_name='library_chunks' AND column_name='embedding_vec'",
      ),
    );
    expect(col!.n).toBe('1');
    const [idx] = await systemTx(db, (q) =>
      q.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM pg_indexes WHERE indexname='library_chunks_vec_idx' AND indexdef ILIKE '%hnsw%'",
      ),
    );
    expect(idx!.n).toBe('1');
    const [rows] = await systemTx(db, (q) =>
      q.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM library_chunks WHERE embedding_vec IS NOT NULL',
      ),
    );
    expect(Number(rows!.n)).toBeGreaterThanOrEqual(TEXTS.length);
  });

  it('<=> sıralaması TS kosinüs sıralamasıyla aynıdır', async () => {
    const q1 = 'damla sulama boru basınç';
    const qv = EMBEDDER.embed(q1);
    const rows = await systemTx(db, (q) =>
      q.query<{ content: string; d: number }>(
        `SELECT content, embedding_vec <=> $1::vector AS d FROM library_chunks ORDER BY d LIMIT 5`,
        [`[${qv.join(',')}]`],
      ),
    );
    const ts = await systemTx(db, (q) =>
      q.query<{ content: string; embedding: number[] }>(
        'SELECT content, embedding FROM library_chunks',
      ),
    );
    const tsOrder = ts
      .map((r) => ({ content: r.content, d: 1 - cosine(qv, r.embedding) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    expect(rows.map((r) => r.content)).toEqual(tsOrder.map((r) => r.content));
    // Mesafe değerleri de uyuşur (float4 yuvarlaması içinde).
    rows.forEach((r, i) => expect(r.d).toBeCloseTo(tsOrder[i]!.d, 4));
  });

  it('searchLibrary vektör yolundan doğru parçayı ve künyeyi döndürür', async () => {
    const hits = await systemTx(db, (q) => searchLibrary(q, 'damla sulama boru basınç', 3));
    expect(hits[0]!.text).toContain('Damla sulama');
    expect(hits[0]!.source.title).toBe('Deneme Rehberi');
    expect(hits[0]!.needsBadge).toBe(true);
  });
});
