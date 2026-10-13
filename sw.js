// Galope no Gelo: funciona offline depois da primeira visita.
// Rede primeiro para o HTML (atualizações chegam logo); cache primeiro para o resto.
// Subir VERSION a cada publicação.
const VERSION = 'galope-v9';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'vendor/three.min.js', 'vendor/mp4-muxer.min.js',
  'fonts/titan-one-latin-400-normal.woff2', 'fonts/silkscreen-latin-400-normal.woff2',
  'fonts/m-plus-rounded-1c-latin-500-normal.woff2', 'fonts/m-plus-rounded-1c-latin-800-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const html = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  if (html) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(r2 => {
      if (r2.ok) { const cp = r2.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
      return r2;
    })));
  }
});
