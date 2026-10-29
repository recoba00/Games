'use strict';
const BUILD = __BUILD_ID__;
const FILES = __PRECACHE__;
const PREFIX = 'hanipcut-pwa:' + self.registration.scope + ':';
const CACHE = PREFIX + BUILD;
const ROOT = new URL('./', self.location.href);
const ASSETS = new Set(FILES.map(file => new URL(file, ROOT).href));

self.addEventListener('install', event => {
  // Atomic install: don't activate a partial offline game. Updates wait for all
  // existing windows to close, so a running game never mixes release assets.
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(FILES.map(file => new Request(new URL(file, ROOT), { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function rangeResponse(request, response) {
  const range = request.headers.get('range');
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const data = await response.arrayBuffer();
  const length = data.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), length - 1) : length - 1) : length - 1;
  if (start > end || start >= length) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } });
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(data.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin) return;
  const entry = request.mode === 'navigate' &&
    (url.pathname === ROOT.pathname || url.pathname === new URL('index.html', ROOT).pathname);
  const key = entry ? new URL('index.html', ROOT).href : url.href;
  if (!ASSETS.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const response = await cache.match(key);
    return response ? rangeResponse(request, response) : fetch(request);
  })());
});
