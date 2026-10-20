import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport, runLatencyBench } from '../src/bench';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'G8_GECIKME.md');
const report = await runLatencyBench();
writeFileSync(out, formatReport(report), 'utf8');
console.log(formatReport(report));
