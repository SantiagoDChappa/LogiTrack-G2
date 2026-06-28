// Cotizador público de envíos (portal). Toma destino + tamaño y pide al backend una
// estimación de costo, mostrando el total aproximado y un desglose. Adaptado de
// public/js/cost-preview.js, pero apunta al endpoint público POST /portal/cotizar.
(function () {
    function fmt(n) {
        var v = Number(n || 0);
        return '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function el(id) { return document.getElementById(id); }

    function isAdvanced() {
        var adv = el('ctz-advanced');
        return adv && adv.style.display !== 'none';
    }

    function selectedSize() {
        var checked = document.querySelector('input[name="size"]:checked');
        return checked ? checked.value : '';
    }

    function render(state, data) {
        var box = el('ctz-result');
        if (!box) { return; }

        if (state === 'loading') {
            box.innerHTML = '<span class="ctz-placeholder"><span class="material-symbols-outlined ctz-spin">autorenew</span> Calculando costo...</span>';
            return;
        }
        if (state === 'incomplete') {
            box.innerHTML = '<span class="ctz-placeholder">Completá el destino y el tamaño para ver el costo estimado.</span>';
            return;
        }
        if (state === 'error' || !data || !data.ok || !data.breakdown) {
            box.innerHTML = '<span class="ctz-placeholder">No pudimos calcular el costo con esos datos. Probá con otra provincia o código postal.</span>';
            return;
        }

        var b = data.breakdown;
        var row = function (label, val) {
            return '<div class="ctz-breakdown-row"><span>' + label + '</span><span>' + fmt(val) + '</span></div>';
        };

        var html = '';
        html += '<div class="ctz-total">';
        html += '<span class="ctz-total-label">Costo estimado' + (data.zoneName ? ' · ' + data.zoneName : '') + '</span>';
        html += '<span class="ctz-total-value">' + fmt(b.final) + '</span>';
        html += '</div>';

        html += '<div class="ctz-breakdown">';
        if (b.costoBase > 0) { html += row('Costo base', b.costoBase); }
        if (b.zoneBase > 0) { html += row('Tarifa por zona', b.zoneBase); }
        if (b.wSurcharge > 0) { html += row('Recargo por peso', b.wSurcharge); }
        if (b.vSurcharge > 0) { html += row('Recargo por volumen', b.vSurcharge); }
        if (b.insurance > 0) { html += row('Seguro de mercadería', b.insurance); }
        html += '</div>';

        box.innerHTML = html;
    }

    function collect() {
        var payload = {
            provinceId: el('provinceId') ? el('provinceId').value : '',
            postalCode: el('postalCode') ? el('postalCode').value.trim() : '',
            declaredValue: el('declaredValue') ? el('declaredValue').value : '',
        };
        if (isAdvanced()) {
            payload.weightKg = el('weightKg') ? el('weightKg').value : '';
            payload.volumeM3 = el('volumeM3') ? el('volumeM3').value : '';
        } else {
            payload.size = selectedSize();
        }
        return payload;
    }

    function hasMinimumInput(payload) {
        var hasDest = (payload.provinceId && payload.provinceId !== '') || (payload.postalCode && payload.postalCode !== '');
        var hasSize = payload.size ? true : (Number(payload.weightKg) > 0);
        return hasDest && hasSize;
    }

    async function calculate() {
        var payload = collect();
        if (!hasMinimumInput(payload)) {
            render('incomplete');
            return;
        }
        render('loading');
        try {
            var res = await fetch('/portal/cotizar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            var data = await res.json();
            render('ok', data);
        } catch (e) {
            render('error');
        }
    }

    function initAdvancedToggle() {
        var btn = el('ctz-toggle-adv');
        var adv = el('ctz-advanced');
        if (!btn || !adv) { return; }
        btn.addEventListener('click', function () {
            var show = adv.style.display === 'none';
            adv.style.display = show ? '' : 'none';
            btn.textContent = show ? 'Usar tamaños predefinidos' : 'Cargar peso y volumen manualmente';
            // Al alternar, los inputs de presets y manuales se excluyen mutuamente.
            document.querySelectorAll('.ctz-presets').forEach(function (p) { p.style.opacity = show ? '.45' : '1'; });
        });
    }

    function init() {
        initAdvancedToggle();
        var form = el('ctz-form');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                calculate();
            });
        }
        render('incomplete');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
