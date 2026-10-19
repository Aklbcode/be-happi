// Be Happi hors ligne : la page d'abord depuis le réseau (pour avoir la dernière version), sinon
// depuis le cache ; les fichiers de l'app (noms avec empreinte) depuis le cache. Seulement ce qui
// vient du même site : jamais les appels à Microsoft Graph ni à SharePoint.
const CACHE = 'behappi-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './favicon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Chaque page garde sa copie (Be Happi et Décale), sans les paramètres de l'adresse.
    const cle = url.origin + url.pathname;
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copie = r.clone();
            caches.open(CACHE).then((c) => c.put(cle, copie));
          }
          return r;
        })
        .catch(() =>
          caches
            .match(cle)
            .then((r) => r || caches.match(new URL('./', self.location.href).href))
            .then((r) => r || Response.error()),
        ),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (deja) =>
        deja ||
        fetch(req).then((r) => {
          if (r.ok && (url.pathname.includes('/assets/') || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname))) {
            const copie = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copie));
          }
          return r;
        }),
    ),
  );
});
