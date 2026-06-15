// ABM tables: filtro de texto + orden por columna + paginación, autocontenido.
// Opt-in con <table data-tools="clave">. Reemplaza a table-paginate.js para esas tablas
// (maneja él mismo la visibilidad de filas, así no compiten por row.style.display).
(function () {
    'use strict';

    const SIZES = [10, 20, 50, 100];
    const DEFAULT_SIZE = 10;
    const KEY = 'tblt:size:';

    const recall = (k) => {
        try { const v = Number(localStorage.getItem(KEY + k)); return SIZES.includes(v) ? v : null; } catch (_) { return null; }
    };
    const remember = (k, v) => { try { localStorage.setItem(KEY + k, String(v)); } catch (_) {} };

    const cellText = (row, idx) => (row.cells[idx] ? row.cells[idx].textContent.trim() : '');
    const isNumeric = (s) => s !== '' && !isNaN(parseFloat(s.replace(/[^0-9.,-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.')));
    const numVal = (s) => parseFloat(s.replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;

    function build(table) {
        const tbody = table.tBodies[0];
        if (!tbody) { return; }
        const key = table.dataset.tools || table.id || 'tbl';

        const rows = Array.from(tbody.rows).filter(r =>
            !r.classList.contains('empty-row') && !r.classList.contains('incident-empty') && r.dataset.skip !== 'true');
        if (rows.length === 0) { return; }

        const headRow = table.tHead ? table.tHead.rows[0] : null;
        const sortableCols = [];
        if (headRow) {
            Array.from(headRow.cells).forEach((th, i) => {
                if (th.classList.contains('col-actions') || th.hasAttribute('data-nosort')) { return; }
                th.classList.add('th-sortable');
                th.setAttribute('role', 'button');
                th.setAttribute('tabindex', '0');
                th.setAttribute('aria-label', `Ordenar por ${th.textContent.trim()}`);
                const arrow = document.createElement('span');
                arrow.className = 'th-sort-arrow';
                arrow.setAttribute('aria-hidden', 'true');
                th.appendChild(arrow);
                const act = () => sortBy(i);
                th.addEventListener('click', act);
                th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
                sortableCols.push(i);
            });
        }

        // Toolbar con buscador.
        const toolbar = document.createElement('div');
        toolbar.className = 'tbl-tools';
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'tbl-tools__search';
        search.placeholder = 'Filtrar…';
        search.setAttribute('aria-label', 'Filtrar tabla');
        const count = document.createElement('span');
        count.className = 'tbl-tools__count';
        toolbar.append(search, count);

        const wrapper = table.closest('.table-wrapper, .shipments-wrapper') || table;
        wrapper.insertAdjacentElement('beforebegin', toolbar);

        // Controles de paginación (mismas clases que table-paginate para heredar estilos).
        const pg = document.createElement('div');
        pg.className = 'tbl-paginate';
        pg.innerHTML = '<div class="tbl-paginate__left">'
            + '<span class="tbl-paginate__label">Filas</span>'
            + '<select class="tbl-paginate__size"></select>'
            + '<span class="tbl-paginate__info"></span></div>'
            + '<div class="tbl-paginate__nav">'
            + '<button type="button" class="tbl-paginate__btn" data-act="first">«</button>'
            + '<button type="button" class="tbl-paginate__btn" data-act="prev">‹</button>'
            + '<span class="tbl-paginate__page"></span>'
            + '<button type="button" class="tbl-paginate__btn" data-act="next">›</button>'
            + '<button type="button" class="tbl-paginate__btn" data-act="last">»</button></div>';
        wrapper.insertAdjacentElement('afterend', pg);
        const sizeSel = pg.querySelector('.tbl-paginate__size');
        SIZES.forEach(n => { const o = document.createElement('option'); o.value = o.textContent = String(n); sizeSel.appendChild(o); });

        const state = {
            size: recall(key) || DEFAULT_SIZE,
            page: 0,
            sortCol: null,
            sortDir: 1,
            filtered: rows.slice(),
        };
        sizeSel.value = String(state.size);

        function applyFilter() {
            const q = search.value.trim().toLowerCase();
            state.filtered = rows.filter(r => !q || r.textContent.toLowerCase().includes(q));
            state.page = 0;
        }

        function sortBy(col) {
            if (state.sortCol === col) { state.sortDir *= -1; }
            else { state.sortCol = col; state.sortDir = 1; }
            const numeric = state.filtered.every(r => { const t = cellText(r, col); return t === '' || isNumeric(t); });
            state.filtered.sort((a, b) => {
                const ta = cellText(a, col), tb = cellText(b, col);
                const cmp = numeric ? (numVal(ta) - numVal(tb)) : ta.localeCompare(tb, 'es', { sensitivity: 'base' });
                return cmp * state.sortDir;
            });
            if (headRow) {
                sortableCols.forEach(i => {
                    const ar = headRow.cells[i].querySelector('.th-sort-arrow');
                    if (ar) { ar.textContent = i === col ? (state.sortDir === 1 ? ' ▲' : ' ▼') : ''; }
                });
            }
            render();
        }

        function render() {
            // Oculta todas las reales, muestra solo la página filtrada.
            rows.forEach(r => { r.style.display = 'none'; });
            const total = state.filtered.length;
            const pages = Math.max(1, Math.ceil(total / state.size));
            if (state.page >= pages) { state.page = pages - 1; }
            if (state.page < 0) { state.page = 0; }
            const from = state.page * state.size;
            const to = Math.min(total, from + state.size);
            for (let i = from; i < to; i++) {
                state.filtered[i].style.display = '';
                tbody.appendChild(state.filtered[i]); // reordena el DOM según el sort
            }
            count.textContent = `${total} resultado${total === 1 ? '' : 's'}`;
            pg.querySelector('.tbl-paginate__info').textContent = total ? ` ${total ? from + 1 : 0}–${to} de ${total}` : ' 0 resultados';
            pg.querySelector('.tbl-paginate__page').textContent = `${state.page + 1} / ${pages}`;
            pg.querySelector('[data-act="first"]').disabled = state.page === 0;
            pg.querySelector('[data-act="prev"]').disabled = state.page === 0;
            pg.querySelector('[data-act="next"]').disabled = state.page >= pages - 1;
            pg.querySelector('[data-act="last"]').disabled = state.page >= pages - 1;
        }

        search.addEventListener('input', () => { applyFilter(); render(); });
        sizeSel.addEventListener('change', () => { state.size = Number(sizeSel.value) || DEFAULT_SIZE; remember(key, state.size); state.page = 0; render(); });
        pg.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            if (!act) { return; }
            const a = act.dataset.act;
            if (a === 'first') { state.page = 0; }
            else if (a === 'prev') { state.page--; }
            else if (a === 'next') { state.page++; }
            else if (a === 'last') { state.page = Infinity; }
            render();
        });

        render();
    }

    function init() { document.querySelectorAll('table[data-tools]').forEach(build); }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
})();
