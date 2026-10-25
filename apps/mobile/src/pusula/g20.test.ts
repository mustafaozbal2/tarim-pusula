import { describe, expect, it } from 'vitest';
import { tr } from '../i18n/tr';
import { captionQuestion } from './model';
import { voiceMessage, type ListenOutcome } from './voiceTypes';

describe('G20.6 sesle sor ve fotoğraf açıklaması', () => {
  it('açıklama yazılmışsa o gönderilir, boşsa varsayılan soru', () => {
    expect(captionQuestion('  yapraklarda leke var ')).toBe('yapraklarda leke var');
    expect(captionQuestion('   ')).toBe('Fotoğraftaki sorunu bakar mısın?');
  });

  const issues = tr.ask.voiceIssues;
  const msg = (o: ListenOutcome) => voiceMessage(o, issues);

  it('metin geldiyse açıklama yok', () => {
    expect(msg({ kind: 'text', text: 'zeytin ne zaman budanır' })).toBeNull();
  });
  it('desteklenmiyorsa dürüst mesaj; yazarak sormayı önerir', () => {
    expect(msg({ kind: 'unsupported' })).toContain('desteklenmiyor');
    expect(msg({ kind: 'unsupported' })).toMatch(/yaz/);
  });
  it('izin reddi, ses duyulmadı ve hata ayrı mesaj verir', () => {
    expect(msg({ kind: 'denied' })).toContain('Mikrofon izni verilmedi');
    expect(msg({ kind: 'none' })).toContain('Ses duyulmadı');
    expect(msg({ kind: 'error', code: 'network' })).toContain('çevrilemedi');
  });
  it('mesajlarda "onay bekliyor" yazısı ya da emoji yok', () => {
    for (const m of Object.values(issues)) {
      expect(m).not.toMatch(/onayı bekl/i);
      expect(m).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});
