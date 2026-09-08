// Easy. — service worker.
//
// Two jobs: open instantly offline, and never get in the way of your data.
//
// The app shell is cached. Your actual data (data/, weeks/, log/) is NEVER
// cached here — it comes from the GitHub API, and a stale meal plan served
// from a cache would be worse than no meal plan. The store keeps its own
// last-known-good copy in localStorage for offline reading.

const VERSION = 'easy-5c52615034';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app/style.css',
  './app/main.js',
  './app/config.js',
  './app/util.js',
  './app/store.js',
  './app/model.js',
  './app/ui.js',
  './app/modules/index.js',
  './app/modules/today.js',
  './app/modules/meals.js',
  './app/modules/chores.js',
  './app/modules/projects.js',
  './app/modules/inbox.js',
  './app/modules/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // addAll is all-or-nothing; one 404 would leave you with no cache at all.
      .then((cache) => Promise.all(SHELL.map((url) =>
        cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isData(url) {
  return /\/(data|weeks|log)\//.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Anything not ours — the GitHub API above all — goes straight through.
  if (url.origin !== self.location.origin) return;

  // Your data is never served from this cache.
  if (isData(url)) return;

  // Navigations: try the network so a deploy shows up, fall back to the
  // cached shell so the app still opens on the metro with no signal.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then((r) => r
        || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } }))),
    );
    return;
  }

  // Everything else: cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
