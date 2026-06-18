(function () {
    'use strict';

    var wrapper = document.getElementById('univ-search');
    var bar     = document.getElementById('univ-search-bar');
    var spinner = document.getElementById('univ-search-spinner');
    var panel   = document.getElementById('univ-search-panel');
    var input   = document.getElementById('univ-search-input');
    var results = document.getElementById('univ-search-results');

    if (!wrapper || !panel || !input) return;

    var debounceTimer = null;
    var fetchSeq      = 0;

    var ALLOWED_BY_ROLE = {
        1: ['shipments', 'incidents', 'routes', 'returns'],
        2: ['shipments', 'incidents'],
        3: ['shipments', 'incidents', 'routes'],
        4: ['shipments', 'incidents', 'routes', 'returns', 'users'],
    };

    var CATEGORIES = [
        { key: 'shipments',  label: 'Envíos',       icon: 'local_shipping',
          urlFn: function (r, roleId) { return '/shipment/detail/' + r.id; },
          primaryFn:   function (r) { return r.trackingId || 'Envío #' + r.id; },
          secondaryFn: function (r) { return [r.recipientName, r.status].filter(Boolean).join(' · '); }
        },
        { key: 'incidents',  label: 'Incidencias',  icon: 'report',
          urlFn: function (r) { return '/incident/' + r.id; },
          primaryFn:   function (r) { return 'Incidencia #' + r.id + (r.trackingId ? ' · ' + r.trackingId : ''); },
          secondaryFn: function (r) { return [r.type, r.status].filter(Boolean).join(' · '); }
        },
        { key: 'routes',     label: 'Rutas',        icon: 'route',
          urlFn: function (r, roleId) { return roleId === 3 ? '/delivery/route/' + r.id : '/route/' + r.id; },
          primaryFn:   function (r) { return 'Ruta #' + r.id; },
          secondaryFn: function (r, roleId) {
              if (roleId === 3) {
                  return [r.transportName || r.branchName, r.status].filter(Boolean).join(' · ');
              }
              return [r.driverName, r.status].filter(Boolean).join(' · ');
          }
        },
        { key: 'returns',    label: 'Devoluciones', icon: 'assignment_return',
          urlFn: function (r) { return '/returns/' + r.id; },
          primaryFn:   function (r) { return 'Devolución #' + r.id + (r.trackingId ? ' · ' + r.trackingId : ''); },
          secondaryFn: function (r) { return r.status || ''; }
        },
        { key: 'users',      label: 'Usuarios',     icon: 'person',
          urlFn: function () { return '/user'; },
          primaryFn:   function (r) { return r.fullName; },
          secondaryFn: function (r) { return r.role || ''; }
        },
    ];

    function resolveRoleId() {
        var rid = parseInt(wrapper.getAttribute('data-role-id'), 10) || 0;
        if (!rid && window.location.pathname.startsWith('/delivery')) {
            rid = 3;
        }
        return rid;
    }

    function getAllowedKeys() {
        var roleId = resolveRoleId();
        var keys = (ALLOWED_BY_ROLE[roleId] || ['shipments', 'incidents']).slice();
        if ((roleId === 3 || window.location.pathname.startsWith('/delivery'))
            && keys.indexOf('routes') < 0) {
            keys.push('routes');
        }
        return keys;
    }

    function getVisibleCategories() {
        var allowed = getAllowedKeys();
        return CATEGORIES.filter(function (cat) {
            return allowed.indexOf(cat.key) >= 0;
        });
    }

    // ── Abrir / cerrar panel de resultados ───────────────────────────────────

    function openPanel() {
        panel.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    function closePanel() {
        panel.hidden = true;
        input.setAttribute('aria-expanded', 'false');
    }

    function setLoading(isLoading) {
        if (bar) bar.classList.toggle('is-loading', isLoading);
        if (spinner) spinner.hidden = !isLoading;
        if (results) results.classList.toggle('is-loading', isLoading);
        wrapper.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    }

    input.addEventListener('focus', openPanel);

    document.addEventListener('click', function (e) {
        if (!wrapper.contains(e.target)) closePanel();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closePanel();
            input.blur();
        }
    });

    // ── Búsqueda con debounce ────────────────────────────────────────────────

    input.addEventListener('input', function () {
        var q = input.value.trim();
        clearTimeout(debounceTimer);

        if (q.length < 2) {
            setLoading(false);
            results.innerHTML = '<p class="univ-search__hint">Escribí al menos 2 caracteres</p>';
            return;
        }

        debounceTimer = setTimeout(function () { fetchResults(q); }, 300);
    });

    function fetchResults(q) {
        var seq = ++fetchSeq;
        setLoading(true);
        openPanel();
        results.innerHTML = '<p class="univ-search__hint univ-search__hint--loading">Buscando…</p>';

        fetch('/api/search?q=' + encodeURIComponent(q), { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                if (seq !== fetchSeq) return;
                setLoading(false);
                renderResults(data);
            })
            .catch(function () {
                if (seq !== fetchSeq) return;
                setLoading(false);
                results.innerHTML = '<p class="univ-search__empty">Error al buscar. Intentá de nuevo.</p>';
            });
    }

    // ── Renderizado de resultados ────────────────────────────────────────────

    function renderResults(data) {
        var roleId = resolveRoleId();
        var visibleCategories = getVisibleCategories();
        var hasAny = visibleCategories.some(function (cat) {
            return (data[cat.key] || []).length > 0;
        });

        if (!hasAny) {
            results.innerHTML = '<p class="univ-search__empty">Sin resultados para «' + escHtml(input.value.trim()) + '»</p>';
            return;
        }

        var html = '';
        var first = true;

        visibleCategories.forEach(function (cat) {
            var items = data[cat.key] || [];
            if (!items.length) return;

            if (!first) html += '<div class="univ-search__sep"></div>';
            first = false;

            html += '<div class="univ-search__category">'
                  + '<span class="material-symbols-outlined">' + cat.icon + '</span>'
                  + escHtml(cat.label)
                  + ' <span class="univ-search__count">(' + items.length + ')</span>'
                  + '</div>';

            items.forEach(function (r) {
                var url       = cat.urlFn(r, roleId);
                var primary   = cat.primaryFn(r);
                var secondary = cat.secondaryFn(r, roleId);

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
