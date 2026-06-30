// Auto-generación de incidencias (US-E02).
// Crea una incidencia de canal SYSTEM ante eventos críticos del envío
// (intento fallido, paquete fallido), evitando duplicados abiertos del mismo tipo.
const incidentTypeModel    = require('../models/incidentType');
const incidentModel        = require('../models/incident');
const { Incident }         = incidentModel;
const incidentHistoryModel = require('../models/incidentHistory');
const { snapshotChecklist } = require('./incidentChecklist');
const { IncidentStatus, IncidentChannel, IncidentEventType } = require('../constants/enums');

// Prioridad por defecto según tipo (1=Baja … 4=Urgente).
const DEFAULT_PRIORITY = { DELIVERY_FAILED: 3, PACKAGE_BROKEN: 3 };

// Crea la incidencia automática dentro de la transacción `t` provista por el caller.
// Devuelve la incidencia creada, o null si no se creó (tipo inexistente o duplicado abierto).
const autoCreateIncident = async ({ shipmentId, typeCode, description }, t) => {
    const type = await incidentTypeModel.getByCode(typeCode);
    if (!type || !type.active) { return null; }

    // Dedup: si ya hay una incidencia abierta del mismo tipo, no creamos otra.
    const open = await incidentModel.findOpenByShipment(shipmentId);
    if (open.some(i => i.incidentTypeId === type.id)) { return null; }

    // LGT-147: asignación automática al staff menos cargado de la sucursal del envío.
    let assignee = null;
    try {
        const shipmentModel = require('../models/shipment');
        const ship = await shipmentModel.getById(shipmentId);
        const branchId = ship?.currentBranchId || ship?.originBranchId || null;
        assignee = await require('./incidentAssignment').pickLeastLoadedAssignee(branchId);
    } catch { /* sin asignación automática si falla */ }

    const created = await Incident.create({
        shipmentId,
        incidentTypeId: type.id,
        status:         IncidentStatus.OPEN,
        priority:       DEFAULT_PRIORITY[typeCode] || 2,
        escalated:      false,
        description:    String(description || 'Incidencia generada automáticamente por el sistema').slice(0, 2000),
        openedChannel:  IncidentChannel.SYSTEM,
        openedByUserId: null,
        assignedToUserId: assignee ? assignee.id : null
    }, { transaction: t });

    await incidentHistoryModel.create({
        incidentId: created.id,
        eventType:  IncidentEventType.AUTO_CREATED,
        toValue:    IncidentStatus.OPEN,
        comment:    `Incidencia generada automáticamente (${type.code})`,
        transaction: t
    });

    if (assignee) {
        await incidentHistoryModel.create({
            incidentId: created.id,
            eventType:  IncidentEventType.ASSIGNED,
            toValue:    String(assignee.id),
            comment:    `Asignación automática a ${assignee.fullName} (menor carga: ${assignee.openCount} abiertas)`,
            transaction: t
        });
    }

    await snapshotChecklist(created.id, type.id, t);

    return created;
};

module.exports = { autoCreateIncident };
