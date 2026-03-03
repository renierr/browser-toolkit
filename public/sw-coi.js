/*!
 * Cross-Origin Isolation Service Worker (Workbox-compatible)
 *
 * Adds COOP + COEP headers to every response so SharedArrayBuffer becomes
 * available. This enables the multi-threaded FFmpeg WASM build on hosts
 * where server headers cannot be configured (e.g. GitHub Pages).
 *
 * How it works:
 *  Monkey-patches self.addEventListener so every future 'fetch' handler's
 *  event.respondWith() is wrapped to inject COOP/COEP headers on the response.
 *  Must be imported FIRST in the SW (before Workbox & other scripts).
 *
 * Design choices:
 *  - Uses COEP "credentialless" (not "require-corp") so cross-origin
 *    sub-resources (CDN fonts, images, scripts) keep working without
 *    crossorigin attributes or CORS headers on every request.
 *  - Only modifies the *headers* — response.body is a ReadableStream that
 *    is transferred (not copied), so there is NO memory duplication.
 *  - Opaque / error / redirect responses are passed through untouched.
 *
 * Limitation:
 *  On the very first page load (before the SW installs), no headers are
 *  injected. After install + activate (skipWaiting + clientsClaim), the
 *  next navigation will have headers. SharedArrayBuffer becomes available
 *  after one reload.
 */

const originalAddEventListener = self.addEventListener;

self.addEventListener = function (type, listener) {
  if (type === 'fetch') {
    const originalListener = listener;
    listener = function (event) {
      const originalRespondWith = event.respondWith;
      event.respondWith = function (promise) {
        originalRespondWith.call(
          event,
          Promise.resolve(promise).then((response) => {
            // Don't touch opaque, error, or redirect responses
            if (
              !response ||
              response.status === 0 ||
              response.type === 'opaque' ||
              response.type === 'opaqueredirect' ||
              response.type === 'error'
            ) {
              return response;
            }

            const newHeaders = new Headers(response.headers);
            // "credentialless" is less restrictive than "require-corp":
            // cross-origin requests still work, they just omit credentials.
            newHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');
            newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

            // response.body is a ReadableStream — passing it here transfers
            // ownership, it does NOT duplicate the data in memory.
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: newHeaders,
            });
          })
        );
      };

      return originalListener.call(this, event);
    };
  }
  return originalAddEventListener.call(this, type, listener);
};
