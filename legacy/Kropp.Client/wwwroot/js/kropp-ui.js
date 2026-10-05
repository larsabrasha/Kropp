// Small DOM helpers for the Razor pages. Named functions only: pages never eval.

export function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

// Fetches files so the service worker caches them for offline use. Failures are ignored: offline,
// the picture is simply missing until the next time there is a network.
export async function prefetch(urls) {
    await Promise.allSettled(urls.map(u => fetch(u).then(r => r.ok ? r.blob() : null)));
}
