(function () {
    'use strict';

    function normalize(str) {
        return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    // --- Buscador del índice del manual (solo si existe la barra) ---
    function initSearch() {
        var input = document.getElementById('help-search-input');
        if (!input) return;

        var cards = Array.prototype.slice.call(document.querySelectorAll('.help-card'));
        var sections = Array.prototype.slice.call(document.querySelectorAll('.help-section'));
        var emptyMsg = document.getElementById('help-search-empty');

        function filterArticles() {
            var q = normalize(input.value.trim());
            var visible = 0;

            cards.forEach(function (card) {
                var haystack = normalize(
                    (card.getAttribute('data-title') || '') + ' ' +
                    (card.getAttribute('data-summary') || '') + ' ' +
                    (card.getAttribute('data-keywords') || '')
                );
                var match = !q || haystack.indexOf(q) >= 0;
                card.hidden = !match;
                if (match) visible++;
            });

            sections.forEach(function (section) {
                var anyVisible = section.querySelector('.help-card:not([hidden])');
                section.hidden = !anyVisible;
            });

            if (emptyMsg) emptyMsg.hidden = visible > 0 || !q;
        }

        input.addEventListener('input', filterArticles);
    }

    // --- Relanzar el tour de onboarding (solo si existe el botón) ---
    function initReplayTour() {
        var replayBtn = document.getElementById('btn-replay-tour-help');
        if (!replayBtn || !window.__LGT) return;

        replayBtn.addEventListener('click', function (e) {
            e.preventDefault();
            var roleId = Number(window.__LGT.roleId);
            fetch('/api/onboarding/replay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
                .then(function () {
                    try { sessionStorage.removeItem('lgt_tour_redirected'); } catch (_) {}
                    try { sessionStorage.removeItem('lgt_tour_dismissed'); } catch (_) {}
                    window.location.href = roleId === 3 ? '/delivery' : '/home';
                })
                .catch(function () {});
        });
    }

    // --- Lightbox / zoom de capturas (funciona en índice y artículos) ---
    function initLightbox() {
        var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-help-zoom]'));
        if (!triggers.length) return;

        var overlay = document.createElement('div');
        overlay.className = 'help-lightbox';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML =
            '<button type="button" class="help-lightbox__close" aria-label="Cerrar">' +
            '<span class="material-symbols-outlined">close</span></button>' +
            '<img class="help-lightbox__img" alt="">';
        document.body.appendChild(overlay);

        var overlayImg = overlay.querySelector('.help-lightbox__img');
        var closeBtn = overlay.querySelector('.help-lightbox__close');
        var lastFocused = null;

        function open(img) {
            if (!img) return;
            lastFocused = document.activeElement;
            overlayImg.src = img.currentSrc || img.src;
            overlayImg.alt = img.alt || '';
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            closeBtn.focus();
        }

        function close() {
            overlay.setAttribute('aria-hidden', 'true');
            overlayImg.removeAttribute('src');
            document.body.style.overflow = '';
            if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
        }

        triggers.forEach(function (trigger) {
            trigger.addEventListener('click', function () {
                open(trigger.querySelector('img'));
            });
        });

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay || e.target === closeBtn || closeBtn.contains(e.target)) close();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.getAttribute('aria-hidden') === 'false') close();
        });
    }

    // --- Fallback de capturas aún no generadas (evita imágenes rotas) ---
    function initFigureFallback() {
        var imgs = Array.prototype.slice.call(document.querySelectorAll('.help-figure__img'));
        imgs.forEach(function (img) {
            function markPending() {
                var figure = img.closest('.help-figure');
                if (!figure || figure.classList.contains('help-figure--pending')) return;
                figure.classList.add('help-figure--pending');
                var frame = figure.querySelector('.help-figure__frame');
                if (frame) {
                    frame.innerHTML =
                        '<div class="help-figure__pending">' +
                        '<span class="material-symbols-outlined">image</span>' +
                        '<span>Captura pendiente</span></div>';
                }
            }
            if (img.complete && img.naturalWidth === 0) {
                markPending();
            } else {
                img.addEventListener('error', markPending);
            }
        });
    }

    function init() {
        initSearch();
        initReplayTour();
        initFigureFallback();
        initLightbox();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
