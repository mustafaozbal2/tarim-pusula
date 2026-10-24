import { describe, expect, it } from 'vitest';
import { demoLine, loadDemoInfo } from './demo';

const info = { demo: true, code: '123456', farmerPhone: '+90', staffPhone: '+90' } as const;

describe('panel demo kodu', () => {
  it('sunucu demo bilgisi verirse kod satırı çıkar', () => {
    expect(demoLine(info)).toContain('123456');
  });
  it('bilgi yoksa (üretim, 404) hiçbir şey çıkmaz', async () => {
    expect(demoLine(null)).toBeNull();
    expect(demoLine({})).toBeNull();
    const none = await loadDemoInfo(() => Promise.reject(new Error('404')));
    expect(none).toBeNull();
    expect(demoLine(none)).toBeNull();
  });
});
