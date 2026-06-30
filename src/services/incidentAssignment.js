// LGT-147 — asignación automática del responsable de una incidencia.
// Criterio implementado: SUCURSAL (ubicación) + CARGA DE TRABAJO (menos
// incidencias abiertas). Especialidad/disponibilidad horaria quedan fuera por
// falta de datos en el modelo (skills/turnos) — ver PROGRESO.

const { Op } = require('sequelize');

const STAFF_ROLES = [1, 2]; // SUPERVISOR, OPERATOR
const OPEN_STATUSES = ['OPEN', 'IN_REVIEW'];

// Devuelve el staff de la sucursal con menos incidencias abiertas, o null.
async function pickLeastLoadedAssignee(branchId) {
    const { User } = require('../models/user');
    const { Incident } = require('../models/incident');

    const where = { active: true, roleId: { [Op.in]: STAFF_ROLES } };
    where.branchId = branchId || null;
    const staff = await User.findAll({ where, attributes: ['id', 'fullName', 'roleId', 'branchId'] });
    if (!staff.length) { return null; }

    let best = null;
    let bestCount = Infinity;
    for (const u of staff) {
        const count = await Incident.count({
            where: { assignedToUserId: u.id, status: { [Op.in]: OPEN_STATUSES } },
        });
        if (count < bestCount) { bestCount = count; best = u; }
    }
    return best ? { id: best.id, fullName: best.fullName, roleId: best.roleId, openCount: bestCount } : null;
}

module.exports = { pickLeastLoadedAssignee, STAFF_ROLES };
