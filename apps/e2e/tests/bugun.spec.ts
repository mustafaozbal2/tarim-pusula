import { expect, test, type Page } from '@playwright/test';

/**
 * G3 + G19: ana sayfa (hedefle birebir düzen) gerçek API'den veri gösterir. Onaysız eşikte uyarı da
 * "uzman onayı bekliyor" yazısı da çıkmaz; onaylanınca Dikkat rozeti ve Erken Uyarılar satırı gelir.
 * Hava ve don ayrıntısı Hava Durumu ve Arazi İşlemleri sayfalarındadır.
 */
interface TestUser {
  api: string;
  token: string;
}

async function setup(page: Page) {
  const user = (await (await page.request.get('/__e2e/user')).json()) as TestUser;
  const created = await page.request.post(`${user.api}/fields`, {
    headers: { authorization: `Bearer ${user.token}` },
    data: { name: 'Burç Köyü Fıstık Bahçesi', lat: 37.0662, lon: 37.3833, cropId: 'antep-fistigi' },
  });
  expect(created.status()).toBe(201);
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
  return user;
}

test('Ana sayfa: 7 ikon, arazi adı, 5 sekme; onaysız eşikte uyarı ve onay yazısı yok', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByTestId('bugun-tarla')).toHaveText('Burç Köyü Fıstık Bahçesi');
  for (const name of [
    'Arazilerim',
    'Arazi İşlemleri',
    'Verim Haritası',
    'Hava Durumu',
    'Uzman Desteği',
    'Mobil Bildirim',
    'Profil Ayarları',
  ]) {
    await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  for (const name of [
    'Faaliyet Zamanı',
    'Faaliyet Rehberi',
    'Erken Uyarılar',
    'Hibe, Kredi ve Desteklemeler',
    'Hepsi',
  ]) {
    await expect(page.getByRole('tab', { name })).toBeVisible();
  }
  // Alt sekme çubuğu yok
  await expect(page.getByRole('tab', { name: 'Soru sor' })).toHaveCount(0);
  await expect(page.getByTestId('dikkat-rozeti')).toHaveCount(0);
  await expect(page.getByText(/onayı bekl/i)).toHaveCount(0);

  // Hava Durumu: seçili arazinin koordinatı, kaynak + saat; onaysız don satırı hiç çıkmaz
  await page.getByRole('button', { name: 'Hava Durumu' }).click();
  await expect(page.getByTestId('hava-sicaklik')).toHaveText('12°'); // sahte sağlayıcının anlık sıcaklığı
  await expect(page.getByText('Bugün hava parçalı bulutlu')).toBeVisible();
  await expect(page.getByTestId('hava-kaynak')).toContainText('Kaynak: Open-Meteo');
  await expect(page.getByTestId('hava-don')).toHaveCount(0);
  await expect(page.getByText(/onayı bekl/i)).toHaveCount(0);
});

test('Onaylanınca: Dikkat rozeti, Erken Uyarılar satırı, Hava ve Arazi İşlemleri', async ({
  page,
}) => {
  await setup(page);
  expect((await page.request.get('/__e2e/approve-frost')).ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByTestId('bugun-tarla')).toBeVisible();
  await expect(page.getByTestId('dikkat-rozeti')).toBeVisible();
  await page.getByTestId('dikkat-rozeti').click();
  await expect(page.getByTestId('liste-satiri').first()).toContainText('don bekleniyor');
  await page.getByTestId('liste-satiri').first().click();
  await expect(page.getByTestId('satir-detay')).toContainText('Kaynak: Open-Meteo');
  await expect(page.getByTestId('satir-detay')).toContainText('20 denemesinden 20');

  await page.getByRole('button', { name: 'Hava Durumu' }).click();
  await expect(page.getByTestId('hava-don-baslik')).toContainText('don bekleniyor');

  await page.goBack();
  await page.getByRole('button', { name: 'Arazi İşlemleri' }).click();
  await expect(page.getByTestId('bugun-don-baslik')).toContainText('don bekleniyor');
  // Onaylı pakette bitkinin su ihtiyacı sayı olarak görünür
  await expect(page.getByTestId('bugun-su')).toContainText('mm');
});

test('Ana sayfa: sunucuya ulaşılamazsa son bilgi görünür', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByTestId('bugun-tarla')).toHaveText('Burç Köyü Fıstık Bahçesi');
  await page.getByRole('button', { name: 'Hava Durumu' }).click();
  await expect(page.getByTestId('hava-sicaklik')).toHaveText('12°');
  await page.goBack();

  await page.route('**/fields**', (r) => r.abort());
  await page.reload();
  await expect(page.getByText('İnternet yok. Son kaydedilen bilgi gösteriliyor.')).toBeVisible();
  await expect(page.getByTestId('bugun-tarla')).toHaveText('Burç Köyü Fıstık Bahçesi');
  await page.getByRole('button', { name: 'Hava Durumu' }).click();
  await expect(page.getByTestId('hava-sicaklik')).toHaveText('12°');
});

test('Alt sayfalardan geri tuşuyla ana sayfaya dönülür; sağ menü açılır ve gider', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByTestId('bugun-tarla')).toBeVisible();
  await page.getByRole('button', { name: 'Arazi İşlemleri' }).click();
  await expect(page.getByRole('heading', { name: 'Arazi İşlemleri' })).toBeVisible();
  await page.getByTestId('geri').click();
  await expect(page.getByTestId('bugun-tarla')).toBeVisible();

  await page.getByTestId('yan-menu-tutamac').click();
  await expect(page.getByTestId('yan-menu-panel')).toBeVisible();
  await page.getByTestId('yan-takvim').click();
  await expect(page.getByRole('heading', { name: 'Tarla takvimi' })).toBeVisible();
});
