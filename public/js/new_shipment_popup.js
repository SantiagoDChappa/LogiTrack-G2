if (serverErrors.length > 0) {
    const isDark = (localStorage.getItem('theme') ?? 'light') === 'dark';

    const errorItems = serverErrors
        .map(e => `
            <li style="
                display: flex;
                align-items: flex-start;
                gap: 0.5rem;
                padding: 0.45rem 0;
                border-bottom: 1px solid ${isDark ? '#334155' : '#f1f5f9'};
                text-align: left;
                font-size: 0.875rem;
                line-height: 1.4;
            ">
                <span style="color: ${isDark ? '#f87171' : '#dc2626'}; flex-shrink: 0; margin-top: 1px;">✕</span>
                <span>${typeof e === 'object' ? e.msg : e}</span>
            </li>`)
        .join('');

    const html = `
        <ul style="
            list-style: none;
            margin: 0.25rem 0 0;
            padding: 0;
            max-height: 260px;
            overflow-y: auto;
            text-align: left;
        ">
            ${errorItems}
        </ul>`;

    Swal.fire({
        icon: 'error',
        title: `<span style="font-size: 1.1rem; font-weight: 600;">Se encontraron ${serverErrors.length} error${serverErrors.length > 1 ? 'es' : ''}</span>`,
        html,
        confirmButtonText: 'Entendido',
        confirmButtonColor: isDark ? '#3b82f6' : '#2563eb',
        background: isDark ? '#1e293b' : '#ffffff',
        color: isDark ? '#f1f5f9' : '#1e293b',
        iconColor: isDark ? '#f87171' : '#dc2626',
        width: 480,
        padding: '1.5rem',
    });
}