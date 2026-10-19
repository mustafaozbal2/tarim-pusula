import { expect, it } from 'vitest';
import { PANEL_TITLE } from './title';

it('panel başlığı Türkçedir', () => {
  expect(PANEL_TITLE).toBe('Tarım Pusula Paneli');
});
