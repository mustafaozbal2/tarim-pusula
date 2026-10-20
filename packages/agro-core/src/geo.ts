/**
 * Tarla geometrisi. Alan, WGS84 elipsoidi üzerinde alan koruyan (Lambert eşit alanlı azimutal,
 * Snyder 1987 §24, elipsoidal biçim) izdüşümle hesaplanır; sonra düzlemde Gauss (ayakkabı bağı)
 * formülü uygulanır. Eşit alanlı izdüşüm alanı bozmadığı için tarla ölçeğinde hata ihmal edilebilir
 * (kenarların büyük daire yerine izdüşümde doğru sayılması küçük çokgenlerde ~1e-7 bağıl hata).
 */
export interface LonLat {
  lon: number;
  lat: number;
}

const A = 6378137; // WGS84 yarı büyük eksen (m)
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const RAD = Math.PI / 180;
const SQ_M_PER_DECARE = 1000;

/** Snyder (3-12): q(φ) = (1-e²)[ sinφ/(1-e²sin²φ) − (1/2e) ln((1−e sinφ)/(1+e sinφ)) ] */
function q(phi: number): number {
  const s = Math.sin(phi);
  return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
}
const QP = q(Math.PI / 2);
/** Alan eşdeğeri küre (authalic) yarıçapı. */
const RQ = A * Math.sqrt(QP / 2);

function authalicLat(phi: number): number {
  return Math.asin(Math.max(-1, Math.min(1, q(phi) / QP)));
}

type XY = { x: number; y: number };

/** Halkayı doğrular; kapalı halkanın tekrar eden son noktasını atar. */
export function openRing(ring: readonly LonLat[]): LonLat[] {
  const pts = ring.map((p) => {
    if (
      !Number.isFinite(p.lon) ||
      !Number.isFinite(p.lat) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lon) > 180
    ) {
      throw new RangeError(`Geçersiz koordinat: ${p.lon}, ${p.lat}`);
    }
    return p;
  });
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length > 1 && first && last && first.lon === last.lon && first.lat === last.lat) {
    pts.pop();
  }
  if (pts.length < 3) throw new RangeError('Çokgen en az 3 farklı nokta içermeli');
  return pts;
}

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

function project(ring: LonLat[]): XY[] {
  const lat0 = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
  const lonRef = ring[0]!.lon;
  const lon0 = lonRef + ring.reduce((s, p) => s + wrap(p.lon - lonRef), 0) / ring.length;
  const phi0 = lat0 * RAD;
  const b0 = authalicLat(phi0);
  const m0 = Math.cos(phi0) / Math.sqrt(1 - E2 * Math.sin(phi0) ** 2);
  const D = (A * m0) / (RQ * Math.cos(b0));
  return ring.map((p) => {
    const b = authalicLat(p.lat * RAD);
    const dl = wrap(p.lon - lon0) * RAD;
    const k = Math.sqrt(
      2 / (1 + Math.sin(b0) * Math.sin(b) + Math.cos(b0) * Math.cos(b) * Math.cos(dl)),
    );
    return {
      x: RQ * D * k * Math.cos(b) * Math.sin(dl),
      y: ((RQ * k) / D) * (Math.cos(b0) * Math.sin(b) - Math.sin(b0) * Math.cos(b) * Math.cos(dl)),
    };
  });
}

function orient(p: XY, r: XY, s: XY): number {
  return (r.x - p.x) * (s.y - p.y) - (r.y - p.y) * (s.x - p.x);
}

function segmentsCross(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = orient(a, b, c);
  const d2 = orient(a, b, d);
  const d3 = orient(c, d, a);
  const d4 = orient(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Kendini kesen (kelebek) çokgen mi? */
export function isSelfIntersecting(ring: readonly LonLat[]): boolean {
  const pts = project(openRing(ring));
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsCross(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

/** Çokgen alanı, metrekare. Köşe sırası (saat yönü/ters) önemsiz. Kendini kesen çokgen reddedilir. */
export function polygonAreaSquareMeters(ring: readonly LonLat[]): number {
  const open = openRing(ring);
  if (isSelfIntersecting(open)) throw new RangeError('Sınır çizgisi kendini kesiyor');
  const p = project(open);
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Çokgen alanı, dekar (1 dekar = 1000 m²). */
export function polygonAreaDecare(ring: readonly LonLat[]): number {
  return polygonAreaSquareMeters(ring) / SQ_M_PER_DECARE;
}

/** Ray-casting: nokta çokgenin içinde mi (kenar üzerindeki noktalar için kesin değil). */
export function pointInPolygon(pt: LonLat, ring: readonly LonLat[]): boolean {
  const r = openRing(ring);
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!;
    const b = r[j]!;
    const crosses = a.lat > pt.lat !== b.lat > pt.lat;
    if (crosses && pt.lon < ((b.lon - a.lon) * (pt.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside;
    }
  }
  return inside;
}

/** Haversine mesafesi (m), ortalama dünya yarıçapıyla. */
export function distanceMeters(a: LonLat, b: LonLat): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

/** Türkiye'yi kabaca kapsayan kutu: konum girişinde bariz hataları yakalar. */
export function isInTurkeyBox(p: LonLat): boolean {
  return p.lat >= 35.8 && p.lat <= 42.2 && p.lon >= 25.6 && p.lon <= 44.9;
}
