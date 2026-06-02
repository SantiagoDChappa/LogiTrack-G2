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

    if (!radios.length || !pickupSection) { return; }

    function applyDeliveryMode(mode) {
        const isPickup = mode === 'branch_pickup';
        pickupSection.style.display = isPickup ? '' : 'none';
        if (pickupSelect) {
            pickupSelect.disabled = !isPickup;
            pickupSelect.required = isPickup;
            if (!isPickup) { pickupSelect.value = ''; }
        }
    }

    radios.forEach((radio) => {
        radio.addEventListener('change', (event) => applyDeliveryMode(event.target.value));
    });

    const initial = document.querySelector('input[name="deliveryMode"]:checked')?.value || 'home';
    applyDeliveryMode(initial);
})();
