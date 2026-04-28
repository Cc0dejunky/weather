const CACHE_NAME = 'daisy-v7';
const ASSETS = [
    'index.html',
    'style.css',
    'app.js',
    'manifest.json',
    'https://cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Network First strategy: Try the network, fall back to cache if offline
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // If successful, clone and save to cache for future offline use
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, response.clone());
                    return response;
                });
            })
            .catch(() => {
                // If network fails (offline), return from cache
                return caches.match(event.request);
            })
    );
});
