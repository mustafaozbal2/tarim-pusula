// Demo için ürün başına örnek ana sayfa içeriği üretir: data/ornek_icerik/<urun-id>.json
// (5 kart, 5 faaliyet zamanı, 5 faaliyet rehberi, 5 erken uyarı, 5 hibe/destek).
// Kullanım: node scripts/gen-ornek-icerik.mjs
// KURALLAR (G22, CLAUDE.md 1-2): ilaç adı, doz, karışım oranı ve kesin tarih iddiası YOK. Hibe oranları
// yalnız "(örnek)" etiketiyle. Bu içerik yalnız demo sunucusunda yüklenir; her kayıt kaynak + tarih + sürüm taşır.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const KAYNAK = 'Örnek veri (demo)';
export const SURUM = 'ornek-icerik-v1';
export const TARIH = '2026-10-25';

/** data/crops_tr.csv satırları (tırnaklı alanları da okur). */
export function readCrops(text) {
  const lines = text.trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const cells = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return { id: cells[0], name: cells[1], grp: cells[3] };
  });
}

/** "Elma, kiraz, armut (örtüsüz; ...)" -> "Elma, kiraz, armut"; "Mısır (tane)" -> "Mısır". */
export function shortName(name) {
  return name.replace(/\s*\(.*\)\s*$/, '').trim();
}

const lower = (s) => s.toLocaleLowerCase('tr-TR');

/** Ürün grubuna göre kelimeler: ağaç/bahçe mi, tarla mı, fide mi. */
function words(grp) {
  switch (grp) {
    case 'meyve-agaci':
      return { yer: 'bahçe', yerde: 'bahçesinde', bitkide: 'ağaçlarında', evre: 'çiçeklenme' };
    case 'tahil':
      return { yer: 'tarla', yerde: 'tarlasında', bitkide: 'bitkilerinde', evre: 'başaklanma' };
    case 'sebze':
      return { yer: 'tarla', yerde: 'tarlasında', bitkide: 'bitkilerinde', evre: 'çiçeklenme' };
    case 'baklagil':
      return { yer: 'tarla', yerde: 'tarlasında', bitkide: 'bitkilerinde', evre: 'çiçeklenme' };
    case 'yem':
      return { yer: 'tarla', yerde: 'tarlasında', bitkide: 'bitkilerinde', evre: 'biçim' };
    default:
      return { yer: 'tarla', yerde: 'tarlasında', bitkide: 'bitkilerinde', evre: 'çiçeklenme' };
  }
}

function zaman(u, grp) {
  const w = words(grp);
  if (grp === 'meyve-agaci') {
    return [
      [`${u} bahçesinde kış budaması`, 'Kuru ve hastalıklı dalları temizleyin.'],
      [`${u} ağaçlarının dibinde toprak işleme`, 'Ağaç diplerini yüzeysel çapalayın.'],
      [`${u} bahçesinde sulama sisteminin kontrolü`, 'Damlatıcı ve boruları tıkanıklığa karşı gözden geçirin.'],
      [`${u} için kaliteyi artırıcı gübreleme`, 'Toprak analizi sonucuna göre gübre planlayın.'],
      [`${u} hasadı için hazırlık`, 'Kasaları, merdiveni ve depolama yerini hazırlayın.'],
    ];
  }
  if (grp === 'sebze') {
    return [
      [`${u} için fide hazırlığı`, 'Sağlıklı ve sertifikalı fide temin edin.'],
      [`${u} fide dikimi`, 'Dikimi serin saatlerde yapıp can suyu verin.'],
      [`${u} tarlasında damla sulama kontrolü`, 'Hatları tıkanıklık ve kaçağa karşı kontrol edin.'],
      [`${u} tarlasında çapalama ve ot temizliği`, 'Bitki diplerini zedelemeden çapalayın.'],
      [`${u} hasadı ve ayıklama`, 'Olgun ürünü serin saatte toplayıp gölgede bekletin.'],
    ];
  }
  return [
    [`${u} ekimi için toprak hazırlığı`, `Toprağı tavında işleyin, ${w.yer} yüzeyini düzleyin.`],
    [`${u} tohum ekimi`, 'Sertifikalı tohum kullanın, ekim derinliğine dikkat edin.'],
    [`${u} tarlasında yabani ot kontrolü`, 'Otları erken dönemde, bitki küçükken temizleyin.'],
    [`${u} için üst gübreleme`, 'Gübre miktarını toprak analizine göre belirleyin.'],
    [`${u} hasadı için hazırlık`, 'Biçerdöver ve depolama yerini önceden ayarlayın.'],
  ];
}

function rehber(u, grp) {
  const w = words(grp);
  const ilk =
    grp === 'meyve-agaci'
      ? [`${u} budamasında dikkat edilecekler`, 'Kesimleri temiz aletle yapın, kalın dal yaralarını kapatın.']
      : [`${u} ekiminde sıra arası ve derinlik`, 'Ekim makinesini ayarlayıp tohumu eşit dağıtın.'];
  return [
    ilk,
    [
      `Toprak analiziyle ${lower(u)} gübre ihtiyacını belirleyin`,
      'Toprak örneğini il/ilçe tarım müdürlüğüne ya da laboratuvara götürün.',
    ],
    [
      `${u} sulamasında sabah ve akşam saatlerini seçin`,
      'Öğle sıcağında su çabuk buharlaşır; toprağın nemini elle kontrol edin.',
    ],
    [
      `${u} ${w.yerde} hastalık ve zararlıyı erken tanıyın`,
      'Yaprakları haftada bir kontrol edin, şüpheli durumda fotoğrafını uzmana gösterin.',
    ],
    [
      'İlaçlama gerekiyorsa uzmana danışın',
      'İlaç seçimi, doz ve karışım için ziraat mühendisine ya da ilçe tarım müdürlüğüne başvurun.',
    ],
  ];
}

