// Preview del costo del envío durante el alta. Al completar zona (provincia/CP),
// peso y volumen, pide el desglose al backend y lo muestra antes de confirmar.
(function () {
    let timer = null;

    function fmt(n) {
        const v = Number(n || 0);
        return '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function render(state, data) {
        const el = document.getElementById('cost-preview-result');
        if (!el) { return; }
        if (state === 'loading') {
            el.innerHTML = '<span class="pred-loading"><span class="material-symbols-outlined pred-spin">autorenew</span> Calculando costo...</span>';
            return;
        }
        if (state === 'empty') {
            el.innerHTML = '<span class="pred-placeholder">Completá provincia/CP, peso y volumen para ver el costo.</span>';
            return;
        }
        if (state === 'error' || !data || !data.ok || !data.breakdown) {
            el.innerHTML = '<span class="pred-placeholder">No se pudo calcular el costo con los datos actuales.</span>';
            return;
        }
        const b = data.breakdown;
        const row = (label, val) => `<div style="display:flex;justify-content:space-between"><span>${label}</span><span>${fmt(val)}</span></div>`;
        let html = '';
        if (b.costoBase > 0) { html += row('Costo base sistema', b.costoBase); }
        if (b.zoneBase > 0) { html += row(`Tarifa zona${data.zoneName ? ' (' + data.zoneName + ')' : ''}`, b.zoneBase); }
        html += row('Recargo peso', b.wSurcharge);
        html += row('Recargo volumen', b.vSurcharge);
        if (b.insurance > 0) { html += row('Seguro de mercadería', b.insurance); }
        html += '<hr style="margin:.35rem 0;border-color:var(--color-border)">';
        html += `<div style="display:flex;justify-content:space-between;font-weight:700"><span>Total estimado</span><span>${fmt(b.final)}</span></div>`;
        el.innerHTML = html;
    }

    async function load() {
        const provinceId = document.getElementById('province')?.value;
        const postalCode = document.getElementById('postal-code')?.value;
        const weightKg = document.getElementById('weight-kg')?.value;
        const volumeM3 = document.getElementById('volume-m3')?.value;
        const declaredValue = document.getElementById('declared-value')?.value;

        if ((!provinceId && !postalCode) || !weightKg) {
            render('empty');
            return;
        }
        render('loading');
        try {
            const res = await fetch('/api/cost-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provinceId, postalCode, weightKg, volumeM3, declaredValue }),
            });
            const data = await res.json();
            render('ok', data);
        } catch {
            render('error');
        }
    }

    function trigger() {
        clearTimeout(timer);
        timer = setTimeout(load, 700);
    }

    function init() {
        ['province', 'postal-code', 'weight-kg', 'volume-m3', 'declared-value'].forEach(function (id) {
            const el = document.getElementById(id);
            if (!el) { return; }
            el.addEventListener('change', trigger);
            if (el.tagName === 'INPUT') { el.addEventListener('input', trigger); }
        });
        render('empty');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
