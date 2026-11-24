import { randomInt } from 'node:crypto';

/** Karışan harfler (0/O, 1/I/L) yok; elle yazılırken hata azalır. */
const ALFABE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const DAVET_KOD_UZUNLUK = 8;

export function davetKoduUret(): string {
  let s = '';
  for (let i = 0; i < DAVET_KOD_UZUNLUK; i++) s += ALFABE[randomInt(ALFABE.length)];
  return s;
}

/** Kullanıcının yazdığı kodu temizler; geçersizse null. */
export function davetKoduTemizle(v: string | undefined | null): string | null {
  const s = (v ?? '').toUpperCase().replace(/[\s-]/g, '');
  return new RegExp(`^[${ALFABE}]{${DAVET_KOD_UZUNLUK}}$`).test(s) ? s : null;
}

/** Paylaşım metni: kodu içerir (bağlantı yerine kod; uygulama mağaza adresi sabit değil). */
export function davetMetni(kod: string): string {
  return `Tarım Pusula uygulamasını kullanıyorum: hava, don uyarısı, pazar fiyatları, destekler tek yerde. Kayıt olurken davet kodumu yaz: ${kod}`;
}
