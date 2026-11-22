/**
 * IP başına hız sınırı (bellekte, 1 dakikalık pencere). Render'da tek örnek çalıştığı için yeterli;
 * shortcut: birden çok örneğe geçilirse sayaç Redis'e taşınmalı.
 * Yapay zekâ/pahalı uçlar (Pusula soru, Nuvia sohbet, fotoğraf) daha sıkı sınırlanır.
 */
type Request = { path: string; ip?: string };
type Response = { setHeader(a: string, b: string): void; status(s: number): { json(v: unknown): void } };
type NextFunction = () => void;

const YZ = /^\/(pusula\/ask|nuvia\/sohbet|nuvia\/bildir|.*\/foto|.*\/analiz)/;

export function hizSiniri(o: { genel: number; yz: number; simdi?: () => number }) {
  const sayac = new Map<string, { t: number; n: number }>();
  const simdi = o.simdi ?? Date.now;
  return (req: Request, res: Response, next: NextFunction) => {
    const yz = YZ.test(req.path);
    const anahtar = (yz ? 'y:' : 'g:') + (req.ip || 'bilinmiyor');
    const t = simdi(), k = sayac.get(anahtar);
    if (!k || t - k.t > 60_000) sayac.set(anahtar, { t, n: 1 });
    else if (++k.n > (yz ? o.yz : o.genel)) {
      res.setHeader('Retry-After', String(Math.ceil((60_000 - (t - k.t)) / 1000)));
      res.status(429).json({ message: 'Çok fazla istek. Bir dakika sonra tekrar deneyin.' });
      return;
    }
    if (sayac.size > 50_000) for (const [a, v] of sayac) if (t - v.t > 60_000) sayac.delete(a);   // bellek taşmasın
    next();
  };
}
