// LGT-207 — teléfono con característica (select) + número que se formatea en vivo.
// Muestra "11 5456 5446" o, si es celular, "9 11 2384 2323". Guarda dígitos planos
// (9 + característica + local) en el hidden senderPhone/recipientPhone para el backend.
(function () {
    var AREAS = [
        ['11', '11 · CABA y GBA'], ['221', '221 · La Plata'], ['223', '223 · Mar del Plata'],
        ['261', '261 · Mendoza'], ['264', '264 · San Juan'], ['280', '280 · Puerto Madryn'],
        ['291', '291 · Bahía Blanca'], ['294', '294 · Bariloche'], ['297', '297 · Comodoro'],
        ['299', '299 · Neuquén'], ['341', '341 · Rosario'], ['342', '342 · Santa Fe'],
        ['343', '343 · Paraná'], ['351', '351 · Córdoba'], ['358', '358 · Río Cuarto'],
        ['362', '362 · Resistencia'], ['376', '376 · Posadas'], ['379', '379 · Corrientes'],
        ['380', '380 · La Rioja'], ['381', '381 · Tucumán'], ['383', '383 · Catamarca'],
        ['385', '385 · Sgo. del Estero'], ['387', '387 · Salta'], ['388', '388 · Jujuy'],
        ['2901', '2901 · Ushuaia'], ['2954', '2954 · Santa Rosa'], ['2966', '2966 · Río Gallegos'],
        ['2983', '2983 · Tres Arroyos'],
    ];
    // Para parsear un número guardado: probar la característica más larga primero.
    var AREA_CODES = AREAS.map(function (a) { return a[0]; }).sort(function (a, b) { return b.length - a.length; });

    // Mapa CP → característica (para preseleccionarla desde la dirección).
    var PROV_AREA = { 1: '221', 2: '383', 3: '362', 4: '280', 5: '351', 6: '379', 7: '343', 8: '370', 9: '388', 10: '2954', 11: '380', 12: '261', 13: '376', 14: '299', 15: '294', 16: '387', 17: '264', 18: '266', 19: '2966', 20: '342', 21: '385', 22: '2901', 23: '381', 24: '11' };
    var CP4_AREA = { '7500': '2983', '7600': '223', '2000': '341', '8000': '291', '3100': '343', '7000': '2281', '4000': '387', '5500': '261', '3400': '379', '3500': '362', '9000': '297', '5800': '358' };

    var digits = function (s) { return String(s == null ? '' : s).replace(/\D/g, ''); };
    var groupLocal = function (s) { var out = []; for (var i = 0; i < s.length; i += 4) { out.push(s.slice(i, i + 4)); } return out.join(' '); };

    function setup(prefix, hiddenId) {
        var area = document.getElementById(prefix + '-phone-area');
        var local = document.getElementById(prefix + '-phone-local');
        var mobile = document.getElementById(prefix + '-phone-mobile');
        var hidden = document.getElementById(hiddenId);
        var preview = document.getElementById(prefix + '-phone-preview');
        if (!area || !local || !hidden) { return; }

        AREAS.forEach(function (a) {
            var o = document.createElement('option');
            o.value = a[0]; o.textContent = a[1];
            if (a[0] === '11') { o.selected = true; }
            area.appendChild(o);
        });

        function recompute() {
            var a = digits(area.value);
            var l = digits(local.value);
            var grouped = groupLocal(l);
            if (local.value !== grouped) {
                var pos = local.selectionStart;
                local.value = grouped;
                try { local.setSelectionRange(pos + (grouped.length - (local.value.length)), pos); } catch (_) {}
            }
            var nine = (mobile && mobile.checked) ? '9' : '';
            var full = l ? (nine + a + l) : '';   // vacío si no cargó número (para que dispare "obligatorio")
            hidden.value = full;

            var parts = [];
            if (nine) { parts.push('9'); }
            if (a) { parts.push(a); }
            if (l) { parts.push(grouped); }
            if (preview) {
                preview.textContent = full ? ('Se guardará: +54 ' + parts.join(' ') + ' · ' + full.length + ' dígitos') : '';
            }
            var okLen = full === '' || (full.length >= 8 && full.length <= 15);
            local.setCustomValidity(okLen ? '' : 'El número completo debe tener entre 8 y 15 dígitos (con la característica).');
        }

        // Reconstruir desde el valor guardado (re-render del form ante error).
        (function initFromHidden() {
            var d = digits(hidden.value);
            if (!d) { recompute(); return; }
            if (d[0] === '9') { if (mobile) { mobile.checked = true; } d = d.slice(1); }
            else if (mobile) { mobile.checked = false; }
            var found = '';
            for (var i = 0; i < AREA_CODES.length; i++) { if (d.indexOf(AREA_CODES[i]) === 0) { found = AREA_CODES[i]; break; } }
            if (found) { area.value = found; d = d.slice(found.length); }
            local.value = groupLocal(d);
            recompute();
        })();

        area.addEventListener('change', recompute);
        local.addEventListener('input', recompute);
        if (mobile) { mobile.addEventListener('change', recompute); }
        return { area: area, recompute: recompute };
    }

    var sender = setup('sender', 'sender-phone');
    var recipient = setup('recipient', 'recipient-phone');

    // Preselecciona la característica según el código postal / provincia de la dirección.
    function areaFromCP() {
        var cpEl = document.getElementById('postal-code');
        var provEl = document.getElementById('province');
        var cp4 = digits(cpEl && cpEl.value).slice(-4);
        return CP4_AREA[cp4] || PROV_AREA[Number(provEl && provEl.value)] || null;
    }
    function applyCP() {
        var a = areaFromCP();
        if (!a) { return; }
        [sender, recipient].forEach(function (g) {
            if (g && g.area && [].some.call(g.area.options, function (o) { return o.value === a; })) {
                g.area.value = a;
                g.recompute();
            }
        });
    }
    var prov = document.getElementById('province');
    if (prov) { prov.addEventListener('change', applyCP); }
    var cp = document.getElementById('postal-code');
    if (cp) { cp.addEventListener('input', applyCP); }
})();
