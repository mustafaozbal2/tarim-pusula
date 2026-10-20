export const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://127.0.0.1:3111';
const TOKEN_KEY = 'panel.token';

export const getToken = (): string | null =>
  typeof window === 'undefined' ? null : window.sessionStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => window.sessionStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => window.sessionStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Sunucunun Türkçe hata mesajını taşır; 401/403 durum kodu çağırana kalır. */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg = (data as { message?: string | string[] } | undefined)?.message;
    throw new ApiError(
      res.status,
      Array.isArray(msg) ? msg.join('; ') : (msg ?? 'İşlem yapılamadı'),
    );
  }
  return data as T;
}

export interface MenuItem {
  path: string;
  label: string;
}
export interface PanelMe {
  userId: string;
  roles: string[];
  menu: MenuItem[];
}
