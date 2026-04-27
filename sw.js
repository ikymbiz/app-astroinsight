/* ============================================================
 * AstroInsight - Service Worker (PWA cache fallback)
 * 既存 index.html 内の swCode を分離独立ファイル化
 * ============================================================ */

const CACHE_NAME = 'astro-v2.0';

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
