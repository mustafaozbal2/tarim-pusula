import { defineConfig } from 'vitest/config';

// Her test dosyası kendi süreç içi Postgres'ini (WASM) açar; paralel koşuda ilk açılış 10 sn'yi aşabiliyor.
// UZMAN_ONAYI=1: testler onay düzeneğini (taslak → onay → yayın) sınar. Canlıda onay kapalıdır (src/onay.ts);
// kapalı kipin davranışı src/onay.test.ts içinde ayrıca sınanır.
export default defineConfig({
  test: { hookTimeout: 90_000, testTimeout: 60_000, env: { UZMAN_ONAYI: '1' } },
});
