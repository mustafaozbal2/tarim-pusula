import { FIELD_COLS } from './fields.logic';
import type { Principal, Queryable } from './db/db';

/**
 * Kullanıcıya bağlı (users tablosuna yabancı anahtarı olan) HER tablo burada ya dışa aktarım anahtarına
 * eşlenir ya da neden aktarılmadığı yazılır. Test, şemadaki yabancı anahtarları bu listeyle karşılaştırır:
 * yeni bir kullanıcı tablosu eklenip buraya yazılmazsa test kırılır (KVKK taşınabilirlik unutulmaz).
 */
export const EXPORT_COVERAGE: Record<string, { key: string } | { excluded: string }> = {
  user_roles: { key: 'profile' },
  fields: { key: 'fields' },
  field_access: { key: 'fieldAccess' },
  devices: { key: 'devices' },
  device_readings: { key: 'deviceReadings' },
  consents: { key: 'consents' },
  nearby_codes: { key: 'nearbyCodes' },
  nearby_proposals: { key: 'nearbyProposals' },
  push_tokens: { key: 'pushTokens' },
  expert_questions: { key: 'expertQuestions' },
  irrigation_commands: { key: 'irrigationCommands' },
  data_shares: { key: 'dataShares' },
  audit_log: { key: 'auditLog' },
  sessions: { excluded: 'oturum jetonu özetleri güvenlik verisidir; kullanıcı bilgisi içermez' },
  otp_codes: { excluded: 'tek kullanımlık doğrulama kodu özeti; kısa ömürlü güvenlik verisi' },
  user_mfa: { excluded: 'iki adımlı doğrulama sırrı; dışarı verilmez' },
  nearby_attempts: { excluded: 'kod tahmin sınırı sayacı (kötüye kullanım koruması)' },
  notification_log: { excluded: 'bildirim tekrar engelleme anahtarı; içerik taşımaz' },
  announcements: {
    excluded: 'kurum içeriği (yazan kullanıcı yalnız yazar kimliği olarak tutulur)',
  },
  library_documents: { excluded: 'kurum içeriği' },
  crop_stages: { excluded: 'uzman/kurum içeriği' },
  crop_pack_versions: { excluded: 'uzman/kurum içeriği' },
  calendar_templates: { excluded: 'kurum içeriği' },
  suitability_factors: { excluded: 'uzman/kurum içeriği' },
  supports: { excluded: 'uzman/kurum içeriği' },
  soil_types: { excluded: 'uzman/kurum içeriği' },
  crop_water_params: { excluded: 'uzman/kurum içeriği' },
};

/** Kategori özeti: Veri Cüzdanı ekranı için (kayıt sayısı + çiftçi dilinde ad). */
export const WALLET_CATEGORIES = [
  { key: 'profile', label: 'Hesabım (telefon, ad)' },
  { key: 'fields', label: 'Tarlalarım' },
  { key: 'devices', label: 'Cihazlarım (vana)' },
  { key: 'irrigation', label: 'Sulama geçmişim' },
  { key: 'questions', label: 'Sorduğum sorular' },
  { key: 'consents', label: 'Verdiğim izinler' },
] as const;

export async function walletSummary(q: Queryable, me: Principal) {
  const count = async (sql: string) =>
    Number((await q.query<{ n: string }>(sql, [me.userId]))[0]!.n);
  const counts: Record<string, number> = {
    profile: 1,
    fields: await count('SELECT count(*) AS n FROM fields WHERE owner_id = $1'),
    devices: await count(
      'SELECT count(*) AS n FROM devices d JOIN fields f ON f.id = d.field_id WHERE f.owner_id = $1',
    ),
    irrigation: await count('SELECT count(*) AS n FROM irrigation_commands WHERE user_id = $1'),
    questions: await count('SELECT count(*) AS n FROM expert_questions WHERE user_id = $1'),
    consents: await count('SELECT count(*) AS n FROM consents WHERE user_id = $1'),
  };
  return WALLET_CATEGORIES.map((c) => ({ ...c, count: counts[c.key] ?? 0 }));
}

