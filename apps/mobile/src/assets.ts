/* eslint-disable @typescript-eslint/no-require-imports -- Metro görselleri durağan require ile paketler */
/** images/ klasöründeki görseller. Yeni yuva: images/manifest.json + buraya satır + `pnpm run images`. */
export const IMAGE_FILES = {
  'amblem.png': require('../assets/images/amblem.png'),
  'ciftci.png': require('../assets/images/ciftci.png'),
  'ikon_arazilerim.png': require('../assets/images/ikon_arazilerim.png'),
  'ikon_arazi_islemleri.png': require('../assets/images/ikon_arazi_islemleri.png'),
  'ikon_verim_haritasi.png': require('../assets/images/ikon_verim_haritasi.png'),
  'ikon_hava.png': require('../assets/images/ikon_hava.png'),
  'ikon_uzman.png': require('../assets/images/ikon_uzman.png'),
  'ikon_bildirim.png': require('../assets/images/ikon_bildirim.png'),
  'ikon_ayarlar.png': require('../assets/images/ikon_ayarlar.png'),
  'kart_1.jpg': require('../assets/images/kart_1.jpg'),
  'kart_2.jpg': require('../assets/images/kart_2.jpg'),
  'kart_3.jpg': require('../assets/images/kart_3.jpg'),
  'kart_4.jpg': require('../assets/images/kart_4.jpg'),
  'kart_5.jpg': require('../assets/images/kart_5.jpg'),
  'urun_1.jpg': require('../assets/images/urun_1.jpg'),
  'urun_2.jpg': require('../assets/images/urun_2.jpg'),
  'urun_3.jpg': require('../assets/images/urun_3.jpg'),
  'urun_4.jpg': require('../assets/images/urun_4.jpg'),
  'urun_5.jpg': require('../assets/images/urun_5.jpg'),
  'urun_6.jpg': require('../assets/images/urun_6.jpg'),
} as const;

export type ImageName = keyof typeof IMAGE_FILES;
