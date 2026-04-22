(function () {
    let timer        = null;
    let addressState = null; // null=sin verificar | 'valid' | 'invalid' | 'timeout'

    function getFields() {
        return {
            street:     (document.getElementById('street')?.value     || '').trim(),
            number:     (document.getElementById('number')?.value     || '').trim(),
            provinceId: (document.getElementById('province')?.value   || '').trim(),
        };
    }

    function setIndicator(state, message) {
        const box = document.getElementById('address-validation-result');
        if (!box) return;

        const icons = { valid: 'check_circle', invalid: 'error_outline', loading: 'autorenew', empty: 'info' };
        const spin  = state === 'loading' ? 'style="animation:pred-spin 1s linear infinite;display:inline-block"' : '';

        box.className = `addr-validation-box addr-validation-box--${state === 'loading' ? 'loading' : state === 'valid' ? 'valid' : state === 'invalid' ? 'invalid' : 'empty'}`;
        box.innerHTML = `<span class="material-symbols-outlined" ${spin} style="font-size:1rem">${icons[state] || 'info'}</span> ${message}`;
    }

    async function validateAddress() {
        // Si el autocomplete ya confirmó la dirección, no re-validar
        if (window.addrValid) return;

        const { street, number, provinceId } = getFields();

        if (!street || !number || !provinceId) {
            addressState = null;
            setIndicator('empty', 'Ingresá calle, número y provincia para verificar la dirección.');
            return;
        }

        setIndicator('loading', 'Verificando dirección...');

        try {
            const res  = await fetch('/api/validate-address', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ street, number, provinceId }),
            });
            const data = await res.json();

            if (data.timeout) {
                addressState = 'timeout';
                setIndicator('empty', 'No se pudo verificar (tiempo de espera agotado). Podés continuar de todas formas.');
                return;
            }

            if (data.valid) {
                addressState = 'valid';
                const short = data.formatted_address.split(',').slice(0, 3).join(',');
                setIndicator('valid', `Dirección encontrada: <strong>${short}</strong>`);
            } else {
                addressState = 'invalid';
                setIndicator('invalid', 'No se encontró la dirección. Revisá calle y número, o continuá de todas formas.');
            }
        } catch {
            addressState = 'timeout';
            setIndicator('empty', 'No se pudo verificar la dirección. Podés continuar de todas formas.');
        }
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(validateAddress, 800);
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Escucha cambios en los campos de dirección
        ['street', 'number', 'province'].forEach(function (id) {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', function () {
                // Si el cambio viene de tipeo manual (no del autocomplete), invalidar selección previa
                if (el.type !== 'hidden') window.addrValid = false;
                schedule();
            });
            if (el.tagName === 'INPUT') el.addEventListener('input', function () {
                if (el.type !== 'hidden') window.addrValid = false;
                schedule();
            });
        });

        // Estado inicial
        setIndicator('empty', 'Ingresá calle, número y provincia para verificar la dirección.');

        // Bloquea el submit si la dirección es inválida
        const form = document.querySelector('form[action=""]');
        if (form) {
            form.addEventListener('submit', function (e) {
                if (addressState !== 'invalid') return; // válida, timeout o sin verificar → dejar pasar

                e.preventDefault();
                const isDark = (localStorage.getItem('theme') ?? 'light') === 'dark';
                Swal.fire({
                    icon:              'warning',
                    title:             'Dirección no encontrada',
                    text:              'No pudimos verificar la dirección ingresada. ¿Querés guardar el envío de todas formas?',
                    showCancelButton:  true,
                    confirmButtonText: 'Guardar igual',
                    cancelButtonText:  'Revisar dirección',
                    confirmButtonColor: isDark ? '#3b82f6' : '#2563eb',
                    background:        isDark ? '#1e293b' : '#ffffff',
                    color:             isDark ? '#f1f5f9' : '#1e293b',
                }).then(function (result) {
                    if (result.isConfirmed) form.submit();
                });
            });
        }
    });
})();
