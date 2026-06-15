// LGT-207 — sugerencia de característica telefónica según el código postal / provincia.
// No bloqueante: precarga la característica como dígitos editables (Esc.5/6/7) y avisa si
// el número no coincide con la zona del CP (Esc.8). El mapeo CP→característica es propio.
(function () {
    // Característica por provincia (capital), fallback cuando no hay CP de ciudad conocida.
    var PROV_AREA = {
        1: '221', 2: '383', 3: '362', 4: '280', 5: '351', 6: '379', 7: '343', 8: '370',
        9: '388', 10: '2954', 11: '380', 12: '261', 13: '376', 14: '299', 15: '294',
        16: '387', 17: '264', 18: '266', 19: '2966', 20: '342', 21: '385', 22: '2901',
        23: '381', 24: '11',
    };
    // Overrides por CP de 4 dígitos para ciudades grandes (más preciso que la capital).
    var CP4_AREA = {
        '7500': '2983', '7600': '223', '2000': '341', '8000': '291', '3100': '343',
        '7000': '2281', '4000': '387', '5500': '261', '3400': '379', '3500': '362',
        '9000': '297', '5800': '358', '6000': '2477', '3300': '3751',
    };
    var DEFAULT_AREA = '11'; // Formato base por defecto (Esc.6).

    function digits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }

    function suggestArea() {
        var cpEl = document.getElementById('postal-code');
        var provEl = document.getElementById('province');
        var cp4 = digits(cpEl && cpEl.value).slice(-4);
        return CP4_AREA[cp4] || PROV_AREA[Number(provEl && provEl.value)] || DEFAULT_AREA;
    }

    function setHint(id, text) {
        var h = document.getElementById(id);
        if (h) { h.textContent = text; h.style.display = text ? '' : 'none'; }
    }

    // Precarga la característica en los teléfonos vacíos y muestra la sugerencia (editable).
    function applySuggestion() {
        var area = suggestArea();
        [['sender-phone', 'sender-phone-area-hint'], ['recipient-phone', 'recipient-phone-area-hint']].forEach(function (pair) {
            var inp = document.getElementById(pair[0]);
            if (!inp) { return; }
            setHint(pair[1], 'Característica sugerida: +54 9 ' + area + ' … (editable)');
            if (!digits(inp.value)) { inp.value = area; } // Esc.5/6 — no sobrescribe lo cargado (Esc.7).
        });
        checkCoherence();
    }

    // Advertencia no bloqueante si el número no arranca con la característica de la zona (Esc.8).
    function checkCoherence() {
        var area = suggestArea();
        [['sender-phone', 'sender-phone-area-warn'], ['recipient-phone', 'recipient-phone-area-warn']].forEach(function (pair) {
            var inp = document.getElementById(pair[0]);
            var warn = document.getElementById(pair[1]);
            if (!inp || !warn) { return; }
            var ph = digits(inp.value);
            var mismatch = ph.length >= 8 && area && ph.indexOf(area) !== 0;
            warn.style.display = mismatch ? '' : 'none';
        });
    }

    var prov = document.getElementById('province');
    if (prov) { prov.addEventListener('change', applySuggestion); }
    var cp = document.getElementById('postal-code');
    if (cp) { cp.addEventListener('input', applySuggestion); }
    ['sender-phone', 'recipient-phone'].forEach(function (id) {
        var i = document.getElementById(id);
        if (i) { i.addEventListener('blur', checkCoherence); }
    });

    // Estado inicial (formato base por defecto).
    applySuggestion();
})();
