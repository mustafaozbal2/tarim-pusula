import { ForbiddenException } from '@nestjs/common';
import { scopeOf, type Institution, type Scope } from '@tarim/agro-core';
import type { Principal, Queryable } from '../db/db';

export interface StaffProfileRow {
  userId: string;
  institution: Institution;
  institutionName: string;
  province: string | null;
  district: string | null;
  title: string;
  registryNo: string;
  expertise: string[];
  wantsRole: 'expert' | 'institution_admin';
  status: 'basvuru' | 'onayli' | 'reddedildi';
  decisionNote: string | null;
  createdAt: string;
}

export const PROFILE_COLS = `user_id AS "userId", institution, institution_name AS "institutionName",
  province, district, title, registry_no AS "registryNo", expertise, wants_role AS "wantsRole",
  status, decision_note AS "decisionNote", created_at AS "createdAt"`;

/**
 * Yetkilinin yayın kapsamı (G24). Yönetici (admin) ulusal. Başvuruyla gelen yetkili kurum kademesiyle
 * sınırlıdır ve yalnız onaylıysa yayın yapar. Profili olmadan rol almış hesap (yönetici panelden doğrudan
 * rol vermiştir) ulusal sayılır: rolü veren yöneticinin güvenidir.
 */
export async function resolveScope(q: Queryable, me: Principal): Promise<Scope> {
  if (me.roles.includes('admin')) return { level: 'ulke' };
  const [p] = await q.query<StaffProfileRow>(
    `SELECT ${PROFILE_COLS} FROM staff_profiles WHERE user_id = $1`,
    [me.userId],
  );
  if (!p) return { level: 'ulke' };
  if (p.status !== 'onayli') {
    throw new ForbiddenException('Yetkili başvurunuz henüz onaylanmadı');
  }
  return scopeOf({ institution: p.institution, province: p.province, district: p.district });
}
