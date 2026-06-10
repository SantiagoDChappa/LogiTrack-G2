/* Loader global entre cargas de página.
 *
 * Reglas:
 * - Se muestra al hacer click en un link interno (mismo host, no anchor, no _blank).
 * - Se muestra al submit de un form.
 * - Se oculta al cargar la nueva página y también si el usuario vuelve con back/forward (bfcache).
 * - No se muestra para:
 *     - links con target=_blank o rel=external
 *     - links que apuntan a un ancla (#...)
 *     - links con data-no-loader
 *     - links con descarga (download attr)
 *     - clicks con ctrl/meta/shift (abren nueva pestaña)
 *     - href javascript:/mailto:/tel:
 */
(function () {
    if (window.__pageLoaderInit) { return; }
    window.__pageLoaderInit = true;

    // Inyecta el HTML del loader una sola vez al body.
    function ensureNode() {
        let el = document.getElementById('page-loader');
        if (el) { return el; }
        el = document.createElement('div');
        el.id = 'page-loader';
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="page-loader__card" role="status" aria-live="polite">' +
            '  <div class="page-loader__spinner"></div>' +
            '  <div class="page-loader__label">Cargando…</div>' +
            '</div>';
        document.body.appendChild(el);
        return el;
    }

    function show() {
        const el = ensureNode();
        el.classList.add('is-active');
        el.setAttribute('aria-hidden', 'false');
    }
    function hide() {
        const el = document.getElementById('page-loader');
        if (!el) { return; }
        el.classList.remove('is-active');
        el.setAttribute('aria-hidden', 'true');
    }

    function isInternalLink(a) {
        if (!a || !a.href) { return false; }
        if (a.target && a.target.toLowerCase() === '_blank') { return false; }
        if (a.hasAttribute('download')) { return false; }
        if (a.hasAttribute('data-no-loader')) { return false; }
        if ((a.getAttribute('rel') || '').toLowerCase().includes('external')) { return false; }
        const href = a.getAttribute('href') || '';
        if (!href || href.startsWith('#')) { return false; }
        const lower = href.toLowerCase();
        if (lower.startsWith('javascript:') || lower.startsWith('mailto:') || lower.startsWith('tel:')) { return false; }
        try {
            const url = new URL(a.href, location.href);
            if (url.origin !== location.origin) { return false; }
            // Si es la misma URL exacta (mismo path + search) y solo cambia el hash, no mostramos.
            if (url.pathname === location.pathname && url.search === location.search && url.hash) { return false; }
            return true;
        } catch { return false; }
    }

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented) { return; }
        if (e.button !== 0) { return; }
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) { return; }
        const a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (!isInternalLink(a)) { return; }
        show();
    }, true);

    document.addEventListener('submit', function (e) {
        const form = e.target;
        if (!form || form.hasAttribute('data-no-loader')) { return; }
        // No mostramos si el form fue cancelado (preventDefault) por otro handler.
        if (e.defaultPrevented) { return; }
        show();
    }, true);

    // Oculta cuando termina de cargar (visible o restaurado de bfcache).
    window.addEventListener('pageshow', hide);
    window.addEventListener('load', hide);

    // Por si el usuario cancela una nav con ESC.
    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { hide(); }
    });
})();
