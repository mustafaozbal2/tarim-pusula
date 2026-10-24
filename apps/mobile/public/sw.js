/* Tarım Pusula servis çalışanı: uygulama kabuğunu çevrimdışı açar.
   API yanıtları BURADA önbelleğe alınmaz (uygulama kendi önbelleğini "son güncelleme" saatiyle tutar);
   başka kaynaklı istekler ve GET dışı istekler hiç yakalanmaz. */
const CACHE = 'tp-kabuk-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// İlk ziyarette sayfa, çalışan devreye girmeden yüklenir; sayfa yüklediği dosyaların adresini bildirir
// ve çalışan onları önbelleğe alır. Böylece ilk ziyaretten sonra uygulama çevrimdışı açılır.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'precache' || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => {
    try {
      return new URL(u, self.location.origin).origin === self.location.origin;
    } catch (e) {
      return false;
    }
  });
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(urls).catch(() => undefined)));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error())),
      ),
  );
});
