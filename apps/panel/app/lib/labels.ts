/** Denetim kaydındaki teknik işlem adlarının Türkçe karşılığı (ana sayfa ve denetim ekranı). */
const ACTIONS: Record<string, string> = {
  'insert.announcements': 'Duyuru eklendi',
  'update.announcements': 'Duyuru güncellendi',
  'delete.announcements': 'Duyuru silindi',
  'announcements.edit': 'Duyuru düzenlendi',
  'announcements.delete': 'Duyuru silindi',
  'announcements.reject': 'Duyuru reddedildi',
  'announcements.revoke': 'Duyuru onayı geri çekildi',
  'announcements.approve': 'Duyuru onaylandı',
  'panel.fields.list': 'Arazi listesi açıldı',
  'panel.devices.list': 'Cihaz listesi açıldı',
  'panel.users.list': 'Kullanıcı listesi açıldı',
  'panel.pack.approve': 'Paket onaylandı',
  'panel.pack.reject': 'Paket reddedildi',
  'panel.pack.revoke': 'Paket onayı geri çekildi',
  'panel.stage.approve': 'Evre onaylandı',
  'panel.stage.reject': 'Evre reddedildi',
  'panel.stage.revoke': 'Evre onayı geri çekildi',
  'panel.stage.create': 'Evre eklendi',
  'mfa.reset': 'İkinci adım sıfırlandı',
  'access.denied': 'Yetkisiz erişim denendi',
};

const ENTITIES: Record<string, string> = {
  announcements: 'Duyuru',
  crop_pack_versions: 'Bitki paketi',
  crop_stages: 'Bitki evresi',
  panel: 'Panel',
  users: 'Kullanıcı',
  user_mfa: 'İkinci adım',
  fields: 'Tarla',
  devices: 'Cihaz',
};

const OPS: Record<string, string> = { insert: 'eklendi', update: 'güncellendi', delete: 'silindi' };

/** Bilinen işlem adı; bilinmeyen "insert.tablo" gibi adlar "Tablo eklendi" biçimine çevrilir. */
export function actionLabel(a: string): string {
  const known = ACTIONS[a];
  if (known) return known;
  const m = /^(insert|update|delete)\.(.+)$/.exec(a);
  return m ? `${entityLabel(m[2]!)} ${OPS[m[1]!]}` : a;
}
export const entityLabel = (e: string): string => ENTITIES[e] ?? e;

/** Duyuru ve paket onay durumu → yazı (renk tek başına anlam taşımaz). */
export function statusLabel(s: string): { text: string; tone: 'draft' | 'ok' | 'bad' } {
  if (s === 'uzman-onayli') return { text: 'Yayında (uzman onaylı)', tone: 'ok' };
  if (s === 'reddedildi') return { text: 'Reddedildi', tone: 'bad' };
  return { text: 'Uzman onayı bekliyor', tone: 'draft' };
}
