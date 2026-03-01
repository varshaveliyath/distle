const CACHE_NAME = 'distle-cache-v1';
let API_URL = 'http://localhost:3001';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(['/', '/index.html', '/icon-512.png']);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

// Handle Widget updates (Experimental API)
self.addEventListener('widgetinstall', event => {
    event.waitUntil(updateWidget(event.widget));
});

self.addEventListener('widgetresume', event => {
    event.waitUntil(updateWidget(event.widget));
});

async function updateWidget(widget) {
    const user = await getSavedUser();
    if (!user) return;

    try {
        const response = await fetch(`${API_URL}/api/distance/${user.id}`);
        const data = await response.json();

        await self.widgets.updateByTag('distance-widget', {
            template: 'distance-template',
            data: {
                distance: data.distance || '??',
                unit: data.unit || 'km',
                lastUpdated: new Date().toLocaleTimeString()
            }
        });
    } catch (error) {
        console.error('Widget update failed', error);
    }
}

let currentUser = null;

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SET_USER') {
        currentUser = event.data.user;
        if (event.data.apiUrl) API_URL = event.data.apiUrl;
        console.log('SW received user & API:', currentUser, API_URL);
    }
});

async function getSavedUser() {
    return currentUser;
}
