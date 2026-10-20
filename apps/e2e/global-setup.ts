import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Testten önce mobil uygulamanın web paketini üretir (E2E_SKIP_BUILD=1 ile atlanır). */
export default function globalSetup() {
  const dist = resolve(import.meta.dirname, '../mobile/dist/index.html');
  if (process.env['E2E_SKIP_BUILD'] && existsSync(dist)) return;
  execSync('pnpm --filter @tarim/mobile run export:web', {
    stdio: 'inherit',
    cwd: resolve(import.meta.dirname, '../..'),
  });
}
