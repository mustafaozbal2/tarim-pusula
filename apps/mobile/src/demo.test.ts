import { describe, expect, it } from 'vitest';
import { demoCodeLine, loadDemoInfo } from './demo';

const info = { demo: true, code: '123456', farmerPhone: '+90', staffPhone: '+90' } as const;

describe('demo kodu satırı', () => {
  it('sunucu demo bilgisi verirse "Demo kodu: 123456" çıkar', () => {
    expect(demoCodeLine(info, 'Demo kodu')).toBe('Demo kodu: 123456');
  });
  it('sunucu demo değilse (404/ağ hatası) hiçbir şey çıkmaz', async () => {
    const none = await loadDemoInfo(() => Promise.reject(new Error('404')));
    expect(none).toBeNull();
    expect(demoCodeLine(none, 'Demo kodu')).toBeNull();
    expect(demoCodeLine({}, 'Demo kodu')).toBeNull();
    expect(demoCodeLine({ demo: true }, 'Demo kodu')).toBeNull();
  });
});
