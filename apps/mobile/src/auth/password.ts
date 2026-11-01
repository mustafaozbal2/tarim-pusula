import { passwordSchema } from '@tarim/schemas';
import { tr } from '../i18n/tr';

/** Şifre kuralını sunucuyla aynı şemadan denetler; geçerliyse `null`. */
export function passwordProblem(p: string, again: string): string | null {
  const r = passwordSchema.safeParse(p);
  if (!r.success) return r.error.issues[0]?.message ?? tr.auth.passwordHint;
  if (p !== again) return tr.auth.mismatch;
  return null;
}
