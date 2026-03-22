const CACHE_NAME = "tonibbq-shell-v3";
const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./config.js",
    "./manifest.webmanifest",
    "./icon.svg",
    "./hero-tonibbq.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    const requestUrl = new URL(event.request.url);
    const isApiRequest =
        requestUrl.origin === self.location.origin &&
        requestUrl.pathname.startsWith("/api/");
    const isAppShellRequest =
        requestUrl.origin === self.location.origin &&
        (
            APP_SHELL.some((asset) => requestUrl.pathname.endsWith(asset.replace("./", "/"))) ||
            requestUrl.pathname === "/"
        );

    if (isApiRequest) {
        return;
    }

    if (isAppShellRequest) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === "basic") {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        return cached || caches.match("./index.html");
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === "basic") {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return caches.match("./index.html");
    }
}
