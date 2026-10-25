import type { SavingsDto, SavingsReportDto } from '../api/client';

const esc = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const nf = (n: number, d = 1) => n.toLocaleString('tr-TR', { maximumFractionDigits: d });

export const BASIS_TEXT = {
  olculen: 'ölçülen',
  beyan: 'çiftçi beyanı',
  varsayim: 'varsayım (kaynaksız)',
  hesap: 'hesap (FAO-56)',
} as const;

export type SavingsView =
  | { kind: 'none'; message: string }
  | {
      kind: 'report';
      rows: { label: string; value: string }[];
      headline: string;
      estimateNote: string | null;
      stressNote: string | null;
    };

/** Ekranda ve raporda aynı metinler: tek kaynak. */
export function savingsView(dto: SavingsDto): SavingsView {
  const r = dto.result;
  if (r.kind === 'none') {
    return {
      kind: 'none',
      message:
        r.reason === 'uzman-onayi-bekliyor'
          ? `Rapor için doğrulanmış veri gerekiyor (${r.missing.join(', ')}). Hazır olunca burada görünür; rakam uydurmuyoruz.`
          : `Rapor için eksik bilgi var: ${r.missing.join(', ')}.`,
    };
  }
  return {
    kind: 'report',
    headline:
      r.savedM3 >= 0
        ? `${nf(r.savedM3, 0)} m³ (%${nf(r.savedPct)}) daha az su`
        : `${nf(-r.savedM3, 0)} m³ (%${nf(-r.savedPct)}) daha fazla su`,
    rows: [
      {
        label: 'Dönem',
        value: `${dto.period.from ?? '-'} / ${dto.period.to ?? '-'} (${r.days} gün)`,
      },
      { label: 'Arazi alanı', value: `${nf(r.areaDecare)} dekar` },
      {
        label: `Geleneksel sulama (${BASIS_TEXT[r.traditionalBasis]})`,
        value: `${nf(r.traditionalM3, 0)} m³ (${nf(r.traditionalMm)} mm)`,
      },
      {
        label: `Tarım Pusula (${BASIS_TEXT[r.pusulaBasis]})`,
        value: `${nf(r.pusulaM3, 0)} m³ (${nf(r.pusulaMm)} mm)`,
      },
      { label: 'Fark', value: `${nf(r.savedM3, 0)} m³ · %${nf(r.savedPct)}` },
      {
        label: 'Sulama sayısı (geleneksel / Pusula)',
        value: `${r.irrigationsTraditional} / ${r.irrigationsPusula}`,
      },
      {
        label: 'Derine sızan su (geleneksel / Pusula)',
        value: `${nf(r.traditionalDeepPercolationMm)} / ${nf(r.pusulaDeepPercolationMm)} mm`,
      },
      {
        label: 'Bitkinin su stresi günleri (geleneksel / Pusula)',
        value: `${r.traditionalStressDays} / ${r.pusulaStressDays}`,
      },
    ],
    estimateNote: r.isEstimate
      ? 'TAHMİN: en az bir taraf ölçülmüş değil. Cihaz sayacı ve kendi takvimin girilince değerler ölçüme dayanır.'
      : null,
    stressNote:
      r.pusulaStressDays > 0
        ? `Dikkat: Pusula senaryosunda ${r.pusulaStressDays} gün bitki su sıkıntısı yaşadı; tasarruf bu bedelle gelmiş olabilir.`
        : null,
  };
}

function sourceLines(dto: SavingsDto): string[] {
  const s = dto.sources;
  const one = (label: string, x: { name: string; date: string; version: string } | null) =>
    x ? `${label}: ${x.name} · ${x.date} · ${x.version}` : null;
  return [
    one('Hava', s.weather),
    one('Bitki katsayısı (Kc)', s.kc),
    one('Toprak', s.soil),
    one('Kök derinliği ve tükenme oranı', s.waterParams),
  ].filter((x): x is string => x !== null);
}

/** Paylaşılabilir düz metin raporu (kaynak + tarih + sürüm dahil). */
export function reportText(dto: SavingsDto, appVersion: string): string {
  const v = savingsView(dto);
  const lines = [
    `Tarım Pusula — Tasarruf ve verim raporu`,
    `Arazi: ${dto.fieldName}`,
    `Üretim: ${dto.generatedAt.slice(0, 10)} · uygulama sürümü ${appVersion}`,
    '',
  ];
  if (v.kind === 'none') return [...lines, v.message].join('\n');
  lines.push(`Sonuç: ${v.headline}`);
  for (const r of v.rows) lines.push(`${r.label}: ${r.value}`);
  if (v.estimateNote) lines.push('', v.estimateNote);
  if (v.stressNote) lines.push(v.stressNote);
  const rep = dto.result as SavingsReportDto;
  lines.push('', 'Yöntem: ' + dto.method, dto.singleKcNote, 'Taban çizgisi ve varsayımlar:');
  for (const a of rep.assumptions) lines.push(`- ${a}`);
  lines.push('', 'Kaynaklar:', ...sourceLines(dto).map((l) => `- ${l}`));
  return lines.join('\n');
}

/** Yazdırılabilir / PDF'e çevrilebilir HTML rapor. */
export function reportHtml(dto: SavingsDto, appVersion: string): string {
  const v = savingsView(dto);
  const body =
    v.kind === 'none'
      ? `<p>${esc(v.message)}</p>`
      : `<h2>${esc(v.headline)}</h2>
<table>${v.rows.map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join('')}</table>
${v.estimateNote ? `<p class="warn">${esc(v.estimateNote)}</p>` : ''}
${v.stressNote ? `<p class="warn">${esc(v.stressNote)}</p>` : ''}
<h3>Yöntem ve varsayımlar</h3>
<p>${esc(dto.method)}. ${esc(dto.singleKcNote)}</p>
<ul>${(dto.result as SavingsReportDto).assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Tasarruf ve verim raporu</title>
<style>body{font-family:Arial,sans-serif;color:#064D3B;margin:24px}h1{font-size:20px}h2{font-size:18px}h3{font-size:15px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #D9DEE0;padding:6px;text-align:left;font-size:13px}
th{background:#E3F2EC}.warn{background:#FFF4DC;border:1px solid #F2C14E;padding:8px;font-size:13px}.src{font-size:12px;color:#4F6258}</style></head>
<body><h1>Tarım Pusula — Tasarruf ve verim raporu</h1>
<p>Arazi: <b>${esc(dto.fieldName)}</b> · Üretim tarihi: ${esc(dto.generatedAt.slice(0, 10))} · Uygulama sürümü: ${esc(appVersion)}</p>
${body}
<h3>Kaynaklar</h3><ul class="src">${sourceLines(dto)
    .map((l) => `<li>${esc(l)}</li>`)
    .join('')}</ul>
</body></html>`;
}
