import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

/** Doküman künyesi: kaynak, tarih, sürüm ve lisans notu zorunlu (atıfsız doküman yok). */
export const libraryDocumentSchema = z
  .object({
    title: text(200),
    publisher: text(160),
    sourceDate: z.iso.date(),
    sourceVersion: text(60),
    sourceUrl: z.url().max(500).optional(),
    licenseNote: text(300),
    tier: z.enum(['kurum', 'genel']),
    /** Düz metin; sayfalar form-feed (\f) ile ayrılır. */
    text: z.string().min(1).max(5_000_000).optional(),
    /** PDF içeriği, base64. */
    pdfBase64: z.string().min(1).max(40_000_000).optional(),
  })
  .refine((d) => (d.text === undefined) !== (d.pdfBase64 === undefined), {
    message: 'Metin ya da PDF’den yalnız biri verilmeli',
  });

export const librarySearchSchema = z.object({
  q: text(300),
  topK: z.coerce.number().int().min(1).max(20).default(5),
});

export type LibraryDocumentInput = z.infer<typeof libraryDocumentSchema>;
