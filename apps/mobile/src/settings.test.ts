import { describe, expect, it } from 'vitest';
import { TEXT_SCALE } from '../../../packages/ui/src/tokens';
import { parseSettings, scaleTextStyle } from './settingsCore';

describe('ayarlar', () => {
  it('bozuk ya da boş kayıt varsayılana düşer', () => {
    expect(parseSettings(null)).toEqual({ textSize: 'normal', voiceGuide: false });
    expect(parseSettings('{bozuk')).toEqual({ textSize: 'normal', voiceGuide: false });
    expect(parseSettings('{"textSize":"huge","voiceGuide":"evet"}')).toEqual({
      textSize: 'normal',
      voiceGuide: false,
    });
  });
  it('geçerli kayıt okunur', () => {
    expect(parseSettings('{"textSize":"large","voiceGuide":true}')).toEqual({
      textSize: 'large',
      voiceGuide: true,
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
