'use client';
import { canOpen } from '@tarim/schemas';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, type PanelMe } from './lib/api';
import { C, Message } from './ui';

type State = { kind: 'loading' } | { kind: 'ready'; me: PanelMe } | { kind: 'forbidden' };

/**
 * Panel çerçevesi: oturumu ve rolü sunucudan okur (/panel/me), rol bazlı menüyü çizer.
 * Yetkisiz kişi için sayfa içeriği HİÇ üretilmez (çocuk bileşenler bağlanmaz); asıl koruma
 * zaten API'dedir (rol + ikinci adım), bu yalnız arayüz katmanıdır.
 */
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });
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
  if (state.kind === 'loading') return <p style={{ padding: 32, fontSize: 18 }}>Yükleniyor</p>;
  if (state.kind === 'forbidden') return <Denied />;

  const { me } = state;
  const allowed = path === '/' || canOpen(path, me.roles);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexWrap: 'wrap' }}>
      <nav
        aria-label="Menü"
        style={{
          background: C.forest,
          color: C.white,
          width: 260,
          padding: 20,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Tarım Pusula</div>
        {me.menu.map((m) => (
          <Link
            key={m.path}
            href={m.path}
            style={{
              display: 'block',
              minHeight: 56,
              lineHeight: '56px',
              fontSize: 18,
              fontWeight: path.startsWith(m.path) ? 800 : 600,
              color: C.white,
              textDecoration: 'none',
              padding: '0 14px',
              borderRadius: 12,
              background: path.startsWith(m.path) ? '#2B5A47' : 'transparent',
            }}
          >
            {m.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => {
            void api('POST', '/auth/logout').catch(() => undefined);
            clearToken();
            router.replace('/giris');
          }}
          style={{
            marginTop: 24,
            minHeight: 56,
            width: '100%',
            fontSize: 18,
            fontWeight: 700,
            borderRadius: 12,
            border: `2px solid ${C.white}`,
            background: 'transparent',
            color: C.white,
            cursor: 'pointer',
          }}
        >
          Çıkış yap
        </button>
      </nav>
      <main style={{ flex: 1, padding: 32, minWidth: 320, boxSizing: 'border-box' }}>
        {path === '/' ? <Home me={me} /> : allowed ? children : <Denied />}
      </main>
    </div>
  );
}

function Home({ me }: { me: PanelMe }) {
  return (
    <>
      <h1 style={{ fontSize: 30 }}>Hoş geldiniz</h1>
      <p style={{ fontSize: 18 }}>Soldaki menüden bir iş seçin.</p>
      <ul style={{ fontSize: 18, lineHeight: 2 }}>
        {me.menu.map((m) => (
          <li key={m.path}>
            <Link href={m.path}>{m.label}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Denied() {
  return (
    <div data-testid="yetkisiz" style={{ padding: 32 }}>
      <Message kind="error">Bu sayfa için yetkiniz yok.</Message>
      <Link href="/" style={{ fontSize: 18 }}>
        Ana sayfaya dön
      </Link>
    </div>
  );
}
