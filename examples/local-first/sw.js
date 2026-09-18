// Opt-in example only. A host must version its cache with each application release.
const cacheName = 'art-local-first-example-v1';
const assets = ['./', './index.html', './app.js', '../a-rich-text.js'].map(path => new URL(path, self.location).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !assets.includes(event.request.url)) return;
  event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(event.request)) ?? fetch(event.request)));
});
