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
          fontSize: 18,
          background: '#F4F6F0',
          color: '#14392B',
        }}
      >
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
