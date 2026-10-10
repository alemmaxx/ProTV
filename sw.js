// proTV service worker: cangkerang app dicache; senarai siaran sentiasa cuba rangkaian dulu.
const CACHE = 'protv-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'assets/fonts.css', 'icons/icon-192.png', 'icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== location.origin) return; // siaran & sumber luar tak disentuh
  const networkFirst = url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('channels.json');
  if(networkFirst){
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; }).catch(() => caches.match(req)));
  } else {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; })));
  }
});
