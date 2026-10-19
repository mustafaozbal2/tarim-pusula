import type { ReactNode } from 'react';

export const metadata = { title: 'Tarım Pusula Paneli' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: '#F4F6F0',
          color: '#14392B',
        }}
      >
        {children}
      </body>
    </html>
  );
}
