import { expect, it } from 'vitest';
import { WORKERS_READY } from './index';

it('iskelet yüklenir', () => {
  expect(WORKERS_READY).toBe(true);
});
