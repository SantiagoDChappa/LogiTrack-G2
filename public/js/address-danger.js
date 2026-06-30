// Aviso de zona peligrosa / no llegable en el alta de envío.
// Al elegir/editar la dirección de destino, evalúa el punto contra las áreas
// peligrosas (point-in-polygon por lat/long, CP de respaldo) vía /api/danger-areas/check:
//   - peligrosa y llegable  -> banner de advertencia (el recargo lo muestra el costo).
//   - no llegable           -> popup Sí/No; si "No", limpia la dirección elegida.
// No corre en retiro por sucursal: el destino es una sucursal propia.
(function () {
    let timer = null;

    const $ = (id) => document.getElementById(id);
    const warnBox       = () => $('address-danger-warning');
    const reachableFlag = () => $('danger-reachable');
    const acceptedFlag  = () => $('danger-accepted');

    function isPickup() {
        return document.querySelector('input[name="deliveryMode"]:checked')?.value === 'branch_pickup';
    }
    function setReachable(v) { const i = reachableFlag(); if (i) { i.value = v; } }
    function setAccepted(v)  { const i = acceptedFlag();  if (i) { i.value = v ? 'true' : ''; } }

    function hideWarn() {
        const b = warnBox();
        if (b) { b.hidden = true; b.innerHTML = ''; }
        setReachable('');
        setAccepted(false);
    }

    function showWarn(kind, area) {
        const b = warnBox();
        if (!b) { return; }
        const name = area && area.name ? ' (' + area.name + ')' : '';
        const note = area && area.note ? ' — ' + area.note : '';
        b.hidden = false;
        if (kind === 'blocked') {
            b.className = 'addr-validation-box addr-validation-box--danger addr-full';
            b.innerHTML = '<span class="material-symbols-outlined" style="font-size:1rem">block</span> ' +
                '<span><strong>Zona no llegable' + name + '.</strong> Elegiste enviar igual a este destino.' + note + '</span>';
        } else {
            b.className = 'addr-validation-box addr-validation-box--warning addr-full';
            b.innerHTML = '<span class="material-symbols-outlined" style="font-size:1rem">warning</span> ' +
                '<span><strong>Zona peligrosa' + name + '.</strong> Se aplicará un recargo al costo del envío.' + note + '</span>';
        }
    }

    function confirmBlocked(area) {
        const isDark = (localStorage.getItem('theme') ?? 'light') === 'dark';
        return Swal.fire({
            icon: 'warning',
            title: 'Zona no llegable',
            html: 'El destino' + (area && area.name ? ' <strong>' + area.name + '</strong>' : '') +
                ' está marcado como <strong>no llegable</strong>: normalmente no realizamos entregas ahí.' +
                (area && area.note ? '<br><small>' + area.note + '</small>' : '') +
                '<br><br>¿Querés elegirlo igual como destino?',
            showCancelButton: true,
            confirmButtonText: 'Sí, elegir igual',
            cancelButtonText: 'No, cambiar dirección',
            confirmButtonColor: '#dc2626',
            background: isDark ? '#1e293b' : '#ffffff',
            color: isDark ? '#f1f5f9' : '#1e293b',
        });
    }

    function clearAddress() {
        const btn = $('address-clear');
        if (btn) { btn.click(); }   // reusa el limpiado del autocomplete
        hideWarn();
    }

    async function evaluate() {
        if (isPickup()) { hideWarn(); return; }
        const lat = $('address-lat')?.value || '';
        const lng = $('address-lng')?.value || '';
        const postalCode = $('postal-code')?.value || '';
        if (!lat && !lng && !postalCode) { hideWarn(); return; }

        try {
            const res = await fetch('/api/danger-areas/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng, postalCode }),
            });
            const data = await res.json();
            if (!data || !data.ok || !data.dangerous) { hideWarn(); return; }

            if (data.reachable === false) {
                setReachable('false');
                const r = await confirmBlocked(data.area);
                if (r.isConfirmed) { setAccepted(true); showWarn('blocked', data.area); }
                else { setAccepted(false); clearAddress(); }
            } else {
                setReachable('true');
                setAccepted(true);   // peligrosa pero llegable: no bloquea, solo recarga
                showWarn('warning', data.area);
            }
        } catch {
            /* si la evaluación falla, no rompemos el alta */
        }
    }

    function schedule() { clearTimeout(timer); timer = setTimeout(evaluate, 500); }

    document.addEventListener('DOMContentLoaded', function () {
        ['province', 'street', 'postal-code'].forEach(function (id) {
            const el = $(id);
            if (!el) { return; }
            el.addEventListener('change', schedule);
            if (el.tagName === 'INPUT') { el.addEventListener('input', schedule); }
        });
        const search = $('address-search');
        if (search) { search.addEventListener('input', hideWarn); }
        const clearBtn = $('address-clear');
        if (clearBtn) { clearBtn.addEventListener('click', hideWarn); }
        document.querySelectorAll('input[name="deliveryMode"]').forEach(function (r) {
            r.addEventListener('change', function () { if (isPickup()) { hideWarn(); } });
        });

        // Si el destino es no llegable y no se aceptó, frena el submit y vuelve a preguntar.
        const form = document.querySelector('form[action=""]');
        if (form) {
            form.addEventListener('submit', function (e) {
                if (isPickup()) { return; }
                if (reachableFlag()?.value === 'false' && acceptedFlag()?.value !== 'true') {
                    e.preventDefault();
                    confirmBlocked(null).then(function (r) {
                        if (r.isConfirmed) { setAccepted(true); showWarn('blocked', null); form.submit(); }
                    });
                }
            }, true);
        }
    });
})();
