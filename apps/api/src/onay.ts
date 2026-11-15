import { systemTx, type Db } from './db/db';

/**
 * Uzman onayı politikası (G36, 15.11.2026, Mustafa'nın kararı).
 *
 * Şu an sistemde görevli uzman yok; uzman kadrosu, uygulama Türkiye çapında kullanıma açılırsa kurulacak.
 * O güne kadar "uzman onayı bekliyor" aşaması KAPALIDIR: resmî siteden alınan haber, kaynaklı (FAO-56 vb.)
 * katsayı ve kurum duyurusu doğrudan yayına girer. Kaynak + tarih + sürüm her kayıtta yine saklanır (kural 6)
 * ve yapay zekâ ilaç dozu üretmez (kural 2); bunlar değişmedi.
 *
 * Onay düzeneği (sütunlar, onay/ret/geri çekme uçları, kapsam denetimi) yerinde durur. Uzman kadrosu
 * kurulunca `UZMAN_ONAYI=1` yazmak yeter: yeni kayıtlar yine taslak başlar ve onay kuyruğuna düşer.
 */
export type OnayDurumu = 'taslak-uzman-onayi-bekliyor' | 'uzman-onayli';

export const TASLAK: OnayDurumu = 'taslak-uzman-onayi-bekliyor';
export const YAYINDA: OnayDurumu = 'uzman-onayli';

export function onayZorunlu(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['UZMAN_ONAYI'] === '1';
}

/** Yeni kaydın başlangıç durumu: onay kapalıyken doğrudan yayında. */
export function yeniKayitDurumu(env: NodeJS.ProcessEnv = process.env): OnayDurumu {
  return onayZorunlu(env) ? TASLAK : YAYINDA;
}

/**
 * Kaynaklı ama veritabanında kaydı olmayan değerlerin (FAO-56 tablo değeri, resmî plan satırı) etkin durumu:
 * onay kapalıyken yayında sayılır. "reddedildi" ve onaylı durumlar olduğu gibi kalır.
 */
export function etkinDurum<T extends string>(durum: T, env: NodeJS.ProcessEnv = process.env): T {
  return (durum === TASLAK && !onayZorunlu(env) ? YAYINDA : durum) as T;
}

/** Onay durumu taşıyan tablolar (reddedilen kayıtlara dokunulmaz). */
export const ONAY_TABLOLARI = [
  'announcements',
  'crop_pack_versions',
  'crop_stages',
  'calendar_templates',
  'soil_types',
  'crop_water_params',
  'suitability_factors',
  'supports',
  'library_documents',
] as const;

/**
 * Onay kapalıyken bekleyen bütün taslakları yayına alır (açılışta ve tohumlardan sonra çağrılır).
 * Onay açıkken hiçbir şey yapmaz. Dönen değer: yayına alınan kayıt sayısı.
 */
export async function bekleyenleriYayinla(
  db: Db,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  if (onayZorunlu(env)) return 0;
  let n = 0;
  await systemTx(db, async (q) => {
    for (const t of ONAY_TABLOLARI) {
      const rows = await q.query(
        `UPDATE ${t} SET review_status = '${YAYINDA}' WHERE review_status = '${TASLAK}' RETURNING 1`,
      );
      n += rows.length;
    }
  });
  return n;
}
