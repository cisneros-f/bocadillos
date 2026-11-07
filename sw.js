// Service worker: guarda la "carcasa" de la app para que abra rápido y sin conexión.
// Los datos (pedidos, menú) SIEMPRE van a la red: nunca se guardan en caché.
// Cuando cambies archivos de la app, sube este número para forzar la actualización.
const CACHE = 'bocatas-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  const url = new URL(req.url);
  // Solo GET de nuestro propio origen; la API de Google pasa de largo.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Red primero (así las actualizaciones llegan enseguida); si no hay red, caché.
  ev.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
