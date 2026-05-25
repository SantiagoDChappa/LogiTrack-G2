(function () {
    'use strict';

    const SIZES = [5, 10, 20, 50, 100];
    const DEFAULT_SIZE = 10;
    const STORAGE_PREFIX = 'tblpg:size:';

    function rememberSize(key, size) {
        try { localStorage.setItem(STORAGE_PREFIX + key, String(size)); } catch (_) {}
    }
    function recallSize(key) {
        try {
            const v = Number(localStorage.getItem(STORAGE_PREFIX + key));
            return SIZES.includes(v) ? v : null;
        } catch (_) { return null; }
    }

    function buildControls(state) {
        const wrap = document.createElement('div');
        wrap.className = 'tbl-paginate';

        const left = document.createElement('div');
        left.className = 'tbl-paginate__left';
        const sizeLabel = document.createElement('span');
        sizeLabel.className = 'tbl-paginate__label';
        sizeLabel.textContent = 'Filas';
        const select = document.createElement('select');
        select.className = 'tbl-paginate__size';
        SIZES.forEach(n => {
            const opt = document.createElement('option');
            opt.value = String(n);
            opt.textContent = String(n);
            if (n === state.size) opt.selected = true;
            select.appendChild(opt);
        });
        left.append(sizeLabel, select);
        const info = document.createElement('span');
        info.className = 'tbl-paginate__info';
        left.appendChild(info);

        const right = document.createElement('div');
        right.className = 'tbl-paginate__nav';
        const btnFirst = navBtn('«');
        const btnPrev  = navBtn('‹');
        const pageInfo = document.createElement('span');
        pageInfo.className = 'tbl-paginate__page';
        const btnNext  = navBtn('›');
        const btnLast  = navBtn('»');
        right.append(btnFirst, btnPrev, pageInfo, btnNext, btnLast);

        wrap.append(left, right);
        return { wrap, select, info, pageInfo, btnFirst, btnPrev, btnNext, btnLast };
    }
    function navBtn(text) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tbl-paginate__btn';
        b.textContent = text;
        return b;
    }

    function paginate(table) {
        const tbody = table.tBodies[0];
        if (!tbody) return;

        // Solo cuentan filas "reales": ignoramos placeholders (clase .empty-row, .incident-empty, data-skip).
        const allRows = Array.from(tbody.rows);
        const dataRows = allRows.filter(r => !r.classList.contains('empty-row')
                                          && !r.classList.contains('incident-empty')
                                          && r.dataset.skip !== 'true');
        if (dataRows.length === 0) return;

        const key = table.dataset.paginate || (table.id || 'default');
        const initialSize = recallSize(key) || Number(table.dataset.paginateSize) || DEFAULT_SIZE;

        const state = {
            size: SIZES.includes(initialSize) ? initialSize : DEFAULT_SIZE,
            page: 0,
            rows: dataRows,
        };

        const ctrl = buildControls(state);
        const wrapper = table.closest('.table-wrapper, .incident-table-wrapper, .shipments-wrapper') || table;
        wrapper.insertAdjacentElement('afterend', ctrl.wrap);

        function render() {
            const total = state.rows.length;
            const pages = Math.max(1, Math.ceil(total / state.size));
            if (state.page >= pages) state.page = pages - 1;
            if (state.page < 0) state.page = 0;
            const from = state.page * state.size;
            const to = Math.min(total, from + state.size);

            state.rows.forEach((row, i) => {
                row.style.display = (i >= from && i < to) ? '' : 'none';
            });

            ctrl.info.textContent = total
                ? ` ${from + 1}–${to} de ${total}`
                : ' 0 resultados';
            ctrl.pageInfo.textContent = `${state.page + 1} / ${pages}`;
            ctrl.btnFirst.disabled = state.page === 0;
            ctrl.btnPrev.disabled  = state.page === 0;
            ctrl.btnNext.disabled  = state.page >= pages - 1;
            ctrl.btnLast.disabled  = state.page >= pages - 1;
        }

        ctrl.select.addEventListener('change', () => {
            state.size = Number(ctrl.select.value) || DEFAULT_SIZE;
            state.page = 0;
            rememberSize(key, state.size);
            render();
        });
        ctrl.btnFirst.addEventListener('click', () => { state.page = 0; render(); });
        ctrl.btnPrev .addEventListener('click', () => { state.page--; render(); });
        ctrl.btnNext .addEventListener('click', () => { state.page++; render(); });
        ctrl.btnLast .addEventListener('click', () => { state.page = Infinity; render(); });

        render();
    }

    function init() {
        document.querySelectorAll('table[data-paginate]').forEach(paginate);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
