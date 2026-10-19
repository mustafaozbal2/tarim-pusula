import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('ok döner', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
  it('/health yoluna bağlıdır', () => {
    expect(Reflect.getMetadata('path', HealthController)).toBe('health');
  });
});
