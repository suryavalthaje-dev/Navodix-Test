/* Cross-origin isolation for hosts that can't send COOP/COEP headers (e.g. GitHub Pages).
 *
 * LibreOffice's WebAssembly build needs SharedArrayBuffer, which browsers only expose to
 * cross-origin isolated pages.  service-worker.js adds the headers; the first visit is not
 * yet controlled by it, so the page reloads itself once after the worker takes over.
 */

/**
 * @param {string|URL} serviceWorkerUrl URL of a script that imports service-worker.js (see README).
 * @returns {Promise<boolean>} Whether the page is cross-origin isolated now.  When a reload is
 *   needed to become isolated, the page reloads and the promise stays pending.
 */
export async function ensureCrossOriginIsolation(serviceWorkerUrl) {
    const KEY = 'office-converter-coi-reload';
    const reloaded = () => {
        try { return sessionStorage.getItem(KEY); } catch { return null; }
    };
    const mark = () => {
        try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode: reload loop guard is best effort */ }
    };
    if (window.crossOriginIsolated) {
        try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
        return true;
    }
    if (!('serviceWorker' in navigator)) return false;
    let registration;
    try {
        registration = await navigator.serviceWorker.register(serviceWorkerUrl);
    } catch (error) {
        console.error('Service worker registration failed', error);
        return false;
    }

    // An already-active service worker does not necessarily control the page
    // that registered it. In that case controllerchange may never fire until
    // the page navigates, so waiting for that event can freeze Save Profile.
    // Wait briefly for activation, then perform one guarded reload to let the
    // worker control this page. If a previous controlled reload already failed,
    // return false so the caller can offer the Word-format fallback.
    if (!navigator.serviceWorker.controller) {
        if (reloaded()) return false;

        let readyRegistration = null;
        try {
            readyRegistration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise(resolve => setTimeout(() => resolve(null), 8000))
            ]);
        } catch (error) {
            console.warn('Waiting for the Office conversion service worker failed:', error);
        }

        if (!readyRegistration && !registration.active) {
            console.warn('Office conversion service worker did not become active in time.');
            return false;
        }

        // The worker is active but this document is not yet controlled.
        // Reload once; the session marker prevents a reload loop.
        mark();
        location.reload();
        return new Promise(() => {}); // pending until the controlled reload
    }

    // A controller exists, but the response headers from the current navigation
    // may still not have enabled isolation. Reload once, then fail gracefully
    // on the next attempt instead of waiting forever.
    if (reloaded()) return false;
    mark();
    location.reload();
    return new Promise(() => {}); // pending until the controlled reload
}
