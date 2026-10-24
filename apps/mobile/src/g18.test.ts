import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firewallCommand, lanIPv4 } from '../../../scripts/lan.mjs';
import { createApi, NetworkError } from './api/client';
import { resolveApiUrl } from './config';

/** G18: APK yapılandırması, sunucu adresi yokken çökmeme, yerel ağ modu yardımcıları. */
const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));

function pngSize(file: string): [number, number] {
  const b = readFileSync(join(ROOT, file));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('G18 EAS ve uygulama yapılandırması', () => {
  it('paket adı com.tarimpusula.app, uygulama adı "Tarım Pusula"', () => {
    expect(app.android.package).toBe('com.tarimpusula.app');
    expect(app.ios.bundleIdentifier).toBe('com.tarimpusula.app');
    expect(app.name).toBe('Tarım Pusula');
  });

  it('preview profili: Android APK, dahili dağıtım', () => {
    expect(eas.build.preview.distribution).toBe('internal');
    expect(eas.build.preview.android.buildType).toBe('apk');
  });

  it('development profili: geliştirme istemcisi (MapLibre native)', () => {
    expect(eas.build.development.developmentClient).toBe(true);
    expect(eas.build.development.android.buildType).toBe('apk');
    expect(app.plugins).toContain('@maplibre/maplibre-react-native');
  });

  it('preview/development sunucu adresi EXPO_PUBLIC_API_URL ile verilir ve geçerli bir http adresidir', () => {
    for (const p of ['preview', 'development']) {
      const url = eas.build[p].env.EXPO_PUBLIC_API_URL as string;
      expect(resolveApiUrl(null, url), p).not.toBeNull();
    }
  });

  it('yerel ağda http için Android cleartext eklentisi tanımlı ve çalışır', () => {
    expect(app.plugins).toContain('./plugins/with-cleartext');
    const plugin = readFileSync(join(ROOT, 'plugins/with-cleartext.js'), 'utf8');
    expect(plugin).toMatch(/usesCleartextTraffic/);
  });

  it('simge, uyarlanabilir simge ve açılış ekranı var; yeni palet', () => {
    expect(pngSize('assets/icon.png')).toEqual([1024, 1024]);
    expect(pngSize('assets/adaptive-icon.png')).toEqual([1024, 1024]);
    const [w, h] = pngSize('assets/splash.png');
    expect(h).toBeGreaterThan(w);
    expect(app.splash.backgroundColor).toBe('#064D3B');
    expect(app.android.adaptiveIcon.backgroundColor).toBe('#064D3B');
    for (const f of [app.icon, app.splash.image, app.android.adaptiveIcon.foregroundImage]) {
      expect(existsSync(join(ROOT, f)), f).toBe(true);
    }
  });

  it('sürüm tanımlı (Hakkında ekranı bunu gösterir)', () => {
    expect(app.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('G18 sunucu adresi yokken çökmeme', () => {
  it('adres çözülemezse istek NetworkError ile reddedilir (çökme yok)', async () => {
    const api = createApi({
      baseUrl: () => {
        const url = resolveApiUrl(null, undefined);
        if (!url) throw new NetworkError();
        return url;
      },
      getToken: () => null,
    });
    await expect(api.fields()).rejects.toBeInstanceOf(NetworkError);
    await expect(api.requestOtp('05320000000')).rejects.toBeInstanceOf(NetworkError);
  });

  it('adres var ama sunucu kapalıysa da NetworkError', async () => {
    const api = createApi({
      baseUrl: 'http://192.168.1.250:8210',
      getToken: () => null,
      fetchImpl: () => Promise.reject(new TypeError('Network request failed')),
    });
    await expect(api.today('x')).rejects.toBeInstanceOf(NetworkError);
  });

  it('Sunucu kartı bileşeni ve oturum bağlantısı kaynakta var', () => {
    const card = read('src/components/SunucuKarti.tsx');
    expect(card).toMatch(/t\.title/);
    expect(read('src/i18n/tr.ts')).toMatch(/Sunucuya bağlanılamadı/);
    expect(read('src/session.ts')).toMatch(/throw new NetworkError\(\)/);
    expect(read('app/giris.tsx')).toMatch(/SunucuKarti/);
    expect(read('app/(tabs)/index.tsx')).toMatch(/SunucuKarti/);
  });
});

describe('G18 yerel ağ modu yardımcıları', () => {
  const nets = {
    Loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.20.0.1' }],
    'Wi-Fi': [
      { family: 'IPv6', internal: false, address: 'fe80::1' },
      { family: 'IPv4', internal: false, address: '192.168.1.42' },
    ],
    Bluetooth: [{ family: 'IPv4', internal: false, address: '169.254.9.9' }],
  };
  it('dahili ve APIPA adresleri atılır; 192.168 öne alınır', () => {
    const l = lanIPv4(nets);
    expect(l.map((x) => x.address)).toEqual(['192.168.1.42', '172.20.0.1']);
    expect(l[0]!.name).toBe('Wi-Fi');
  });
  it('adres yoksa boş liste', () => {
    expect(lanIPv4({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] })).toEqual([]);
  });
  it('güvenlik duvarı komutu yalnız özel ağ profiline ve verilen kapılara izin verir', () => {
    const c = firewallCommand([8200, 8201, 8210]);
    expect(c).toContain('localport=8200,8201,8210');
    expect(c).toContain('profile=private');
    expect(c).toContain('action=allow');
  });
  it('demo betiği --lan seçeneğini 0.0.0.0 ve yerel IP ile işler', () => {
    const demo = readFileSync(join(ROOT, '../../scripts/demo.mjs'), 'utf8');
    expect(demo).toMatch(/--lan/);
    expect(demo).toMatch(/0\.0\.0\.0/);
    expect(demo).toMatch(/firewallCommand/);
  });
});

describe('G18 PWA ve Hakkında', () => {
  it('PWA bildirimi yeni palette; "Ana ekrana ekle" yönergesi rehberde', () => {
    const m = JSON.parse(read('public/manifest.webmanifest'));
    expect(m.theme_color).toBe('#064D3B');
    const guide = readFileSync(join(ROOT, '../../docs/APK_REHBERI.md'), 'utf8');
    expect(guide).toMatch(/Ana ekrana ekle/);
  });
  it('Hakkında bölümü sürümü gösterir', () => {
    expect(read('app/ayarlar.tsx')).toMatch(/ayar-surum/);
  });
});
