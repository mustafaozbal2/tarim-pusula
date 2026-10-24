import { useSyncExternalStore } from 'react';
import { StyleSheet, Text } from 'react-native';
import { TEXT_SCALE } from '@tarim/ui';
import { DEFAULTS, parseSettings, scaleTextStyle, type Settings } from './settingsCore';
import { kv } from './offline/kvStore';

/** Uygulama içi ayarlar (cihaz deposunda): yazı boyutu Normal/Büyük, ses rehberi aç/kapa. */

const KEY = 'settings.v1';

let current: Settings = DEFAULTS;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let patched = false;
/** RN `Text` çizimini sarar: "Büyük" modda tüm yazıların boyu 1,2 katına çıkar. Bir kez kurulur. */
function installTextScale() {
  if (patched) return;
  const T = Text as unknown as {
    render?: (props: { style?: unknown }, ref: unknown) => unknown;
  };
  const orig = T.render;
  if (typeof orig !== 'function') return;
  T.render = function (this: unknown, props, ref) {
    const scale = TEXT_SCALE[current.textSize];
    if (scale !== 1) {
      const flat = (StyleSheet.flatten(props.style as never) ?? undefined) as
        { fontSize?: number; lineHeight?: number } | undefined;
      props = { ...props, style: [props.style, scaleTextStyle(flat, scale)] };
    }
    return orig.call(this, props, ref);
  };
  patched = true;
}

export function loadSettings(): Promise<void> {
  loaded ??= kv.get(KEY).then((raw) => {
    current = parseSettings(raw);
    installTextScale();
    emit();
  });
  return loaded;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  current = { ...current, ...patch };
  await kv.set(KEY, JSON.stringify(current));
  emit();
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      void loadSettings();
      return () => listeners.delete(l);
    },
    () => current,
    () => DEFAULTS,
  );
}
