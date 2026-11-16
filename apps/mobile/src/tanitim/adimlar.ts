/**
 * Sayfa tanıtımları: her sayfa için adım adım anlatım. `hedef` verilirse o düğme/kutu ışıklandırılır ve
 * okla gösterilir (kimlik, ilgili bileşende `hedefRef('...')` ile bağlanır); verilmezse açıklama ortada durur.
 * Ekranda o an bulunmayan hedefin adımı atlanır (ör. tarla yokken tarla listesi). Dil: çiftçi dili, kısa cümle.
 * Her hedef kimliğinin kodda bağlı olduğu `adimlar.test.ts` ile denetlenir.
 */
export interface TanitimAdimi {
  /** hedefRef kimliği; yoksa ortada genel açıklama. */
  hedef?: string;
  baslik: string;
  metin: string;
}

/** Yol → sayfa anahtarı ("/", "/hava", "/tarla-ekle/koy"). */
export function sayfaAnahtari(yol: string): string {
  const y = (yol || '/').split('?')[0]!.replace(/\/+$/, '');
  if (y === '' || y === '/index') return '/';
  return y;
}

const GERI: TanitimAdimi = {
  hedef: 'ortak.geri',
  baslik: 'Geri düğmesi',
  metin: 'Bir önceki sayfaya döner. Telefonun kendi geri tuşu da aynı işi yapar.',
};

const AMPUL: TanitimAdimi = {
  hedef: 'ortak.yardim',
  baslik: 'Mavi ampul',
  metin: 'Bu sayfayı yeniden anlatmamı istersen mavi ampule dokun.',
};

const ALT_CUBUK: TanitimAdimi[] = [
  {
    hedef: 'alt.ana',
    baslik: 'Ana sayfa düğmesi',
    metin: 'Hangi sayfada olursan ol, bu düğme seni ana sayfaya geri getirir.',
  },
  {
    hedef: 'alt.ikiz',
    baslik: 'İkiz Tarım',
    metin:
      'Tarlanın sanal ikizi. Toprakta ne kadar su kaldığını ve sulamazsan ne olacağını gösterir.',
  },
  {
    hedef: 'alt.yz',
    baslik: 'Yapay zekâ: Nuvia',
    metin:
      'Yeşil robot Nuvia. Yazarak ya da konuşarak sorarsın; cevap verir, seni doğru sayfaya götürür.',
  },
  {
    hedef: 'alt.hava',
    baslik: 'Hava',
    metin: 'Tarlanın havasına tek dokunuşla geçersin: sıcaklık, yağış, rüzgâr, don.',
  },
  {
    hedef: 'alt.neeksem',
    baslik: 'Ne Eksem?',
    metin:
      'Türkiye’de hangi ürün az, hangisi fazla üretiliyor; tarlana ne ekmek mantıklı, buradan bakarsın.',
  },
];

