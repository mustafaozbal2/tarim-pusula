/**
 * Değişmez kural 1: uzman onayı olmayan (taslak) bilgi rozetle gösterilir,
 * ASLA uyarı/öneri/komut üretmez.
 */
export type ReviewStatus = 'taslak-uzman-onayi-bekliyor' | 'uzman-onayli' | 'reddedildi';

export function canDriveAdvice(status: ReviewStatus): boolean {
  return status === 'uzman-onayli';
}

export function needsDraftBadge(status: ReviewStatus): boolean {
  return status !== 'uzman-onayli';
}
