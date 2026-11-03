/**
 * Zod'un varsayılan İngilizce hata metinlerini çiftçi diline çevirir. Şemalarda elle yazılmış (Türkçe)
 * iletiler olduğu gibi kalır; yalnız "Too small: expected ..." gibi varsayılanlar çevrilir.
 */
export interface IssueLike {
  code: string;
  message: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}

const DEFAULT_EN = /^(Too (small|big)|Invalid|Unrecognized|Expected|Input)/;

export function friendlyIssue(i: IssueLike): string {
  if (!DEFAULT_EN.test(i.message)) return i.message;
  const isText = i.origin === 'string';
  const isList = i.origin === 'array';
  switch (i.code) {
    case 'too_small':
      if (isText)
        return Number(i.minimum) <= 1
          ? 'Bu alan boş bırakılamaz'
          : `En az ${i.minimum} karakter yazın`;
      if (isList) return `En az ${i.minimum} öğe gerekli`;
      return `Değer en az ${i.minimum} olmalı`;
    case 'too_big':
      if (isText) return `En çok ${i.maximum} karakter yazılabilir`;
      if (isList) return `En çok ${i.maximum} öğe olabilir`;
      return `Değer en çok ${i.maximum} olabilir`;
    case 'invalid_type':
      return 'Bu alan eksik ya da yanlış türde';
    default:
      return 'Girilen bilgi geçersiz';
  }
}

/** Birden çok hatayı tek cümlede, tekrarsız birleştirir. */
export function friendlyMessage(issues: IssueLike[]): string {
  return [...new Set(issues.map(friendlyIssue))].join('; ');
}
