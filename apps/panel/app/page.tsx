import { PANEL_TITLE } from './title';

export default function Home() {
  return (
    <main style={{ padding: 32 }}>
      <h1 style={{ fontSize: 32 }}>{PANEL_TITLE}</h1>
      <p style={{ fontSize: 18 }}>Kurum ve yönetici paneli. Bu sayfa iskelettir.</p>
    </main>
  );
}
