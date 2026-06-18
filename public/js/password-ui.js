/* UI reutilizable para inputs de contraseña.
   - [data-pw-toggle]   → agrega un ícono de ojo para ver/ocultar.
   - [data-pw-strength] → agrega checklist de requisitos + barra de fuerza (poco/segura/muy segura).
   Autocontenido (estilos inline) para funcionar en login, reset y cambio forzado. */
(function () {
    'use strict';

    function addEyeToggle(input) {
        if (input.dataset.pwToggleDone) { return; }
        input.dataset.pwToggleDone = '1';
        var wrap = document.createElement('span');
        wrap.style.cssText = 'position:relative;display:block';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        input.style.paddingRight = '2.4rem';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Mostrar u ocultar la contraseña');
        btn.style.cssText = 'position:absolute;right:.55rem;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--color-text-secondary,#94a3b8);display:flex;align-items:center;padding:0';
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:1.25rem">visibility</span>';
        btn.addEventListener('click', function () {
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.querySelector('.material-symbols-outlined').textContent = show ? 'visibility_off' : 'visibility';
        });
        wrap.appendChild(btn);
    }

    function addStrength(input) {
        if (input.dataset.pwStrengthDone) { return; }
        input.dataset.pwStrengthDone = '1';

        var rules = [
            { t: 'Mínimo 10 caracteres', f: function (v) { return v.length >= 10; } },
            { t: 'Una mayúscula',        f: function (v) { return /[A-Z]/.test(v); } },
            { t: 'Un número',            f: function (v) { return /\d/.test(v); } },
            { t: 'Un símbolo (!@#$%…)',  f: function (v) { return /[^A-Za-z0-9]/.test(v); } }
        ];
        var levels = [
            { l: '', c: '' },
            { l: 'Poco segura', c: '#ef4444' },
            { l: 'Segura',      c: '#f59e0b' },
            { l: 'Muy segura',  c: '#16a34a' }
        ];

        var box = document.createElement('div');
        box.style.cssText = 'margin-top:.55rem';

        var bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:4px;margin-bottom:.35rem';
        var segs = [];
        for (var i = 0; i < 3; i++) {
            var s = document.createElement('div');
            s.style.cssText = 'height:5px;flex:1;border-radius:3px;background:var(--color-border,#334155);transition:background .2s';
            segs.push(s);
            bar.appendChild(s);
        }

        var label = document.createElement('div');
        label.style.cssText = 'font-size:.75rem;font-weight:700;margin-bottom:.4rem;min-height:1em';

        var list = document.createElement('ul');
        list.style.cssText = 'list-style:none;padding:0;margin:0;font-size:.78rem;color:var(--color-text-secondary,#94a3b8)';
        var items = rules.map(function (r) {
            var li = document.createElement('li');
            li.style.cssText = 'display:flex;align-items:center;gap:.35rem;margin:.15rem 0';
            li.innerHTML = '<span class="material-symbols-outlined" style="font-size:1rem">cancel</span><span>' + r.t + '</span>';
            list.appendChild(li);
            return li;
        });

        box.appendChild(bar);
        box.appendChild(label);
        box.appendChild(list);
        input.parentNode.insertBefore(box, input.nextSibling);

        input.addEventListener('input', function () {
            var v = input.value, passed = 0;
            rules.forEach(function (r, idx) {
                var ok = r.f(v);
                if (ok) { passed++; }
                var ic = items[idx].querySelector('.material-symbols-outlined');
                ic.textContent = ok ? 'check_circle' : 'cancel';
                ic.style.color = ok ? '#16a34a' : 'var(--color-text-secondary,#94a3b8)';
            });
            var lvl = v.length === 0 ? 0 : (passed <= 2 ? 1 : (passed === 3 ? 2 : 3));
            segs.forEach(function (sg, i) {
                sg.style.background = (lvl > 0 && i < lvl) ? levels[lvl].c : 'var(--color-border,#334155)';
            });
            label.textContent = levels[lvl].l;
            label.style.color = levels[lvl].c;
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('[data-pw-toggle]').forEach(addEyeToggle);
        document.querySelectorAll('[data-pw-strength]').forEach(addStrength);
    });
})();
