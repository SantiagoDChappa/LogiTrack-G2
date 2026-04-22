(function () {
    let debounceTimer = null;

    function getFormValues() {
        const widget = document.getElementById('prediction-widget');

        const provinceId = document.getElementById('province')?.value
                        || widget?.dataset.provinceId;
        const street     = document.getElementById('street')?.value
                        || widget?.dataset.street      || '';
        const number     = document.getElementById('number')?.value
                        || widget?.dataset.number      || '';
        const weightKg   = document.getElementById('weight-kg')?.value
                        || widget?.dataset.weightKg;
        const packageQty = document.getElementById('package-qty')?.value
                        || widget?.dataset.packageQty;
        const shipTypeId = document.getElementById('shipment-type')?.value
                        || widget?.dataset.shipmentTypeId;

        return { provinceId, street, number, weightKg, packageQty, shipTypeId };
    }

    async function loadPrediction() {
        const { provinceId, street, number, weightKg, packageQty, shipTypeId } = getFormValues();

        if (!provinceId || !weightKg || !packageQty || !shipTypeId) {
            showPlaceholder();
            return;
        }

        showLoading();

        try {
            // 1. Calcular distancia (Nominatim + Haversine)
            const addrLat = document.getElementById('address-lat')?.value || null;
            const addrLng = document.getElementById('address-lng')?.value || null;

            const distRes = await fetch('/api/distance', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    destinationProvinceId: parseInt(provinceId),
                    destinationStreet:     street,
                    destinationNumber:     number,
                    destinationLat:        addrLat ? parseFloat(addrLat) : undefined,
                    destinationLng:        addrLng ? parseFloat(addrLng) : undefined,
                }),
            });
            const distData = await distRes.json();

            // 2. Predicción ML
            // JS getDay(): 0=Dom…6=Sáb — ML espera 0=Lun…6=Dom
            const now    = new Date();
            const mlDay  = (now.getDay() + 6) % 7;
            const month  = now.getMonth() + 1;
            // shipTypeId: 1=Express→0, 2=Estándar→1
            const shipType = parseInt(shipTypeId) === 1 ? 0 : 1;

            const predRes = await fetch('/api/predict', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    distance_km:             distData.distance_km,
                    weight_kg:               parseFloat(weightKg),
                    package_quantity:        parseInt(packageQty),
                    ship_type:               shipType,
                    day_of_week:             mlDay,
                    month,
                    origin_province:         distData.origin_province_ml,
                    destination_province:    distData.destination_province_ml,
                }),
            });
            const pred = await predRes.json();

            if (pred.error) { showError(pred.error); return; }
            showResult(pred, distData.distance_km);
        } catch {
            showError('Servicio de predicción no disponible');
        }
    }

    function showPlaceholder() {
        const el = document.getElementById('prediction-result');
        if (!el) return;
        // En modo detalle (sin campos de formulario visibles) el mensaje es diferente
        const isDetail = !document.getElementById('shipment-type');
        el.innerHTML = isDetail
            ? '<span class="pred-placeholder">Sin datos suficientes para calcular la predicción (falta tipo, peso o cantidad en el envío)</span>'
            : '<span class="pred-placeholder">Completá provincia, tipo, peso y cantidad para ver la predicción</span>';
    }

    function showLoading() {
        const el = document.getElementById('prediction-result');
        if (!el) return;
        el.innerHTML = '<span class="pred-loading"><span class="material-symbols-outlined pred-spin">autorenew</span> Calculando...</span>';
    }

    function showError(msg) {
        const el = document.getElementById('prediction-result');
        if (!el) return;
        el.innerHTML = `<span class="pred-error"><span class="material-symbols-outlined">error_outline</span> ${msg}</span>`;
    }

    function showResult(pred, distKm) {
        const el = document.getElementById('prediction-result');
        if (!el) return;
        const isDelayed  = pred.delayed;
        const badgeClass = isDelayed ? 'retrasado' : 'entregado';
        const label      = isDelayed ? 'Posible demora' : 'A tiempo';
        const days       = pred.delivery_days;
        el.innerHTML = `
            <div class="pred-row">
                <span class="status-badge ${badgeClass}">${label}</span>
                <span class="pred-prob">Prob. de demora: <strong>${pred.probability}%</strong></span>
            </div>
            <div class="pred-days">
                <span class="material-symbols-outlined">schedule</span>
                Tiempo estimado: <strong>${days} día${days !== 1 ? 's' : ''}</strong>
            </div>
            <div class="pred-dist">
                <span class="material-symbols-outlined">route</span>
                Distancia aprox.: <strong>${distKm} km</strong>
            </div>
        `;
    }

    function trigger() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadPrediction, 700);
    }

    function initPrediction() {
        ['province', 'street', 'number', 'weight-kg', 'package-qty', 'shipment-type'].forEach(function (id) {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', trigger);
            if (el.tagName === 'INPUT') el.addEventListener('input', trigger);
        });

        const widget = document.getElementById('prediction-widget');
        if (widget && widget.dataset.autoload === 'true') {
            loadPrediction();
        } else {
            showPlaceholder();
        }
    }

    // Compatibilidad con defer: si DOMContentLoaded ya disparó, ejecutar inmediatamente
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPrediction);
    } else {
        initPrediction();
    }
})();
