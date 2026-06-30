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
        if (b.distanceSurcharge > 0) { html += row(`Recargo distancia${b.distanceKm ? ' (' + b.distanceKm + ' km)' : ''}`, b.distanceSurcharge); }
        if (b.expressSurcharge > 0) { html += row('Recargo Express', b.expressSurcharge); }
        if (b.fragileSurcharge > 0) { html += row('Recargo frágil', b.fragileSurcharge); }
        // Diferencia por zona peligrosa: se itemiza para que se vea el recargo aparte.
        if (b.dangerSurcharge > 0) {
            html += `<div style="display:flex;justify-content:space-between;color:var(--color-danger,#dc2626)"><span><span class="material-symbols-outlined" style="font-size:1rem;vertical-align:-2px">warning</span> Recargo zona peligrosa</span><span>+ ${fmt(b.dangerSurcharge)}</span></div>`;
        }
        html += '<hr style="margin:.35rem 0;border-color:var(--color-border)">';
        html += `<div style="display:flex;justify-content:space-between;font-weight:700"><span>Subtotal estimado (sin IVA)</span><span>${fmt(b.final)}</span></div>`;
        html += '<div style="font-size:.72rem;color:var(--color-text-secondary);margin-top:.1rem">La factura suma el 21% de IVA sobre este monto.</div>';
        el.innerHTML = html;
    }

    // En retiro por sucursal la dirección está oculta: el destino es la sucursal
    // elegida, así que tomamos provincia/CP/coordenadas del <option> seleccionado.
    function readInputs() {
        const isPickup = document.querySelector('input[name="deliveryMode"]:checked')?.value === 'branch_pickup';
        const weightKg = document.getElementById('weight-kg')?.value;
        const volumeM3 = document.getElementById('volume-m3')?.value;
        const declaredValue = document.getElementById('declared-value')?.value;
        const fragile = document.getElementById('fragile')?.checked || false;
        const shipmentTypeId = document.getElementById('shipment-type')?.value || '';

        if (isPickup) {
            const opt = document.getElementById('pickup-branch-id')?.selectedOptions?.[0];
            return {
                provinceId: opt?.dataset.province || '',
                postalCode: opt?.dataset.postal || '',
                lat: opt?.dataset.lat || '',
                lng: opt?.dataset.lng || '',
                weightKg, volumeM3, declaredValue, fragile, shipmentTypeId,
            };
        }
        return {
            provinceId: document.getElementById('province')?.value || '',
            postalCode: document.getElementById('postal-code')?.value || '',
            lat: document.getElementById('address-lat')?.value || '',
            lng: document.getElementById('address-lng')?.value || '',
            weightKg, volumeM3, declaredValue, fragile, shipmentTypeId,
        };
    }

    async function load() {
        const { provinceId, postalCode, lat, lng, weightKg, volumeM3, declaredValue, fragile, shipmentTypeId } = readInputs();

        if ((!provinceId && !postalCode) || !weightKg) {
            render('empty');
            return;
        }
        render('loading');
        try {
            const res = await fetch('/api/cost-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provinceId, postalCode, weightKg, volumeM3, declaredValue, lat, lng, fragile, shipmentTypeId }),
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
        // address-lat/address-lng son hidden: el autocomplete dispara 'change' en
        // 'province'/'street' al elegir, así que el recargo por polígono se recalcula.
        ['province', 'postal-code', 'weight-kg', 'volume-m3', 'declared-value',
         'address-lat', 'address-lng', 'pickup-branch-id', 'fragile', 'shipment-type'].forEach(function (id) {
            const el = document.getElementById(id);
            if (!el) { return; }
            el.addEventListener('change', trigger);
            if (el.tagName === 'INPUT') { el.addEventListener('input', trigger); }
        });
        document.querySelectorAll('input[name="deliveryMode"]').forEach(function (r) {
            r.addEventListener('change', trigger);
        });
        render('empty');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
