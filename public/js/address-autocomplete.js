(function () {
    let debounceTimer   = null;
    let activeIndex     = -1;
    let currentResults  = [];
    let addressSelected = false; // true cuando el usuario eligió una sugerencia

    // ── Elementos ──────────────────────────────────────────────
    function el(id) { return document.getElementById(id); }

    // ── Inicialización ─────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        const searchBox = el('address-search');
        const dropdown  = el('address-dropdown');
        if (!searchBox || !dropdown) return;

        searchBox.addEventListener('input', function () {
            addressSelected = false;
            clearChip();
            clearHidden();
            const isPickup = document.querySelector('input[name="deliveryMode"]:checked')?.value === 'branch_pickup';
            searchBox.required = !isPickup;
            schedule(this.value);
        });

        searchBox.addEventListener('keydown', handleKeydown);

        document.addEventListener('click', function (e) {
            if (!searchBox.contains(e.target) && !dropdown.contains(e.target)) {
                hideDropdown();
            }
        });

        // Botón para limpiar selección
        const clearBtn = el('address-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                searchBox.value = '';
                clearChip();
                clearHidden();
                addressSelected = false;
                const isPickup = document.querySelector('input[name="deliveryMode"]:checked')?.value === 'branch_pickup';
                searchBox.required = !isPickup;
                setValidationState('empty', 'Ingresá una dirección para buscar sugerencias.');
                searchBox.focus();
                window.addrValid = false;
            });
        }
    });

    // ── Debounce y búsqueda ────────────────────────────────────
    function schedule(q) {
        clearTimeout(debounceTimer);
        if (q.length < 3) { hideDropdown(); return; }
        showLoading();
        debounceTimer = setTimeout(function () { fetchSuggestions(q); }, 400);
    }

    async function fetchSuggestions(q) {
        try {
            const res  = await fetch(`/api/address-suggest?q=${encodeURIComponent(q)}`);
            currentResults = await res.json();
            renderDropdown(currentResults);
        } catch {
            hideDropdown();
        }
    }

    // ── Render del dropdown ────────────────────────────────────
    function renderDropdown(results) {
        const dropdown = el('address-dropdown');
        if (!dropdown) return;

        activeIndex = -1;
        dropdown.innerHTML = '';

        if (results.length === 0) {
            dropdown.innerHTML = '<div class="addr-dd-empty">No se encontraron resultados</div>';
            dropdown.style.display = 'block';
            return;
        }

        results.forEach(function (r, i) {
            const item = document.createElement('div');
            item.className = 'addr-dd-item';
            item.dataset.index = i;

            // display_name ya viene limpio del servidor (sin códigos internos)
            const parts    = r.display_name.split(',').map(s => s.trim()).filter(Boolean);
            const mainLine = parts[0] || [r.street, r.number].filter(Boolean).join(' ');
            const city     = r.city || parts[1] || '';
            const prov     = r.province_name || '';

            // La provincia se muestra como badge bien visible para que el usuario
            // distinga entre resultados de distintas ciudades (ej: Av. Corrientes
            // existe tanto en CABA como en Rosario).
            item.innerHTML =
                `<div class="addr-dd-row">` +
                    `<span class="addr-dd-main">${mainLine}</span>` +
                    (prov ? `<span class="addr-dd-prov">${prov}</span>` : '') +
                `</div>` +
                (city ? `<span class="addr-dd-sub">${city}</span>` : '');

            item.addEventListener('mousedown', function (e) {
                e.preventDefault();
                selectResult(i);
            });

            dropdown.appendChild(item);
        });

        dropdown.style.display = 'block';
    }

    // ── Selección de una sugerencia ────────────────────────────
    function selectResult(index) {
        const r = currentResults[index];
        if (!r) return;

        addressSelected = true;
        window.addrValid = true;

        // Llena los hidden fields que va a enviar el form
        setHidden('street',      r.street);
        setHidden('number',      r.number);
        setHidden('province',    r.province_id || '');
        setHidden('postal-code', r.postal || '');
        setHidden('address-lat', r.lat != null ? String(r.lat) : '');
        setHidden('address-lng', r.lng != null ? String(r.lng) : '');

        // Muestra el chip usando la nomenclatura limpia del servidor
        const parts   = r.display_name.split(',').map(s => s.trim()).filter(Boolean);
        const mainLine = parts[0] || [r.street, r.number].filter(Boolean).join(' ');
        const subLine  = parts.slice(1, 3).join(', ') || [r.city, r.province_name].filter(Boolean).join(', ');
        showChip(mainLine, subLine);

        // Limpia el input y cierra el dropdown
        const searchBox = el('address-search');
        searchBox.value = '';
        searchBox.required = false;
        hideDropdown();

        // Marca la validación como correcta
        setValidationState('valid', `Dirección seleccionada: <strong>${mainLine}${subLine ? ', ' + subLine : ''}</strong>`);

        // Dispara la predicción (cambia el valor del province hidden)
        const provinceHidden = el('province');
        if (provinceHidden) provinceHidden.dispatchEvent(new Event('change'));
        const streetHidden = el('street');
        if (streetHidden) streetHidden.dispatchEvent(new Event('change'));
    }

    // ── Chip de dirección seleccionada ─────────────────────────
    function showChip(main, sub) {
        const row  = el('addr-selected-row');
        const text = el('addr-chip-text');
        if (text) text.innerHTML = `<strong>${main}</strong>${sub ? ' — ' + sub : ''}`;
        if (row)  row.style.display = 'flex';
    }

    function clearChip() {
        const row = el('addr-selected-row');
        if (row) row.style.display = 'none';
    }

    // ── Campos hidden ──────────────────────────────────────────
    function setHidden(id, value) {
        const el2 = el(id);
        if (el2) el2.value = value || '';
    }

    function clearHidden() {
        ['street', 'number', 'province', 'postal-code', 'address-lat', 'address-lng'].forEach(function (id) {
            setHidden(id, '');
        });
    }

    // ── Indicador de validación (comparte el div con address-validation.js) ──
    function setValidationState(state, message) {
        const box = el('address-validation-result');
        if (!box) return;
        const spin = state === 'loading' ? 'style="animation:pred-spin 1s linear infinite;display:inline-block"' : '';
        const icons = { valid: 'check_circle', invalid: 'error_outline', loading: 'autorenew', empty: 'info' };
        box.className = `addr-validation-box addr-validation-box--${state === 'loading' ? 'loading' : state}`;
        box.innerHTML = `<span class="material-symbols-outlined" ${spin} style="font-size:1rem">${icons[state] || 'info'}</span> ${message}`;
    }

    // ── Loading state en el dropdown ───────────────────────────
    function showLoading() {
        const dropdown = el('address-dropdown');
        if (!dropdown) return;
        dropdown.innerHTML = '<div class="addr-dd-empty">Buscando...</div>';
        dropdown.style.display = 'block';
    }

    function hideDropdown() {
        const dropdown = el('address-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        activeIndex = -1;
    }

    // ── Navegación con teclado ─────────────────────────────────
    function handleKeydown(e) {
        const dropdown = el('address-dropdown');
        if (!dropdown || dropdown.style.display === 'none') return;

        const items = dropdown.querySelectorAll('.addr-dd-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            updateActiveItem(items);
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            selectResult(activeIndex);
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    }

    function updateActiveItem(items) {
        items.forEach(function (item, i) {
            item.classList.toggle('addr-dd-item--active', i === activeIndex);
        });
    }
})();
