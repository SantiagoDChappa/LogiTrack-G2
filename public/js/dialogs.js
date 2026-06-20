/* LogiTrack — diálogos in-page (reemplazan confirm()/alert() del navegador).
 * Usa SweetAlert2 si está disponible; si no, cae a los diálogos nativos para no romper nada.
 *   - window.ltConfirm(opts|string) -> Promise<boolean>
 *   - window.ltAlert(opts|string)   -> Promise<void>
 *   - Auto-upgrade declarativo: <form data-confirm="msg"> dispara la confirmación in-page
 *     antes de enviarse (reemplaza onsubmit="return confirm(...)").
 */
(function () {
    'use strict';

    function isDark() { return (localStorage.getItem('theme') || 'light') === 'dark'; }
    function theme() { return { background: isDark() ? '#1e293b' : '#ffffff', color: isDark() ? '#f1f5f9' : '#1e293b' }; }
    function normalize(opts) { return typeof opts === 'string' ? { title: opts } : (opts || {}); }

    window.ltConfirm = function (opts) {
        var o = normalize(opts);
        if (!window.Swal) {
            return Promise.resolve(window.confirm([o.title, o.text].filter(Boolean).join('\n\n')));
        }
        return window.Swal.fire(Object.assign({
            icon: o.icon || 'question',
            title: o.title || '¿Confirmás?',
            text: o.text || '',
            html: o.html,
            showCancelButton: true,
            confirmButtonText: o.confirmButtonText || 'Aceptar',
            cancelButtonText: o.cancelButtonText || 'Cancelar',
            confirmButtonColor: o.confirmButtonColor || '#2563eb',
            cancelButtonColor: o.cancelButtonColor || (isDark() ? '#475569' : '#6b7280'),
        }, theme())).then(function (r) { return !!r.isConfirmed; });
    };

    window.ltAlert = function (opts) {
        var o = normalize(opts);
        if (!window.Swal) {
            window.alert([o.title, o.text].filter(Boolean).join('\n\n'));
            return Promise.resolve();
        }
        return window.Swal.fire(Object.assign({
            icon: o.icon || 'info',
            title: o.title || '',
            text: o.text || '',
            html: o.html,
            confirmButtonText: o.confirmButtonText || 'Entendido',
            confirmButtonColor: o.confirmButtonColor || '#2563eb',
        }, theme())).then(function () {});
    };

    function confirmFromEl(el) {
        return window.ltConfirm({
            title: el.getAttribute('data-confirm-title') || '¿Confirmás?',
            text: el.getAttribute('data-confirm'),
            icon: el.getAttribute('data-confirm-icon') || 'question',
            confirmButtonText: el.getAttribute('data-confirm-ok') || 'Aceptar',
            confirmButtonColor: el.getAttribute('data-confirm-color') || '#2563eb',
        });
    }

    // Auto-upgrade declarativo: formularios con data-confirm confirman in-page antes de enviarse.
    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!(form instanceof HTMLFormElement)) { return; }
        if (!form.getAttribute('data-confirm') || form.dataset.confirmed === '1') { return; }
        e.preventDefault();
        confirmFromEl(form).then(function (ok) {
            if (ok) { form.dataset.confirmed = '1'; form.submit(); }
        });
    }, true);

    // Botones submit con data-confirm (preservando name/value del botón disparador).
    document.addEventListener('click', function (e) {
        if (!e.target.closest) { return; }
        var btn = e.target.closest('button[data-confirm],input[type="submit"][data-confirm]');
        if (!btn || btn.dataset.confirmed === '1') { return; }
        var form = btn.form;
        if (!form) { return; }
        e.preventDefault();
        confirmFromEl(btn).then(function (ok) {
            if (!ok) { return; }
            btn.dataset.confirmed = '1';
            if (form.requestSubmit) {
                form.requestSubmit(btn);
            } else {
                // Fallback: replicamos el name/value del botón antes de enviar.
                if (btn.name) {
                    var hidden = document.createElement('input');
                    hidden.type = 'hidden'; hidden.name = btn.name; hidden.value = btn.value;
                    form.appendChild(hidden);
                }
                form.submit();
            }
        });
    }, true);
})();
