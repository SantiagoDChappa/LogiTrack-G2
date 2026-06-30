/* Alta de envío — análisis ML post-submit.
 *
 * El modelo (fecha estimada + fiabilidad) tarda ~30s, así que NO se calcula en vivo
 * mientras se llena el form. Al dar de alta:
 *   1. Se valida el form (required nativo).
 *   2. Se muestra una pantalla de análisis con mensajes progresivos.
 *   3. Termina el ML → se muestran fecha estimada + fiabilidad, y el operador elige
 *      seguir con esa fecha o cambiarla (desde la estimada en adelante).
 *   4. Confirmar → recién ahí se envía el form y se crea el envío.
 *
 * Si el ML tarda demasiado o está caído (timeout), se ofrece una fecha por defecto
 * (reglas por tipo de envío) y se deja continuar sin bloquear el alta.
 */
(function () {
    const form = document.querySelector('.form-new form');
    if (!form) { return; }

    const TIMEOUT_MS = 10000;       // tope de espera del ML antes de caer a fecha default
    const RISK_HALFLIFE_DAYS = 3;   // cada N días de margen, el riesgo se reduce a la mitad

    let confirmed = false;          // cuando es true, dejamos pasar el submit real

    form.addEventListener('submit', function (e) {
        if (confirmed) { return; }      // submit programático tras confirmar → pasa
        e.preventDefault();
        if (!form.reportValidity()) { return; }   // que el browser marque los required
        runFlow();
    });

    // ── Lectura del form ────────────────────────────────────────────────────
    function getDeliveryMode() {
        const checked = document.querySelector('input[name="deliveryMode"]:checked');
        return checked ? checked.value : 'home';
    }

    function getFormValues() {
        const isPickup = getDeliveryMode() === 'branch_pickup';
        const weightKg   = document.getElementById('weight-kg')?.value;
        const packageQty = document.getElementById('package-qty')?.value;
        const shipTypeId = document.getElementById('shipment-type')?.value;

        if (isPickup) {
            const opt = document.getElementById('pickup-branch-id')?.selectedOptions[0];
            return {
                provinceId: opt?.dataset.province || null,
                street: '', number: '',
                lat: opt ? parseFloat(opt.dataset.lat) : null,
                lng: opt ? parseFloat(opt.dataset.lng) : null,
                weightKg, packageQty, shipTypeId,
            };
        }
        return {
            provinceId: document.getElementById('province')?.value || null,
            street:     document.getElementById('street')?.value || '',
            number:     document.getElementById('number')?.value || '',
            lat: parseFloat(document.getElementById('address-lat')?.value),
            lng: parseFloat(document.getElementById('address-lng')?.value),
            weightKg, packageQty, shipTypeId,
        };
    }

    // Fecha por defecto (fallback ML caído): Express +2, Estándar +5, resto +3 días.
    function defaultEstimatedDays(shipTypeId) {
        const t = parseInt(shipTypeId);
        if (t === 1) { return 2; }   // Express
        if (t === 2) { return 5; }   // Estándar
        return 3;
    }

    // ── Predicción (distancia + ML) ─────────────────────────────────────────
    async function computePrediction(onStep) {
        const v = getFormValues();

        onStep && onStep('Estimando fecha de entrega…');
        const now = new Date();
        const mlDay = (now.getDay() + 6) % 7;
        const month = now.getMonth() + 1;
        const shipType = parseInt(v.shipTypeId) === 1 ? 0 : 1;

        const estRes = await fetch('/api/estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destinationProvinceId: v.provinceId ? parseInt(v.provinceId) : undefined,
                destinationStreet: v.street,
                destinationNumber: v.number,
                destinationLat: Number.isFinite(v.lat) ? v.lat : undefined,
                destinationLng: Number.isFinite(v.lng) ? v.lng : undefined,
                weight_kg: parseFloat(v.weightKg),
                package_quantity: parseInt(v.packageQty),
                ship_type: shipType,
                shipmentId: null,
            }),
        });

        if (!estRes.ok) throw new Error('Error en estimación');
        const data = await estRes.json();
        if (data.error) throw new Error(data.error);

        return {
            deliveryDays: data.delivery_days,
            probability: data.probability,
            distKm: data.distance_km,
    };
}

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
        ]);
    }

    // ── Helpers de fecha ────────────────────────────────────────────────────
    function toISODate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    function addDays(days) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days);
        return d;
    }
    function tomorrowISO() { return toISODate(addDays(1)); }
    function chosenDays(iso) {
        if (!iso) { return null; }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) { return null; }
        return Math.round((d.getTime() - today.getTime()) / 86400000);
    }

    // Riesgo efectivo para la fecha elegida (más margen sobre la estimación = menos riesgo).
    function effectiveRisk(prob, mlDays, chosen) {
        if (chosen == null) { return prob; }
        const slack = chosen - mlDays;
        const risk = prob * Math.pow(2, -slack / RISK_HALFLIFE_DAYS);
        return Math.max(0, Math.min(100, Math.round(risk)));
    }

    // ── Overlay ─────────────────────────────────────────────────────────────
    function buildOverlay() {
        let el = document.getElementById('alta-ml-overlay');
        if (el) { return el; }
        el = document.createElement('div');
        el.id = 'alta-ml-overlay';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.innerHTML = '<div class="alta-ml__card" id="alta-ml-card"></div>';
        document.body.appendChild(el);
        return el;
    }

    function showAnalyzing(card) {
        const msgs = [
            'Analizando distancia y ruta…',
            'Estimando fecha de entrega…',
            'Calculando fiabilidad…',
            'Evaluando riesgo de demora…',
        ];
        card.innerHTML =
            '<div class="alta-ml__spinner"></div>' +
            '<h3 class="alta-ml__title">Analizando tu envío</h3>' +
            '<p class="alta-ml__msg" id="alta-ml-msg">' + msgs[0] + '</p>' +
            '<p class="alta-ml__hint">Esto puede tardar unos segundos. No cierres la página.</p>';
        const msgEl = card.querySelector('#alta-ml-msg');
        let i = 0;
        const timer = setInterval(() => {
            i = (i + 1) % msgs.length;
            if (msgEl) { msgEl.textContent = msgs[i]; }
        }, 2800);
        return {
            stop: () => clearInterval(timer),
            setStep: (txt) => { if (msgEl) { msgEl.textContent = txt; } },
        };
    }

    // Panel de confirmación. pred = null → modo "sin estimación" (ML caído/timeout).
    function showConfirm(card, pred, shipTypeId) {
        const mlIso  = pred ? toISODate(addDays(pred.deliveryDays)) : null;
        const defIso = toISODate(addDays(defaultEstimatedDays(shipTypeId)));
        const minIso = mlIso && mlIso > tomorrowISO() ? mlIso : tomorrowISO();
        const startIso = pred ? minIso : defIso;

        card.innerHTML =
            (pred
                ? '<h3 class="alta-ml__title"><span class="material-symbols-outlined">verified</span> Estimación lista</h3>'
                : '<h3 class="alta-ml__title alta-ml__title--warn"><span class="material-symbols-outlined">schedule</span> No pudimos estimar automáticamente</h3>') +
            '<div id="alta-ml-result" class="alta-ml__result"></div>' +
            '<div class="alta-ml__datefield">' +
            '  <label for="alta-ml-date">Fecha de entrega</label>' +
            '  <input type="date" id="alta-ml-date" min="' + (pred ? minIso : tomorrowISO()) + '" value="' + startIso + '">' +
            '  <small class="alta-ml__datehint" id="alta-ml-datehint">' +
            (pred ? 'Estimada por el modelo. Podés mantenerla o elegir una posterior.'
                  : 'No se pudo estimar; elegí una fecha (desde mañana) o seguí con la sugerida.') +
            '  </small>' +
            '</div>' +
            '<div class="alta-ml__actions">' +
            '  <button type="button" class="alta-ml__btn alta-ml__btn--ghost" id="alta-ml-back">Volver a editar</button>' +
            '  <button type="button" class="alta-ml__btn alta-ml__btn--primary" id="alta-ml-confirm">' +
            '    <span class="material-symbols-outlined">save</span> Confirmar y crear envío</button>' +
            '</div>';

        const dateInput = card.querySelector('#alta-ml-date');
        const render = () => renderResult(card, pred);
        render();
        dateInput.addEventListener('change', render);
        dateInput.addEventListener('input', render);

        card.querySelector('#alta-ml-back').addEventListener('click', closeOverlay);
        card.querySelector('#alta-ml-confirm').addEventListener('click', () => {
            const hidden = document.getElementById('expected-date');
            if (hidden) { hidden.value = dateInput.value || ''; }
            confirmed = true;
            showCreating(card);
            form.submit();
        });
    }

    function renderResult(card, pred) {
        const el = card.querySelector('#alta-ml-result');
        const dateInput = card.querySelector('#alta-ml-date');
        if (!el) { return; }

        if (!pred) {
            el.innerHTML = '<p class="alta-ml__nopred">El modelo no respondió a tiempo. ' +
                'El envío se crea igual; revisá la fecha sugerida.</p>';
            return;
        }

        const chosen = chosenDays(dateInput?.value);
        const risk = effectiveRisk(pred.probability, pred.deliveryDays, chosen);
        const fiab = Math.max(0, Math.min(100, 100 - risk));

        let color, label, cls;
        if (risk < 20)       { color = '🟢'; label = 'Alta fiabilidad';  cls = 'alta'; }
        else if (risk <= 50) { color = '🟡'; label = 'Fiabilidad media'; cls = 'media'; }
        else                 { color = '🔴'; label = 'Baja fiabilidad';  cls = 'baja'; }

        const mlDate = addDays(pred.deliveryDays);
        const mlLabel = mlDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

        const slack = chosen != null ? chosen - pred.deliveryDays : null;
        const nota = slack == null ? ''
            : slack > 0 ? ` (${slack} día${slack !== 1 ? 's' : ''} de margen sobre lo estimado)`
            : slack < 0 ? ` (${-slack} día${-slack !== 1 ? 's' : ''} antes de lo estimado)`
            : '';

        el.innerHTML =
            '<div class="pred-row">' +
            '  <span class="pred-semaforo pred-semaforo--' + cls + '">' + color + ' ' + label + '</span>' +
            '  <span class="pred-prob"><strong>' + fiab + '%</strong> de fiabilidad</span>' +
            '</div>' +
            '<div class="pred-prob pred-prob--sub"><span class="material-symbols-outlined">schedule</span> ' +
            '  Prob. de demora: <strong>' + risk + '%</strong>' + nota + '</div>' +
            '<div class="pred-days"><span class="material-symbols-outlined">event</span> ' +
            '  Llega estimado: <strong>' + mlLabel + '</strong> (' + pred.deliveryDays + ' día' + (pred.deliveryDays !== 1 ? 's' : '') + ')</div>' +
            '<div class="pred-dist"><span class="material-symbols-outlined">route</span> ' +
            '  Distancia aprox.: <strong>' + pred.distKm + ' km</strong></div>';
    }

    function showCreating(card) {
        card.innerHTML =
            '<div class="alta-ml__spinner"></div>' +
            '<h3 class="alta-ml__title">Creando envío…</h3>' +
            '<p class="alta-ml__hint">Generando comprobante y guardando los datos.</p>';
    }

    function closeOverlay() {
        const el = document.getElementById('alta-ml-overlay');
        if (el) { el.remove(); }
    }

    // ── Orquestación ────────────────────────────────────────────────────────
    async function runFlow() {
        const overlay = buildOverlay();
        const card = overlay.querySelector('#alta-ml-card');
        const anim = showAnalyzing(card);
        const shipTypeId = document.getElementById('shipment-type')?.value;

        try {
            const pred = await withTimeout(computePrediction(anim.setStep), TIMEOUT_MS);
            anim.stop();
            showConfirm(card, pred, shipTypeId);
        } catch (err) {
            anim.stop();
            console.error('[alta-ml]', err.message);
            showConfirm(card, null, shipTypeId);
        }
    }
})();
