import type { ReactNode } from 'react';
import { Shell } from './Shell';
import { PANEL_TITLE } from './title';

export const metadata = { title: PANEL_TITLE };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14,
          background: '#F1F3F4',
          color: '#064D3B',
        }}
      >
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
