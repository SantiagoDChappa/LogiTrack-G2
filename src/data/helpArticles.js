'use strict';

const CATEGORIES = Object.freeze({
    inicio:        { label: 'Primeros pasos',  order: 1 },
    operaciones:   { label: 'Operaciones',     order: 2 },
    administracion:{ label: 'Administración',  order: 3 },
    reparto:       { label: 'Reparto',         order: 4 },
    referencia:    { label: 'Referencia',      order: 5 },
});

/** Catálogo estático del manual. roles = roleIds que pueden ver el artículo. */
const ARTICLES = [
    {
        slug: 'primeros-pasos',
        title: 'Primeros pasos en LogiTrack',
        summary: 'Recorrido inicial, tour guiado y conceptos básicos del sistema.',
        category: 'inicio',
        icon: 'rocket_launch',
        roles: [1, 2, 4],
        keywords: 'inicio tour onboarding bienvenida panel',
        partial: 'primeros-pasos',
    },
    {
        slug: 'busqueda-universal',
        title: 'Búsqueda rápida',
        summary: 'Cómo usar la barra de búsqueda del header para encontrar envíos, incidencias y más.',
        category: 'inicio',
        icon: 'search',
        roles: [1, 2, 3, 4],
        keywords: 'buscar search envío incidencia ruta tracking',
        partial: 'busqueda-universal',
    },
    {
        slug: 'panel-general',
        title: 'Panel general (Inicio)',
        summary: 'KPIs del día, repartidores disponibles y accesos rápidos.',
        category: 'inicio',
        icon: 'dashboard',
        roles: [1, 2, 4],
        keywords: 'dashboard inicio home estadísticas kpi',
        partial: 'panel-general',
    },
    {
        slug: 'envios',
        title: 'Gestión de envíos',
        summary: 'Alta, seguimiento, detalle y estados de los envíos.',
        category: 'operaciones',
        icon: 'local_shipping',
        roles: [1, 2, 4],
        keywords: 'envío shipment crear tracking estado',
        partial: 'envios',
    },
    {
        slug: 'cobro-envios',
        title: 'Cobro de envíos y Mercado Pago',
        summary: 'Pendiente de pago, link al remitente, registro de cobro y verificación.',
        category: 'operaciones',
        icon: 'payments',
        roles: [1, 2, 4],
        keywords: 'pago cobro mercado pago factura efectivo transferencia pendiente',
        partial: 'cobro-envios',
        isNew: true,
        newSince: '2026-06',
    },
    {
        slug: 'kanban',
        title: 'Tablero Kanban',
        summary: 'Visualizá y mové envíos por columnas de estado.',
        category: 'operaciones',
        icon: 'view_kanban',
        roles: [1, 4],
        keywords: 'kanban columnas estado flujo',
        partial: 'kanban',
    },
    {
        slug: 'ruteo',
        title: 'Ruteo y optimización',
        summary: 'Planificación de rutas, asignación a repartidores y despacho.',
        category: 'operaciones',
        icon: 'route',
        roles: [1, 4],
        keywords: 'ruta optimizar repartidor paradas transporte',
        partial: 'ruteo',
    },
    {
        slug: 'incidencias',
        title: 'Incidencias operativas',
        summary: 'Registro, seguimiento y resolución de problemas.',
        category: 'operaciones',
        icon: 'report',
        roles: [1, 2, 4],
        keywords: 'incidencia problema demora daño extravío',
        partial: 'incidencias',
    },
    {
        slug: 'modificaciones-portal',
        title: 'Modificaciones del portal',
        summary: 'Solicitudes de cambio que envían los clientes desde el portal externo.',
        category: 'operaciones',
        icon: 'edit_note',
        roles: [2, 4],
        keywords: 'portal cliente modificación cambio dirección',
        partial: 'modificaciones-portal',
    },
    {
        slug: 'reportes',
        title: 'Reportes y análisis',
        summary: 'Volumen, entregas a tiempo, rendimiento y satisfacción.',
        category: 'operaciones',
        icon: 'bar_chart',
        roles: [1, 4],
        keywords: 'reporte gráfico volumen rendimiento satisfacción',
        partial: 'reportes',
    },
    {
        slug: 'ojo-patron',
        title: 'Ojo de Patrón (fatiga)',
        summary: 'Monitoreo de fatiga de repartidores y bloqueos por seguridad.',
        category: 'operaciones',
        icon: 'monitor_heart',
        roles: [1, 4],
        keywords: 'fatiga repartidor bloqueo seguridad',
        partial: 'ojo-patron',
    },
    {
        slug: 'import-csv',
        title: 'Importar envíos por CSV',
        summary: 'Carga masiva de envíos desde un archivo.',
        category: 'administracion',
        icon: 'upload_file',
        roles: [4],
        keywords: 'csv importar carga masiva archivo',
        partial: 'import-csv',
    },
    {
        slug: 'usuarios-ajustes',
        title: 'Usuarios, sucursales y ajustes',
        summary: 'Administración de cuentas, sucursales y configuración del sistema.',
        category: 'administracion',
        icon: 'settings',
        roles: [4],
        keywords: 'usuario sucursal ajustes configuración admin',
        partial: 'usuarios-ajustes',
    },
    {
        slug: 'mi-ruteo',
        title: 'Mi ruteo (inicio repartidor)',
        summary: 'Pantalla principal del repartidor: ruta activa y próximas asignaciones.',
        category: 'reparto',
        icon: 'local_shipping',
        roles: [3],
        keywords: 'repartidor ruta activa asignada delivery',
        partial: 'mi-ruteo',
    },
    {
        slug: 'copiloto-voz',
        title: 'Copiloto de voz',
        summary: 'Comandos de voz en ruta para operar sin sacar las manos del volante.',
        category: 'reparto',
        icon: 'mic',
        roles: [3],
        keywords: 'voz copiloto manos libres micrófono comando repartidor',
        partial: 'copiloto-voz',
        isNew: true,
        newSince: '2026-06',
    },
    {
        slug: 'entregas-repartidor',
        title: 'Realizar entregas',
        summary: 'Recorrido de ruta, escaneo, evidencia y entregas fallidas.',
        category: 'reparto',
        icon: 'package_2',
        roles: [3],
        keywords: 'entrega escaneo qr evidencia parada',
        partial: 'entregas-repartidor',
    },
    {
        slug: 'incidencias-repartidor',
        title: 'Reportar incidencias en ruta',
        summary: 'Cómo informar problemas durante una entrega.',
        category: 'reparto',
        icon: 'report',
        roles: [3],
        keywords: 'incidencia repartidor problema entrega',
        partial: 'incidencias-repartidor',
    },
    {
        slug: 'notificaciones',
        title: 'Notificaciones',
        summary: 'Campana del header, centro de notificaciones y tipos de alerta.',
        category: 'operaciones',
        icon: 'notifications',
        roles: [1, 2, 3, 4],
        keywords: 'notificación alerta campana aviso email',
        partial: 'notificaciones',
    },
    {
        slug: 'transportes-zonas',
        title: 'Transportes y zonas',
        summary: 'Vehículos, conductores, zonas de cobertura e impacto en el ruteo.',
        category: 'administracion',
        icon: 'local_shipping',
        roles: [4],
        keywords: 'transporte vehículo zona cobertura patente conductor',
        partial: 'transportes-zonas',
    },
    {
        slug: 'portal-cliente-staff',
        title: 'Portal del cliente (vista staff)',
        summary: 'Qué ve el cliente externo y cómo impacta en la operación interna.',
        category: 'operaciones',
        icon: 'public',
        roles: [2, 4],
        keywords: 'portal cliente externo token dni daño elección',
        partial: 'portal-cliente-staff',
    },
    {
        slug: 'glosario',
        title: 'Glosario',
        summary: 'Términos y conceptos frecuentes de LogiTrack.',
        category: 'referencia',
        icon: 'menu_book',
        roles: [1, 2, 3, 4],
        keywords: 'glosario término concepto definición fatiga return hist ienv',
        partial: 'glosario',
    },
];

