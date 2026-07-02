(function () {
    'use strict';

    var START_DELAY_MS = 800;
    var POLL_MS = 400;
    var MAX_POLL_ATTEMPTS = 150;
    /** Clave legacy (global): limpiar al iniciar para no bloquear otros usuarios en la misma pestaña. */
    var LEGACY_DISMISSED = 'lgt_whats_new_dismissed_session';

    function userId() {
        return window.__LGT && window.__LGT.userId != null ? String(window.__LGT.userId) : '0';
    }

    function dismissedStorageKey(releaseId) {
        return 'lgt_whats_new_dismissed_' + userId() + '_' + releaseId;
    }

    function tourBlocking() {
        if (!window.__LGT) return true;
        var path = window.location.pathname;
        if (path === '/login/2fa/setup' || path === '/login/2fa' || path === '/account/password/forced') {
            return true;
        }
        // Usuario ya onboarded: mostrar novedades sin esperar tour.
        if (window.__LGT.onboarded) return false;
        // Tour completado/saltado en esta sesión (antes de que persista en el servidor).
        try {
            if (sessionStorage.getItem('lgt_tour_dismissed_' + userId()) === '1') return false;
        } catch (_) { /* ignore */ }
        if (document.querySelector('.driver-overlay, .driver-popover, .driver-popover-wrapper')) {
            return true;
        }
        // Onboarding pendiente: el tour principal va antes que el modal de novedades.
        return true;
    }

    function markSessionDismissed(releaseId) {
        try { sessionStorage.setItem(dismissedStorageKey(releaseId), '1'); } catch (_) { /* ignore */ }
    }

    function wasSessionDismissed(releaseId) {
        try { return sessionStorage.getItem(dismissedStorageKey(releaseId)) === '1'; } catch (_) { return false; }
    }

    function markReleaseSeen(releaseId) {
        if (window.__LGT) {
            if (!window.__LGT.helpSeen) window.__LGT.helpSeen = {};
            window.__LGT.helpSeen['release:' + releaseId] = true;
            window.__LGT.pendingRelease = null;
        }
        return fetch('/api/onboarding/release-seen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({ releaseId: releaseId }),
        }).catch(function () {});
    }

    function closeModal(backdrop) {
        if (!backdrop) return;
        backdrop.hidden = true;
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function openModal(backdrop) {
        if (!backdrop) return;
        backdrop.hidden = false;
        backdrop.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        var focusable = backdrop.querySelector('.whats-new-btn-dismiss, .whats-new-modal__close');
        if (focusable) focusable.focus();
    }

    function initWhatsNewModal() {
        try { sessionStorage.removeItem(LEGACY_DISMISSED); } catch (_) { /* ignore */ }

        var backdrop = document.getElementById('whats-new-backdrop');
        if (!backdrop || !window.__LGT || !window.__LGT.pendingRelease) return;

        if (window.location.pathname.indexOf('/help') === 0) return;

        var release = window.__LGT.pendingRelease;
        if (wasSessionDismissed(release.id)) return;

        var opened = false;

        function dismiss() {
            markSessionDismissed(release.id);
            markReleaseSeen(release.id);
            closeModal(backdrop);
        }

        function dismissAndGo(fn) {
            markSessionDismissed(release.id);
            closeModal(backdrop);
            var done = markReleaseSeen(release.id);
            if (done && typeof done.then === 'function') {
                done.finally(fn);
            } else {
                fn();
            }
        }

        function tryOpen() {
            if (opened || backdrop.hidden === false) return true;
            if (tourBlocking()) return false;
            opened = true;
            openModal(backdrop);
            return true;
        }

        backdrop.querySelector('#whats-new-dismiss')?.addEventListener('click', dismiss);
        backdrop.querySelector('#whats-new-close')?.addEventListener('click', dismiss);

        backdrop.querySelectorAll('.whats-new-btn-manual').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                var href = link.getAttribute('href') || '/help';
                dismissAndGo(function () {
                    window.location.href = href;
                });
            });
        });

        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) dismiss();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !backdrop.hidden) dismiss();
        });

        window.addEventListener('lgt:main-tour-finished', function () {
            tryOpen();
        });

        setTimeout(function () {
            if (tryOpen()) return;
            var attempts = 0;
            var poll = setInterval(function () {
                attempts += 1;
                if (tryOpen() || attempts >= MAX_POLL_ATTEMPTS) clearInterval(poll);
            }, POLL_MS);
        }, START_DELAY_MS);
    }

    function init() {
        initWhatsNewModal();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
