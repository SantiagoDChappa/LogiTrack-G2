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

            const widget = document.getElementById('prediction-widget');
            const shipmentId = widget?.dataset.shipmentId || null;

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
                    shipmentId:              shipmentId ? parseInt(shipmentId) : null,
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

        // Semáforo de fiabilidad (3 niveles, umbrales LGT-111 sobre la prob. de demora).
        const prob = pred.probability;
        const fiabilidad = Math.max(0, Math.min(100, 100 - prob));
        let semaforoColor, semaforoLabel, semaforoClass;
        if (prob < 20) {
            semaforoColor = '🟢';
            semaforoLabel = 'Alta fiabilidad';
            semaforoClass = 'alta';
        } else if (prob <= 50) {
            semaforoColor = '🟡';
            semaforoLabel = 'Fiabilidad media';
            semaforoClass = 'media';
        } else {
            semaforoColor = '🔴';
            semaforoLabel = 'Baja fiabilidad';
            semaforoClass = 'baja';
        }

        // Fecha estimada en lenguaje natural
        const days = pred.delivery_days;
        const fechaEstimada = new Date();
        fechaEstimada.setDate(fechaEstimada.getDate() + days);
        const fechaLabel = fechaEstimada.toLocaleDateString('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long'
        });

        // Si estamos en el form de alta, sincronizar la fecha estimada del ML
        // hacia el campo del form para que se persista en DB junto con el envío.
        // Solo se autocompleta si el operador no ingresó manualmente una fecha.
        const dateInput = document.getElementById('expected-date');
        if (dateInput && !dateInput.value) {
            const yyyy = fechaEstimada.getFullYear();
            const mm   = String(fechaEstimada.getMonth() + 1).padStart(2, '0');
            const dd   = String(fechaEstimada.getDate()).padStart(2, '0');
            dateInput.value = `${yyyy}-${mm}-${dd}`;
        }

        // Etiquetas de justificación (factores objetivos; el nivel ya lo dice el semáforo).
        const etiquetas = [];
        if (distKm > 800)           etiquetas.push('Larga distancia');
        if (pred.delivery_days > 5) etiquetas.push('Entrega lenta');

        el.innerHTML = `
            <div class="pred-row">
                <span class="pred-semaforo pred-semaforo--${semaforoClass}">${semaforoColor} ${semaforoLabel}</span>
                <span class="pred-prob"><strong>${fiabilidad}%</strong> de fiabilidad</span>
            </div>
            <div class="pred-prob pred-prob--sub">
                <span class="material-symbols-outlined">schedule</span>
                Prob. de demora: <strong>${prob}%</strong>
            </div>
            <div class="pred-days">
                <span class="material-symbols-outlined">event</span>
                Llega estimado: <strong>${fechaLabel}</strong> (${days} día${days !== 1 ? 's' : ''})
            </div>
            <div class="pred-dist">
                <span class="material-symbols-outlined">route</span>
                Distancia aprox.: <strong>${distKm} km</strong>
            </div>
            ${etiquetas.length > 0 ? `
            <div class="pred-tags">
                ${etiquetas.map(e => `<span class="pred-tag">${e}</span>`).join('')}
            </div>` : ''}
            ${prob > 50 ? `
            <div class="pred-alert" id="pred-alert-high-risk">
                <span class="material-symbols-outlined">warning</span>
                Fiabilidad baja — cargando sugerencia...
            </div>` : ''}
        `;

        // Si riesgo > 50%, buscar repartidor sugerido
        if (prob > 50) {
            fetch('/api/suggest-delivery')
                .then(r => r.json())
                .then(data => {
                    const alertEl = document.getElementById('pred-alert-high-risk');
                    if (!alertEl) return;
                    if (data.suggested) {
                        alertEl.innerHTML = `<span class="material-symbols-outlined">warning</span> Fiabilidad baja — Repartidor sugerido: <strong>${data.suggested.fullName}</strong> (${data.suggested.activeShipments} envío${data.suggested.activeShipments !== 1 ? 's' : ''} activo${data.suggested.activeShipments !== 1 ? 's' : ''})`;
                    } else {
                        alertEl.innerHTML = '<span class="material-symbols-outlined">warning</span> Fiabilidad baja — No hay repartidores disponibles';
                    }
                })
                .catch(() => {
                    const alertEl = document.getElementById('pred-alert-high-risk');
                    if (alertEl) alertEl.innerHTML = `<span class="material-symbols-outlined">warning</span> Fiabilidad baja`;
                });
        }
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
    window.assignSuggestedDelivery = async function(shipmentId, deliveryUserId) {
        try {
            const res = await fetch(`/shipment/update/${shipmentId}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `deliveryUserId=${deliveryUserId}`
            });
            if (res.ok || res.redirected) {
                window.location.reload();
            }
        } catch {
            alert('Error al asignar repartidor');
        }
    };
})();