function uyari(u, grp) {
  const w = words(grp);
  const don =
    grp === 'sebze'
      ? [`${u} fidelerinde gece soğuğu riski`, 'Açık ve rüzgârsız gecelerde fideleri örtüyle koruyun.']
      : [
          `${u} için ${w.evre} dönemi zirai don riski`,
          'Hava Durumu sayfasındaki gece en düşük sıcaklığını takip edin.',
        ];
  return [
    don,
    [`${u} ${w.yerde} zararlı takibi`, 'Tuzakları ve yaprak altlarını düzenli kontrol edin.'],
    [
      `Sıcak ve kuru günlerde ${lower(u)} için su stresi riski`,
      'Yapraklarda solma görülürse sulama aralığını gözden geçirin.',
    ],
    [
      `Yoğun yağış sonrası ${lower(u)} için mantar hastalığı riski`,
      'Yaprak ve meyvede leke görülürse uzmana danışın.',
    ],
    [
      `Kuvvetli rüzgârda ${lower(u)} ${w.bitkide} zarar`,
      'Destek ve bağlantıları kontrol edin, gevşek örtüleri sabitleyin.',
    ],
  ];
}

function hibe(u) {
  return [
    [
      'Bireysel sulama sistemlerine %50 hibe desteği (örnek)',
      'Damla ve yağmurlama sistemleri için örnek destek kaydı. Güncel şartları il/ilçe tarım müdürlüğünden öğrenin.',
    ],
    [
      `${u} üreticilerine alan bazlı destek (örnek)`,
      'Örnek destek kaydı. ÇKS kaydınızın güncel olması gerekir.',
    ],
    [
      'Tarımsal kalkınma kooperatiflerine kredi desteği (örnek)',
      'Örnek kredi kaydı. Başvuru yeri ve şartları kurumdan teyit edilmelidir.',
    ],
    [
      'Genç çiftçi projelerine hibe desteği (örnek)',
      'Örnek hibe kaydı. Yaş ve proje şartlarını il müdürlüğünden öğrenin.',
    ],
    ['Tarım sigortası prim desteği (örnek)', `${u} için ürün sigortası hakkında örnek destek kaydı.`],
  ];
}

function kartlar(u) {
  return [
    [`${u} üretiminde stratejik konum`, `${u} üretiminin bölge ve ülke içindeki yeri.`],
    [`${u} için gübreleme yöntemleri`, 'Toprak analizine dayalı gübreleme neden önemlidir?'],
    [`Drone ile ${lower(u)} takibi`, 'Drone ile alan gözlemi ve ilaçlama uygulamaları hakkında genel bilgi.'],
    ['İklim krizi gıda krizinin habercisi', `Kuraklık ve sıcak dalgalarının ${lower(u)} üretimine etkisi.`],
    [`${u} üretiminde planlama nasıl olmalı`, 'Ekimden hasada kadar işlerin takvimle planlanması.'],
  ];
}

// Faaliyet ve uyarıların bugünden uzaklığı (gün). Kesin tarih iddiası yok: ekranda gösterilen tarih
// demo gününe göre hesaplanır.
const ZAMAN_GUN = [2, 9, 16, 30, 45];
const REHBER_GUN = [1, 5, 12, 20, 28];
const UYARI_GUN = [0, 3, 6, 10, 14];
const HIBE_GUN = [4, 15, 25, 35, 50];

const rows = (list, days) => list.map(([baslik, ozet], i) => ({ baslik, ozet, gunFarki: days[i] }));

/** Bir ürün için örnek içerik (25 kayıt). */
export function buildContent(crop) {
  const u = shortName(crop.name);
  return {
    urunId: crop.id,
    urunAdi: crop.name,
    kaynak: KAYNAK,
    tarih: TARIH,
    surum: SURUM,
    kartlar: kartlar(u).map(([baslik, ozet], i) => ({ baslik, ozet, gorsel: `kart_${i + 1}.jpg` })),
    faaliyetZamani: rows(zaman(u, crop.grp), ZAMAN_GUN),
    faaliyetRehberi: rows(rehber(u, crop.grp), REHBER_GUN),
    erkenUyarilar: rows(uyari(u, crop.grp), UYARI_GUN),
    destekler: rows(hibe(u), HIBE_GUN),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const crops = readCrops(readFileSync(join(root, 'data', 'crops_tr.csv'), 'utf8'));
  const out = join(root, 'data', 'ornek_icerik');
  mkdirSync(out, { recursive: true });
  for (const c of crops) {
    writeFileSync(join(out, `${c.id}.json`), `${JSON.stringify(buildContent(c), null, 2)}\n`);
  }
  console.log(`ornek_icerik: ${crops.length} ürün yazıldı (${out})`);
}
