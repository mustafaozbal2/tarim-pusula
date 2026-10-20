import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Panel (Next.js) sunucusu: üretim derlemesini üretir (E2E_SKIP_BUILD=1 ve derleme varsa atlanır)
 * ve `next start` ile sunar. API adresi derleme anında gömülür.
 */
const PANEL_PORT = process.env['E2E_PANEL_PORT'] ?? '8112';
const API_PORT = process.env['E2E_API_PORT'] ?? '3111';
const panelDir = resolve(import.meta.dirname, '../panel');
const env = { ...process.env, NEXT_PUBLIC_API_URL: `http://127.0.0.1:${API_PORT}` };
const shell = process.platform === 'win32';

if (!(process.env['E2E_SKIP_BUILD'] && existsSync(resolve(panelDir, '.next/BUILD_ID')))) {
  const b = spawnSync('pnpm', ['exec', 'next', 'build'], {
    cwd: panelDir,
    env,
    stdio: 'inherit',
    shell,
  });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const child = spawn('pnpm', ['exec', 'next', 'start', '-p', PANEL_PORT, '-H', '127.0.0.1'], {
  cwd: panelDir,
  env,
  stdio: 'inherit',
  shell,
});
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill());
