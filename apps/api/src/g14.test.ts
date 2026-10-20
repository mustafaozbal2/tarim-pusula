import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS, corsOrigins, scanForSecrets, securityHeaders } from './security';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('G14 güvenlik başlıkları', () => {
  it('her yanıta başlıkları koyar ve devam eder', () => {
    const set: Record<string, string> = {};
    let called = false;
    securityHeaders()(null, { setHeader: (k, v) => void (set[k] = v) }, () => (called = true));
    expect(called).toBe(true);
    expect(set['X-Content-Type-Options']).toBe('nosniff');
    expect(set['X-Frame-Options']).toBe('DENY');
    expect(set['Cache-Control']).toBe('no-store');
    expect(set['Content-Security-Policy']).toContain("default-src 'none'");
    expect(set['Strict-Transport-Security']).toBeUndefined();
    expect(Object.keys(set).sort()).toEqual(Object.keys(SECURITY_HEADERS).sort());
  });

  it('HSTS yalnız istenince', () => {
    const set: Record<string, string> = {};
    securityHeaders({ hsts: true })(null, { setHeader: (k, v) => void (set[k] = v) }, () => {});
    expect(set['Strict-Transport-Security']).toMatch(/max-age=31536000/);
  });

  it('üretimde CORS_ORIGINS zorunlu, geliştirmede serbest', () => {
    expect(corsOrigins({})).toBe(true);
    expect(corsOrigins({ CORS_ORIGINS: 'https://a.example, https://b.example' })).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(() => corsOrigins({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
    expect(corsOrigins({ NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example' })).toEqual([
      'https://a.example',
    ]);
  });
});

describe('G14 gizli anahtar taraması', () => {
  it('bilinen desenleri yakalar, değeri raporlamaz', () => {
    const fakeAws = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const fakeAnt = 'sk-ant-' + 'a'.repeat(30);
    const hits = scanForSecrets([
      { path: 'a.ts', text: `const k = '${fakeAws}';\nok\nx = "${fakeAnt}"` },
      { path: 'b.env', text: 'COPERNICUS_CLIENT_SECRET="abcdefghijklmnop1234"' },
      { path: 'c.ts', text: '-----BEGIN ' + 'PRIVATE KEY-----' },
      { path: 'd.ts', text: 'url = "postgres://kullanici:parola123@prod.example.com/db"' },
    ]);
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual([
      'a.ts:1',
      'a.ts:3',
      'b.env:1',
      'c.ts:1',
      'd.ts:1',
    ]);
    expect(JSON.stringify(hits)).not.toContain(fakeAws);
  });

  it('geliştirme örneklerini (localhost, boş değer) yanlış alarm saymaz', () => {
    const hits = scanForSecrets([
      {
        path: '.env.example',
        text: 'DATABASE_URL=postgres://tarim:tarim@localhost:5432/tarim\nANTHROPIC_API_KEY=\n',
      },
    ]);
    expect(hits).toEqual([]);
  });

  it('depoda izlenen hiçbir dosyada gizli anahtar yok; .env izlenmiyor', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    expect(tracked.filter((p) => /(^|\/)\.env$/.test(p))).toEqual([]);
    const files = tracked
      .filter(
        (p) =>
          !/\.(png|jpg|jpeg|ico|woff2?|ttf|pdf|docx|zip|lock)$/i.test(p) &&
          !p.endsWith('pnpm-lock.yaml'),
      )
      .flatMap((p) => {
        try {
          return [{ path: p, text: readFileSync(join(root, p), 'utf8') }];
        } catch {
          return [];
        }
      })
      // Tarayıcının kendi test girdileri bu dosyada bilerek sahte anahtar içerir.
      .filter((f) => !f.path.endsWith('apps/api/src/g14.test.ts'));
    expect(files.length).toBeGreaterThan(100);
    expect(scanForSecrets(files)).toEqual([]);
  });
});
