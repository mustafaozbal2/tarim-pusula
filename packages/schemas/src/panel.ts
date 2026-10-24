import { z } from 'zod';
import type { Role } from './auth';

/** Panele girebilen roller. Çiftçi/yardımcı/kooperatif/danışman panele giremez. */
export const PANEL_ROLES: readonly Role[] = ['institution_admin', 'expert', 'admin'];

export type PanelIcon =
  | 'home'
  | 'field'
  | 'plan'
  | 'megaphone'
  | 'check'
  | 'leaf'
  | 'soil'
  | 'chat'
  | 'chip'
  | 'audit'
  | 'users';

export interface PanelMenuItem {
  path: string;
  label: string;
  roles: readonly Role[];
  icon: PanelIcon;
  /** Açılır grup başlığı; yoksa tek başına bir menü öğesidir. */
  group?: string;
}

const STAFF_ROLES: readonly Role[] = ['institution_admin', 'expert', 'admin'];
const REVIEWERS: readonly Role[] = ['expert', 'admin'];

/** Rol bazlı menü (eski panel yapısı: Ana Sayfa, Arazi işlemleri, Üretim planlama...). Sayfa erişimi de aynı tablodan denetlenir (`canOpen`). */
export const PANEL_MENU: readonly PanelMenuItem[] = [
  { path: '/', label: 'Ana sayfa', icon: 'home', roles: STAFF_ROLES },
  {
    path: '/arazi',
    label: 'Arazi listele',
    icon: 'field',
    group: 'Arazi işlemleri',
    roles: REVIEWERS,
  },
  {
    path: '/uretim/arz-talep',
    label: 'Ürün arz talep',
    icon: 'plan',
    group: 'Üretim planlama',
    roles: STAFF_ROLES,
  },
  {
    path: '/uretim/verim',
    label: 'Verim haritası',
    icon: 'plan',
    group: 'Üretim planlama',
    roles: STAFF_ROLES,
  },
  {
    path: '/uretim/urunler',
    label: 'Desteklenen ürünler',
    icon: 'plan',
    group: 'Üretim planlama',
    roles: STAFF_ROLES,
  },
  {
    path: '/duyurular',
    label: 'Duyurular',
    icon: 'megaphone',
    group: 'Duyuru ve içerik',
    roles: STAFF_ROLES,
  },
  {
    path: '/onay',
    label: 'Onay kuyruğu',
    icon: 'check',
    group: 'Duyuru ve içerik',
    roles: REVIEWERS,
  },
  { path: '/paketler', label: 'Bitki paketleri (Kc)', icon: 'leaf', roles: REVIEWERS },
  { path: '/toprak', label: 'Toprak türleri', icon: 'soil', roles: REVIEWERS },
  { path: '/uzman', label: 'Soru / uzman kuyruğu', icon: 'chat', roles: REVIEWERS },
  { path: '/cihazlar', label: 'Cihazlar', icon: 'chip', roles: ['admin'] },
  { path: '/denetim', label: 'Denetim kaydı', icon: 'audit', roles: ['admin'] },
  { path: '/kullanicilar', label: 'Kullanıcılar', icon: 'users', roles: ['admin'] },
];

export const hasPanelAccess = (roles: readonly string[]) =>
  roles.some((r) => (PANEL_ROLES as readonly string[]).includes(r));

export const panelMenu = (roles: readonly string[]): PanelMenuItem[] =>
  PANEL_MENU.filter((m) => m.roles.some((r) => roles.includes(r)));

/** Yol (alt yollar dahil) bu rollerden biri için açık mı? Menüde olmayan yol kapalıdır. */
export const canOpen = (path: string, roles: readonly string[]): boolean =>
  PANEL_MENU.some(
    (m) =>
      (path === m.path || path.startsWith(`${m.path}/`)) && m.roles.some((r) => roles.includes(r)),
  );

export const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Kod 6 haneli olmalı') });

export const stageCreateSchema = z
  .object({
    nameTr: z.string().trim().min(2, 'Evre adı yazın').max(80),
    kc: z.number().positive().max(2).nullable().default(null),
    frostCriticalC: z.number().min(-30).max(10).nullable().default(null),
    source: z.string().trim().min(3, 'Kaynak (atıf) zorunlu').max(300),
  })
  .refine((v) => v.kc !== null || v.frostCriticalC !== null, {
    message: 'Kc ya da don eşiği girin',
  });
/** Reddetme ve onay geri çekme gerekçesi (denetim kaydına yazılır). */
export const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Gerekçe yazın').max(300),
});
export type Reason = z.infer<typeof reasonSchema>;

export type StageCreate = z.infer<typeof stageCreateSchema>;
