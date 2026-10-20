import { defineConfig } from 'vitest/config';

// Her test dosyası kendi süreç içi Postgres'ini (WASM) açar; paralel koşuda ilk açılış 10 sn'yi aşabiliyor.
export default defineConfig({ test: { hookTimeout: 90_000, testTimeout: 60_000 } });
