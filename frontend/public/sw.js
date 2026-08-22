/**
 * Minimal service worker. Listly is online-only by design, so this worker
 * deliberately caches nothing: it exists to satisfy the browser installability
 * criteria and takes control immediately on update.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// A registered fetch handler is part of the installability criteria; leaving it
// empty lets every request go straight to the network.
self.addEventListener('fetch', () => {});
