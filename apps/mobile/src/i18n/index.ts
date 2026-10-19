import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { tr } from './tr';

export const DEFAULT_LANGUAGE = 'tr';

/** Yeni dil eklemek için `resources` içine yeni bir çeviri nesnesi eklenir. */
export const resources = { tr: { translation: tr } } as const;

export function createI18n(language: string = DEFAULT_LANGUAGE) {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    returnObjects: true,
  });
  return instance;
}

export const i18n = createI18n();
