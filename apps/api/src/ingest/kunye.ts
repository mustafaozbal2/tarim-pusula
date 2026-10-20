import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * Kaynak künyesi: her dosyanın yanında `<dosya>.kunye.json` olarak durur. Künyesi eksik dosya içe aktarılmaz
 * (kural 6: kaynak + tarih + sürüm olmadan kayıt yok). Onay durumu künyede YOKTUR: her şey taslak girer.
 */
export const kunyeSchema = z
  .object({
    title: text(200),
    publisher: text(160),
    sourceDate: z.iso.date(),
    sourceVersion: text(60),
    sourceUrl: z.url().max(500).optional(),
    licenseNote: text(300),
    tier: z.enum(['kurum', 'genel']),
    kind: z.enum(['kutuphane', 'bitki-paketi']).default('kutuphane'),
    /** Yalnız `bitki-paketi` için: crops.id */
    cropId: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
  })
  .strict()
  .refine((k) => (k.kind === 'bitki-paketi') === (k.cropId !== undefined), {
    message: 'cropId yalnız ve her zaman bitki-paketi türünde verilir',
  });

export type Kunye = z.infer<typeof kunyeSchema>;