/** Kullanıcıya ait tüm veri (RLS altında, yalnız kendi kayıtları). Büyük görseller base64 olarak gömülür. */
export async function buildExport(q: Queryable, me: Principal, profile: unknown) {
  return {
    profile,
    fields: await q.query(`SELECT ${FIELD_COLS} FROM fields WHERE owner_id = $1`, [me.userId]),
    fieldAccess: await q.query(
      `SELECT a.field_id AS "fieldId", a.user_id AS "userId", a.level, a.granted_at AS "grantedAt"
       FROM field_access a JOIN fields f ON f.id = a.field_id WHERE f.owner_id = $1
       ORDER BY a.granted_at, a.field_id`,
      [me.userId],
    ),
    sharedWithMe: await q.query(
      `SELECT field_id AS "fieldId", level FROM field_access WHERE user_id = $1`,
      [me.userId],
    ),
    devices: await q.query(
      `SELECT d.id, d.field_id AS "fieldId", d.name, d.kind, d.manufacturer, d.model,
              d.connection_method AS "connectionMethod", d.source, d.adapter_version AS "adapterVersion",
              d.created_at AS "createdAt"
       FROM devices d JOIN fields f ON f.id = d.field_id WHERE f.owner_id = $1
       ORDER BY d.created_at, d.id`,
      [me.userId],
    ),
    deviceReadings: await q.query(
      `SELECT r.device_id AS "deviceId", r.at, r.metric, r.value, r.unit, r.source
       FROM device_readings r JOIN fields f ON f.id = r.field_id WHERE f.owner_id = $1
       ORDER BY r.at, r.id`,
      [me.userId],
    ),
    irrigationCommands: await q.query(
      `SELECT id, device_id AS "deviceId", field_id AS "fieldId", action, minutes, status, reason,
              created_at AS "createdAt", sent_at AS "sentAt", acked_at AS "ackedAt", latency_ms AS "latencyMs"
       FROM irrigation_commands WHERE user_id = $1 ORDER BY created_at, id`,
      [me.userId],
    ),
    consents: await q.query(
      `SELECT purpose, granted, policy_version AS "policyVersion", created_at AS "createdAt"
       FROM consents WHERE user_id = $1 ORDER BY created_at, id`,
      [me.userId],
    ),
    expertQuestions: await q.query(
      `SELECT id, field_id AS "fieldId", question, reason, status, answer, answer_source AS "answerSource",
              answered_at AS "answeredAt", has_image AS "hasImage", created_at AS "createdAt"
       FROM expert_questions WHERE user_id = $1 ORDER BY created_at, id`,
      [me.userId],
    ),
    expertQuestionImages: await q.query(
      `SELECT i.question_id AS "questionId", i.mime, encode(i.data, 'base64') AS "dataBase64"
       FROM expert_question_images i JOIN expert_questions e ON e.id = i.question_id
       WHERE e.user_id = $1 ORDER BY e.created_at, e.id`,
      [me.userId],
    ),
    pushTokens: await q.query(
      `SELECT platform, created_at AS "createdAt", last_seen_at AS "lastSeenAt"
       FROM push_tokens WHERE user_id = $1 ORDER BY created_at, id`,
      [me.userId],
    ),
    nearbyCodes: await q.query(
      `SELECT id, expires_at AS "expiresAt", revoked_at AS "revokedAt", created_at AS "createdAt"
       FROM nearby_codes WHERE owner_id = $1 ORDER BY created_at, id`,
      [me.userId],
    ),
    nearbyProposals: await q.query(
      `SELECT id, owner_id AS "ownerId", helper_id AS "helperId", payload, status,
              field_id AS "fieldId", created_at AS "createdAt", decided_at AS "decidedAt"
       FROM nearby_proposals WHERE owner_id = $1 OR helper_id = $1 ORDER BY created_at, id`,
      [me.userId],
    ),
    dataShares: await q.query(
      `SELECT id, owner_id AS "ownerId", recipient_id AS "recipientId", categories, purpose,
              created_at AS "createdAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"
       FROM data_shares WHERE owner_id = $1 OR recipient_id = $1 ORDER BY created_at, id`,
      [me.userId],
    ),
    auditLog: await q.query(
      `SELECT seq, at, action, entity, entity_id AS "entityId" FROM audit_log
       WHERE actor_id = $1 ORDER BY seq`,
      [me.userId],
    ),
  };
}
