/* Mapa interactivo del admin de zonas.
   Aditivo: la tabla sigue siendo el fallback. Geometría desde georef
   (apis.datos.gob.ar), datos de zonas desde /api/zones-geo/summary.
   No rompe nada si la API externa falla: muestra aviso y queda la tabla. */
(function () {
    'use strict';
    var root = document.getElementById('zone-map');
    if (!root) { return; }

    // Polígonos oficiales (IGN/georef) bundleados en public/geo. La API de
    // georef solo devuelve centroides (Point), no formas, por eso van locales.
    var GEO_PROVINCES = '/geo/provincias.geojson';
    var GEO_DEPARTAMENTOS = '/geo/departamentos.geojson';
    var COLOR_NONE = '#cbd5e1';   // sin zona
    var COLOR_MULTI = '#6d4aff';  // varias zonas
    var COLOR_DANGER = '#dc2626'; // peligrosa (llegable: recarga el envío)
    var COLOR_BLOCKED = '#7f1d1d';// no llegable (no se entrega)
    var DANGER_API = '/api/danger-areas';

    var map = null;
    var provLayer = null;
    var deptLayer = null;
    var summary = null;            // { provinces:[], maxZoneCount }
    var byKey = {};                // provinceKey normalizado -> provincia
    var initialized = false;
    var currentProvince = null;
    var deptPinned = false;        // partido fijado por click (no se pierde al sacar el cursor)
    var pinnedDeptLayer = null;    // capa del partido fijado, para mantener su resaltado
    var deptIndex = {};            // códigoINDEC partido -> zona (de la provincia activa)
    var cpIndex = {};              // código postal -> localidad (para mostrar nombres, no solo números)
    var dangerLayer = null;        // capa de áreas peligrosas / no llegables (overlay rojo)
    var pendingDraw = null;        // polígono recién dibujado, a la espera de guardarse

    function norm(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    }
    function money(n) {
        return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function provinceFill(p) {
        if (!p || p.zoneCount === 0) { return COLOR_NONE; }
        if (p.zoneCount === 1) { return p.zones[0].color; }
        return COLOR_MULTI;
    }

    /* ---------- panel lateral de info ---------- */
    var panel = document.getElementById('zone-map-panel');
    var pinned = false;

    // Agrupa los prefijos CP por localidad para mostrar nombres ("Florida (1602)")
    // en vez de solo números. Los CP sin localidad conocida quedan como código suelto.
    function formatPrefixes(prefixes) {
        if (!prefixes || !prefixes.length) { return '—'; }
        var groups = {}, order = [];
        prefixes.forEach(function (cp) {
            var name = cpIndex[cp] || null;
            var key = name || ('#' + cp);
            if (!groups[key]) { groups[key] = { name: name, cps: [] }; order.push(key); }
            groups[key].cps.push(cp);
        });
        return order.map(function (k) {
            var g = groups[k];
            return g.name
                ? g.name + ' <span class="zmp-cp">(' + g.cps.join(', ') + ')</span>'
                : '<span class="zmp-cp">' + g.cps.join(', ') + '</span>';
        }).join(' · ');
    }
    // Nombres de localidad únicos (sin CP) para el resumen del card.
    function localidadNames(prefixes) {
        var names = [], seen = {};
        (prefixes || []).forEach(function (cp) {
            var nm = cpIndex[cp] || ('CP ' + cp);
            if (!seen[nm]) { seen[nm] = true; names.push(nm); }
        });
        return names;
    }
    // opts.expandLocs: muestra la lista completa de localidades (vista de partido fijado,
    // donde sobra espacio y conviene el detalle). opts.wide: card a ancho completo.
    function zoneCard(z, opts) {
        opts = opts || {};
        var env = z.shipmentCount > 0 ? z.shipmentCount : '—';
        var tr  = z.transportCount > 0 ? z.transportCount : '—';
        var names = localidadNames(z.prefixes);
        var total = names.length;
        var summary = total === 0 ? 'Sin localidades'
            : (total <= 3 ? names.slice(0, 3).join(', ') + '.'
                          : names.slice(0, 3).join(', ') + ' y ' + (total - 3) + ' más.');
        var more = total > 0 ? ' <a class="zmp-more" data-zone="' + z.id + '">'
                + (total > 3 ? 'Ver detalles' : 'Ver todas') + '</a>' : '';
        var locsSection = opts.expandLocs
            ? '<section class="zmp-sec">' +
                '<p class="zmp-sec__label">Localidades (' + total + ')</p>' +
                '<p class="zmp-locs"><span class="material-symbols-outlined">location_on</span>' +
                    '<span>' + (total ? formatPrefixes(z.prefixes) : 'Sin localidades') + '</span></p>' +
              '</section>'
            : '<section class="zmp-sec">' +
                '<p class="zmp-sec__label">Localidades</p>' +
                '<p class="zmp-locs"><span class="material-symbols-outlined">location_on</span>' +
                    '<span>' + summary + more + '</span></p>' +
                '<p class="zmp-locs__full" id="zlocs-' + z.id + '" hidden>' + formatPrefixes(z.prefixes) + '</p>' +
              '</section>';
        return '<article class="zmp-zone' + (opts.wide ? ' zmp-zone--wide' : '') + '" style="--zone-accent:' + z.color + '">' +
            '<header class="zmp-zone__head">' +
                '<span class="zmp-zone__icon material-symbols-outlined">pin_drop</span>' +
                '<h4>' + z.name + '</h4>' +
                (z.enabled ? '' : '<span class="zmp-off">deshabilitada</span>') +
            '</header>' +
            '<section class="zmp-sec">' +
                '<p class="zmp-sec__label">Precios</p>' +
                '<div class="zmp-stats">' +
                    '<span class="zmp-stat"><span class="material-symbols-outlined">payments</span><b>' + money(z.baseCost) + '</b></span>' +
                    '<span class="zmp-stat"><span class="material-symbols-outlined">scale</span><b>+' + money(z.surchargePerKg) + '</b></span>' +
                    '<span class="zmp-stat"><span class="zmp-unit">M³</span><b>+' + money(z.surchargePerM3) + '</b></span>' +
                '</div>' +
            '</section>' +
            '<section class="zmp-sec">' +
                '<p class="zmp-sec__label">Operaciones</p>' +
                '<div class="zmp-stats">' +
                    '<span class="zmp-stat"><span class="material-symbols-outlined">deployed_code</span><b>' + env + '</b> ' + (z.shipmentCount === 1 ? 'Envío' : 'Envíos') + '</span>' +
                    '<span class="zmp-stat"><span class="material-symbols-outlined">local_shipping</span><b>' + tr + '</b> ' + (z.transportCount === 1 ? 'Transportista' : 'Transportistas') + '</span>' +
                '</div>' +
            '</section>' +
            locsSection +
        '</article>';
    }
    // Toggle "Ver detalles/todas" -> despliega la lista completa de localidades.
    function bindPanelInteractions() {
        if (!panel) { return; }
        panel.querySelectorAll('.zmp-more').forEach(function (a) {
            a.dataset.label = a.textContent;
            a.addEventListener('click', function () {
                var box = document.getElementById('zlocs-' + a.getAttribute('data-zone'));
                if (!box) { return; }
                box.hidden = !box.hidden;
                a.textContent = box.hidden ? a.dataset.label : 'Ver menos';
            });
        });
    }
    function renderProvincePanel(p, isPinned) {
        if (!panel) { return; }
        if (!p) {
            panel.classList.add('is-empty');
            panel.innerHTML = '<p class="zmp-hint">Pasá el cursor por una provincia. Click para fijar y entrar a sus partidos.</p>';
            return;
        }
        panel.classList.remove('is-empty');
        var html = '<div class="zmp-head"><h3>' + p.provinceName.toUpperCase() +
            '<span class="zmp-head__sub">: Zonas y Tarifas</span></h3>' +
            (isPinned ? '<button type="button" class="zmp-close" aria-label="Cerrar">&times;</button>' : '') + '</div>';
        if (p.zoneCount === 0) {
            html += '<p class="zmp-hint">Sin zonas cargadas en esta provincia.</p>';
        } else {
            html += '<div class="zmp-zones">' + p.zones.map(zoneCard).join('') + '</div>';
        }
        if (isPinned) {
            html += '<p class="zmp-hint zmp-hint--foot">Mostrando partidos. Pasá el cursor por un partido para ver su zona.</p>';
        }
        panel.innerHTML = html;
        var close = panel.querySelector('.zmp-close');
        if (close) { close.addEventListener('click', clearPinned); }
        bindPanelInteractions();
    }
    function renderDeptPanel(partidoName, z, isPinned) {
        if (!panel) { return; }
        panel.classList.remove('is-empty');
        var html = '<div class="zmp-head"><h3>' + partidoName.toUpperCase() +
            '<span class="zmp-head__sub">' + (currentProvince ? ' · ' + currentProvince.provinceName : '') + '</span></h3>' +
            (isPinned ? '<button type="button" class="zmp-back" aria-label="Volver a la provincia">' +
                '<span class="material-symbols-outlined">arrow_back</span>Volver</button>' : '') + '</div>';
        if (z) {
            // Partido fijado: card a ancho completo y localidades desplegadas (hay espacio).
            html += '<div class="zmp-zones">' + zoneCard(z, isPinned ? { expandLocs: true, wide: true } : {}) + '</div>';
        } else {
            html += '<p class="zmp-hint">Partido sin zona asignada. Asigná partidos desde el formulario de la zona.</p>';
        }
        if (isPinned) {
            html += '<p class="zmp-hint zmp-hint--foot">Partido fijado. Pasá por otro partido para previsualizarlo, o tocá «Volver».</p>';
        }
        panel.innerHTML = html;
        var back = panel.querySelector('.zmp-back');
        if (back) { back.addEventListener('click', clearDeptPinned); }
        bindPanelInteractions();
    }
    function clearDeptPinned() {
        deptPinned = false;
        if (deptLayer && pinnedDeptLayer) { deptLayer.resetStyle(pinnedDeptLayer); }
        pinnedDeptLayer = null;
        renderProvincePanel(currentProvince, true);
    }
    function clearPinned() {
        pinned = false;
        deptPinned = false;
        pinnedDeptLayer = null;
        currentProvince = null;
        if (deptLayer) { map.removeLayer(deptLayer); deptLayer = null; }
        if (provLayer) { provLayer.setStyle(provStyle); }
        renderProvincePanel(null, false);
        map.setView([-40, -63], 4);
    }

    /* ---------- estilos de capa ----------
       Para que una zona se lea como UNA superficie y no como un mosaico de
       partidos: el borde de cada polígono usa el MISMO color que su relleno, así
       los límites internos entre partidos de la misma zona se funden y solo
       resaltan los bordes donde cambia el color (zona contra zona). Relleno más
       translúcido para que se vean las calles/nombres abajo. */
    function provStyle(feature) {
        var p = byKey[norm(feature.properties.nombre)];
        var fill = provinceFill(p);
        return {
            fillColor: fill,
            weight: 0.7, color: p ? fill : '#94a3b8',
            opacity: 0.55, fillOpacity: p ? 0.5 : 0.16,
            lineJoin: 'round', lineCap: 'round',
        };
    }
    function deptStyle(feature) {
        var z = feature ? deptIndex[feature.properties.id] : null;
        var fill = z ? z.color : COLOR_NONE;
        return {
            fillColor: fill,
            weight: 0.7, color: z ? fill : '#94a3b8',
            opacity: 0.6, fillOpacity: z ? 0.52 : 0.18,
            lineJoin: 'round', lineCap: 'round',
        };
    }

    /* ---------- interacción provincias ---------- */
    function onEachProvince(feature, layer) {
        var key = norm(feature.properties.nombre);
        var p = byKey[key] || { provinceName: feature.properties.nombre, zoneCount: 0, zones: [] };
        layer.bindTooltip(p.provinceName + ' · ' + p.zoneCount + (p.zoneCount === 1 ? ' zona' : ' zonas'), { sticky: true });
        layer.on({
            mouseover: function () {
                // En modo fijado (drill) no mostramos tooltip de provincia: manda el partido.
                if (pinned) { layer.closeTooltip(); return; }
                layer.setStyle({ weight: 2.5, color: '#1a3566', fillOpacity: 0.9 });
                renderProvincePanel(p, false);
            },
            mouseout: function () {
                layer.closeTooltip();   // evita tooltips "pegados" al cambiar rápido de provincia
                if (pinned) { return; }
                provLayer.resetStyle(layer);
                renderProvincePanel(null, false);
            },
            click: function () {
                pinned = true;
                deptPinned = false;        // entrar a otra provincia descarta el partido fijado
                pinnedDeptLayer = null;
                currentProvince = p;
                // Cierra cualquier tooltip de provincia que haya quedado abierto.
                provLayer.eachLayer(function (l) { l.closeTooltip(); });
                renderProvincePanel(p, true);
                provLayer.setStyle({ fillOpacity: 0.15, weight: 1 });
                layer.setStyle({ fillOpacity: 0.25, weight: 2.5, color: '#1a3566' });
                var gid = feature.properties.id;
                if (gid) { loadDepartamentos(gid); map.fitBounds(layer.getBounds(), { padding: [20, 20] }); }
            },
        });
    }

    var DEPT_HL = { weight: 2.5, color: '#1a3566', fillOpacity: 0.95 };
    // Partido fijado: relleno casi transparente para ver el mapa abajo, y solo el
    // contorno marcado con el color de su zona (o gris si no tiene zona).
    function deptPinStyle(z) {
        return { weight: 3.5, color: z ? z.color : '#475569', opacity: 1, fillOpacity: 0.05, dashArray: null };
    }
    function onEachDept(feature, layer) {
        var z = deptIndex[feature.properties.id];
        layer.bindTooltip(feature.properties.nombre + ' · ' + (z ? z.name : 'sin zona'), { sticky: true });
        layer.on({
            mouseover: function () {
                if (layer !== pinnedDeptLayer) { layer.setStyle(DEPT_HL); }
                // Hover previsualiza, pero sin pisar el panel del partido fijado.
                if (!deptPinned) { renderDeptPanel(feature.properties.nombre, z, false); }
            },
            mouseout: function () {
                layer.closeTooltip();
                if (layer !== pinnedDeptLayer) { deptLayer.resetStyle(layer); }
                // Vuelve al partido fijado si hay uno; si no, a la vista de la provincia.
                if (deptPinned && pinnedDeptLayer) {
                    var pz = deptIndex[pinnedDeptLayer.feature.properties.id];
                    renderDeptPanel(pinnedDeptLayer.feature.properties.nombre, pz, true);
                } else {
                    renderProvincePanel(currentProvince, true);
                }
            },
            click: function () {
                // Fija el partido: su info queda en el panel aunque saques el cursor.
                if (pinnedDeptLayer && deptLayer) { deptLayer.resetStyle(pinnedDeptLayer); }
                deptPinned = true;
                pinnedDeptLayer = layer;
                layer.setStyle(deptPinStyle(z));
                layer.bringToFront();   // que el contorno no quede tapado por vecinos
                layer.closeTooltip();
                renderDeptPanel(feature.properties.nombre, z, true);
                map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 11 });
            },
        });
    }

    /* ---------- carga de datos ---------- */
    function showError(msg) {
        var box = document.getElementById('zone-map-error');
        if (box) { box.textContent = msg; box.hidden = false; }
    }

    function buildDeptIndex(p) {
        deptIndex = {};
        if (!p) { return; }
        (p.zones || []).forEach(function (z) {
            (z.departamentoIds || []).forEach(function (d) {
                if (!deptIndex[d]) { deptIndex[d] = z; }  // primera zona gana en caso de solapamiento
            });
        });
    }

    var allDeptsGeo = null;   // cache del geojson nacional de partidos

    function drawDepartamentos(provGeoId) {
        var feats = (allDeptsGeo.features || []).filter(function (f) {
            return f.properties && f.properties.provincia && f.properties.provincia.id === provGeoId;
        });
        deptLayer = L.geoJSON({ type: 'FeatureCollection', features: feats },
            { style: deptStyle, onEachFeature: onEachDept }).addTo(map);
    }

    function loadDepartamentos(provGeoId) {
        if (deptLayer) { map.removeLayer(deptLayer); deptLayer = null; }
        buildDeptIndex(currentProvince);
        if (allDeptsGeo) { drawDepartamentos(provGeoId); return; }
        fetch(GEO_DEPARTAMENTOS)
            .then(function (r) { return r.json(); })
            .then(function (geo) { allDeptsGeo = geo; drawDepartamentos(provGeoId); })
            .catch(function () { showError('No se pudieron cargar los partidos.'); });
    }

    function buildMap() {
        map = L.map(root, { scrollWheelZoom: true, attributionControl: true }).setView([-40, -63], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18, attribution: '&copy; OpenStreetMap',
        }).addTo(map);

        // CP → localidad para mostrar nombres en vez de solo códigos. Best-effort:
        // si falla, los CP se muestran como número (no rompe el mapa).
        fetch('/geo/cp-localidades.json')
            .then(function (r) { return r.json(); })
            .then(function (m) { cpIndex = m || {}; })
            .catch(function () { cpIndex = {}; });

        Promise.all([
            fetch('/api/zones-geo/summary').then(function (r) { return r.json(); }),
            fetch(GEO_PROVINCES).then(function (r) { return r.json(); }),
        ]).then(function (res) {
            summary = res[0];
            var geo = res[1];
            (summary.provinces || []).forEach(function (p) { if (p.provinceKey) { byKey[p.provinceKey] = p; } });
            provLayer = L.geoJSON(geo, { style: provStyle, onEachFeature: onEachProvince }).addTo(map);
            renderLegend();
            renderProvincePanel(null, false);
        }).catch(function () {
            showError('No se pudo cargar el mapa. Usá la vista de tabla.');
        });

        loadDangerAreas();   // overlay rojo de zonas peligrosas / no llegables
        setupDangerDraw();   // herramienta para dibujar nuevas (si Geoman está disponible)
    }

    /* ---------- zonas peligrosas: overlay + dibujo ---------- */
    function dangerStyle(area) {
        var blocked = area && area.reachable === false;
        return {
            color: blocked ? COLOR_BLOCKED : COLOR_DANGER,
            weight: 2, fillColor: blocked ? COLOR_BLOCKED : COLOR_DANGER,
            // Relleno rojo de baja opacidad: se ve el mapa abajo, solo se distingue
            // la mancha de la zona peligrosa. La no llegable va un poco más marcada.
            fillOpacity: blocked ? 0.28 : 0.15, dashArray: blocked ? null : '5,4',
        };
    }
    function dangerTooltip(area) {
        return '<strong>' + (area.name || 'Área peligrosa') + '</strong><br>' +
            (area.reachable === false ? '⛔ No llegable' : '⚠️ Peligrosa (recargo)') +
            (area.note ? '<br>' + area.note : '');
    }
    function loadDangerAreas() {
        fetch(DANGER_API)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (dangerLayer) { map.removeLayer(dangerLayer); dangerLayer = null; }
                var feats = (data.areas || []).filter(function (a) { return a.geom; }).map(function (a) {
                    return { type: 'Feature', geometry: a.geom, properties: a };
                });
                if (!feats.length) { return; }
                dangerLayer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
                    style: function (f) { return dangerStyle(f.properties); },
                    onEachFeature: function (f, layer) {
                        layer.bindTooltip(dangerTooltip(f.properties), { sticky: true });
                    },
                }).addTo(map);
            })
            .catch(function () { /* opcional: el overlay no es crítico */ });
    }

    // Activa el dibujo a mano (Leaflet-Geoman). Si la librería no cargó, no pasa nada.
    function setupDangerDraw() {
        if (!map.pm || setupDangerDraw._done) { return; }
        setupDangerDraw._done = true;
        map.pm.addControls({
            position: 'topright',
            drawMarker: false, drawPolyline: false, drawCircle: false, drawCircleMarker: false,
            drawText: false, drawRectangle: true, drawPolygon: true,
            editMode: false, dragMode: false, cutPolygon: false, rotateMode: false, removalMode: false,
        });
        map.pm.setLang('es');
        map.on('pm:create', function (e) {
            pendingDraw = e.layer;
            var gj = e.layer.toGeoJSON();
            openDangerForm(gj.geometry);
        });
    }

    function cancelPendingDraw() {
        if (pendingDraw) { map.removeLayer(pendingDraw); pendingDraw = null; }
        var f = document.getElementById('zone-danger-form');
        if (f) { f.remove(); }
    }

    // Formulario flotante para nombrar/guardar el área dibujada.
    function openDangerForm(geom) {
        cancelPendingDrawForm();
        var box = document.createElement('div');
        box.id = 'zone-danger-form';
        box.className = 'zone-danger-form';
        box.innerHTML =
            '<h4>Nueva área peligrosa</h4>' +
            '<label>Nombre<input type="text" id="zdf-name" placeholder="Ej: Barrio X"></label>' +
            '<label class="zdf-check"><input type="checkbox" id="zdf-blocked"> No llegable (no se entrega)</label>' +
            '<label>Nota (opcional)<input type="text" id="zdf-note" placeholder="Motivo / referencia"></label>' +
            '<div class="zdf-actions">' +
                '<button type="button" class="btn-secondary" id="zdf-cancel">Cancelar</button>' +
                '<button type="button" class="btn-primary" id="zdf-save">Guardar</button>' +
            '</div>' +
            '<p class="zdf-err" id="zdf-err" hidden></p>';
        document.getElementById('zone-map-view').appendChild(box);
        document.getElementById('zdf-cancel').addEventListener('click', cancelPendingDraw);
        document.getElementById('zdf-save').addEventListener('click', function () { saveDangerArea(geom); });
        document.getElementById('zdf-name').focus();
    }
    function cancelPendingDrawForm() {
        var f = document.getElementById('zone-danger-form');
        if (f) { f.remove(); }
    }
    function saveDangerArea(geom) {
        var name = (document.getElementById('zdf-name').value || '').trim();
        var err = document.getElementById('zdf-err');
        if (!name) { err.textContent = 'Poné un nombre.'; err.hidden = false; return; }
        var btn = document.getElementById('zdf-save');
        btn.disabled = true;
        fetch(DANGER_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scope: 'POLYGON', name: name,
                reachable: !document.getElementById('zdf-blocked').checked,
                note: document.getElementById('zdf-note').value || null,
                geom: geom,
            }),
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
              if (!res.ok || !res.j.ok) { throw new Error(res.j && res.j.error || 'Error'); }
              cancelPendingDraw();        // saca el polígono temporal de Geoman
              loadDangerAreas();          // y lo re-dibuja desde el server con su estilo
          })
          .catch(function (e2) { err.textContent = e2.message || 'No se pudo guardar.'; err.hidden = false; btn.disabled = false; });
    }

    function renderLegend() {
        var box = document.getElementById('zone-map-legend');
        if (!box || !summary) { return; }
        var items = '<div class="zml-item"><span class="zml-sw" style="background:' + COLOR_NONE + '"></span>Sin zona</div>' +
            '<div class="zml-item"><span class="zml-sw" style="background:' + COLOR_MULTI + '"></span>Varias zonas</div>' +
            '<div class="zml-item"><span class="zml-sw zml-sw--danger" style="background:' + COLOR_DANGER + '"></span>Peligrosa (recargo)</div>' +
            '<div class="zml-item"><span class="zml-sw" style="background:' + COLOR_BLOCKED + '"></span>No llegable</div>';
        var seen = {};
        (summary.provinces || []).forEach(function (p) {
            if (p.zoneCount === 1) {
                var z = p.zones[0];
                if (!seen[z.id]) { seen[z.id] = true; items += '<div class="zml-item"><span class="zml-sw" style="background:' + z.color + '"></span>' + z.name + '</div>'; }
            }
        });
        box.innerHTML = items;
    }

    /* ---------- toggle tabla / mapa ---------- */
    var btnTable = document.getElementById('view-table');
    var btnMap = document.getElementById('view-map');
    var tableWrap = document.getElementById('zone-table-view');
    var mapWrap = document.getElementById('zone-map-view');

    function showMap() {
        tableWrap.hidden = true; mapWrap.hidden = false;
        btnTable.classList.remove('active'); btnMap.classList.add('active');
        if (!initialized) { initialized = true; buildMap(); }
        else if (map) { setTimeout(function () { map.invalidateSize(); }, 50); }
    }
    function showTable() {
        mapWrap.hidden = true; tableWrap.hidden = false;
        btnMap.classList.remove('active'); btnTable.classList.add('active');
    }
    if (btnMap) { btnMap.addEventListener('click', showMap); }
    if (btnTable) { btnTable.addEventListener('click', showTable); }

    // El mapa es la vista por defecto: si arranca visible, inicializarlo ya.
    if (mapWrap && !mapWrap.hidden && !initialized) { initialized = true; buildMap(); }
})();
