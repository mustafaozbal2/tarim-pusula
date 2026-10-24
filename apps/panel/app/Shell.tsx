'use client';
import { canOpen } from '@tarim/schemas';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Home } from './Home';
import { api, clearToken, getToken, type MenuItem, type PanelMe } from './lib/api';
import { C, Icon, Message } from './ui';

type State = { kind: 'loading' } | { kind: 'ready'; me: PanelMe } | { kind: 'forbidden' };

const ROLE_LABEL: Record<string, string> = {
  institution_admin: 'Kurum yöneticisi',
  expert: 'Uzman',
  admin: 'Yönetici',
};

const isActive = (path: string, itemPath: string) =>
  itemPath === '/' ? path === '/' : path === itemPath || path.startsWith(`${itemPath}/`);

/** Menüyü sıralı öğe/grup listesine çevirir (gruplu öğeler ilk görüldükleri yerde toplanır). */
export function groupMenu(
  menu: MenuItem[],
): ({ item: MenuItem } | { group: string; items: MenuItem[] })[] {
  const out: ({ item: MenuItem } | { group: string; items: MenuItem[] })[] = [];
  for (const m of menu) {
    if (!m.group) {
      out.push({ item: m });
      continue;
    }
    const g = out.find(
      (x): x is { group: string; items: MenuItem[] } => 'group' in x && x.group === m.group,
    );
    if (g) g.items.push(m);
    else out.push({ group: m.group, items: [m] });
  }
  return out;
}

/** Üst çubuktaki breadcrumb: Ana sayfa › Grup › Sayfa. */
export function breadcrumb(menu: MenuItem[], path: string): string[] {
  const item = menu.find((m) => m.path !== '/' && isActive(path, m.path));
  if (!item) return ['Ana sayfa'];
  return item.group ? ['Ana sayfa', item.group, item.label] : ['Ana sayfa', item.label];
}

/**
 * Panel çerçevesi: oturumu ve rolü sunucudan okur (/panel/me), rol bazlı menüyü çizer.
 * Yetkisiz kişi için sayfa içeriği HİÇ üretilmez (çocuk bileşenler bağlanmaz); asıl koruma
 * zaten API'dedir (rol + ikinci adım), bu yalnız arayüz katmanıdır.
 */
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const bare = path === '/giris';

  useEffect(() => {
    if (bare) return;
    if (!getToken()) {
      router.replace('/giris');
      return;
    }
    api<PanelMe>('GET', '/panel/me')
      .then((me) => setState({ kind: 'ready', me }))
      .catch(() => {
        clearToken();
        router.replace('/giris');
      });
  }, [bare, path, router]);

  if (bare) return <>{children}</>;
  if (state.kind === 'loading') return <p style={{ padding: 32, fontSize: 14 }}>Yükleniyor</p>;
  if (state.kind === 'forbidden') return <Denied />;

  const { me } = state;
  const allowed = path === '/' || canOpen(path, me.roles);
  const trail = breadcrumb(me.menu, path);
  const roleText = me.roles
    .filter((r) => r in ROLE_LABEL)
    .map((r) => ROLE_LABEL[r])
    .join(', ');

  const link = (m: MenuItem, indent: boolean) => {
    const active = isActive(path, m.path);
    return (
      <Link
        key={m.path}
        href={m.path}
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 38,
          fontSize: 14,
          fontWeight: active ? 800 : 600,
          color: C.white,
          textDecoration: 'none',
          padding: indent ? '0 12px 0 34px' : '0 12px',
          borderRadius: 6,
          background: active ? C.listGreen : 'transparent',
        }}
      >
        {indent ? null : <Icon name={m.icon} />}
        {m.label}
      </Link>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        aria-label="Menü"
        style={{
          background: C.forest,
          color: C.white,
          width: 250,
          flexShrink: 0,
          padding: '14px 10px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, margin: '0 6px 14px' }}>Tarım Pusula</div>
        {groupMenu(me.menu).map((g) =>
          'item' in g ? (
            link(g.item, false)
          ) : (
            <div key={g.group}>
              <button
                type="button"
                aria-expanded={!closed[g.group]}
                onClick={() => setClosed({ ...closed, [g.group]: !closed[g.group] })}
                style={{
                  all: 'unset',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  minHeight: 38,
                  padding: '0 12px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: C.white,
                }}
              >
                <Icon name={g.items[0]!.icon} />
                <span style={{ flex: 1 }}>{g.group}</span>
                <span
                  style={{
                    display: 'inline-flex',
                    transform: closed[g.group] ? 'none' : 'rotate(90deg)',
                  }}
                >
                  <Icon name="chevron" size={14} />
                </span>
              </button>
              {closed[g.group] ? null : g.items.map((m) => link(m, true))}
            </div>
          ),
        )}
      </nav>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            background: C.white,
            borderBottom: `1px solid ${C.border}`,
            padding: '0 24px',
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <nav
            aria-label="Sayfa yolu"
            data-testid="ust-yol"
            style={{ fontSize: 13, color: C.muted }}
          >
            {trail.join(' › ')}
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <span data-testid="ust-kullanici" style={{ fontWeight: 700 }}>
              {roleText}
            </span>
            <button
              type="button"
              onClick={() => {
                void api('POST', '/auth/logout').catch(() => undefined);
                clearToken();
                router.replace('/giris');
              }}
              style={{
                minHeight: 32,
                padding: '0 12px',
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 6,
                border: `1px solid ${C.forest}`,
                background: C.white,
                color: C.forest,
                cursor: 'pointer',
              }}
            >
              Çıkış yap
            </button>
          </div>
        </header>
        <main style={{ flex: 1, padding: 24, boxSizing: 'border-box' }}>
          {path === '/' ? <Home me={me} /> : allowed ? children : <Denied />}
        </main>
      </div>
    </div>
  );
}

function Denied() {
  return (
    <div data-testid="yetkisiz" style={{ padding: 32 }}>
      <Message kind="error">Bu sayfa için yetkiniz yok.</Message>
      <Link href="/" style={{ fontSize: 14 }}>
        Ana sayfaya dön
      </Link>
    </div>
  );
}
