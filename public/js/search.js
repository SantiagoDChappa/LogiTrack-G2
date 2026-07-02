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
    var focusIndex    = -1;
    var focusables    = [];

    var ALLOWED_BY_ROLE = {
        1: ['shipments', 'incidents', 'routes', 'returns', 'modifications', 'portalClients'],
        2: ['shipments', 'incidents', 'routes', 'modifications', 'portalClients'],
        3: ['shipments', 'incidents', 'routes'],
        4: ['shipments', 'incidents', 'routes', 'returns', 'users', 'modifications', 'portalClients'],
    };

    function looksLikeTracking(q) {
        return /^[A-Za-z]/.test(q) || q.indexOf('-') >= 0 || q.indexOf('_') >= 0;
    }

    function moreUrlShipments(q) {
        if (looksLikeTracking(q)) {
            return '/shipment/search?trackingId=' + encodeURIComponent(q);
        }
        return '/shipment/search?name=' + encodeURIComponent(q);
    }

    function moreUrlIncidents(q) {
        if (/^\d{1,9}$/.test(q)) {
            return '/incident?id=' + encodeURIComponent(q);
        }
        if (looksLikeTracking(q)) {
            return '/incident?trackingId=' + encodeURIComponent(q);
        }
        if (q.indexOf('@') >= 0) {
            return '/incident?reporterEmail=' + encodeURIComponent(q);
        }
        return '/incident?reporterName=' + encodeURIComponent(q);
    }

    var CATEGORIES = [
        { key: 'shipments', label: 'Envíos', icon: 'local_shipping',
          urlFn: function (r) { return '/shipment/detail/' + r.id; },
          moreUrlFn: moreUrlShipments,
          primaryFn: function (r) { return r.trackingId || 'Envío #' + r.id; },
          statusFn: function (r) {
              return r.status ? { label: r.status, slug: r.statusSlug, kind: 'shipment' } : null;
          },
          detailFn: function (r) {
              var parts = [];
              if (r.senderName) parts.push({ label: 'Rem.', value: r.senderName });
              if (r.recipientName) parts.push({ label: 'Dest.', value: r.recipientName });
              return parts;
          },
          matchFn: function (r) { return matchMeta(r); },
          secondaryFn: function (r) {
              if (r.secondary) return r.secondary;
              return [r.recipientName, r.status].filter(Boolean).join(' · ');
          }
        },
        { key: 'incidents', label: 'Incidencias', icon: 'report',
          urlFn: function (r) { return '/incident/' + r.id; },
          moreUrlFn: moreUrlIncidents,
          primaryFn: function (r) {
              return 'Incidencia #' + r.id + (r.trackingId ? ' · ' + r.trackingId : '');
          },
          statusFn: function (r) {
              return r.status ? { label: r.status, slug: r.statusCode, kind: 'incident' } : null;
          },
          detailFn: function (r) {
              var parts = [];
              if (r.type) parts.push({ label: 'Tipo', value: r.type });
              if (r.reporterName) parts.push({ label: 'Reportante', value: r.reporterName });
              return parts;
          },
          matchFn: function (r) { return matchMeta(r); },
          secondaryFn: function (r) { return [r.type, r.status].filter(Boolean).join(' · '); }
        },
        { key: 'routes', label: 'Rutas', icon: 'route',
          urlFn: function (r, roleId) {
              return roleId === 3 ? '/delivery/route/' + r.id : '/route/' + r.id;
          },
          moreUrlFn: function (q) { return '/route?q=' + encodeURIComponent(q); },
          primaryFn: function (r) { return 'Ruta #' + r.id; },
          statusFn: function (r) {
              return r.status ? { label: r.status, slug: r.statusSlug, kind: 'route' } : null;
          },
          detailFn: function (r, roleId) {
              if (roleId === 3) {
                  return [
                      r.transportName ? { label: 'Transporte', value: r.transportName } : null,
                      r.branchName ? { label: 'Sucursal', value: r.branchName } : null,
                  ].filter(Boolean);
              }
              return [
                  r.driverName ? { label: 'Repartidor', value: r.driverName } : null,
                  r.transportName ? { label: 'Transporte', value: r.transportName } : null,
              ].filter(Boolean);
          },
          secondaryFn: function (r, roleId) {
              if (roleId === 3) {
                  return [r.transportName || r.branchName, r.status].filter(Boolean).join(' · ');
              }
              return [r.driverName, r.status].filter(Boolean).join(' · ');
          }
        },
        { key: 'returns', label: 'Devoluciones', icon: 'assignment_return',
          urlFn: function (r) { return '/incident/' + r.id; },
          moreUrlFn: function (q) { return '/incident?trackingId=' + encodeURIComponent(q); },
          primaryFn: function (r) {
              return 'Devolución #' + r.id + (r.trackingId ? ' · ' + r.trackingId : '');
          },
          statusFn: function (r) {
              return r.status ? { label: r.status, slug: r.statusCode, kind: 'incident' } : null;
          },
          matchFn: function (r) { return matchMeta(r); },
          secondaryFn: function (r) { return r.status || ''; }
        },
        { key: 'modifications', label: 'Modificaciones portal', icon: 'edit_note',
          urlFn: function (r) { return '/shipment/detail/' + r.shipmentId; },
          moreUrlFn: function () { return '/shipment/modifications?status=ALL'; },
          primaryFn: function (r) {
              return 'Solicitud #' + r.id + (r.trackingId ? ' · ' + r.trackingId : '');
          },
          statusFn: function (r) {
              return r.status ? { label: r.status, slug: r.statusSlug, kind: 'mod' } : null;
          },
          detailFn: function (r) {
              var parts = [];
              if (r.changeType) parts.push({ label: 'Cambio', value: r.changeType });
              if (r.recipientName) parts.push({ label: 'Dest.', value: r.recipientName });
              return parts;
          },
          matchFn: function (r) { return matchMeta(r); },
          secondaryFn: function (r) {
              return [r.recipientName, r.status, r.changeType].filter(Boolean).join(' · ');
          }
        },
        { key: 'portalClients', label: 'Clientes portal', icon: 'person_search',
          urlFn: function (r) {
              var param = r.matchAs === 'recipient' ? 'recipientDocument' : 'senderDocument';
              return '/shipment/search?' + param + '=' + encodeURIComponent(r.document);
          },
          moreUrlFn: function (q) {
              if (/^\d{1,9}$/.test(q)) {
                  return '/shipment/search?document=' + encodeURIComponent(q);
              }
              return '/shipment/search?name=' + encodeURIComponent(q);
          },
          primaryFn: function (r) { return r.fullName || 'Doc. ' + r.document; },
          detailFn: function (r) {
              var parts = [];
              if (r.email) parts.push({ label: 'Email', value: r.email });
              if (r.document) parts.push({ label: 'Doc.', value: String(r.document) });
              if (r.shipmentCount > 1) parts.push({ label: 'Envíos', value: String(r.shipmentCount) });
              return parts;
          },
          matchFn: function (r) { return matchMeta(r); },
          secondaryFn: function (r) {
              var parts = [];
              if (r.email) parts.push(r.email);
              if (r.shipmentCount > 1) parts.push(r.shipmentCount + ' envíos');
              return parts.join(' · ');
          }
        },
        { key: 'users', label: 'Usuarios', icon: 'person',
          urlFn: function (r) { return '/user/update/' + r.id; },
          moreUrlFn: function (q) { return '/user/search?fullName=' + encodeURIComponent(q); },
          primaryFn: function (r) { return r.fullName; },
          statusFn: function (r) {
              return r.role ? { label: r.role, slug: 'role', kind: 'role' } : null;
          },
          detailFn: function (r) {
              return r.email ? [{ label: 'Email', value: r.email }] : [];
          },
          secondaryFn: function (r) {
              return [r.role, r.email].filter(Boolean).join(' · ');
          }
        },
    ];

    function matchMeta(r) {
        if (!r.matchLabel) return null;
        return { label: r.matchLabel, value: r.matchValue || '' };
    }

    function statusBadgeHtml(status) {
        if (!status || !status.label) return '';
        var cls = 'univ-search__badge';
        if (status.kind === 'incident') {
            cls += ' incident-badge incident-badge--' + escHtml(status.slug || 'open');
        } else if (status.kind === 'role') {
            cls += ' univ-search__badge--role';
        } else {
            cls += ' status-badge status-badge--sm';
            if (status.slug) cls += ' ' + escHtml(status.slug);
        }
        return '<span class="univ-search__status"><span class="' + cls + '">' + escHtml(status.label) + '</span></span>';
    }

    function matchHintHtml(meta) {
        if (!meta || !meta.label) return '';
        var value = meta.value ? ' «' + escHtml(meta.value) + '»' : '';
        return '<div class="univ-search__match">Coincide en <strong>' + escHtml(meta.label) + '</strong>' + value + '</div>';
    }

    function detailRowsHtml(parts) {
        if (!parts || !parts.length) return '';
        return '<div class="univ-search__details">' + parts.map(function (p) {
            return '<span class="univ-search__detail">'
                + '<span class="univ-search__detail-label">' + escHtml(p.label) + '</span> '
                + escHtml(p.value)
                + '</span>';
        }).join('<span class="univ-search__detail-sep">·</span>') + '</div>';
    }

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

    function isTypingContext(el) {
        if (!el || !el.tagName) return false;
        var tag = el.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select'
            || el.isContentEditable;
    }

    function openPanel() {
        panel.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    function closePanel() {
        panel.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        focusIndex = -1;
        focusables = [];
    }

    function setLoading(isLoading) {
        if (bar) bar.classList.toggle('is-loading', isLoading);
        if (spinner) spinner.hidden = !isLoading;
        if (results) results.classList.toggle('is-loading', isLoading);
        wrapper.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    }

    function updateFocusHighlight() {
        focusables.forEach(function (el, i) {
            el.classList.toggle('is-focused', i === focusIndex);
        });
        if (focusIndex >= 0 && focusables[focusIndex]) {
            focusables[focusIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    function collectFocusables() {
        if (!results) return [];
        return Array.from(results.querySelectorAll('a.univ-search__item, a.univ-search__more'));
    }

    input.addEventListener('focus', openPanel);

    document.addEventListener('click', function (e) {
        if (!wrapper.contains(e.target)) closePanel();
    });

    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            if (isTypingContext(document.activeElement) && document.activeElement !== input) return;
            e.preventDefault();
            input.focus();
            openPanel();
            return;
        }

        if (e.key === 'Escape') {
            closePanel();
            input.blur();
            return;
        }

        if (panel.hidden || document.activeElement !== input) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!focusables.length) focusables = collectFocusables();
            if (!focusables.length) return;
            e.preventDefault();
            if (e.key === 'ArrowDown') {
                focusIndex = focusIndex < focusables.length - 1 ? focusIndex + 1 : 0;
            } else {
                focusIndex = focusIndex > 0 ? focusIndex - 1 : focusables.length - 1;
            }
            updateFocusHighlight();
            return;
        }

        if (e.key === 'Enter' && focusIndex >= 0 && focusables[focusIndex]) {
            e.preventDefault();
            focusables[focusIndex].click();
        }
    });

    input.addEventListener('input', function () {
        var q = input.value.trim();
        clearTimeout(debounceTimer);
        focusIndex = -1;
        focusables = [];

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
                renderResults(data, q);
            })
            .catch(function () {
                if (seq !== fetchSeq) return;
                setLoading(false);
                results.innerHTML = '<p class="univ-search__empty">Error al buscar. Intentá de nuevo.</p>';
            });
    }

    function renderResults(data, q) {
        var roleId = resolveRoleId();
        var visibleCategories = getVisibleCategories();
        var meta = data.meta || {};
        var hasAny = visibleCategories.some(function (cat) {
            return (data[cat.key] || []).length > 0;
        });

        if (!hasAny) {
            results.innerHTML = '<p class="univ-search__empty">Sin resultados para «' + escHtml(q) + '»</p>';
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
                var url = cat.urlFn(r, roleId);
                var primary = cat.primaryFn(r, roleId);
                var status = cat.statusFn ? cat.statusFn(r, roleId) : null;
                var details = cat.detailFn ? cat.detailFn(r, roleId) : [];
                var match = cat.matchFn ? cat.matchFn(r, roleId) : null;

                html += '<a href="' + escHtml(url) + '" class="univ-search__item">'
                      + '<div class="univ-search__item-icon">'
                      + '<span class="material-symbols-outlined">' + cat.icon + '</span>'
                      + '</div>'
                      + '<div class="univ-search__item-text">'
                      + '<div class="univ-search__item-primary">' + escHtml(primary) + '</div>'
                      + detailRowsHtml(details)
                      + matchHintHtml(match)
                      + '</div>'
                      + statusBadgeHtml(status)
                      + '</a>';
            });

            if (meta[cat.key] && meta[cat.key].hasMore && cat.moreUrlFn) {
                html += '<a href="' + escHtml(cat.moreUrlFn(q, roleId)) + '" class="univ-search__more">Ver todos →</a>';
            }
        });

        results.innerHTML = html;
        focusables = collectFocusables();
        focusIndex = -1;

        results.querySelectorAll('a.univ-search__item, a.univ-search__more').forEach(function (a) {
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
