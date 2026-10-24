// Tek komutla demo: `pnpm run demo`. Docker ve dış ağ gerekmez.
//   mobil web  http://localhost:8200   (API 8210)
//   kurum paneli http://localhost:8201
// Seçenekler: --rebuild (web paketlerini yeniden derle), --no-open (tarayıcıyı açma).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const WEB = 8200;
const PANEL = 8201;
const API = 8210;
const rebuild = process.argv.includes('--rebuild');
const open = !process.argv.includes('--no-open');
const shell = process.platform === 'win32';

const env = {
  ...process.env,
  DEMO_MODE: '1',
  DEMO_API_PORT: String(API),
  DEMO_WEB_PORT: String(WEB),
};

function run(label, cmd, args, opts) {
  console.log(`\n[demo] ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell, ...opts });
  if (r.status !== 0) {
    console.error(`[demo] ${label} başarısız (çıkış kodu ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

// 1) Mobil web paketi (demo adresi ve rozeti derlemeye gömülür).
const mobileDir = resolve(root, 'apps/mobile');
if (rebuild || !existsSync(resolve(mobileDir, 'dist-demo/index.html'))) {
  run('Mobil web paketi derleniyor (ilk seferde birkaç dakika sürebilir)', 'pnpm', [
    'exec', 'expo', 'export', '--platform', 'web', '--output-dir', 'dist-demo',
  ], {
    cwd: mobileDir,
    env: { ...env, EXPO_PUBLIC_API_URL: `http://localhost:${API}`, EXPO_PUBLIC_DEMO: '1' },
  });
}

// 2) Panel (üretim derlemesi, ayrı klasöre).
const panelDir = resolve(root, 'apps/panel');
const panelEnv = {
  ...env,
  NEXT_PUBLIC_API_URL: `http://localhost:${API}`,
  NEXT_PUBLIC_DEMO: '1',
  NEXT_DIST_DIR: '.next-demo',
};
const panelMarker = resolve(panelDir, '.next-demo/.demo-built');
if (rebuild || !existsSync(panelMarker)) {
  run('Kurum paneli derleniyor', 'pnpm', ['exec', 'next', 'build'], {
    cwd: panelDir,
    env: panelEnv,
  });
  writeFileSync(panelMarker, new Date().toISOString());
}

// 3) API + mobil web (tek süreç) ve panel.
const children = [
  spawn('pnpm', ['exec', 'tsx', 'src/demo-server.ts'], {
    cwd: resolve(root, 'apps/api'),
    env: { ...env, NODE_ENV: 'development' },
    stdio: 'inherit',
    shell,
  }),
  spawn('pnpm', ['exec', 'next', 'start', '-p', String(PANEL), '-H', '127.0.0.1'], {
    cwd: panelDir,
    env: panelEnv,
    stdio: 'inherit',
    shell,
  }),
];
// Windows'ta kabuk üzerinden başlayan süreçlerin alt süreçleri de kapatılmalı.
const stop = () =>
  children.forEach((c) => {
    if (process.platform === 'win32' && c.pid) {
      spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    } else c.kill();
  });
process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('SIGTERM', stop);
children.forEach((c) =>
  c.on('exit', (code) => {
    if (code) console.error(`[demo] bir süreç kapandı (kod ${code}).`);
    stop();
    process.exit(code ?? 0);
  }),
);

async function waitFor(url, ms = 180_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).status === 200) return true;
    } catch {
      // henüz hazır değil
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const ok =
  (await waitFor(`http://127.0.0.1:${API}/health`)) &&
  (await waitFor(`http://127.0.0.1:${WEB}/health`)) &&
  (await waitFor(`http://127.0.0.1:${PANEL}/giris`));
if (!ok) {
  console.error('[demo] Sunucular zamanında hazır olmadı.');
  stop();
  process.exit(1);
}
console.log(`\n[demo] HAZIR`);
console.log(`  Mobil (telefon boyutu): http://localhost:${WEB}`);
console.log(`  Kurum paneli          : http://localhost:${PANEL}`);
console.log('  Demo kodu: 123456  (durdurmak için Ctrl+C)\n');

if (open) {
  for (const url of [`http://localhost:${WEB}`, `http://localhost:${PANEL}`]) {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
  }
}