const ADIMLAR: Record<string, TanitimAdimi[]> = {
  '/': [
    {
      baslik: 'Ana sayfan',
      metin:
        'Tarlanla ilgili her şey bu sayfada toplanır. Düğmeleri sırayla gösteriyorum; ekrana her dokunuşunda bir sonrakine geçerim.',
    },
    {
      hedef: 'ana.ikon.arazilerim',
      baslik: 'Arazilerim',
      metin: 'Kayıtlı tarlalarını listede ve haritada görürsün.',
    },
    {
      hedef: 'ana.ikon.arazi-islemleri',
      baslik: 'Arazi İşlemleri',
      metin:
        'Yeni tarla eklersin; tarlanın adını, ürününü, büyüklüğünü değiştirirsin. Takvim, sulama ve uydu araçları da burada.',
    },
    {
      hedef: 'ana.ikon.verim-haritasi',
      baslik: 'Verim Haritası',
      metin: 'Bölgende hangi ürünler yetişiyor, verim ne durumda; buradan bakarsın.',
    },
    {
      hedef: 'ana.ikon.hava',
      baslik: 'Hava Durumu',
      metin: 'Tarlanın bulunduğu yerin bugünkü ve önümüzdeki günlerin havası.',
    },
    {
      hedef: 'ana.ikon.uzman',
      baslik: 'Uzman Desteği',
      metin:
        'Sorunu yazarsın ya da hasta yaprağın fotoğrafını çekersin. Cevap gelince telefonuna bildirim düşer.',
    },
    {
      hedef: 'ana.ikon.bildirim',
      baslik: 'Bildirimler',
      metin:
        'Don, sulama ve haber bildirimleri burada. Üstündeki kırmızı sayı okumadıklarını gösterir.',
    },
    {
      hedef: 'ana.ikon.menu',
      baslik: 'Menü',
      metin:
        'Bütün sayfaların listesi: takvim, pazar fiyatları, sulama, cihazlar, ayarlar. Aradığını bulamazsan buraya bak.',
    },
    {
      hedef: 'ortak.yardim',
      baslik: 'Mavi ampul',
      metin:
        'Bir sayfayı anlamazsan bu mavi ampule dokun. O sayfayı sana baştan, düğme düğme anlatırım.',
    },
    {
      hedef: 'ana.kartlar',
      baslik: 'Haber şeridi',
      metin:
        'İl ve ilçe tarım müdürlüklerinin, TÜİK’in ve diğer resmî kurumların haberleri. Bir karta dokununca haberin tamamı açılır.',
    },
    {
      hedef: 'ana.arazi',
      baslik: 'Seçili tarlan',
      metin:
        'Şu an hangi tarlaya baktığını gösterir. Dokunursan başka tarlana geçersin ya da yeni tarla eklersin.',
    },
    {
      hedef: 'ana.don',
      baslik: 'Bu gece don kartı',
      metin:
        'Bu gece don bekleniyorsa saat saat burada görünür. “Neler yapabilirim?” yazısına dokunursan alınacak önlemleri okursun.',
    },
    {
      hedef: 'ana.sekmeler',
      baslik: 'Beş sekme',
      metin:
        'Faaliyet Zamanı: yapılacak işler ve başvuru son günleri. Faaliyet Rehberi: bilgilendirmeler. Erken Uyarılar: don, yağış, sıcak. Hibe ve Destekler: başvurular. Hepsi: tümü bir arada.',
    },
    {
      hedef: 'ana.satir',
      baslik: 'Liste satırı',
      metin:
        'Solda tarih, sağda konu yazar. Satıra dokununca ayrıntısı ve bilginin kaynağı açılır.',
    },
    {
      hedef: 'ana.tarla-ekle',
      baslik: 'İlk tarlanı ekle',
      metin:
        'Henüz tarlan yok. Bu düğmeyle tarlanı ekle; hava, haber ve uyarılar ona göre dolacak.',
    },
    ...ALT_CUBUK,
  ],

  '/ikiz-tarim': [
    {
      baslik: 'İkiz Tarım',
      metin:
        'Burası tarlanın bilgisayardaki ikizi. Hava, toprak ve senin kayıtlarınla toprağındaki suyu her gün hesaplar; “şunu yapsam ne olur” sorusunu denemene yarar.',
    },
    {
      hedef: 'ikiz.tarla',
      baslik: 'Hangi tarla',
      metin: 'Hesabın hangi tarlan için yapıldığı burada yazar.',
    },
    {
      hedef: 'ikiz.durum',
      baslik: 'Bugünkü durum',
      metin:
        'Toprağındaki suyun bugünkü hali. Yeşil çubuk doluluğu gösterir; altındaki sarı yazı bugün için söylenecek en önemli cümledir.',
    },
    {
      hedef: 'ikiz.ozet',
      baslik: 'Üç sayı',
      metin:
        'Kökün tutabildiği su, bitkinin sıkılmadan dayandığı sınır ve mevsimin sıcaklık birikimi.',
    },
    {
      hedef: 'ikiz.zaman',
      baslik: 'Zaman çizgisi',
      metin:
        'Solda geçen 14 gün, sağda önümüzdeki 16 gün. Çizgi aşağı indikçe toprak kurur. Mavi nokta sulamadır.',
    },
    {
      hedef: 'ikiz.senaryo',
      baslik: 'Ya şunu yaparsam?',
      metin:
        'Her kutu bir seçenek: şimdi sula, birkaç gün bekle, hiç sulama. Birine dokun; ne kadar su gider, bitki kaç gün sıkılır, verim nasıl etkilenir, görürsün.',
    },
    {
      hedef: 'ikiz.kayit',
      baslik: 'Kayıt ekle',
      metin:
        'Suladıysan ya da tarlanda yağış ölçtüysen buraya yaz. Sen yazdıkça ikiz gerçeğe yaklaşır.',
    },
    {
      hedef: 'ikiz.toprak',
      baslik: 'Toprağını seç',
      metin: 'Toprağın kumlu mu, tınlı mı, killi mi? Doğrusunu seçersen hesap da doğru olur.',
    },
    {
      hedef: 'ikiz.karne',
      baslik: 'Tahmin karnesi',
      metin: 'İkizin geçmiş tahminleri ne kadar tuttu, burada dürüstçe yazar.',
    },
    {
      hedef: 'ikiz.neden',
      baslik: 'Neden? Nasıl hesaplandı?',
      metin: 'Hesabın yöntemini ve hangi kaynaklara dayandığını açar.',
    },
    {
      hedef: 'ikiz.arazi-sec',
      baslik: 'Başka arazi seç',
      metin: 'Birden çok tarlan varsa bu düğmeyle sıradaki tarlanın ikizine geçersin.',
    },
    AMPUL,
  ],

  '/ne-eksem': [
    {
      baslik: 'Ne Eksem?',
      metin:
        'Türkiye’nin hangi üründe açığı, hangisinde fazlası var; bölgenin resmî planında ne yazıyor. Bu sayfa ikisini birleştirip sana bir sıralama çıkarır. Karar yine senindir.',
    },
    {
      hedef: 'neeksem.tarla',
      baslik: 'Hangi tarla için?',
      metin: 'Sıralama tarlanın ilçesine göre yapılır. Başka tarlan varsa buradan seçersin.',
    },
    {
      hedef: 'neeksem.ozet',
      baslik: 'Özet',
      metin: 'Bölgende açığı en yüksek görünen ürün ve hesabın güven düzeyi burada yazar.',
    },
    {
      hedef: 'neeksem.halka',
      baslik: 'İlk üç ürün',
      metin: 'Halka, ilk üç ürünün sıralama puanındaki payını gösterir.',
    },
    {
      hedef: 'neeksem.urun',
      baslik: 'Ürün kartı',
      metin:
        'Çubuk sola kayıksa ülkede o üründen açık, sağa kayıksa fazla var. Karta dokununca neden bu sırada olduğunu ve kaynağını okursun.',
    },
    {
      hedef: 'neeksem.tablo',
      baslik: 'Sıralamanın devamı',
      metin: 'Dördüncüden sonraki ürünler. “Hepsini göster” ile listenin tamamı açılır.',
    },
    {
      hedef: 'neeksem.kisitli',
      baslik: 'Kısıtlı ürünler',
      metin:
        'Ülkede fazlası olan bazı meyvelerde yeni bahçe kurmak izne bağlıdır. Dikmeden önce tarım müdürlüğüne sor.',
    },
    {
      hedef: 'neeksem.niyet',
      baslik: 'Ekim niyeti',
      metin:
        'Hangi ürüne kaç dekar ayırmayı düşündüğünü yazarsın. Adın görünmez; yalnız bölge toplamı gösterilir, böylece herkes aynı ürüne yığılmaz.',
    },
    {
      hedef: 'neeksem.neden',
      baslik: 'Neden? Nasıl hesaplandı?',
      metin: 'Sıralamanın hesabını ve dayandığı resmî kaynakları açar.',
    },
    AMPUL,
  ],

  '/hava': [
    {
      baslik: 'Hava Durumu',
      metin: 'Bu sayfa şehrin değil, tarlanın tam bulunduğu yerin havasını gösterir.',
    },
    {
      hedef: 'hava.ozet',
      baslik: 'Şu anki hava',
      metin: 'Tarlanın adı, şu anki sıcaklık ve bugünün en düşük ve en yüksek sıcaklığı.',
    },
    {
      hedef: 'hava.simdi',
      baslik: 'Ayrıntılar',
      metin:
        'Hissedilen sıcaklık, nem, rüzgâr ve yağış. İlaçlama ve sulama için rüzgâra ve yağışa bak.',
    },
    {
      hedef: 'hava.tahmin',
      baslik: 'Önümüzdeki günler',
      metin: 'Her kutu bir gün. Sağa kaydırırsan haftanın kalanını görürsün.',
    },
    {
      hedef: 'hava.don',
      baslik: 'Don durumu',
      metin: 'Bu gece don tehlikesi var mı, burada yazar.',
    },
    {
      hedef: 'hava.don7',
      baslik: 'Gelecek 7 gece',
      metin: 'Önümüzdeki yedi gecenin en düşük sıcaklığı ve don ihtimali.',
    },
    {
      hedef: 'hava.su',
      baslik: 'Günlük su kaybı',
      metin: 'Bugün toprağın ve bitkinin havaya verdiği su. Sayı büyükse toprak çabuk kurur.',
    },
    GERI,
    AMPUL,
  ],

  '/yapay-zeka': [
    {
      baslik: 'Nuvia ile sohbet',
      metin:
        'Nuvia, Tarım Pusula’nın yapay zekâsı. Tarlanın havasını, suyunu, haberlerini bilir. Sorarsın, cevap verir; gerekirse seni doğru sayfaya götürür.',
    },
    {
      hedef: 'yz.robot',
      baslik: 'Nuvia',
      metin:
        'Sohbet boşken burada seni bekler. Soru sorduğunda cevabı balonla yazar ve sesli okur.',
    },
    {
      hedef: 'yz.hazir',
      baslik: 'Hazır sorular',
      metin: 'Ne yazacağını bilmiyorsan bunlardan birine dokun; soru senin yerine gönderilir.',
    },
    {
      hedef: 'yz.giris',
      baslik: 'Yazı kutusu',
      metin: 'Sorunu buraya yazarsın. Yazınca sağda gönder düğmesi belirir.',
    },
    {
      hedef: 'yz.kamera',
      baslik: 'Fotoğraf çek',
      metin: 'Hasta yaprağın ya da meyvenin fotoğrafını çekip Nuvia’ya gösterirsin.',
    },
    {
      hedef: 'yz.galeri',
      baslik: 'Galeriden seç',
      metin: 'Telefonunda kayıtlı bir fotoğrafı gönderirsin.',
    },
    {
      hedef: 'yz.ses',
      baslik: 'Sesle sor',
      metin: 'Yazmak istemezsen mikrofona dokun ve konuş. Söylediğin yazıya çevrilir.',
    },
    {
      hedef: 'yz.gecmis',
      baslik: 'Geçmiş sohbetler',
      metin: 'Eski konuşmaların telefonunda saklanır; buradan yeniden açarsın.',
    },
    {
      hedef: 'yz.yeni',
      baslik: 'Yeni sohbet',
      metin: 'Konuyu değiştireceksen temiz bir sohbet başlatırsın.',
    },
    {
      hedef: 'yz.uyari',
      baslik: 'Önemli not',
      metin:
        'Nuvia ilaç dozu ve karışım oranı vermez. İlaç için etiketi ve tarım müdürlüğünü esas al.',
    },
  ],

  '/tarlalarim': [
    {
      baslik: 'Arazilerim',
      metin:
        'Kayıtlı bütün tarlaların burada. Her tarla için uyduya, takvime ve sulamaya buradan geçersin.',
    },
    {
      hedef: 'tarla.ozet',
      baslik: 'Özet',
      metin: 'Kaç tarlan var, toplam kaç dekar, kaç cihazın bağlı.',
    },
    {
      hedef: 'tarla.gorunum',
      baslik: 'Liste ya da harita',
      metin: 'Tarlalarını alt alta liste olarak ya da harita üstünde görürsün.',
    },
    {
      hedef: 'tarla.ara',
      baslik: 'Tarla ara',
      metin: 'Tarlan çoksa adını yazıp hemen bulursun.',
    },
    {
      hedef: 'tarla.kart',
      baslik: 'Tarla kartı',
      metin:
        'Tarlanın adı, yeri, ürünü ve büyüklüğü. “Uydudan bak” yeşilliği, “Takvim” yapılacak işleri açar.',
    },
    {
      hedef: 'tarla.guncelle',
      baslik: 'Bilgileri güncelle',
      metin: 'Tarlanın adını, ürününü ya da büyüklüğünü değiştirirsin.',
    },
    {
      hedef: 'tarla.ekle',
      baslik: 'Tarla ekle',
      metin: 'Yeni bir tarla eklemek için bu düğmeye basarsın.',
    },
    GERI,
    AMPUL,
  ],

  '/arazi-islemleri': [
    {
      baslik: 'Arazi İşlemleri',
      metin: 'Tarlanla ilgili bütün işler tek sayfada: ekle, güncelle, sil ve araçlar.',
    },
    {
      hedef: 'hub.arazi',
      baslik: 'Seçili tarla',
      metin: 'Aşağıdaki işlemler bu tarla için yapılır.',
    },
    {
      hedef: 'hub.ekle',
      baslik: 'Yeni arazi ekle',
      metin: 'Tarlanın yerini ve ürününü seçerek yeni tarla eklersin.',
    },
    {
      hedef: 'hub.guncelle',
      baslik: 'Araziyi güncelle',
      metin: 'Adını, büyüklüğünü, ürününü değiştirirsin.',
    },
    {
      hedef: 'hub.sil',
      baslik: 'Araziyi sil',
      metin: 'Tarlayı hesabından kaldırır. Silmeden önce sana bir kez daha sorar.',
    },
    {
      hedef: 'hub.araclar',
      baslik: 'Araçlar',
      metin:
        'Takvim, üretim planı, uydudan yeşillik, sulama, tasarruf raporu ve cihazlar. Her kart kendi sayfasını açar.',
    },
    GERI,
    AMPUL,
  ],

  '/takvim': [
    {
      baslik: 'Tarla takvimi',
      metin: 'Ürününe göre yapılacak işler ve kendi notların ay ay bu sayfada durur.',
    },
    {
      hedef: 'takvim.tarla',
      baslik: 'Hangi tarla',
      metin: 'Takvim bu tarlanın ürününe göre hazırlanır.',
    },
    {
      hedef: 'takvim.ay',
      baslik: 'Ay görünümü',
      metin:
        'Bir güne dokunursan o günün işlerini görür, kendi notunu eklersin. Not eklediğin gün ve 1-2 gün öncesinde bildirim gelir.',
    },
    {
      hedef: 'takvim.telefon',
      baslik: 'Telefon takvimine ekle',
      metin: 'İşleri telefonunun kendi takvimine aktarır; alarmı telefonun çalar.',
    },
    {
      hedef: 'takvim.paylas',
      baslik: 'Takvimi paylaş',
      metin: 'Takvimi dosya olarak ailene ya da ortağına gönderirsin.',
    },
    { hedef: 'takvim.simdi', baslik: 'Şimdi', metin: 'Bugünlerde yapılması gereken işler.' },
    {
      hedef: 'takvim.yaklasan',
      baslik: 'Yaklaşan',
      metin: 'Önümüzdeki haftalarda sırası gelecek işler.',
    },
    {
      hedef: 'takvim.sonraki',
      baslik: 'Başka tarla',
      metin: 'Sıradaki tarlanın takvimine geçersin.',
    },
    AMPUL,
  ],

  '/pazar': [
    {
      baslik: 'Pazar fiyatları',
      metin: 'Ürününün hal ve borsa fiyatları. Nerede satarsan eline ne geçer, karşılaştırırsın.',
    },
    { hedef: 'pazar.urun', baslik: 'Ürün seç', metin: 'Fiyatını görmek istediğin ürüne dokun.' },
    {
      hedef: 'pazar.yer',
      baslik: 'Satış yeri',
      metin: 'Kendi ilini ya da başka bir hali seçip fiyatını görürsün.',
    },
    {
      hedef: 'pazar.fiyat',
      baslik: 'Fiyat kartı',
      metin:
        'Kilogram fiyatı, en düşük ve en yüksek aralığı, fiyatın yönü ve altında bilginin kaynağı yazar.',
    },
    {
      hedef: 'pazar.yerler',
      baslik: 'Nerede satsam?',
      metin:
        'Yakındaki satış yerleri. Yol masrafı düşülünce eline geçecek tahmini parayı ve yol tarifini verir.',
    },
    {
      hedef: 'pazar.guncelleme',
      baslik: 'Son güncelleme',
      metin: 'Fiyatların en son ne zaman alındığını gösterir.',
    },
    GERI,
    AMPUL,
  ],

  '/bildirimler': [
    {
      baslik: 'Bildirimler',
      metin: 'Tarlanla ilgili uyarılar, haberler ve uzman cevapları burada toplanır.',
    },
    {
      hedef: 'bildirim.ozet',
      baslik: 'Okunmamışlar',
      metin: 'Kaç bildirimi henüz okumadığını gösterir.',
    },
    {
      hedef: 'bildirim.hepsi',
      baslik: 'Hepsini okundu say',
      metin: 'Tek dokunuşla bütün bildirimleri okunmuş sayar.',
    },
    {
      hedef: 'bildirim.liste',
      baslik: 'Bildirim listesi',
      metin:
        'Bir bildirime dokununca ilgili sayfa açılır: don ise hava, haber ise haberin kendisi.',
    },
    GERI,
    AMPUL,
  ],

  '/sulama': [
    {
      baslik: 'Sulama',
      metin: 'Tarlandaki akıllı vanayı buradan açıp kapatırsın. Vana senden habersiz hiç açılmaz.',
    },
    {
      hedef: 'sulama.yok',
      baslik: 'Cihaz bağlı değil',
      metin: 'Uzaktan sulama için tarlanda bağlı bir vana cihazı gerekir. Buradan cihaz eklersin.',
    },
    {
      hedef: 'sulama.durum',
      baslik: 'Vana durumu',
      metin: 'Vana şu an açık mı kapalı mı, kaç dakika kaldı.',
    },
    {
      hedef: 'sulama.oneri',
      baslik: 'Su ihtiyacı',
      metin: 'Tarlanın bugünkü su ihtiyacı. Sulamaya karar verirken buna bak.',
    },
    { hedef: 'sulama.kip', baslik: 'Elle ya da otomatik', metin: 'Şu an sulama elle başlatılır.' },
    {
      hedef: 'sulama.kayit',
      baslik: 'Kayıt',
      metin: 'Her açma ve kapama kayda geçer; kim, ne zaman açtı sonradan görülür.',
    },
    {
      hedef: 'sulama.baslat',
      baslik: 'Sulamayı başlat',
      metin: 'Süreyi seçip onaylarsın. Vana en çok 30 dakika açık kalır, sonra kendi kapanır.',
    },
    AMPUL,
  ],

  '/soru-sor': [
    {
      baslik: 'Uzman Desteği',
      metin:
        'Tarlanda bir sorun görürsen buradan sorarsın. Soru, tarlanın bulunduğu bölgenin yetkilisine gider.',
    },
    {
      hedef: 'soru.ust',
      baslik: 'Nasıl çalışır',
      metin: 'Soruyu sen sorarsın; cevap gelince bildirim alırsın.',
    },
    {
      hedef: 'soru.arazi',
      baslik: 'Hangi tarla için?',
      metin: 'Sorunun hangi tarlayla ilgili olduğunu seç; soru o bölgeye yönlendirilir.',
    },
    { hedef: 'soru.ses', baslik: 'Sesle sor', metin: 'Konuşursun, söylediğin yazıya çevrilir.' },
    {
      hedef: 'soru.foto',
      baslik: 'Fotoğrafla sor',
      metin: 'Hasta yaprağın ya da zararlının fotoğrafını çekip gönderirsin.',
    },
    { hedef: 'soru.yazarak', baslik: 'Yazarak sor', metin: 'Sorunu kendi cümlelerinle yazarsın.' },
    {
      hedef: 'soru.sik',
      baslik: 'Sık sorulanlar',
      metin: 'Bunlardan birine dokunursan soru hemen gönderilir.',
    },
    {
      hedef: 'soru.sorularim',
      baslik: 'Sorularım',
      metin: 'Daha önce sorduğun sorular ve gelen cevaplar.',
    },
    GERI,
    AMPUL,
  ],

  '/sorularim': [
    { baslik: 'Sorularım', metin: 'Sorduğun bütün sorular ve cevapları burada durur.' },
    {
      hedef: 'sorularim.liste',
      baslik: 'Soru listesi',
      metin:
        'Her kartta sorun, durumu ve geldiyse cevabı yazar. Cevap gecikirse Nuvia geçici bir bilgi notu bırakır.',
    },
    GERI,
    AMPUL,
  ],

  '/ayarlar': [
    { baslik: 'Ayarlar', metin: 'Uygulamayı kendine göre ayarladığın sayfa.' },
    {
      hedef: 'ayar.cuzdan',
      baslik: 'Veri cüzdanım',
      metin: 'Hakkında hangi verilerin tutulduğunu görür, indirir ya da hesabını silersin.',
    },
    {
      hedef: 'ayar.cks',
      baslik: 'ÇKS bağlantısı',
      metin: 'Resmî çiftçi kayıt bilgilerinle bağlantı durumu.',
    },
    {
      hedef: 'ayar.hatirlatici',
      baslik: 'Hatırlatıcılar',
      metin: 'Don ve sulama için hangi durumda, saat kaçta bildirim almak istediğini seçersin.',
    },
    {
      hedef: 'ayar.kaynak',
      baslik: 'Resmî kaynaklar',
      metin: 'Haberlerin hangi resmî sitelerden alındığını tek tek görürsün.',
    },
    {
      hedef: 'ayar.ses',
      baslik: 'Sesli rehber',
      metin: 'Ekrandaki bilgilerin sesli okunmasını açıp kapatırsın.',
    },
    {
      hedef: 'ayar.guncelle',
      baslik: 'Güncellemeleri denetle',
      metin: 'Uygulamanın yeni sürümü var mı diye bakar; varsa hemen kurar.',
    },
    { hedef: 'ayar.yazi', baslik: 'Yazı boyutu', metin: 'Yazılar küçük geliyorsa “Büyük”ü seç.' },
    {
      hedef: 'ayar.tanitim',
      baslik: 'Tanıtımı baştan göster',
      metin: 'Karşılama kartını ve bütün sayfa anlatımlarını ilk günkü gibi yeniden açar.',
    },
    {
      hedef: 'ayar.cikis',
      baslik: 'Çıkış yap',
      metin: 'Hesabından çıkar. Verilerin silinmez; yeniden girince durur.',
    },
    GERI,
    AMPUL,
  ],

  '/ndvi': [
    {
      baslik: 'Uydudan yeşillik',
      metin:
        'Uydu, tarlanın üstünden yaklaşık 5 günde bir geçer ve bitkinin ne kadar yeşil olduğunu ölçer.',
    },
    {
      hedef: 'ndvi.tarla',
      baslik: 'Hangi tarla',
      metin: 'Ölçüm bu tarlanın bulunduğu yer için yapılır.',
    },
    {
      hedef: 'ndvi.duzey',
      baslik: 'Yeşillik düzeyi',
      metin: 'Tarlanın şu anki yeşilliği: zayıf, orta ya da güçlü.',
    },
    {
      hedef: 'ndvi.grafik',
      baslik: 'Zaman grafiği',
      metin:
        'Yeşilliğin haftalar içindeki gidişi. Çizgi düşüyorsa tarlaya gidip bakmakta fayda var.',
    },
    { hedef: 'ndvi.son', baslik: 'Son ölçüm', metin: 'En son uydu ölçümünün tarihi ve değeri.' },
    {
      hedef: 'ndvi.nasil',
      baslik: 'Nasıl okunur?',
      metin: 'Sayıların ne anlama geldiği burada anlatılır.',
    },
    AMPUL,
  ],

  '/tasarruf': [
    {
      baslik: 'Tasarruf raporu',
      metin:
        'Alışkanlıkla sulamak yerine ihtiyaca göre sularsan ne kadar su ve para kazanırsın, bu sayfa hesaplar.',
    },
    {
      hedef: 'tasarruf.sonuc',
      baslik: 'Sonuç',
      metin: 'Tasarruf edilen su, yakıt ve tahmini para. Hesabın varsayımları altında yazar.',
    },
    GERI,
    AMPUL,
  ],

  '/verim-haritasi': [
    {
      baslik: 'Verim Haritası',
      metin: 'Bölgende yaygın yetişen ürünler ve verim karşılaştırmaları.',
    },
    {
      hedef: 'verim.urunler',
      baslik: 'Bölgenin ürünleri',
      metin: 'Tarlanın bulunduğu bölgede yaygın yetişen ürünler.',
    },
    {
      hedef: 'verim.bugday',
      baslik: 'Verim karşılaştırması',
      metin: 'TÜİK verisine göre dekar başına verim.',
    },
    GERI,
    AMPUL,
  ],

  '/uretim-plani': [
    {
      baslik: 'Üretim planı',
      metin: 'Ürününün ekimden hasada yapılacak işleri sırasıyla burada görünür.',
    },
    {
      hedef: 'plan.is',
      baslik: 'İş kartı',
      metin: 'İşin adı, yapılacağı tarih aralığı ve kısa açıklaması.',
    },
    GERI,
    AMPUL,
  ],

  '/cihazlar': [
    { baslik: 'Cihazlarım', metin: 'Tarlana bağlı vana ve sensörler burada listelenir.' },
    { hedef: 'cihaz.arazi', baslik: 'Hangi tarla', metin: 'Cihazlar bu tarlaya bağlıdır.' },
    { hedef: 'cihaz.kart', baslik: 'Cihaz kartı', metin: 'Cihazın adı, türü ve bağlantı durumu.' },
    { hedef: 'cihaz.ekle', baslik: 'Cihaz ekle', metin: 'Yeni bir vana ya da sensör bağlarsın.' },
    GERI,
    AMPUL,
  ],

  '/cihaz-ekle': [
    {
      baslik: 'Cihaz ekle',
      metin: 'Tarlana yeni bir vana ya da sensör bağlamak için üç bilgi yeter.',
    },
    {
      hedef: 'cihazekle.arazi',
      baslik: 'Hangi tarla',
      metin: 'Cihazın takılı olduğu tarlayı seç.',
    },
    {
      hedef: 'cihazekle.ad',
      baslik: 'Cihazın adı',
      metin: 'Tanıyacağın bir ad ver: “Üst bahçe vanası” gibi.',
    },
    {
      hedef: 'cihazekle.kod',
      baslik: 'Eşleştirme kodu',
      metin: 'Cihazın üstünde yazan kodu buraya yaz.',
    },
    { hedef: 'cihazekle.kaydet', baslik: 'Kaydet', metin: 'Cihazı tarlana bağlar.' },
    GERI,
    AMPUL,
  ],

  '/hatirlaticilar': [
    {
      baslik: 'Hatırlatıcılar',
      metin: 'Hangi durumda ve saat kaçta bildirim almak istediğini sen belirlersin.',
    },
    {
      hedef: 'hat.esik',
      baslik: 'Sıcaklık sınırı',
      metin: 'Sıcaklık bu derecenin altına inecekse haber verilir.',
    },
    { hedef: 'hat.saat', baslik: 'Bildirim saati', metin: 'Günlük hatırlatmanın geleceği saat.' },
    { hedef: 'hat.kaydet', baslik: 'Kaydet', metin: 'Seçtiklerini saklar.' },
    {
      hedef: 'hat.kontrol',
      baslik: 'Şimdi kontrol et',
      metin: 'Beklemeden hemen denetler; bildirim gerekiyorsa gönderir.',
    },
    AMPUL,
  ],

  '/veri-cuzdani': [
    {
      baslik: 'Veri cüzdanım',
      metin:
        'Verin senindir. Hakkında ne tutulduğunu görür, indirir, paylaşımı kapatır ya da hesabını silersin.',
    },
    {
      hedef: 'cuzdan.sil',
      baslik: 'Hesabı sil',
      metin: 'Hesabını ve bütün verilerini kalıcı olarak siler. Geri alınamaz; önce sana sorar.',
    },
    AMPUL,
  ],

  '/kc-listesi': [
    {
      baslik: 'Bitkinin su ihtiyacı',
      metin: 'Her bitki aynı suyu içmez. Kartlar hangi dönemde ne kadar su istediğini gösterir.',
    },
    { hedef: 'liste.ara', baslik: 'Bitki ara', metin: 'Bitkinin adını yazıp hemen bulursun.' },
    {
      hedef: 'liste.kartlar',
      baslik: 'Bitki kartları',
      metin: 'Çubuk uzunsa bitki o dönemde çok su ister.',
    },
    {
      hedef: 'liste.nasil',
      baslik: 'Nasıl okunur?',
      metin: 'Sayıların anlamı ve kaynağı burada yazar.',
    },
    GERI,
    AMPUL,
  ],

  '/toprak-turleri': [
    {
      baslik: 'Toprak türleri',
      metin: 'Toprağını elinde sık; kartlardaki tarife göre türünü bul.',
    },
    { hedef: 'liste.ara', baslik: 'Toprak ara', metin: 'Toprak türünün adını yazıp bulursun.' },
    {
      hedef: 'liste.kartlar',
      baslik: 'Toprak kartları',
      metin: 'Her kartta toprağın eldeki hali ve suyu ne kadar tuttuğu yazar.',
    },
    {
      hedef: 'liste.nasil',
      baslik: 'Nasıl okunur?',
      metin: 'Değerlerin anlamı ve kaynağı burada yazar.',
    },
    GERI,
    AMPUL,
  ],

  '/resmi-kaynaklar': [
    {
      baslik: 'Resmî kaynaklar',
      metin: 'Haberlerin alındığı resmî siteler. Günde 5 kez taranır; hiçbir haber uydurulmaz.',
    },
    {
      hedef: 'kaynak.liste',
      baslik: 'Kaynak listesi',
      metin:
        'Her satırda kurumun adı ve en son ne zaman bakıldığı yazar. Dokunursan sitesi açılır.',
    },
    GERI,
    AMPUL,
  ],

  '/entegrasyonlar': [
    {
      baslik: 'ÇKS bağlantısı',
      metin: 'Çiftçi Kayıt Sistemi ile bağlantı kurulursa parsellerin kendiliğinden gelir.',
    },
    { hedef: 'cks.durum', baslik: 'Bağlantı durumu', metin: 'Resmî bağlantının şu anki durumu.' },
    AMPUL,
  ],

  '/arazi-duzenle': [
    { baslik: 'Araziyi güncelle', metin: 'Tarlanın bilgilerini buradan değiştirirsin.' },
    { hedef: 'duzenle.arazi', baslik: 'Hangi tarla', metin: 'Değiştirmek istediğin tarlayı seç.' },
    { hedef: 'duzenle.ad', baslik: 'Adı', metin: 'Tarlana tanıdığın bir ad ver.' },
    {
      hedef: 'duzenle.alan',
      baslik: 'Büyüklüğü',
      metin: 'Dekar olarak yaz. Su ve tasarruf hesapları buna göre yapılır.',
    },
    { hedef: 'duzenle.kaydet', baslik: 'Kaydet', metin: 'Değişiklikleri saklar.' },
    GERI,
    AMPUL,
  ],

  '/tarla-ekle': [
    {
      baslik: 'Tarla ekle',
      metin: 'Tarlanın yerini dört yoldan biriyle gösterirsin. Hangisi kolayına geliyorsa onu seç.',
    },
    {
      hedef: 'ekle.gps',
      baslik: 'Tarladayım',
      metin: 'Şu an tarladaysan telefonun konumuyla tek dokunuşta eklenir.',
    },
    { hedef: 'ekle.koy', baslik: 'Köyümü seçeyim', metin: 'İl, ilçe ve köyü listeden seçersin.' },
    {
      hedef: 'ekle.harita',
      baslik: 'Haritada göstereyim',
      metin: 'Uydu görüntüsünde tarlanın üstüne dokunursun.',
    },
    {
      hedef: 'ekle.yakin',
      baslik: 'Yakınım yapsın',
      metin: 'Çocuğun ya da komşun kendi telefonundan ekler; sen yalnız onaylarsın.',
    },
    AMPUL,
  ],

  '/tarla-ekle/koy': [
    { baslik: 'Köyünü seç', metin: 'Önce ilini, sonra ilçeni ve köyünü seçersin.' },
    { hedef: 'koy.il', baslik: 'Ara', metin: 'Adın ilk harflerini yazınca liste kısalır.' },
    AMPUL,
  ],

  '/tarla-ekle/harita': [
    { baslik: 'Haritada göster', metin: 'Uydu görüntüsünde tarlanı bul ve üstüne dokun.' },
    {
      hedef: 'harita.harita',
      baslik: 'Harita',
      metin: 'Parmağınla kaydır; tarlanın üstüne dokununca işaret konur.',
    },
    {
      hedef: 'harita.yakinlas',
      baslik: 'Yakınlaş',
      metin: 'Artı ile yakınlaşır, eksi ile uzaklaşırsın.',
    },
    {
      hedef: 'harita.yer',
      baslik: 'Burası tarlam',
      metin: 'İşaret doğru yerdeyse bu düğmeyle devam edersin.',
    },
  ],

  '/tarla-ekle/urun': [
    { baslik: 'Ürün ve ad', metin: 'Son adım: tarlada ne yetiştiğini ve tarlanın adını yaz.' },
    {
      hedef: 'urun.urun',
      baslik: 'Ürün',
      metin: 'Tarlandaki ürünü seç. Takvim, su hesabı ve haberler buna göre gelir.',
    },
    {
      hedef: 'urun.ad',
      baslik: 'Tarlanın adı',
      metin: 'Tanıdığın bir ad ver: “Dere kenarı”, “Üst bahçe” gibi.',
    },
    AMPUL,
  ],

  '/haber': [
    {
      baslik: 'Haber',
      metin: 'Resmî kurumun haberi. Özeti Nuvia çıkarır; aslı kurumun kendi sayfasındadır.',
    },
    {
      hedef: 'haber.baslik',
      baslik: 'Başlık',
      metin: 'Haberin konusu. Başvuru son günü varsa hemen altında sarı şeritle yazar.',
    },
    { hedef: 'haber.metin', baslik: 'Özet', metin: 'Haberin çiftçiyi ilgilendiren kısmı.' },
    {
      hedef: 'haber.kaynagi-ac',
      baslik: 'Kaynağı aç',
      metin: 'Haberin aslını ve başvuru bağlantısını kurumun sitesinde açar.',
    },
    {
      hedef: 'haber.neden',
      baslik: 'Neden?',
      metin: 'Bu haberin sana neden gösterildiğini söyler: ilin, ilçen ya da ürünün yüzünden.',
    },
    {
      hedef: 'haber.kaynak',
      baslik: 'Kaynak ve tarih',
      metin: 'Haberi hangi kurumun, hangi gün yayımladığı.',
    },
    GERI,
    AMPUL,
  ],
};

export function sayfaAdimlari(sayfa: string): TanitimAdimi[] {
  return ADIMLAR[sayfa] ?? [];
}

/** Tanıtımı olan sayfalar (test ve denetim için). */
export function tanitimliSayfalar(): string[] {
  return Object.keys(ADIMLAR);
}

/** Bir sayfanın tanıtımında kullanılan hedef kimlikleri. */
export function sayfaHedefleri(sayfa: string): string[] {
  return sayfaAdimlari(sayfa)
    .map((a) => a.hedef)
    .filter((h): h is string => !!h);
}
