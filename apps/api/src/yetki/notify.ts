import type { PushClient } from '@tarim/workers';
import type { Queryable } from '../db/db';

/**
 * Kullanıcıya bildirim: uygulama içi kutuya (zil) yazar ve kayıtlı telefonlarına push gönderir.
 * Push hatası bildirimi düşürmez (kutuda kalır); geçersiz cihaz belirteci silinir.
 */
export async function notifyUser(
  q: Queryable,
  push: PushClient,
  n: {
    userId: string;
    kind: 'uzman_cevap' | 'duyuru' | 'basvuru';
    title: string;
    body: string;
    refId?: string;
  },
): Promise<string> {
  const [row] = await q.query<{ id: string }>(
    `INSERT INTO notifications(user_id, kind, title, body, ref_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [n.userId, n.kind, n.title, n.body.slice(0, 1000), n.refId ?? null],
  );
  const tokens = await q.query<{ token: string }>(
    'SELECT token FROM push_tokens WHERE user_id = $1',
    [n.userId],
  );
  if (tokens.length > 0) {
    try {
      const res = await push.send(
        tokens.map((t) => ({
          to: t.token,
          title: n.title,
          body: n.body.slice(0, 180),
          data: { kind: n.kind, refId: n.refId ?? null, notificationId: row!.id },
          priority: 'default' as const,
        })),
      );
      const bad = res.filter((r) => r.invalidToken).map((r) => r.token);
      if (bad.length) await q.query('DELETE FROM push_tokens WHERE token = ANY($1)', [bad]);
    } catch {
      // Push sağlayıcısı geçici olarak yoksa bildirim kutuda bekler.
    }
  }
  return row!.id;
}
