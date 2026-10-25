import type { TodayDto } from '../api/client';
import { frostCardModel, waterNeedText, weatherText } from './model';

export interface NotificationRow {
  id: string;
  /** ISO tarih (satırdaki gg/aa/yyyy kutusu). */
  date: string;
  title: string;
  tone: 'normal' | 'warning';
}

/**
 * Bildirimler sekmesi satırları. Yalnız sunucunun ürettiği olgulardan türetilir; uzman onayı olmayan
 * veri uyarı satırı üretmez (değişmez kural 1) ve satır olarak da gösterilmez.
 */
export function buildNotifications(today: TodayDto): NotificationRow[] {
  const date = today.generatedAt;
  const rows: NotificationRow[] = [];
  const frost = frostCardModel(today.frost);
  // Onaysız bilgi satırı çiftçiye hiç gösterilmez (ne uyarı ne "onay bekliyor" yazısı).
  if (frost.kind !== 'pending' && frost.kind !== 'unavailable') {
    rows.push({
      id: 'don',
      date,
      title: frost.title,
      tone: frost.kind === 'warning' || frost.kind === 'watch' ? 'warning' : 'normal',
    });
  }
  const water = waterNeedText(today.waterNeed);
  if (water) {
    rows.push({ id: 'su', date, title: `Bitkinin bugünkü su ihtiyacı ${water}`, tone: 'normal' });
  }
  rows.push({
    id: 'hava',
    date,
    title: weatherText(today.weather.current?.weatherCode),
    tone: 'normal',
  });
  const d = today.weather.today;
  rows.push({
    id: 'sicaklik',
    date,
    title: `En düşük ${Math.round(d.tMinC)}°, en yüksek ${Math.round(d.tMaxC)}°`,
    tone: 'normal',
  });
  if (d.precipMm !== null && d.precipMm > 0) {
    rows.push({
      id: 'yagis',
      date,
      title: `Bahçenizin bulunduğu konumda yağış var (${d.precipMm.toLocaleString('tr-TR', {
        maximumFractionDigits: 1,
      })} mm)`,
      tone: 'normal',
    });
  }
  rows.push({
    id: 'et0',
    date,
    title: `Bitkilerin su kaybı bugün ${today.et0.mmPerDay.toLocaleString('tr-TR', {
      maximumFractionDigits: 1,
    })} mm/gün (referans)`,
    tone: 'normal',
  });
  return rows;
}
