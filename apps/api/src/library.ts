import { createHash } from 'node:crypto';
import {
  chunkPages,
  HashEmbedder,
  needsDraftBadge,
  rankChunks,
  type Candidate,
  type Embedder,
  type PageText,
  type ReviewStatus,
  type SourceTier,
} from '@tarim/agro-core';
import type { Queryable } from './db/db';

export const EMBEDDER: Embedder = new HashEmbedder(512);
export const MAX_PDF_PAGES = 1000;

/** Düz metin: sayfalar form-feed ile ayrılır; ayrılmamışsa tek sayfa. */
export function textToPages(text: string): PageText[] {
  return text
    .split('\f')
    .map((t, i) => ({ page: i + 1, text: t }))
    .filter((p) => p.text.trim() !== '');
}

/** PDF'ten sayfa sayfa metin. Taranmış (metinsiz) PDF boş döner; çağıran bunu hata sayar. */
export async function pdfToPages(data: Uint8Array): Promise<PageText[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  try {
    if (doc.numPages > MAX_PDF_PAGES) throw new Error('PDF çok uzun');
    const pages: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let out = '';
      for (const item of content.items) {
        if ('str' in item) out += item.str + (item.hasEOL ? '\n' : ' ');
      }
      if (out.trim()) pages.push({ page: n, text: out });
    }
    return pages;
  } finally {
    await doc.cleanup();
  }
}

export interface DocMeta {
  title: string;
  publisher: string;
  sourceDate: string;
  sourceVersion: string;
  sourceUrl?: string | undefined;
  licenseNote: string;
  tier: 'kurum' | 'genel';
}

const arr = (v: readonly number[]) => `{${v.join(',')}}`;
const vec = (v: readonly number[]) => `[${v.join(',')}]`;

async function hasVectorColumn(q: Queryable): Promise<boolean> {
  const r = await q.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'library_chunks' AND column_name = 'embedding_vec'`,
  );
  return r.length > 0;
}

/** Dokümanı ve parçalarını tek işlemde kaydeder. Aynı içerik+sürüm ikinci kez girilemez (unique ihlali). */
export async function storeDocument(
  q: Queryable,
  userId: string,
  meta: DocMeta,
  pages: PageText[],
): Promise<{ id: string; chunks: number }> {
  const chunks = chunkPages(pages);
  const hash = createHash('sha256')
    .update(meta.sourceVersion + '\0' + pages.map((p) => p.text).join('\f'))
    .digest('hex');
  const [doc] = await q.query<{ id: string }>(
    `INSERT INTO library_documents(title, publisher, source_date, source_version, source_url,
       license_note, tier, page_count, content_hash, embedder, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      meta.title,
      meta.publisher,
      meta.sourceDate,
      meta.sourceVersion,
      meta.sourceUrl ?? null,
      meta.licenseNote,
      meta.tier,
      Math.max(...pages.map((p) => p.page)),
      hash,
      EMBEDDER.id,
      userId,
    ],
  );
  const withVec = await hasVectorColumn(q);
  for (const c of chunks) {
    const e = EMBEDDER.embed(c.text);
    if (withVec) {
      await q.query(
        `INSERT INTO library_chunks(document_id, seq, page, content, embedding, embedding_vec)
         VALUES ($1,$2,$3,$4,$5::real[],$6::vector)`,
        [doc!.id, c.seq, c.page, c.text, arr(e), vec(e)],
      );
    } else {
      await q.query(
        `INSERT INTO library_chunks(document_id, seq, page, content, embedding)
         VALUES ($1,$2,$3,$4,$5::real[])`,
        [doc!.id, c.seq, c.page, c.text, arr(e)],
      );
    }
  }
  return { id: doc!.id, chunks: chunks.length };
}

interface Row {
  chunkId: string;
  documentId: string;
  content: string;
  page: number;
  embedding: number[];
  title: string;
  publisher: string;
  sourceDate: Date | string;
  sourceVersion: string;
  sourceUrl: string | null;
  licenseNote: string;
  tier: 'kurum' | 'genel';
  reviewStatus: ReviewStatus;
}

export interface SearchHit {
  chunkId: string;
  documentId: string;
  text: string;
  page: number;
  /** Etkin düzey: onaylıysa "uzman-onayli", değilse yükleyenin bildirdiği düzey. */
  tier: SourceTier;
  score: number;
  /** Uzman onayı yoksa arayüz "uzman onayı bekliyor" rozeti gösterir; içerik öneri/komut üretmez. */
  needsBadge: boolean;
  source: {
    title: string;
    publisher: string;
    date: string;
    version: string;
    url: string | null;
    license: string;
  };
}

const SELECT = `SELECT c.id AS "chunkId", c.document_id AS "documentId", c.content, c.page, c.embedding,
  d.title, d.publisher, d.source_date AS "sourceDate", d.source_version AS "sourceVersion",
  d.source_url AS "sourceUrl", d.license_note AS "licenseNote", d.tier, d.review_status AS "reviewStatus"
  FROM library_chunks c JOIN library_documents d ON d.id = c.document_id`;

const CANDIDATE_LIMIT = 300;

export async function searchLibrary(
  q: Queryable,
  query: string,
  topK: number,
): Promise<SearchHit[]> {
  const qv = EMBEDDER.embed(query);
  // pgvector varsa en yakın adaylar dizinden; yoksa tüm parçalar TS'de karşılaştırılır.
  const rows = (await hasVectorColumn(q))
    ? await q.query<Row>(
        `${SELECT} WHERE c.embedding_vec IS NOT NULL
         ORDER BY c.embedding_vec <=> $1::vector LIMIT ${CANDIDATE_LIMIT}`,
        [vec(qv)],
      )
    : await q.query<Row>(SELECT);
  const cands = rows.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    text: r.content,
    page: r.page,
    tier: (r.reviewStatus === 'uzman-onayli' ? 'uzman-onayli' : r.tier) as SourceTier,
    embedding: r.embedding,
    source: {
      title: r.title,
      publisher: r.publisher,
      date: new Date(r.sourceDate).toISOString().slice(0, 10),
      version: r.sourceVersion,
    },
    row: r,
  })) satisfies (Candidate & { row: Row })[];
  return rankChunks(query, cands, EMBEDDER, { topK }).map(({ chunk, score }) => ({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    text: chunk.text,
    page: chunk.page,
    tier: chunk.tier,
    score: Math.round(score * 1000) / 1000,
    needsBadge: needsDraftBadge(chunk.row.reviewStatus),
    source: {
      ...chunk.source,
      url: chunk.row.sourceUrl,
      license: chunk.row.licenseNote,
    },
  }));
}
