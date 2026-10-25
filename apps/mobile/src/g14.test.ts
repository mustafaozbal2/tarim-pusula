import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../../packages/ui/src/contrast';
import { MIN_FONT_SIZE, MIN_TOUCH_TARGET, colors } from '../../../packages/ui/src/tokens';

/** G14 erişilebilirlik denetimi: kaynak koddan mekanik UX_KURALLARI ihlali taraması. */
const ROOT = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))];
const sources = files.map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, 'utf8') }));

describe('G14 erişilebilirlik denetimi', () => {
  it('dosyalar bulundu', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('yazı boyutu en az 16 (sekme etiketi istisnası tokenlarda)', () => {
    const bad: string[] = [];
    for (const { file, text } of sources) {
      for (const m of text.matchAll(/fontSize:\s*(\d+)/g)) {
        if (Number(m[1]) < MIN_FONT_SIZE) bad.push(`${file}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('sistem yazı büyütmesi kapatılmaz', () => {
    const bad = sources.filter(({ text }) => /allowFontScaling=\{?\s*false/.test(text));
    expect(bad.map((b) => b.file)).toEqual([]);
  });

  it('sabit yükseklik/genişlik dokunma alanlarında 56 altına inmez', () => {
    const bad: string[] = [];
    for (const { file, text } of sources) {
      for (const m of text.matchAll(/\bmin(?:Height|Width):\s*(\d+)/g)) {
        if (Number(m[1]) < MIN_TOUCH_TARGET && Number(m[1]) > 0) bad.push(`${file}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('her Pressable ekran okuyucu rolü taşır', () => {
    const bad: string[] = [];
    for (const { file, text } of sources) {
      const parts = text.split('<Pressable').slice(1);
      parts.forEach((p, i) => {
        const head = p.slice(0, p.indexOf('>') > 0 ? 600 : 300);
        if (!/accessibilityRole=|\{\.\.\.props\}|role=/.test(head)) bad.push(`${file} #${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('yalnız ikon taşıyan düğmelerde etiket vardır (geri, yakınlaştır)', () => {
    // Geri düğmesi ortak üst banttadır (Screen ve FlowHeader ikisi de UstBant kullanır, G22.8).
    const bant = sources.find((s) => s.file.endsWith('UstBant.tsx'))!;
    expect(bant.text).toMatch(/accessibilityLabel=\{tr\.flow\.back\}/);
    const flow = sources.find((s) => s.file.endsWith('FlowParts.tsx'))!;
    expect(flow.text).toMatch(/<UstBant /);
    const harita = sources.find((s) => s.file.endsWith('harita.tsx'))!;
    expect(harita.text).toMatch(/accessibilityLabel=\{t\.zoomIn\}/);
    expect(harita.text).toMatch(/accessibilityLabel=\{t\.zoomOut\}/);
  });

  it('arayüz metinlerinde emoji yok', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
    const bad = sources.filter(({ text }) => emoji.test(text)).map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it('ana metin ve düğme renkleri WCAG AA (4.5) sağlar', () => {
    const pairs: [string, string, string][] = [
      ['orman/zemin', colors.forest, colors.background],
      ['beyaz/orman', colors.onForest, colors.forest],
      ['soluk metin/zemin', colors.textMuted, colors.background],
      ['soluk metin/beyaz', colors.textMuted, colors.surface],
      ['beyaz/su mavisi', colors.onForest, colors.water],
      ['beyaz/kiremit', colors.onForest, colors.brick],
      ['uyarı metni/uyarı zemini', colors.amberText, colors.amberSoft],
      ['uyarı metni/kehribar', colors.amberText, colors.amber],
      ['yeşil metin/fıstık', colors.pistachioText, colors.pistachio],
      ['kiremit/kiremit zemin', colors.brick, colors.brickSoft],
      ['su mavisi/su zemin', colors.water, colors.waterSoft],
    ];
    const low = pairs
      .map(([n, a, b]) => ({ n, r: contrastRatio(a, b) }))
      .filter((x) => x.r < 4.5)
      .map((x) => `${x.n}: ${x.r.toFixed(2)}`);
    expect(low).toEqual([]);
  });

  it('sesli oku ve sesle sor ekranda mevcut (ses rehberi)', () => {
    const soru = sources.find((s) => s.file.endsWith('soru-sor.tsx'))!;
    expect(soru.text).toMatch(/expo-speech|Speech/);
  });
});

describe('G14 mağaza paketi ve PWA', () => {
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
  const app = JSON.parse(read('app.json')).expo;
  const eas = JSON.parse(read('eas.json'));
  const manifest = JSON.parse(read('public/manifest.webmanifest'));

  it('iOS ve Android kimlikleri ve izin metinleri Türkçe tanımlı', () => {
    expect(app.ios.bundleIdentifier).toBe('com.tarimpusula.app');
    expect(app.android.package).toBe('com.tarimpusula.app');
    expect(app.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(app.ios.infoPlist.NSCameraUsageDescription).toMatch(/fotoğraf/);
    expect(app.android.blockedPermissions).toEqual(
      expect.arrayContaining(['READ_CONTACTS', 'READ_SMS']),
    );
    // G20.6: yerel ses tanıma için mikrofon izni artık açık ve metni Türkçe (ses kaydı saklanmaz).
    expect(app.android.blockedPermissions).not.toContain('RECORD_AUDIO');
    expect(app.android.permissions).toContain('RECORD_AUDIO');
    expect(app.ios.infoPlist.NSMicrophoneUsageDescription).toMatch(/saklanmaz/);
  });

  it('EAS: geliştirme, deneme ve yayın profili; yayın paketi app-bundle', () => {
    expect(Object.keys(eas.build).sort()).toEqual(['development', 'preview', 'production']);
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(eas.build.development.developmentClient).toBe(true);
  });

  it('EAS yapılandırmasında gizli anahtar yok', () => {
    const text = read('eas.json');
    expect(text).not.toMatch(/secret|token|password|apikey/i);
  });

  it('PWA bildirimi: Türkçe, bağımsız ekran, tema rengi ve 192/512 simge', () => {
    expect(manifest.lang).toBe('tr');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#064D3B');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const i of manifest.icons) {
      const png = readFileSync(join(ROOT, 'public', i.src.replace(/^\//, '')));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    }
  });

  it('servis çalışanı yalnız aynı kaynaklı GET isteklerini yakalar, API önbelleğe alınmaz', () => {
    const sw = read('public/sw.js');
    expect(sw).toMatch(/req\.method !== 'GET'/);
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/);
    expect(sw).toMatch(/startsWith\('\/api\/'\)/);
  });
});
