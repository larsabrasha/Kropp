// Small DOM helpers for the Razor pages. Named functions only: pages never eval.

export function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}
