import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { GovdeHatasiFiltresi } from './govde-hatasi';

function calistir(e: Error & { getStatus(): number; getResponse(): unknown }) {
  let sonuc: { durum: number; govde: unknown } | null = null;
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (n: number) => ({ json: (b: unknown) => (sonuc = { durum: n, govde: b }) }),
      }),
    }),
  };
  new GovdeHatasiFiltresi().catch(e as never, host as never);
  return sonuc!;
}

describe('bozuk JSON iletisi (CB-3)', () => {
  it('ayrıştırıcının İngilizce iletisi sızmaz', () => {
    const r = calistir(new BadRequestException('Unexpected token } in JSON at position 5'));
    expect(r.durum).toBe(400);
    expect(JSON.stringify(r.govde)).not.toMatch(/Unexpected|position/);
    expect(JSON.stringify(r.govde)).toContain('geçerli JSON değil');
  });
  it('doğrulama hataları olduğu gibi kalır', () => {
    const r = calistir(new BadRequestException(['phone must be a string']));
    expect(JSON.stringify(r.govde)).toContain('phone must be a string');
  });
});
