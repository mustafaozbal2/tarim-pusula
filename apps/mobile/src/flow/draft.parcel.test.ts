import { describe, expect, it } from 'vitest';
import { emptyDraft, toFieldPayload, withPoint } from './draft';

describe('ada ve parsel (isteğe bağlı)', () => {
  const base = { ...withPoint(emptyDraft(), { lat: 37, lon: 37 }, 'gps'), cropId: 'zeytin' };
  it('boş bırakılınca yüke girmez; kayıt yine geçerli', () => {
    const p = toFieldPayload({ ...base, parcelBlock: '  ', parcelNo: '' });
    expect(p.parcelBlock).toBeUndefined();
    expect(p.parcelNo).toBeUndefined();
  });
  it('doluysa kırpılıp yüke girer', () => {
    const p = toFieldPayload({ ...base, parcelBlock: ' 123 ', parcelNo: '45' });
    expect(p).toMatchObject({ parcelBlock: '123', parcelNo: '45' });
  });
});
