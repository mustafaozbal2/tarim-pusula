import { useSyncExternalStore } from 'react';
import { emptyDraft, type FieldDraft } from './draft';

/** Ekranlar arası taslak (tek kullanıcı, tek akış). Akış bitince ya da vazgeçilince sıfırlanır. */
let draft: FieldDraft = emptyDraft();
const listeners = new Set<() => void>();

export function getDraft(): FieldDraft {
  return draft;
}

export function updateDraft(fn: (d: FieldDraft) => FieldDraft): void {
  draft = fn(draft);
  listeners.forEach((l) => l());
}

export function resetDraft(keep?: Partial<FieldDraft>): void {
  updateDraft(() => ({ ...emptyDraft(), ...keep }));
}

export function useDraft(): FieldDraft {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => draft,
    () => draft,
  );
}
