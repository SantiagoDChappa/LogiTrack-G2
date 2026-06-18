(function () {
    'use strict';

    var btn    = document.getElementById('univ-search-btn');
    var panel  = document.getElementById('univ-search-panel');
    var input  = document.getElementById('univ-search-input');
    var results = document.getElementById('univ-search-results');

    if (!btn || !panel || !input) return;

    var debounceTimer = null;

    // ── Abrir / cerrar panel ─────────────────────────────────────────────────

    function openPanel() {
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        input.focus();
    }

    function closePanel() {
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (panel.hidden) { openPanel(); } else { closePanel(); }
    });

    document.addEventListener('click', function (e) {
        var wrapper = document.getElementById('univ-search');
        if (wrapper && !wrapper.contains(e.target)) closePanel();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePanel();
    });

    // ── Búsqueda con debounce ────────────────────────────────────────────────

    input.addEventListener('input', function () {
        var q = input.value.trim();
        clearTimeout(debounceTimer);

        if (q.length < 2) {
            results.innerHTML = '<p class="univ-search__hint">Escribí al menos 2 caracteres</p>';
            return;
        }

        debounceTimer = setTimeout(function () { fetchResults(q); }, 300);
    });

    function fetchResults(q) {
        results.innerHTML = '<p class="univ-search__hint">Buscando…</p>';
        fetch('/api/search?q=' + encodeURIComponent(q))
            .then(function (r) { return r.json(); })
            .then(function (data) { renderResults(data); })
            .catch(function () {
                results.innerHTML = '<p class="univ-search__empty">Error al buscar. Intentá de nuevo.</p>';
            });
    }

    // ── Renderizado de resultados ────────────────────────────────────────────

    var CATEGORIES = [
        { key: 'shipments',  label: 'Envíos',       icon: 'local_shipping', urlFn: function (r) { return '/shipment/detail/' + r.id; },
          primaryFn:   function (r) { return r.trackingId || 'Envío #' + r.id; },
          secondaryFn: function (r) { return [r.recipientName, r.status].filter(Boolean).join(' · '); }
        },
        { key: 'incidents',  label: 'Incidencias',  icon: 'report',         urlFn: function (r) { return '/incident/' + r.id; },
          primaryFn:   function (r) { return 'Incidencia #' + r.id + (r.trackingId ? ' · ' + r.trackingId : ''); },
          secondaryFn: function (r) { return [r.type, r.status].filter(Boolean).join(' · '); }
        },
        { key: 'routes',     label: 'Rutas',        icon: 'route',          urlFn: function (r) { return '/route/' + r.id; },
          primaryFn:   function (r) { return 'Ruta #' + r.id; },
          secondaryFn: function (r) { return [r.driverName, r.status].filter(Boolean).join(' · '); }
        },
        { key: 'returns',    label: 'Devoluciones', icon: 'assignment_return', urlFn: function (r) { return '/returns/' + r.id; },
          primaryFn:   function (r) { return 'Devolución #' + r.id + (r.trackingId ? ' · ' + r.trackingId : ''); },
          secondaryFn: function (r) { return r.status || ''; }
        },
        { key: 'users',      label: 'Usuarios',     icon: 'person',         urlFn: function () { return '/user'; },
          primaryFn:   function (r) { return r.fullName; },
          secondaryFn: function (r) { return r.role || ''; }
        },
    ];

    function renderResults(data) {
        var hasAny = CATEGORIES.some(function (cat) { return (data[cat.key] || []).length > 0; });

        if (!hasAny) {
            results.innerHTML = '<p class="univ-search__empty">Sin resultados</p>';
            return;
        }

        var html = '';
        var first = true;

        CATEGORIES.forEach(function (cat) {
            var items = data[cat.key] || [];
            if (!items.length) return;

            if (!first) html += '<div class="univ-search__sep"></div>';
            first = false;

            html += '<div class="univ-search__category">'
                  + '<span class="material-symbols-outlined">' + cat.icon + '</span>'
                  + escHtml(cat.label)
                  + '</div>';

            items.forEach(function (r) {
                var url       = cat.urlFn(r);
                var primary   = cat.primaryFn(r);
                var secondary = cat.secondaryFn(r);

                html += '<a href="' + escHtml(url) + '" class="univ-search__item">'
                      + '<div class="univ-search__item-icon">'
                      + '<span class="material-symbols-outlined">' + cat.icon + '</span>'
                      + '</div>'
                      + '<div class="univ-search__item-text">'
                      + '<div class="univ-search__item-primary">'  + escHtml(primary)   + '</div>'
                      + (secondary ? '<div class="univ-search__item-secondary">' + escHtml(secondary) + '</div>' : '')
                      + '</div>'
                      + '</a>';
            });
        });

        results.innerHTML = html;

        // Cerrar panel al navegar
        results.querySelectorAll('a.univ-search__item').forEach(function (a) {
            a.addEventListener('click', closePanel);
        });
    }

    function escHtml(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();