const asRole = (roleId) => Number(roleId);

const getArticlesForRole = (roleId) => {
    const role = asRole(roleId);
    return ARTICLES
        .filter((a) => a.roles.includes(role))
        .sort((a, b) => {
            const ca = CATEGORIES[a.category]?.order ?? 99;
            const cb = CATEGORIES[b.category]?.order ?? 99;
            if (ca !== cb) { return ca - cb; }
            return a.title.localeCompare(b.title, 'es');
        });
};

const getArticleBySlug = (slug, roleId) => {
    const role = asRole(roleId);
    return ARTICLES.find((a) => a.slug === slug && a.roles.includes(role)) || null;
};

/** Conjunto de slugs que el rol puede ver. Útil para no enlazar a artículos restringidos. */
const getAccessibleSlugs = (roleId) => new Set(getArticlesForRole(roleId).map((a) => a.slug));

const getCategoriesForArticles = (articles) => {
    const seen = new Set();
    const list = [];
    for (const a of articles) {
        if (seen.has(a.category)) { continue; }
        seen.add(a.category);
        const meta = CATEGORIES[a.category];
        if (meta) { list.push({ id: a.category, label: meta.label, order: meta.order }); }
    }
    return list.sort((a, b) => a.order - b.order);
};

module.exports = {
    CATEGORIES,
    ARTICLES,
    getArticlesForRole,
    getArticleBySlug,
    getAccessibleSlugs,
    getCategoriesForArticles,
};
