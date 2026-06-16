// LGT-207 — teléfono en UN solo input que se formatea en vivo mientras se escribe.
// Detecta característica (por la lista de áreas) y el 9 de celular, y agrupa con espacios:
//   "11 5456 5446"  ·  "9 11 2384 2323"  ·  "351 456 7890".
// Guarda dígitos planos en el hidden senderPhone/recipientPhone para el backend.
(function () {
    // Características conocidas (para detectar dónde termina el código de área).
    var AREA_CODES = ['11', '221', '223', '261', '264', '280', '291', '294', '297', '299',
        '341', '342', '343', '351', '358', '362', '376', '379', '380', '381', '383', '385',
        '387', '388', '2901', '2954', '2966', '2983', '2281', '2477', '3751']
        .sort(function (a, b) { return b.length - a.length; }); // más largo primero

    // CP → característica (para precargarla desde la dirección, opcional).
    var PROV_AREA = { 1: '221', 5: '351', 6: '379', 7: '343', 12: '261', 13: '376', 14: '299', 16: '387', 17: '264', 20: '342', 21: '385', 23: '381', 24: '11' };
    var CP4_AREA = { '7500': '2983', '7600': '223', '2000': '341', '8000': '291', '3100': '343', '5000': '351', '5500': '261', '9000': '297' };

    var digits = function (s) { return String(s == null ? '' : s).replace(/\D/g, ''); };

    function detectArea(rest) {
        for (var i = 0; i < AREA_CODES.length; i++) {
            if (rest.indexOf(AREA_CODES[i]) === 0) { return AREA_CODES[i]; }
        }
        // Sin match (todavía escribiendo / área desconocida): 11 → 2 dígitos, resto ~3.
        if (rest.indexOf('11') === 0) { return rest.slice(0, 2); }
        return rest.slice(0, Math.min(rest[0] === '2' ? 4 : 3, rest.length));
    }

    function format(d) {
        if (!d) { return ''; }
        var mobile = d[0] === '9';            // el 9 al inicio = celular (ningún área empieza en 9)
        var rest = mobile ? d.slice(1) : d;
        var area = detectArea(rest);
        var sub = rest.slice(area.length);
        var parts = [];
        if (mobile) { parts.push('9'); }
        if (area) { parts.push(area); }
        for (var i = 0; i < sub.length; i += 4) { parts.push(sub.slice(i, i + 4)); }
        return parts.join(' ');
    }

    function setup(prefix, hiddenId) {
        var input = document.getElementById(prefix + '-phone-display');
        var hidden = document.getElementById(hiddenId);
        var preview = document.getElementById(prefix + '-phone-preview');
        if (!input || !hidden) { return; }

        function paint(d) {
            input.value = format(d);
            hidden.value = d;
            if (preview) {
                preview.textContent = d ? ('Se guardará: +54 ' + format(d) + ' · ' + d.length + ' dígitos') : '';
            }
            var okLen = d === '' || (d.length >= 8 && d.length <= 15);
            input.setCustomValidity(okLen ? '' : 'El teléfono debe tener entre 8 y 15 dígitos.');
        }

        input.addEventListener('input', function () {
            var caret = input.selectionStart;
            var before = digits(input.value.slice(0, caret)).length;   // dígitos antes del cursor
            var d = digits(input.value).slice(0, 15);
            var formatted = format(d);
            input.value = formatted;
            hidden.value = d;
            if (preview) { preview.textContent = d ? ('Se guardará: +54 ' + formatted + ' · ' + d.length + ' dígitos') : ''; }
            input.setCustomValidity((d === '' || (d.length >= 8 && d.length <= 15)) ? '' : 'El teléfono debe tener entre 8 y 15 dígitos.');
            // Reubica el cursor después de "before" dígitos en el texto formateado.
            var pos = 0, seen = 0;
            while (pos < formatted.length && seen < before) { if (/\d/.test(formatted[pos])) { seen++; } pos++; }
            try { input.setSelectionRange(pos, pos); } catch (_) {}
        });

        paint(digits(hidden.value));   // estado inicial (re-render por error)
        return { paint: paint, getDigits: function () { return digits(hidden.value); } };
    }

    var sender = setup('sender', 'sender-phone');
    var recipient = setup('recipient', 'recipient-phone');

    // Precarga la característica desde el CP/provincia si el campo está vacío (opcional, no molesta).
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
            if (g && g.getDigits() === '') { g.paint(a); }   // solo si todavía no escribió nada
        });
    }
    var prov = document.getElementById('province');
    if (prov) { prov.addEventListener('change', applyCP); }
    var cp = document.getElementById('postal-code');
    if (cp) { cp.addEventListener('input', applyCP); }
})();
