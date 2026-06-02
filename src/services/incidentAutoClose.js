// Cierre automático de incidencias (US-E09).
// Cierra con trazabilidad las incidencias auto-cerrables de un envío cuando
// se cumple una condición de resolución (p.ej. el envío fue entregado).
const { Op } = require('sequelize');
const { Incident } = require('../models/incident');
const { IncidentType } = require('../models/incidentType');
const incidentHistoryModel = require('../models/incidentHistory');
const { IncidentStatus, IncidentResolution, IncidentEventType, IncidentChannel } = require('../constants/enums');

// Tipos cuya resolución queda implícita al entregarse el envío.
const AUTO_CLOSABLE_CODES = ['DELIVERY_FAILED', 'DELAY'];

// Cierra las incidencias abiertas/auto-generadas del envío dentro de la transacción `t`.
// Devuelve la cantidad de incidencias cerradas.
const autoCloseForShipment = async (shipmentId, { reason } = {}, t) => {
    const closableTypes = await IncidentType.findAll({
        where: { code: { [Op.in]: AUTO_CLOSABLE_CODES } },
        attributes: ['id'],
        transaction: t || null
    });
    const closableTypeIds = closableTypes.map(x => x.id);

    const candidates = await Incident.findAll({
        where: {
            shipmentId,
            status: { [Op.in]: [IncidentStatus.OPEN, IncidentStatus.IN_REVIEW] },
            [Op.or]: [
                { openedChannel: IncidentChannel.SYSTEM },
                ...(closableTypeIds.length ? [{ incidentTypeId: { [Op.in]: closableTypeIds } }] : [])
            ]
        },
        transaction: t || null
    });

    let closed = 0;
    for (const incident of candidates) {
        const from = incident.status;
        await incident.update({
            status:         IncidentStatus.CLOSED,
            resolution:     IncidentResolution.PROCEDENTE,
            closedByUserId: null,
            closedAt:       new Date()
        }, { transaction: t || null });
        await incidentHistoryModel.create({
            incidentId: incident.id,
            eventType:  IncidentEventType.AUTO_CLOSED,
            fromValue:  from,
            toValue:    IncidentResolution.PROCEDENTE,
            comment:    reason || 'Cierre automático por resolución del envío',
            transaction: t
        });
        closed += 1;
    }
    return closed;
};

module.exports = { autoCloseForShipment };
