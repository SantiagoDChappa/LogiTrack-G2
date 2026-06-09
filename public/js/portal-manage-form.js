(function () {
    const timeSelect = document.getElementById('timeWindowSelect');
    const fromInput = document.getElementById('windowFrom');
    const toInput = document.getElementById('windowTo');

    if (timeSelect && fromInput && toInput) {
        timeSelect.addEventListener('change', function () {
            const value = timeSelect.value;
            if (!value) {
                fromInput.value = '';
                toInput.value = '';
                return;
            }
            const parts = value.split('|');
            fromInput.value = parts[0] || '';
            toInput.value = parts[1] || '';
        });
    }

    const radios = document.querySelectorAll('input[name="deliveryMode"]');
    const pickupSection = document.getElementById('pickup-branch-section');
    const pickupSelect = document.getElementById('pickupBranchId');

    // Caja de fecha estimada: se recalcula al cambiar la modalidad para que el
    // destinatario sepa cuándo recibiría a domicilio vs cuándo podría retirar.
    const etaBox = document.querySelector('.eta-box');
    const etaLabel = document.getElementById('etaLabel');
    const etaDate = document.getElementById('etaDate');
    const etaNote = document.getElementById('etaNote');

    function applyEta(mode) {
        if (!etaBox || !etaDate) { return; }
        const isPickup = mode === 'branch_pickup';
        const val = isPickup ? etaBox.dataset.etaPickup : etaBox.dataset.etaHome;
        if (etaLabel) { etaLabel.textContent = isPickup ? 'Retiro disponible desde' : 'Entrega estimada a domicilio'; }
        etaDate.textContent = val || '—';
        if (etaNote) {
            etaNote.textContent = isPickup
                ? 'Disponible para retirar en la sucursal a partir de esta fecha.'
                : 'Si elegís retiro por sucursal podés tenerlo antes.';
        }
    }

    if (!radios.length || !pickupSection) {
        // Sin radios (envío no editable): igual mostramos la estimación actual.
        applyEta(document.querySelector('input[name="deliveryMode"]:checked')?.value || 'home');
        return;
    }

    function applyDeliveryMode(mode) {
        const isPickup = mode === 'branch_pickup';
        pickupSection.style.display = isPickup ? '' : 'none';
        if (pickupSelect) {
            pickupSelect.disabled = !isPickup;
            pickupSelect.required = isPickup;
            if (!isPickup) { pickupSelect.value = ''; }
        }
        applyEta(mode);
    }

    radios.forEach((radio) => {
        radio.addEventListener('change', (event) => applyDeliveryMode(event.target.value));
    });

    const initial = document.querySelector('input[name="deliveryMode"]:checked')?.value || 'home';
    applyDeliveryMode(initial);
})();
