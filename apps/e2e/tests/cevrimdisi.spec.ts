import { expect, test } from '@playwright/test';

/**
 * G15: web servis çalışanı. İlk ziyaretten sonra internet kesilince uygulama kabuğu açılır;
 * API yanıtları servis çalışanında önbelleğe alınmaz (veri, uygulamanın "son güncelleme" önbelleğindedir).
 */
test('İnternet kesilince uygulama kabuğu açılır, API yanıtı önbelleğe alınmaz', async ({
  page,
  context,
}) => {
  const user = (await (await page.request.get('/__e2e/user')).json()) as {
    api: string;
    token: string;
  };
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
  await page.goto('/tarlalarim');
  await expect(page.getByRole('heading', { name: 'Tarlalarım' })).toBeVisible();

  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error('servis çalışanı etkin değil');
  });
  // Önbelleğe alma mesajı işlenene kadar bekle.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const c = await caches.open('tp-kabuk-v1');
        return (await c.keys()).length;
      }),
    )
    .toBeGreaterThan(2);
  // Sayfanın yüklediği tüm aynı kaynaklı js/css dosyaları önbelleğe girene kadar bekle (yarış olmasın).
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin) && /\.(js|css)(\?|$)/.test(u));
        const c = await caches.open('tp-kabuk-v1');
        const cached = new Set((await c.keys()).map((r) => r.url));
        return urls.filter((u) => !cached.has(u));
      }),
    )
    .toEqual([]);
  const cachedUrls = await page.evaluate(async () => {
    const c = await caches.open('tp-kabuk-v1');
    return (await c.keys()).map((r) => r.url);
  });
  expect(cachedUrls.some((u) => /\.js(\?|$)/.test(u))).toBe(true);
  expect(cachedUrls.some((u) => u.includes('/fields'))).toBe(false);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tarlalarım' })).toBeVisible();
  await context.setOffline(false);
});
