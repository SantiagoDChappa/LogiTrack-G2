// LGT-207 — teléfono en UN solo input que se autoformatea mientras se escribe.
// Detecta la característica (código de área real) y el 9 de celular, agrupa con espacios:
//   "11 5456 5446"  ·  "9 11 2384 2323"  ·  "351 456 7890".
// Límite por formato: 10 dígitos (área + abonado) u 11 si es celular (con el 9).
// Valida que la característica sea real (misma lista que el backend src/utils/phone.js).
(function () {
    // Características conocidas de 2/3 dígitos (las de 4 se aceptan si empiezan con 2 o 3).
    var KNOWN = ['11', '220', '221', '223', '230', '236', '237', '249', '260', '261', '263',
        '264', '266', '280', '291', '294', '297', '298', '299', '341', '342', '343', '345',
        '348', '351', '353', '358', '362', '364', '370', '376', '379', '380', '381', '383',
        '385', '387', '388'];
    var KNOWN_SET = {};
    KNOWN.forEach(function (c) { KNOWN_SET[c] = true; });

    var PROV_AREA = { 1: '221', 5: '351', 6: '379', 7: '343', 12: '261', 13: '376', 14: '299', 16: '387', 17: '264', 20: '342', 21: '385', 23: '381', 24: '11' };
    var CP4_AREA = { '7500': '2983', '7600': '223', '2000': '341', '8000': '291', '3100': '343', '5000': '351', '5500': '261', '9000': '297' };

    var digits = function (s) { return String(s == null ? '' : s).replace(/\D/g, ''); };

    function detectArea(rest) {
        if (KNOWN_SET[rest.slice(0, 3)]) { return rest.slice(0, 3); }
        if (KNOWN_SET[rest.slice(0, 2)]) { return rest.slice(0, 2); }
        if (/^[23]\d{3}$/.test(rest.slice(0, 4))) { return rest.slice(0, 4); }
        // Todavía escribiendo / desconocida: heurística para ir formateando.
        if (rest.indexOf('11') === 0) { return rest.slice(0, 2); }
        return rest.slice(0, Math.min(rest[0] === '2' ? 4 : 3, rest.length));
    }

    // Limita los dígitos según el formato: 11 con el 9 de celular, 10 sin él.
    function cap(d) {
        var max = d[0] === '9' ? 11 : 10;
        return d.slice(0, max);
    }

    function format(d) {
        if (!d) { return ''; }
        var mobile = d[0] === '9';
        var rest = mobile ? d.slice(1) : d;
        var area = detectArea(rest);
        var sub = rest.slice(area.length);
        var parts = [];
        if (mobile) { parts.push('9'); }
        if (area) { parts.push(area); }
        for (var i = 0; i < sub.length; i += 4) { parts.push(sub.slice(i, i + 4)); }
        return parts.join(' ');
    }

    // Valida característica real + longitud (10, u 11 con 9). { ok, reason }.
    function validate(d) {
        if (!d) { return { ok: false, reason: 'empty' }; }
        var mobile = d[0] === '9';
        var rest = mobile ? d.slice(1) : d;
        var areaKnown = KNOWN_SET[rest.slice(0, 3)] ? rest.slice(0, 3)
            : KNOWN_SET[rest.slice(0, 2)] ? rest.slice(0, 2)
                : /^[23]\d{3}$/.test(rest.slice(0, 4)) ? rest.slice(0, 4) : null;
        if (rest.length < 10) { return { ok: false, reason: 'short' }; }
        if (!areaKnown) { return { ok: false, reason: 'area' }; }
        if (rest.length !== 10) { return { ok: false, reason: 'length' }; }
        return { ok: true };
    }

    function setup(prefix, hiddenId) {
        var input = document.getElementById(prefix + '-phone-display');
        var hidden = document.getElementById(hiddenId);
        var preview = document.getElementById(prefix + '-phone-preview');
        if (!input || !hidden) { return; }

        function refresh(d, keepCaret) {
            d = cap(d);
            var formatted = format(d);
            var caretDigits = keepCaret != null ? keepCaret : digits(input.value).length;
            input.value = formatted;
            hidden.value = d;
            var v = validate(d);
            if (preview) {
                if (!d) { preview.textContent = ''; preview.style.color = ''; }
                else if (v.ok) { preview.textContent = '✓ Se guardará: +54 ' + formatted + ' · ' + d.length + ' dígitos'; preview.style.color = 'var(--color-success, #16a34a)'; }
                else if (v.reason === 'area') { preview.textContent = '⚠ La característica no parece válida'; preview.style.color = 'var(--color-warning, #b45309)'; }
                else { preview.textContent = 'Seguí: ' + formatted + ' (' + d.length + ' díg.)'; preview.style.color = 'var(--color-text-secondary)'; }
            }
            input.setCustomValidity((d === '' || v.ok) ? '' :
                v.reason === 'area' ? 'La característica (código de área) no es válida.' :
                    'El teléfono debe tener 10 dígitos (u 11 con el 9 de celular).');
            // Reubica el cursor después de "caretDigits" dígitos en el texto formateado.
            if (keepCaret != null) {
                var pos = 0, seen = 0;
                while (pos < formatted.length && seen < caretDigits) { if (/\d/.test(formatted[pos])) { seen++; } pos++; }
                try { input.setSelectionRange(pos, pos); } catch (_) {}
            }
        }

        input.addEventListener('input', function () {
            var caret = input.selectionStart;
            var before = digits(input.value.slice(0, caret)).length;
            refresh(digits(input.value), before);
        });

        refresh(digits(hidden.value), null);   // estado inicial (re-render por error)
        return { set: function (d) { refresh(digits(d), null); }, get: function () { return digits(hidden.value); } };
    }

    var sender = setup('sender', 'sender-phone');
    var recipient = setup('recipient', 'recipient-phone');

    // Precarga la característica desde el CP/provincia si el campo está vacío.
    function areaFromCP() {
        var cpEl = document.getElementById('postal-code');
        var provEl = document.getElementById('province');
        var cp4 = digits(cpEl && cpEl.value).slice(-4);
        return CP4_AREA[cp4] || PROV_AREA[Number(provEl && provEl.value)] || null;
    }
    function applyCP() {
        var a = areaFromCP();
        if (!a) { return; }
        [sender, recipient].forEach(function (g) { if (g && g.get() === '') { g.set(a); } });
    }
    var prov = document.getElementById('province');
    if (prov) { prov.addEventListener('change', applyCP); }
    var cp = document.getElementById('postal-code');
    if (cp) { cp.addEventListener('input', applyCP); }
})();
