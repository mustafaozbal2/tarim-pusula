export interface WalletCategoryDto {
  key: string;
  label: string;
  count: number;
}

export interface ShareDto {
  id: string;
  ownerId: string;
  recipientId: string;
  categories: string[];
  purpose: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
}

export interface WalletDto {
  shareId: string;
  categories: WalletCategoryDto[];
  given: ShareDto[];
  received: ShareDto[];
}

const DAY_MS = 86_400_000;

/** Paylaşımın durumu, çiftçi dilinde. */
export function shareStatusText(s: ShareDto, now: number): string {
  if (s.revokedAt) return 'Geri alındı';
  const left = new Date(s.expiresAt).getTime() - now;
  if (left <= 0) return 'Süresi doldu';
  const days = Math.ceil(left / DAY_MS);
  return days === 1 ? 'Son gün: bugün bitiyor' : `${days} gün daha açık`;
}

/** İndirilen dosyanın adı (tarih yerel değil UTC gün, öngörülebilir). */
export function exportFileName(at: Date): string {
  return `tarim-pusula-verilerim-${at.toISOString().slice(0, 10)}.json`;
}

/** Dışa aktarma metni: okunaklı, tek JSON. */
export function exportText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function categoryNames(keys: readonly string[], all: readonly WalletCategoryDto[]): string {
  return keys.map((k) => all.find((c) => c.key === k)?.label ?? k).join(', ');
}
