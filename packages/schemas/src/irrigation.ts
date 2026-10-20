import { z } from 'zod';

/** Vananın bir seferde açık kalabileceği azami süre. Cihaz da aynı sınırı kendi başına uygular. */
export const MAX_IRRIGATION_MINUTES = 30;

export const irrigationActionSchema = z.enum(['open', 'close']);

export const commandCreateSchema = z
  .object({
    action: irrigationActionSchema,
    minutes: z
      .number()
      .int('Süre tam dakika olmalı')
      .min(1, 'Süre en az 1 dakika')
      .max(MAX_IRRIGATION_MINUTES, 'Süre en çok 30 dakika')
      .optional(),
    /** İstemci her dokunuşta bir kez üretir; ağ tekrarı aynı komutu ikinci kez doğurmaz. */
    idempotencyKey: z.string().min(8, 'Anahtar çok kısa').max(80),
  })
  .refine((c) => c.action === 'close' || c.minutes !== undefined, {
    message: 'Açmak için süre gerekir',
    path: ['minutes'],
  });

export const commandStatusSchema = z.enum([
  'pending',
  'sent',
  'acked',
  'rejected',
  'expired',
  'failed',
]);

export type IrrigationAction = z.infer<typeof irrigationActionSchema>;
export type CommandStatus = z.infer<typeof commandStatusSchema>;
export type CommandCreate = z.infer<typeof commandCreateSchema>;

export interface CommandDto {
  id: string;
  deviceId: string;
  action: IrrigationAction;
  minutes: number | null;
  status: CommandStatus;
  reason: string | null;
  createdAt: string;
  expiresAt: string;
  sentAt: string | null;
  ackedAt: string | null;
  latencyMs: number | null;
}

export interface DeviceStatusDto {
  deviceId: string;
  fieldId: string;
  name: string;
  /** Bilinmiyorsa null (cihaz hiç bağlanmadı). */
  valveOpen: boolean | null;
  closesAt: string | null;
  lastSeenAt: string | null;
  online: boolean;
  /** Cihaz kurulmuş mu (sır üretilmiş mi). */
  provisioned: boolean;
  lastCommand: CommandDto | null;
  /** Son başarılı açılış (geçmiş). */
  lastRun: { at: string; minutes: number } | null;
}
