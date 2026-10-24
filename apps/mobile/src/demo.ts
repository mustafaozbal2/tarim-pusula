/**
 * Demo derlemesi (`EXPO_PUBLIC_DEMO=1`): her ekranda "Örnek veri" rozeti görünür.
 * Demo kodu ise derleme bayrağına değil SUNUCUYA bağlıdır: `GET /demo/info` yalnız sunucuda
 * `DEMO_MODE=1` iken vardır; yoksa kod hiçbir koşulda gösterilmez.
 */
export const DEMO_BUILD = process.env['EXPO_PUBLIC_DEMO'] === '1';

export interface DemoInfoDto {
  demo: true;
  code: string;
  farmerPhone: string;
  staffPhone: string;
}

/** Giriş ekranının altındaki demo kodu satırı; sunucu demo değilse `null` (hiçbir şey gösterilmez). */
export function demoCodeLine(info: Partial<DemoInfoDto> | null | undefined, label: string) {
  if (!info || info.demo !== true || !info.code) return null;
  return `${label}: ${info.code}`;
}

/** Demo bilgisini sorgular; ağ ya da 404 hatasında sessizce `null`. */
export async function loadDemoInfo(
  fetchInfo: () => Promise<DemoInfoDto>,
): Promise<DemoInfoDto | null> {
  try {
    const info = await fetchInfo();
    return info.demo === true ? info : null;
  } catch {
    return null;
  }
}
