/*!
 * Custom Cross-Origin Isolation Service Worker (Workbox-compatible)
 * 
 * Intercepts all 'fetch' event listeners registered in the Service Worker (including Workbox)
 * and modifies the resulting Response to include COOP and COEP headers.
 * This guarantees SharedArrayBuffer works offline and on GitHub Pages!
 */

const originalAddEventListener = self.addEventListener;

self.addEventListener = function (type, listener) {
    if (type === 'fetch') {
        const originalListener = listener;
        listener = function (event) {
            // Hook the respondWith method for this event
            const originalRespondWith = event.respondWith;
            event.respondWith = function (promise) {
                originalRespondWith.call(event, Promise.resolve(promise).then(response => {
                    if (!response || response.status === 0 || response.type === 'opaque' || response.type === 'error') {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });
                }));
            };

            return originalListener.call(this, event);
        };
    }
    return originalAddEventListener.call(this, type, listener);
};
