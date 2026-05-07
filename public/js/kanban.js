/**
 * Kanban board — supervisor view
 * Exposes window.kanban used by inline handlers in kanban.ejs
 */
(function () {
    'use strict';

    /* ── Constants ──────────────────────────────────────────── */

    const VALID_DRAGS = { 1: 6, 3: 6, 6: 7 };

    const COLS = [
        { id: 1, name: 'Pendiente',       icon: 'schedule'       },
        { id: 6, name: 'Asignado',        icon: 'assignment_ind' },
        { id: 7, name: 'En Preparación',  icon: 'inventory_2'    },
        { id: 2, name: 'En Tránsito',     icon: 'local_shipping' },
        { id: 3, name: 'En Sucursal',     icon: 'warehouse'      },
        { id: 9, name: 'Intento Fallido', icon: 'report'         },
    ];

    /* ── State ──────────────────────────────────────────────── */

    const drivers = JSON.parse(
        document.getElementById('k-drivers-data').textContent || '[]'
    );

    let pendingAction = null;

    /* ── DOM helpers ────────────────────────────────────────── */

    const $ = (id) => document.getElementById(id);

    function colCount(sid) { return $(`k-cnt-${sid}`); }
    function pillCount(sid) { return $(`k-pill-${sid}`); }
    function colBody(sid)   { return $(`k-body-${sid}`); }
    function colEmpty(sid)  { return $(`k-empty-${sid}`); }
    function colName(sid)   { return (COLS.find(c => c.id === sid) || {}).name || ''; }

    function updateCounter(sid, delta) {
        const cnt  = colCount(sid);
        const pill = pillCount(sid);
        if (cnt)  cnt.textContent  = Math.max(0, parseInt(cnt.textContent  || '0', 10) + delta);
        if (pill) pill.textContent = Math.max(0, parseInt(pill.textContent || '0', 10) + delta);

        if (sid === 9) {
            const n = parseInt(pill?.textContent || '0', 10);
            const wrapper = pill?.closest('.k-metric-pill');
            if (wrapper) wrapper.classList.toggle('k-pill-alert', n > 0);
        }
    }

    function refreshEmpty(sid) {
        const body  = colBody(sid);
        const empty = colEmpty(sid);
        if (!body || !empty) return;
        const hasVisible = Array.from(body.querySelectorAll('.k-card'))
            .some(c => !c.classList.contains('k-card-filtered-out'));
        empty.style.display = hasVisible ? 'none' : '';
    }

    /* ── Filters ────────────────────────────────────────────── */

    function applyFilters() {
        const query  = ($('k-filter-search').value || '').toLowerCase().trim();
        const drvVal = $('k-filter-driver').value;
        let total = 0;

        document.querySelectorAll('.k-card').forEach(card => {
            const matchSearch = !query
                || card.dataset.trk.toLowerCase().includes(query)
                || card.dataset.rec.toLowerCase().includes(query);

            const matchDriver = !drvVal
                || (drvVal === '__none__' && !card.dataset.drvId)
                || card.dataset.drvId === drvVal;

            const visible = matchSearch && matchDriver;
            card.classList.toggle('k-card-filtered-out', !visible);
            if (visible) total++;
        });

        const fc = $('k-filter-count');
        if (fc) fc.textContent = (query || drvVal) ? `${total} resultado${total !== 1 ? 's' : ''}` : '';

        COLS.forEach(c => refreshEmpty(c.id));
    }

    /* ── Modal ──────────────────────────────────────────────── */

    function openModal(opts) {
        $('k-modal-title').textContent    = opts.title    || '';
        $('k-modal-subtitle').textContent = opts.subtitle || '';

        const icon = $('k-modal-icon');
        icon.className = `modal-head-icon ${opts.iconCls || 'mi-assign'}`;

        const sym = $('k-modal-icon-sym');
        sym.textContent = opts.iconSym || 'assignment_ind';

        $('k-modal-body').innerHTML = opts.body || '';

        const btn = $('k-modal-confirm');
        btn.className = `btn-primary btn-sm${opts.danger ? ' danger' : ''}`;
        btn.disabled  = opts.btnDisabled || false;
        btn.textContent = opts.btnLabel || 'Confirmar';

        $('k-modal-back').classList.add('is-open');
    }

    function closeModal() {
        $('k-modal-back').classList.remove('is-open');
        pendingAction = null;
    }

    function confirmModal() {
        if (!pendingAction) { closeModal(); return; }
        const action = pendingAction;
        closeModal();
        executeAction(action);
    }

    $('k-modal-back').addEventListener('click', function (e) {
        if (e.target === this) closeModal();
    });

    /* ── Action buttons (Cancelar / Fallido) ────────────────── */

    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', handleActionButton);
    });

    function handleActionButton(e) {
        const btn     = e.currentTarget;
        const type    = btn.dataset.action;
        const sid     = parseInt(btn.dataset.sid, 10);
        const cardEl  = btn.closest('.k-card');
        const fromSid = cardEl ? parseInt(cardEl.dataset.sid, 10) : null;

        pendingAction = { type, shipmentId: sid, cardEl, fromStatusId: fromSid };

        const trk  = cardEl?.dataset.trk    || '';
        const rec  = cardEl?.dataset.recFull || cardEl?.dataset.rec || '';
        const prov = cardEl?.dataset.prov    || '';
        const preview = buildPreview(trk, rec, prov);

        if (type === 'cancel') {
            openModal({
                title:      'Cancelar envío',
                subtitle:   trk,
                iconCls:    'mi-cancel',
                iconSym:    'cancel',
                danger:     true,
                btnLabel:   'Confirmar cancelación',
                btnDisabled: true,
                body:       preview + buildTextarea('Motivo de cancelación', 'cancel'),
            });
            bindTextarea();

        } else if (type === 'failed') {
            openModal({
                title:      'Marcar paquete fallido',
                subtitle:   trk,
                iconCls:    'mi-failed',
                iconSym:    'broken_image',
                danger:     true,
                btnLabel:   'Confirmar',
                btnDisabled: true,
                body:       preview + buildTextarea('Motivo', 'failed'),
            });
            bindTextarea();
        }
    }

    function buildPreview(trk, rec, prov) {
        return `<div class="k-modal-preview">
            <div class="k-prev-trk">${trk}</div>
            <div class="k-prev-rec">${rec}${prov ? ' · ' + prov : ''}</div>
        </div>`;
    }

    function buildTextarea(label, id) {
        return `<label class="k-modal-lbl">${label} <span style="color:var(--color-danger)">*</span></label>
<textarea class="k-modal-ta" id="k-modal-ta-${id}" rows="3"
  placeholder="Describí el motivo (mín. 10 caracteres)…"
  oninput="kanban._checkTa('${id}')"></textarea>
<div class="k-modal-chars" id="k-modal-chars-${id}">0 / 10 mínimo</div>`;
    }

    function bindTextarea() {
        // focus after render
        setTimeout(() => {
            const ta = document.querySelector('.k-modal-ta');
            if (ta) ta.focus();
        }, 60);
    }

    function _checkTa(id) {
        const ta    = $(`k-modal-ta-${id}`);
        const chars = $(`k-modal-chars-${id}`);
        const btn   = $('k-modal-confirm');
        if (!ta) return;

        const n = ta.value.trim().length;
        ta.className = 'k-modal-ta' + (n === 0 ? '' : n >= 10 ? ' good' : ' bad');
        if (chars) {
            chars.textContent = `${n} / 10 mínimo`;
            chars.className   = 'k-modal-chars' + (n > 0 && n < 10 ? ' err' : '');
        }
        if (btn) btn.disabled = n < 10;
    }

    /* ── Drag & Drop ────────────────────────────────────────── */

    let draggedCard = null;
    let dragFromSid = null;

    document.querySelectorAll('.k-card').forEach(attachDragListeners);

    function attachDragListeners(card) {
        card.addEventListener('dragstart', onDragStart);
        card.addEventListener('dragend',   onDragEnd);
    }

    document.querySelectorAll('.k-col').forEach(col => {
        col.addEventListener('dragover',  onDragOver);
        col.addEventListener('dragleave', onDragLeave);
        col.addEventListener('drop',      onDrop);
    });

    function onDragStart(e) {
        draggedCard = e.currentTarget;
        dragFromSid = parseInt(draggedCard.closest('.k-col').dataset.colSid, 10);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => draggedCard && draggedCard.classList.add('dragging'), 0);
    }

    function onDragEnd() {
        if (draggedCard) draggedCard.classList.remove('dragging');
        draggedCard = null;
        dragFromSid = null;
        document.querySelectorAll('.k-col').forEach(c => c.classList.remove('drop-ok', 'drop-bad'));
    }

    function onDragOver(e) {
        e.preventDefault();
        if (!draggedCard) return;

        const col   = e.currentTarget;
        const toSid = parseInt(col.dataset.colSid, 10);

        col.classList.remove('drop-ok', 'drop-bad');
        if (toSid === dragFromSid) return;

        const valid = VALID_DRAGS[dragFromSid] === toSid;
        col.classList.add(valid ? 'drop-ok' : 'drop-bad');
        e.dataTransfer.dropEffect = valid ? 'move' : 'none';
    }

    function onDragLeave(e) {
        const col = e.currentTarget;
        if (!col.contains(e.relatedTarget)) col.classList.remove('drop-ok', 'drop-bad');
    }

    function onDrop(e) {
        e.preventDefault();
        if (!draggedCard) return;

        const col   = e.currentTarget;
        const toSid = parseInt(col.dataset.colSid, 10);
        col.classList.remove('drop-ok', 'drop-bad');

        if (toSid === dragFromSid) return;

        if (VALID_DRAGS[dragFromSid] !== toSid) {
            shakeCard(draggedCard);
            return;
        }

        const card    = draggedCard;
        const fromSid = dragFromSid;
        const trk     = card.dataset.trk;
        const rec     = card.dataset.recFull || card.dataset.rec || '';
        const prov    = card.dataset.prov || '';

        pendingAction = {
            type:           'drag',
            shipmentId:     parseInt(card.dataset.id, 10),
            cardEl:         card,
            fromStatusId:   fromSid,
            targetStatusId: toSid,
        };

        const preview = buildPreview(trk, rec, prov);

        if (toSid === 6) {
            const isRe = fromSid === 3;
            openModal({
                title:    isRe ? 'Reasignar repartidor' : 'Asignar repartidor',
                subtitle: `${colName(fromSid)} → ${colName(toSid)}`,
                iconCls:  'mi-assign',
                iconSym:  'assignment_ind',
                btnLabel: isRe ? 'Confirmar reasignación' : 'Confirmar asignación',
                btnDisabled: false,
                body:     preview + buildDriverSelect(card.dataset.drvId),
            });

        } else if (toSid === 7) {
            const drvName = card.dataset.drvName || '';
            const info = drvName
                ? `El repartidor <strong>${card.querySelector('.card-driver')?.textContent?.trim() || drvName}</strong> podrá retirarlo desde sucursal.`
                : '<strong>No tiene repartidor asignado.</strong> Podés asignarlo desde la tarjeta.';

            openModal({
                title:    'Iniciar preparación',
                subtitle: `${colName(fromSid)} → ${colName(toSid)}`,
                iconCls:  'mi-prepare',
                iconSym:  'inventory_2',
                btnLabel: 'Confirmar preparación',
                btnDisabled: false,
                body:     preview + `<div class="modal-info" style="display:flex;align-items:flex-start;gap:.4rem;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:.55rem .75rem;font-size:var(--font-size-xs);color:var(--color-text-secondary);line-height:1.5;margin-bottom:.9rem"><span class="material-symbols-outlined" style="font-size:.95rem;color:var(--color-primary);flex-shrink:0;margin-top:1px">info</span><span>El envío pasará a <strong>En Preparación</strong>. ${info}</span></div>`,
            });
        }
    }

    function buildDriverSelect(currentDrvId) {
        let opts = '<option value="">Seleccionar repartidor…</option>';
        drivers.forEach(d => {
            const sel = String(d.id) === String(currentDrvId) ? ' selected' : '';
            opts += `<option value="${d.id}"${sel}>${d.fullName}</option>`;
        });
        return `<label class="k-modal-lbl">Repartidor <span style="color:var(--color-danger)">*</span></label>
<select class="k-modal-sel" id="k-modal-drv">${opts}</select>`;
    }

    /* ── Execute confirmed action ───────────────────────────── */

    async function executeAction(action) {
        const { type, shipmentId, cardEl, fromStatusId, targetStatusId } = action;

        if (type === 'drag') {
            const drvEl  = $('k-modal-drv');
            const drvId  = drvEl?.value || '';
            const drvTxt = drvEl?.options[drvEl.selectedIndex]?.text || '';
            const url    = targetStatusId === 6
                ? `/shipment/update/${shipmentId}/assign`
                : `/shipment/update/${shipmentId}/prepare`;
            const body = new URLSearchParams();
            if (drvId) body.set('deliveryUserId', drvId);
            await postAction(url, body, cardEl, fromStatusId, targetStatusId, drvId, drvTxt);

        } else if (type === 'cancel') {
            const ta = $('k-modal-ta-cancel');
            const comment = ta?.value.trim() || '';
            if (comment.length < 10) { shakeModal(); return; }
            await postAction(
                `/shipment/update/${shipmentId}/cancel`,
                new URLSearchParams({ comment }),
                cardEl, fromStatusId, 5
            );

        } else if (type === 'failed') {
            const ta = $('k-modal-ta-failed');
            const comment = ta?.value.trim() || '';
            if (comment.length < 10) { shakeModal(); return; }
            await postAction(
                `/shipment/update/${shipmentId}/mark-failed`,
                new URLSearchParams({ comment }),
                cardEl, fromStatusId, 9
            );
        }
    }

    async function postAction(endpoint, body, cardEl, fromSid, toSid, drvId, drvName) {
        try {
            const resp = await fetch(endpoint, {
                method:  'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body:    body.toString(),
            });

            const finalUrl = resp.url || '';
            const params   = new URL(finalUrl, window.location.origin).searchParams;

            if (!resp.ok || params.has('smError') || params.has('error')) {
                const msg = params.get('smError') || params.get('error') || 'Error desconocido';
                showToast('err', decodeURIComponent(msg));
                shakeCard(cardEl);
                return;
            }

            if (toSid === 5) {
                removeCard(cardEl, fromSid);
                showToast('ok', `${cardEl.dataset.trk} cancelado`);
            } else {
                moveCard(cardEl, fromSid, toSid, drvId, drvName);
                rebuildCardButtons(cardEl, toSid);
                const msg = toSid === 9
                    ? `${cardEl.dataset.trk} marcado como intento fallido`
                    : `${cardEl.dataset.trk} → ${colName(toSid)}`;
                showToast('ok', msg);
            }

        } catch {
            showToast('err', 'Error de red. Intentá de nuevo.');
        }
    }

    /* ── DOM card operations ────────────────────────────────── */

    function moveCard(cardEl, fromSid, toSid, drvId, drvName) {
        if (!cardEl) return;

        cardEl.dataset.sid = toSid;

        if (drvId !== undefined) {
            cardEl.dataset.drvId   = drvId || '';
            cardEl.dataset.drvName = (drvName || '').toLowerCase();
            const drvDiv = cardEl.querySelector('.card-driver');
            if (drvDiv) {
                if (drvName && drvName !== 'Seleccionar repartidor…') {
                    drvDiv.className = 'card-driver';
                    drvDiv.innerHTML = `<span class="material-symbols-outlined">directions_bike</span>${drvName}`;
                } else {
                    drvDiv.className = 'card-driver card-driver--none';
                    drvDiv.innerHTML = `<span class="material-symbols-outlined">person_off</span>Sin asignar`;
                }
            }
        }

        const targetBody  = colBody(toSid);
        if (!targetBody) return;

        const firstCard = targetBody.querySelector('.k-card');
        targetBody.insertBefore(cardEl, firstCard || colEmpty(toSid));

        attachDragListeners(cardEl);

        updateCounter(fromSid, -1);
        updateCounter(toSid,   +1);
        refreshEmpty(fromSid);
        refreshEmpty(toSid);

        // brief highlight
        cardEl.style.transition = 'none';
        cardEl.style.boxShadow  = '0 0 0 2px var(--color-primary)';
        setTimeout(() => { cardEl.style.transition = ''; cardEl.style.boxShadow = ''; }, 800);
    }

    function removeCard(cardEl, fromSid) {
        if (!cardEl) return;
        cardEl.style.transition = 'opacity 0.3s, transform 0.3s';
        cardEl.style.opacity    = '0';
        cardEl.style.transform  = 'scale(0.95)';
        setTimeout(() => {
            cardEl.remove();
            updateCounter(fromSid, -1);
            refreshEmpty(fromSid);
        }, 300);
    }

    function rebuildCardButtons(cardEl, newSid) {
        const CARD_BTNS = {
            1: ['cancel'],
            6: ['cancel'],
            7: ['cancel', 'failed'],
            2: ['cancel', 'failed'],
            3: ['failed'],
            9: ['failed'],
        };

        const btns   = CARD_BTNS[newSid] || [];
        const actDiv = cardEl.querySelector('.card-actions');
        if (!actDiv) return;

        actDiv.querySelectorAll('.c-btn-cancel, .c-btn-failed').forEach(b => b.remove());

        const shipId = parseInt(cardEl.dataset.id, 10);

        if (btns.includes('cancel')) {
            const btn = document.createElement('button');
            btn.className          = 'c-btn c-btn-cancel';
            btn.dataset.action     = 'cancel';
            btn.dataset.sid        = shipId;
            btn.innerHTML = '<span class="material-symbols-outlined">cancel</span>Cancelar';
            btn.addEventListener('click', handleActionButton);
            actDiv.appendChild(btn);
        }

        if (btns.includes('failed')) {
            const btn = document.createElement('button');
            btn.className          = 'c-btn c-btn-failed';
            btn.dataset.action     = 'failed';
            btn.dataset.sid        = shipId;
            btn.innerHTML = '<span class="material-symbols-outlined">broken_image</span>Fallido';
            btn.addEventListener('click', handleActionButton);
            actDiv.appendChild(btn);
        }
    }

    /* ── Toasts ─────────────────────────────────────────────── */

    function showToast(type, message) {
        Swal.fire({
            toast:             true,
            position:          'bottom-end',
            icon:              type === 'ok' ? 'success' : 'error',
            title:             message,
            showConfirmButton: false,
            timer:             3000,
            timerProgressBar:  true,
        });
    }

    /* ── Shake ──────────────────────────────────────────────── */

    function shakeCard(cardEl) {
        if (!cardEl) return;
        cardEl.classList.remove('k-card-shake');
        void cardEl.offsetWidth;
        cardEl.classList.add('k-card-shake');
        cardEl.addEventListener('animationend', () => cardEl.classList.remove('k-card-shake'), { once: true });
    }

    function shakeModal() {
        const m = $('k-modal');
        if (!m) return;
        m.classList.remove('k-card-shake');
        void m.offsetWidth;
        m.classList.add('k-card-shake');
        m.addEventListener('animationend', () => m.classList.remove('k-card-shake'), { once: true });
    }

    /* ── Public API ─────────────────────────────────────────── */

    window.kanban = { applyFilters, closeModal, confirmModal, _checkTa };

})();
