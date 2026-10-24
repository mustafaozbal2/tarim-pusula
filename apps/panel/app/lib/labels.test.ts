import { describe, expect, it } from 'vitest';
import { actionLabel, entityLabel, statusLabel } from './labels';

describe('etiketler', () => {
  it('bilinen işlemler Türkçe', () => {
    expect(actionLabel('announcements.revoke')).toBe('Duyuru onayı geri çekildi');
    expect(actionLabel('panel.users.list')).toBe('Kullanıcı listesi açıldı');
  });
  it('bilinmeyen insert/update/delete tablo adından üretilir', () => {
    expect(actionLabel('insert.crop_pack_versions')).toBe('Bitki paketi eklendi');
    expect(actionLabel('delete.devices')).toBe('Cihaz silindi');
    expect(actionLabel('bilinmeyen.islem')).toBe('bilinmeyen.islem');
    expect(entityLabel('yok_tablo')).toBe('yok_tablo');
  });
  it('onay durumu yazıyla; renk tek başına anlam taşımaz', () => {
    expect(statusLabel('uzman-onayli')).toEqual({ text: 'Yayında (uzman onaylı)', tone: 'ok' });
    expect(statusLabel('reddedildi').text).toBe('Reddedildi');
    expect(statusLabel('taslak-uzman-onayi-bekliyor').text).toBe('Uzman onayı bekliyor');
  });
});
