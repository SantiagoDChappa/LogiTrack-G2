(function () {
    function formatDoc(digits) {
        if (!digits) return '';
        return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    document.querySelectorAll('[data-doc-format]').forEach(function (input) {
        // Format initial value (raw number from server)
        const initialRaw = input.value.replace(/\./g, '');
        if (initialRaw) input.value = formatDoc(initialRaw);

        input.addEventListener('input', function () {
            const selEnd  = this.selectionEnd;
            const prevLen = this.value.length;
            const raw     = this.value.replace(/[^\d]/g, '').slice(0, 8); // max 8 dígitos → 99.999.999
            const formatted = formatDoc(raw);
            this.value = formatted;
            const diff   = formatted.length - prevLen;
            const newPos = Math.max(0, selEnd + diff);
            try { this.setSelectionRange(newPos, newPos); } catch (_) {}
        });

        const form = input.closest('form');
        if (form) {
            form.addEventListener('submit', function () {
                const raw = input.value.replace(/\./g, '');
                // Validar rango antes de enviar
                const num = parseInt(raw, 10);
                if (!raw || num < 1000000 || num > 99999999) {
                    input.setCustomValidity('El documento debe estar entre 1.000.000 y 99.999.999');
                    input.reportValidity();
                    // Restaurar formato para que el usuario siga viendo el valor formateado
                    return;
                }
                input.setCustomValidity('');
                input.value = raw; // enviar sin puntos al backend
            });
        }

        // Limpiar validación custom al escribir
        input.addEventListener('input', function () {
            this.setCustomValidity('');
        });
    });
})();
