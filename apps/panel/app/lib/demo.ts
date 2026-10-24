/**
 * Demo derlemesi (`NEXT_PUBLIC_DEMO=1`). Kod, derleme bayrağına değil SUNUCUYA bağlıdır:
 * `GET /demo/info` yalnız sunucuda `DEMO_MODE=1` iken vardır; yoksa kod hiçbir koşulda gösterilmez.
 */
export const DEMO_BUILD = process.env['NEXT_PUBLIC_DEMO'] === '1';

export interface DemoInfo {
  demo: true;
  code: string;
  farmerPhone: string;
  staffPhone: string;
}

/** Giriş adımına göre ekranda yazacak demo kodu satırı; demo değilse `null`. */
export function demoLine(info: Partial<DemoInfo> | null | undefined): string | null {
  if (!info || info.demo !== true || !info.code) return null;
  return `Demo kodu: ${info.code} (hem SMS kodu hem doğrulayıcı kodu yerine geçer)`;
}

export async function loadDemoInfo(get: () => Promise<DemoInfo>): Promise<DemoInfo | null> {
  try {
    const info = await get();
    return info.demo === true ? info : null;
  } catch {
    return null;
  }
}
