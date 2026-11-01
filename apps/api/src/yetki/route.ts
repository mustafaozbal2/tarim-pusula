import { pickExpert, type ExpertCandidate, type Institution } from '@tarim/agro-core';
import { systemTx, type Db } from '../db/db';

/**
 * Uzmana sor yönlendirmesi (G24): sorunun arazisinin il/ilçesi ve ürünü için en uygun uzman
 * (agro-core pickExpert). Aday: rolü `expert` olan ve (varsa) yetkili profili onaylı kullanıcılar.
 * Profili olmayan uzman (yöneticinin doğrudan rol verdiği) ulusal sayılır.
 */
export async function routeQuestion(db: Db, questionId: string): Promise<string | null> {
  return systemTx(db, async (q) => {
    const [question] = await q.query<{
      province: string | null;
      district: string | null;
      cropId: string | null;
    }>(
      `SELECT e.province, e.district, e.crop_id AS "cropId" FROM expert_questions e WHERE e.id = $1`,
      [questionId],
    );
    if (!question) return null;
    const rows = await q.query<{
      userId: string;
      institution: Institution | null;
      province: string | null;
      district: string | null;
      expertise: string[] | null;
      status: string | null;
      open: string;
    }>(
      `SELECT r.user_id AS "userId", s.institution, s.province, s.district, s.expertise, s.status,
         (SELECT count(*) FROM expert_questions x
            WHERE x.assigned_to = r.user_id AND x.status = 'bekliyor')::text AS open
       FROM user_roles r LEFT JOIN staff_profiles s ON s.user_id = r.user_id
       WHERE r.role = 'expert'`,
    );
    const candidates: ExpertCandidate[] = rows
      .filter((r) => r.status === null || r.status === 'onayli')
      .map((r) => ({
        userId: r.userId,
        institution: r.institution ?? 'bakanlik',
        province: r.province,
        district: r.district,
        expertise: r.expertise ?? [],
        openQuestions: Number(r.open),
      }));
    const chosen = pickExpert(question, candidates);
    if (!chosen) return null;
    await q.query(
      `UPDATE expert_questions SET assigned_to = $2, assigned_at = now() WHERE id = $1`,
      [questionId, chosen.userId],
    );
    return chosen.userId;
  });
}
