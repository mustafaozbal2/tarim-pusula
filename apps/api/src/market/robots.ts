/** robots.txt yorumlayıcı: toplayıcılar yalnız izin verilen yolları, istenen bekleme süresiyle çeker. */

export interface RobotsRules {
  /** En uzun eşleşen kural kazanır; eşitlikte Allow kazanır (RFC 9309). */
  allow: string[];
  disallow: string[];
  crawlDelaySec: number | null;
}

const UA_PRODUCT = 'tarimpusulabot';

/** `ua` için geçerli grubu seçer (özel grup varsa o, yoksa `*`). */
export function parseRobots(text: string, ua = UA_PRODUCT): RobotsRules {
  type Group = { agents: string[]; rules: RobotsRules };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: { allow: [], disallow: [], crawlDelaySec: null } };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' && val) cur.rules.allow.push(val);
    else if (key === 'disallow' && val) cur.rules.disallow.push(val);
    else if (key === 'crawl-delay') {
      const n = Number(val);
      if (Number.isFinite(n) && n >= 0) cur.rules.crawlDelaySec = n;
    }
  }
  const name = ua.toLowerCase();
  const own = groups.find((g) => g.agents.some((a) => a !== '*' && name.includes(a)));
  const star = groups.find((g) => g.agents.includes('*'));
  return (own ?? star)?.rules ?? { allow: [], disallow: [], crawlDelaySec: null };
}

function matches(pattern: string, path: string): boolean {
  // '*' joker ve '$' satır sonu desteklenir.
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+?^{}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\$$/, '$'),
  );
  return re.test(path);
}

export function robotsAllows(rules: RobotsRules, path: string): boolean {
  let best = { len: -1, allow: true };
  for (const [list, allow] of [
    [rules.allow, true],
    [rules.disallow, false],
  ] as const) {
    for (const p of list) {
      if (matches(p, path) && (p.length > best.len || (p.length === best.len && allow)))
        best = { len: p.length, allow };
    }
  }
  return best.allow;
}
