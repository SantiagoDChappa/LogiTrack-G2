/* Mapa interactivo del admin de zonas.
   Aditivo: la tabla sigue siendo el fallback. Geometría desde georef
   (apis.datos.gob.ar), datos de zonas desde /api/zones-geo/summary.
   No rompe nada si la API externa falla: muestra aviso y queda la tabla. */
(function () {
    'use strict';
    var root = document.getElementById('zone-map');
    if (!root) { return; }

    var GEOREF = 'https://apis.datos.gob.ar/georef/api';
    var COLOR_NONE = '#cbd5e1';   // sin zona
    var COLOR_MULTI = '#6d4aff';  // varias zonas

    var map = null;
    var provLayer = null;
    var deptLayer = null;
    var summary = null;            // { provinces:[], maxZoneCount }
    var byKey = {};                // provinceKey normalizado -> provincia
    var initialized = false;
    var currentProvince = null;

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

    function chip(z) {
        return '<span class="zmp-chip" style="background:' + z.color + '"></span>';
    }
    function zoneCard(z) {
        return '<div class="zmp-zone">' +
            '<div class="zmp-zone__head">' + chip(z) +
                '<strong>' + z.name + '</strong>' +
                (z.enabled ? '' : '<span class="zmp-off">deshabilitada</span>') +
            '</div>' +
            '<dl class="zmp-grid">' +
                '<dt>Costo base</dt><dd>' + money(z.baseCost) + '</dd>' +
                '<dt>Recargo/kg</dt><dd>' + money(z.surchargePerKg) + '</dd>' +
                '<dt>Recargo/m³</dt><dd>' + money(z.surchargePerM3) + '</dd>' +
                '<dt>Prefijos CP</dt><dd>' + (z.prefixes.length ? z.prefixes.join(', ') : '—') + '</dd>' +
                '<dt>Envíos</dt><dd>' + z.shipmentCount + '</dd>' +
                '<dt>Transportistas</dt><dd>' + z.transportCount + '</dd>' +
            '</dl></div>';
    }
    function renderProvincePanel(p, isPinned) {
        if (!panel) { return; }
        if (!p) {
            panel.innerHTML = '<p class="zmp-hint">Pasá el cursor por una provincia. Click para fijar y entrar a sus partidos.</p>';
            return;
        }
        var html = '<div class="zmp-head"><h3>' + p.provinceName + '</h3>' +
            (isPinned ? '<button type="button" class="zmp-close" aria-label="Cerrar">&times;</button>' : '') + '</div>' +
            '<p class="zmp-sub">' + p.zoneCount + (p.zoneCount === 1 ? ' zona' : ' zonas') + '</p>';
        if (p.zoneCount === 0) {
            html += '<p class="zmp-hint">Sin zonas cargadas en esta provincia.</p>';
        } else {
            html += p.zones.map(zoneCard).join('');
        }
        if (isPinned) {
            html += '<p class="zmp-hint">Mostrando partidos. La asignación de zona por partido es a nivel provincia hasta cablear el puente CP→partido.</p>';
        }
        panel.innerHTML = html;
        var close = panel.querySelector('.zmp-close');
        if (close) { close.addEventListener('click', clearPinned); }
    }
    function clearPinned() {
        pinned = false;
        currentProvince = null;
        if (deptLayer) { map.removeLayer(deptLayer); deptLayer = null; }
        if (provLayer) { provLayer.setStyle(provStyle); }
        renderProvincePanel(null, false);
        map.setView([-40, -63], 4);
    }

    /* ---------- estilos de capa ---------- */
    function provStyle(feature) {
        var p = byKey[norm(feature.properties.nombre)];
        return {
            fillColor: provinceFill(p),
            weight: 1, color: '#ffffff', fillOpacity: p ? 0.78 : 0.35,
        };
    }
    function deptStyle() {
        var p = currentProvince;
        var fill = (p && p.zoneCount === 1) ? p.zones[0].color : (p && p.zoneCount > 1 ? COLOR_MULTI : COLOR_NONE);
        return { fillColor: fill, weight: 1, color: '#ffffff', fillOpacity: 0.7 };
    }

    /* ---------- interacción provincias ---------- */
    function onEachProvince(feature, layer) {
        var key = norm(feature.properties.nombre);
        var p = byKey[key] || { provinceName: feature.properties.nombre, zoneCount: 0, zones: [] };
        layer.bindTooltip(p.provinceName + ' · ' + p.zoneCount + (p.zoneCount === 1 ? ' zona' : ' zonas'), { sticky: true });
        layer.on({
            mouseover: function () {
                if (pinned) { return; }
                layer.setStyle({ weight: 2.5, color: '#1a3566', fillOpacity: 0.9 });
                renderProvincePanel(p, false);
            },
            mouseout: function () {
                if (pinned) { return; }
                provLayer.resetStyle(layer);
                renderProvincePanel(null, false);
            },
            click: function () {
                pinned = true;
                currentProvince = p;
                renderProvincePanel(p, true);
                provLayer.setStyle({ fillOpacity: 0.15, weight: 1 });
                layer.setStyle({ fillOpacity: 0.25, weight: 2.5, color: '#1a3566' });
                var gid = feature.properties.id;
                if (gid) { loadDepartamentos(gid); map.fitBounds(layer.getBounds(), { padding: [20, 20] }); }
            },
        });
    }

    function onEachDept(feature, layer) {
        layer.bindTooltip(feature.properties.nombre, { sticky: true });
        layer.on({
            mouseover: function () { layer.setStyle({ weight: 2.5, color: '#1a3566' }); },
            mouseout: function () { deptLayer.resetStyle(layer); },
        });
    }

    /* ---------- carga de datos ---------- */
    function showError(msg) {
        var box = document.getElementById('zone-map-error');
        if (box) { box.textContent = msg; box.hidden = false; }
    }

    function loadDepartamentos(provGeoId) {
        if (deptLayer) { map.removeLayer(deptLayer); deptLayer = null; }
        fetch(GEOREF + '/departamentos?provincia=' + encodeURIComponent(provGeoId) + '&campos=id,nombre&max=200&formato=geojson')
            .then(function (r) { return r.json(); })
            .then(function (geo) {
                if (!geo || !geo.features) { return; }
                deptLayer = L.geoJSON(geo, { style: deptStyle, onEachFeature: onEachDept }).addTo(map);
            })
            .catch(function () { showError('No se pudieron cargar los partidos (georef no disponible).'); });
    }

    function buildMap() {
        map = L.map(root, { scrollWheelZoom: true, attributionControl: true }).setView([-40, -63], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18, attribution: '&copy; OpenStreetMap',
        }).addTo(map);

        Promise.all([
            fetch('/api/zones-geo/summary').then(function (r) { return r.json(); }),
            fetch(GEOREF + '/provincias?campos=id,nombre&max=30&formato=geojson').then(function (r) { return r.json(); }),
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
    }

    function renderLegend() {
        var box = document.getElementById('zone-map-legend');
        if (!box || !summary) { return; }
        var items = '<div class="zml-item"><span class="zml-sw" style="background:' + COLOR_NONE + '"></span>Sin zona</div>' +
            '<div class="zml-item"><span class="zml-sw" style="background:' + COLOR_MULTI + '"></span>Varias zonas</div>';
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
