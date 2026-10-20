import { expect, test, type Page } from '@playwright/test';

/**
 * G3 kabul ölçütü: Bugün ekranı gerçek API'den (hava sağlayıcısı sahte) veri gösterir.
 * Önce eşik onaysızdır: uyarı yoktur, "uzman onayı bekliyor" rozeti vardır. Onaylanınca tek büyük don kartı çıkar.
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

test('Bugün: gerçek API verisi, onaysız eşikte uyarı yok, onaylıysa don kartı', async ({
  page,
}) => {
  await setup(page);

  await page.goto('/');
  await expect(page.getByTestId('bugun-tarla')).toHaveText('Burç Köyü Fıstık Bahçesi');
  await expect(page.getByTestId('bugun-sicaklik')).toHaveText('12°'); // sahte sağlayıcının anlık sıcaklığı
  await expect(page.getByText('Bugün hava parçalı bulutlu')).toBeVisible();
  await expect(page.getByTestId('bugun-guncelleme')).toContainText('Son güncelleme');
  await expect(page.getByTestId('bugun-guncelleme')).toContainText('Kaynak: Open-Meteo');

  // Onaysız: uyarı yok, rozet var (değişmez kural 1)
  const card = page.getByTestId('bugun-don-karti');
  await expect(card).toContainText('Don uyarısı için uzman onayı bekliyor');
  await expect(card.getByText('Uzman onayı bekliyor', { exact: true })).toBeVisible();
  await expect(card).not.toContainText('don bekleniyor');
  await expect(page.getByTestId('bugun-su')).toContainText('uzman onayı bekleniyor');

  // Uzman onayı gelince: tek büyük uyarı kartı
  expect((await page.request.get('/__e2e/approve-frost')).ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId('bugun-don-baslik')).toContainText('don bekleniyor');
  await expect(card).toContainText('DİKKAT');
  await expect(card).toContainText('%100');
  await expect(card).toContainText('Kaynak: Open-Meteo');
  // Ayrıntı "Neden?" arkasında
  await expect(card).not.toContainText('denemesinden');
  await card.getByRole('button', { name: 'Neden?' }).click();
  await expect(card).toContainText('40'.replace('40', '20') + ' denemesinden 20');
  // Onaylı pakette bitkinin su ihtiyacı sayı olarak görünür
  await expect(page.getByTestId('bugun-su')).toContainText('mm');
});

test('Bugün: sunucuya ulaşılamazsa son bilgi ve "son güncelleme" görünür', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByTestId('bugun-sicaklik')).toHaveText('12°');
  const first = await page.getByTestId('bugun-guncelleme').innerText();

  await page.route('**/fields**', (r) => r.abort());
  await page.reload();
  await expect(page.getByText('İnternet yok. Son kaydedilen bilgi gösteriliyor.')).toBeVisible();
  await expect(page.getByTestId('bugun-sicaklik')).toHaveText('12°');
  await expect(page.getByTestId('bugun-guncelleme')).toContainText(first.split(' · ')[0]!);
});
