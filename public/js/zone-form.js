/* Selector de partidos para el form de zona (alta/edición).
   La zona se sigue definiendo por prefijos CP para el costeo; los partidos
   son la capa visual del mapa. Trae los partidos de la provincia elegida
   desde georef (apis.datos.gob.ar) y los muestra como checkboxes.
   Aditivo: si georef falla, el resto del form sigue funcionando. */
(function () {
    'use strict';
    var picker = document.getElementById('partido-picker');
    if (!picker) { return; }

    var GEOREF = 'https://apis.datos.gob.ar/georef/api';
    var provSelect = document.getElementById('provinceId');
    var selected = {};   // códigoINDEC -> true
    var provByName = null; // nombre normalizado -> id georef

    // ids ya guardados (update). Vienen en data-selected como JSON.
    try {
        (JSON.parse(picker.getAttribute('data-selected') || '[]') || []).forEach(function (d) { selected[d] = true; });
    } catch (e) { /* sin selección previa */ }

    function norm(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    }
    function setMsg(html) { picker.innerHTML = '<p class="partido-picker__msg">' + html + '</p>'; }

    function loadProvinces() {
        if (provByName) { return Promise.resolve(provByName); }
        return fetch(GEOREF + '/provincias?campos=id,nombre&max=30')
            .then(function (r) { return r.json(); })
            .then(function (j) {
                provByName = {};
                (j.provincias || []).forEach(function (p) { provByName[norm(p.nombre)] = p.id; });
                return provByName;
            });
    }

    function render(departamentos) {
        if (!departamentos.length) { setMsg('Esta provincia no tiene partidos en georef.'); return; }
        departamentos.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
        var html = '<div class="partido-picker__grid">';
        departamentos.forEach(function (d) {
            var checked = selected[d.id] ? ' checked' : '';
            html += '<label class="partido-picker__item">' +
                '<input type="checkbox" name="departamentoIds" value="' + d.id + '"' + checked + '>' +
                '<span>' + d.nombre + '</span></label>';
        });
        html += '</div>';
        picker.innerHTML = html;
    }

    function loadPartidos() {
        var opt = provSelect && provSelect.options[provSelect.selectedIndex];
        var provName = opt ? opt.text : '';
        if (!provSelect || !provSelect.value || !provName) {
            setMsg('Elegí una provincia para asignar partidos.');
            return;
        }
        setMsg('Cargando partidos…');
        loadProvinces()
            .then(function (map) {
                var geoId = map[norm(provName)];
                if (!geoId) { setMsg('No se encontró la provincia en georef.'); return; }
                return fetch(GEOREF + '/departamentos?provincia=' + geoId + '&campos=id,nombre&max=200')
                    .then(function (r) { return r.json(); })
                    .then(function (j) { render(j.departamentos || []); });
            })
            .catch(function () { setMsg('No se pudieron cargar los partidos (georef no disponible).'); });
    }

    if (provSelect) { provSelect.addEventListener('change', function () { selected = {}; loadPartidos(); }); }
    loadPartidos();
})();
