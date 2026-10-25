/** Sesle sorma sonucu: metin, izin reddi, ses duyulmadı, desteklenmiyor ya da hata. */
export type ListenOutcome =
  | { kind: 'text'; text: string }
  | { kind: 'denied' }
  | { kind: 'none' }
  | { kind: 'unsupported' }
  | { kind: 'error'; code: string };

/** Sonucun çiftçi dilinde dürüst açıklaması; metin geldiyse null (açıklama gerekmez). */
export function voiceMessage(
  o: ListenOutcome,
  t: {
    unsupported: string;
    denied: string;
    none: string;
    error: string;
  },
): string | null {
  switch (o.kind) {
    case 'text':
      return null;
    case 'unsupported':
      return t.unsupported;
    case 'denied':
      return t.denied;
    case 'none':
      return t.none;
    case 'error':
      return t.error;
  }
}
