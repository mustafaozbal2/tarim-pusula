// images/ klasörünü mobil uygulamanın assets/images/ klasörüne KOPYALAR (sembolik bağ değil) ve
// hangi dosyaların hâlâ yer tutucu olduğunu src/imageStatus.generated.ts'e yazar.
// Kullanım: node scripts/sync-images.mjs   (pnpm run images; demo ve derleme öncesi otomatik)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'images');
const dst = join(root, 'apps', 'mobile', 'assets', 'images');
const statusFile = join(root, 'apps', 'mobile', 'src', 'imageStatus.generated.ts');

export function syncImages() {
  const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
  const regPath = join(src, '.placeholders.json');
  const reg = existsSync(regPath) ? JSON.parse(readFileSync(regPath, 'utf8')) : {};
  // Eksik yuva varsa yer tutucuyu Pillow betiğiyle üret (var olanlara dokunmaz).
  if (manifest.some((m) => !existsSync(join(src, m.name)))) {
    for (const py of ['python', 'python3']) {
      const r = spawnSync(py, [join(root, 'scripts', 'gen-images.py')], { stdio: 'inherit' });
      if (r.status === 0) break;
    }
  }
  const reg2 = existsSync(regPath) ? JSON.parse(readFileSync(regPath, 'utf8')) : reg;
  mkdirSync(dst, { recursive: true });
  const placeholder = {};
  for (const item of manifest) {
    const from = join(src, item.name);
    if (!existsSync(from)) throw new Error(`images/${item.name} yok; önce: python scripts/gen-images.py`);
    copyFileSync(from, join(dst, item.name));
    const hash = createHash('sha256').update(readFileSync(from)).digest('hex');
    placeholder[item.name] = reg2[item.name] === hash;
  }
  const body = Object.entries(placeholder)
    .map(([k, v]) => `  '${k}': ${v},`)
    .join('\n');
  const text = `// Otomatik üretilir: node scripts/sync-images.mjs. Elle değiştirmeyin.\n/** true: dosya hâlâ "Resim N" yer tutucusu. */\nexport const IMAGE_IS_PLACEHOLDER: Record<string, boolean> = {\n${body}\n};\n`;
  if (!existsSync(statusFile) || readFileSync(statusFile, 'utf8') !== text) writeFileSync(statusFile, text);
  return { count: manifest.length, placeholder };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = syncImages();
  const left = Object.values(r.placeholder).filter(Boolean).length;
  console.log(`images: ${r.count} dosya kopyalandı (${left} yer tutucu, ${r.count - left} gerçek görsel)`);
}
