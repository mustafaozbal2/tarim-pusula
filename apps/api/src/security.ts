/** G14: güvenlik başlıkları ve gizli anahtar taraması (OWASP ASVS V14 yapılandırma, V2 gizli bilgi). */

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Resource-Policy': 'same-site',
  // API yalnız JSON döner; hiçbir kaynak yüklemesine izin verilmez.
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

interface HeaderSink {
  setHeader(name: string, value: string): unknown;
}

/** Express ara katmanı. Üretimde HTTPS arkasında ayrıca HSTS eklenir. */
export function securityHeaders(opts: { hsts?: boolean } = {}) {
  return (_req: unknown, res: HeaderSink, next: () => void): void => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (opts.hsts)
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

/** Üretimde CORS kaynakları açıkça verilmeli; "her yerden" yalnız geliştirmede. */
export function corsOrigins(env: Record<string, string | undefined>): string[] | true {
  const list = env['CORS_ORIGINS']
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list && list.length > 0) return list;
  if (env['NODE_ENV'] === 'production') {
    throw new Error('Üretimde CORS_ORIGINS verilmeli (virgülle ayrılmış adresler).');
  }
  return true;
}

export interface SecretHit {
  file: string;
  line: number;
  rule: string;
}

const RULES: { rule: string; re: RegExp }[] = [
  { rule: 'Anthropic anahtarı', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { rule: 'OpenAI tarzı anahtar', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { rule: 'AWS erişim anahtarı', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { rule: 'GitHub jetonu', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { rule: 'Google API anahtarı', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { rule: 'Slack jetonu', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: 'Özel anahtar bloğu', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  {
    rule: 'Parolalı bağlantı adresi',
    // localhost geliştirme örnekleri (docker-compose, .env.example) hariç.
    re: /\b(?:postgres|postgresql|mysql|mongodb|redis|amqp):\/\/[^\s:/@]+:[^\s@]{4,}@(?!localhost|127\.0\.0\.1|db\b|postgres\b)[A-Za-z0-9.-]+/,
  },
  {
    rule: 'Sabit gizli değer ataması',
    re: /(?:CLIENT_SECRET|API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY)\s*[=:]\s*['"][A-Za-z0-9+/_=-]{16,}['"]/,
  },
];

/** Verilen dosyalarda gizli anahtar desenlerini arar; değeri raporlamaz (yalnız yer ve kural). */
export function scanForSecrets(files: { path: string; text: string }[]): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const f of files) {
    const lines = f.text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const r of RULES)
        if (r.re.test(line)) hits.push({ file: f.path, line: i + 1, rule: r.rule });
    });
  }
  return hits;
}
