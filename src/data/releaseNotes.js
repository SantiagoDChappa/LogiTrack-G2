'use strict';

/** Catálogo de releases para el modal "Novedades" y tracking por usuario. */
const RELEASES = Object.freeze([
    {
        id: '2026-06',
        title: 'Novedades de junio 2026',
        features: Object.freeze([
            {
                id: 'cobro-envios',
                roles: [1, 2, 4],
                title: 'Cobro con Mercado Pago',
                summary: 'Los envíos manuales quedan pendientes de pago hasta que el remitente pague online o vos registres el cobro en efectivo o transferencia.',
                icon: 'payments',
                helpSlug: 'cobro-envios',
            },
            {
                id: 'copiloto-voz',
                roles: [3],
                title: 'Copiloto de voz',
                summary: 'Comandos de voz en ruta para consultar la próxima entrega, pausar, navegar o llamar al destinatario sin sacar las manos del volante.',
                icon: 'mic',
                helpSlug: 'copiloto-voz',
            },
        ]),
    },
]);

const releaseKey = (releaseId) => `release:${releaseId}`;

const isValidReleaseId = (releaseId) => RELEASES.some((r) => r.id === releaseId);

/** Primer release pendiente para el rol (null si ya vio todas las novedades aplicables). */
const getPendingReleaseForUser = (helpSeen, roleId) => {
    const role = Number(roleId);
    const seen = helpSeen || {};
    for (const release of RELEASES) {
        if (seen[releaseKey(release.id)]) { continue; }
        const features = release.features.filter((f) => f.roles.includes(role));
        if (features.length === 0) { continue; }
        return {
            id: release.id,
            title: release.title,
            features: features.map((f) => ({ ...f })),
        };
    }
    return null;
};

module.exports = {
    RELEASES,
    releaseKey,
    isValidReleaseId,
    getPendingReleaseForUser,
};
