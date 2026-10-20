import { z } from 'zod';

export const pusulaAskSchema = z.object({
  question: z.string().trim().min(1).max(500),
  fieldId: z.uuid().optional(),
  /** Fotoğraf girişi: base64 (en çok ~6 MB). Fotoğraflı sorular uzman kuyruğuna düşer. */
  image: z
    .object({
      mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      base64: z.string().min(1).max(8_500_000),
    })
    .optional(),
});

export const expertAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(2000),
  /** Atıf zorunlu: kaynak, yayın ya da kurum adı. */
  source: z.string().trim().min(1).max(300),
  /** Aynı soruya sonraki cevaplarda kullanılsın mı. */
  cacheable: z.boolean().default(false),
});

export type PusulaAsk = z.infer<typeof pusulaAskSchema>;
