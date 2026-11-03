import { describe, expect, it } from 'vitest';
import { fieldCreateSchema, loginSchema } from './index';
import { friendlyMessage } from './friendly';

describe('çiftçi dilinde doğrulama iletileri', () => {
  it('varsayılan İngilizce iletiler Türkçeye çevrilir, elle yazılanlar korunur', () => {
    const r = loginSchema.safeParse({ phone: '', password: '' });
    expect(r.success).toBe(false);
    if (r.success) return;
    const m = friendlyMessage(r.error.issues);
    expect(m).toContain('Geçerli bir cep telefonu numarası yazın');
    expect(m).toContain('Şifreni yaz');
    expect(m).not.toMatch(/Too |expected|Invalid/i);
  });

  it('sayı sınırı ve boş metin Türkçe', () => {
    const r = fieldCreateSchema.safeParse({ name: '', lat: 91, lon: 38 });
    expect(r.success).toBe(false);
    if (r.success) return;
    const m = friendlyMessage(r.error.issues);
    expect(m).toContain('Bu alan boş bırakılamaz');
    expect(m).toContain('Değer en çok 90 olabilir');
    expect(m).not.toMatch(/Too |expected/i);
  });
});
