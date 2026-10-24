import { defineConfig } from 'vitest/config';

// Gerçek altyapı: aynı API testleri PGlite yerine Docker'daki PostgreSQL+PostGIS+pgvector'a karşı koşar
// (src/db/testdb.ts), artı integration/ altındaki Redis, MQTT ve PostGIS karşılaştırma testleri.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'integration/**/*.itest.ts'],
    hookTimeout: 120_000,
    testTimeout: 90_000,
    maxWorkers: 4,
    env: {
      TEST_DATABASE_URL:
        process.env['TEST_DATABASE_URL'] ?? 'postgres://tarim:tarim@localhost:5432/tarim',
      REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
      MQTT_URL: process.env['MQTT_URL'] ?? 'mqtt://localhost:1883',
    },
  },
});
