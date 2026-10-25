import { describe, expect, it } from 'vitest';
import { TEXT_SCALE } from '../../../packages/ui/src/tokens';
import {
  DEV_TAPS,
  DEV_TAP_WINDOW_MS,
  nextTap,
  parseSettings,
  scaleTextStyle,
} from './settingsCore';

describe('ayarlar', () => {
  it('bozuk ya da boş kayıt varsayılana düşer', () => {
    expect(parseSettings(null)).toEqual({ textSize: 'normal', voiceGuide: false, devMode: false });
    expect(parseSettings('{bozuk')).toEqual({
      textSize: 'normal',
      voiceGuide: false,
      devMode: false,
    });
    expect(parseSettings('{"textSize":"huge","voiceGuide":"evet"}')).toEqual({
      textSize: 'normal',
      voiceGuide: false,
      devMode: false,
    });
  });
  it('geçerli kayıt okunur', () => {
    expect(parseSettings('{"textSize":"large","voiceGuide":true}')).toEqual({
      textSize: 'large',
      voiceGuide: true,
      devMode: false,
    });
  });
  it('Büyük mod: 15 px gövde 18 px olur, satır yüksekliği de ölçeklenir', () => {
    expect(scaleTextStyle({ fontSize: 15 }, TEXT_SCALE.large)).toEqual({ fontSize: 18 });
    expect(scaleTextStyle({ fontSize: 15, lineHeight: 20 }, TEXT_SCALE.large)).toEqual({
      fontSize: 18,
      lineHeight: 24,
    });
    expect(scaleTextStyle({ fontSize: 15 }, TEXT_SCALE.normal)).toEqual({ fontSize: 15 });
  });
});

describe('geliştirici modu (7 dokunuş)', () => {
  it('7 hızlı dokunuş açar; 6 yetmez', () => {
    let st = { count: 0, last: 0 };
    for (let i = 0; i < DEV_TAPS - 1; i++) {
      const r = nextTap(st, 1000 + i * 300);
      expect(r.unlocked).toBe(false);
      st = r.state;
    }
    const last = nextTap(st, 1000 + (DEV_TAPS - 1) * 300);
    expect(last.unlocked).toBe(true);
    expect(last.state.count).toBe(0);
  });
  it('uzun duraklama sayacı sıfırlar', () => {
    let st = { count: 0, last: 0 };
    for (let i = 0; i < 5; i++) st = nextTap(st, 1000 + i * 200).state;
    const after = nextTap(st, 1000 + 5 * 200 + DEV_TAP_WINDOW_MS + 1);
    expect(after.state.count).toBe(1);
    expect(after.unlocked).toBe(false);
  });
  it('kayıtta devMode okunur', () => {
    expect(parseSettings('{"devMode":true}').devMode).toBe(true);
  });
});
