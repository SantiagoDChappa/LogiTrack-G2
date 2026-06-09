// Estimación de fecha de entrega/retiro para autogestión del destinatario.
// No hay motor de SLA en el sistema: usamos días hábiles desde "hoy" con
// lead times configurables por modalidad. El retiro por sucursal queda
// disponible antes que el envío a domicilio (no requiere ruteo de reparto).
// Helpers puros (sin DB) → testeables de forma aislada.

const DEFAULT_LEAD_HOME_DAYS   = 3; // envío a domicilio
const DEFAULT_LEAD_PICKUP_DAYS = 1; // retiro por sucursal

// Sábado (6) y domingo (0) no cuentan como días hábiles.
function isBusinessDay(date) {
    const wd = date.getDay();
    return wd !== 0 && wd !== 6;
}

// Suma N días hábiles a una fecha (a medianoche, sin tocar el original).
function addBusinessDays(from, days) {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    let added = 0;
    while (added < Math.max(0, days)) {
        d.setDate(d.getDate() + 1);
        if (isBusinessDay(d)) { added++; }
    }
    return d;
}

// Fecha estimada según la modalidad ('home' | 'branch_pickup').
function estimateDeliveryDate({
    mode,
    from = new Date(),
    leadHomeDays = DEFAULT_LEAD_HOME_DAYS,
    leadPickupDays = DEFAULT_LEAD_PICKUP_DAYS,
} = {}) {
    const days = mode === 'branch_pickup' ? leadPickupDays : leadHomeDays;
    return addBusinessDays(from, days);
}

module.exports = {
    DEFAULT_LEAD_HOME_DAYS, DEFAULT_LEAD_PICKUP_DAYS,
    isBusinessDay, addBusinessDays, estimateDeliveryDate,
};
