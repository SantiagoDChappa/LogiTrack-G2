const sequelize = require('../database/connection');
const { QueryTypes } = require('sequelize');

const getShipmentsByPeriod = async (req, res) => {
    const { from, to } = req.query;

    const today = new Date().toISOString().split('T')[0];
    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dateFrom = from || defaultFrom;
    const dateTo   = to   || today;

    const hasQuery = !!(from || to);
    let error = null;
    let statusTotals = [];
    let totalShipments = 0;

    if (dateFrom > dateTo) {
        error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
    } else {
        statusTotals = await sequelize.query(
            `SELECT s."statusId", st.description AS status_label, COUNT(s.id)::int AS total
               FROM logitrack.shipment s
               JOIN logitrack.status st ON st.id = s."statusId"
              WHERE s."createdAt"::date >= :from AND s."createdAt"::date <= :to
              GROUP BY s."statusId", st.description
              ORDER BY total DESC`,
            { type: QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
        );
        totalShipments = statusTotals.reduce((sum, row) => sum + row.total, 0);
    }

    res.render('report/shipments-by-period', {
        dateFrom,
        dateTo,
        error,
        statusTotals,
        totalShipments,
        hasQuery,
    });
};

const getOnTimeDeliveries = async (req, res) => {
    const { from, to, segmentBy = '' } = req.query;

    const today = new Date().toISOString().split('T')[0];
    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dateFrom = from || defaultFrom;
    const dateTo   = to   || today;

    const hasQuery = !!(from || to);
    let error = null;
    let summary = null;
    let segments = [];

    if (dateFrom > dateTo) {
        error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
    } else {
        const [summaryRow] = await sequelize.query(
            `SELECT
                COUNT(*)::int AS total,
                COUNT(CASE WHEN h."changedAt"::date <= s."expectedDeliveryDate" THEN 1 END)::int AS on_time,
                COUNT(CASE WHEN h."changedAt"::date >  s."expectedDeliveryDate" THEN 1 END)::int AS late
             FROM logitrack.shipment s
             JOIN logitrack.shipment_history h ON h."shipmentId" = s.id AND h."toStatusId" = 4
             WHERE h."changedAt"::date >= :from AND h."changedAt"::date <= :to
               AND s."expectedDeliveryDate" IS NOT NULL`,
            { type: QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
        );
        summary = summaryRow;

        if (summary.total > 0) {
            const baseWhere = `
                h."changedAt"::date >= :from AND h."changedAt"::date <= :to
                AND s."expectedDeliveryDate" IS NOT NULL`;

            if (segmentBy === 'deliveryUser') {
                segments = await sequelize.query(
                    `SELECT
                        u."fullName" AS label,
                        COUNT(*)::int AS total,
                        COUNT(CASE WHEN h."changedAt"::date <= s."expectedDeliveryDate" THEN 1 END)::int AS on_time
                     FROM logitrack.shipment s
                     JOIN logitrack.shipment_history h ON h."shipmentId" = s.id AND h."toStatusId" = 4
                     JOIN logitrack.user u ON u.id = s."deliveryUserId"
                     WHERE ${baseWhere} AND s."deliveryUserId" IS NOT NULL
                     GROUP BY u.id, u."fullName"
                     ORDER BY total DESC`,
                    { type: QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
                );
            } else if (segmentBy === 'zone') {
                segments = await sequelize.query(
                    `SELECT
                        z.name AS label,
                        COUNT(*)::int AS total,
                        COUNT(CASE WHEN h."changedAt"::date <= s."expectedDeliveryDate" THEN 1 END)::int AS on_time
                     FROM logitrack.shipment s
                     JOIN logitrack.shipment_history h ON h."shipmentId" = s.id AND h."toStatusId" = 4
                     JOIN logitrack.zone z ON z.id = s."zoneId"
                     WHERE ${baseWhere} AND s."zoneId" IS NOT NULL
                     GROUP BY z.name
                     ORDER BY total DESC`,
                    { type: QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
                );
            }
        }
    }

    res.render('report/on-time-deliveries', {
        dateFrom,
        dateTo,
        segmentBy,
        error,
        summary,
        segments,
        hasQuery,
    });
};

const getDeliveryPerformance = async (req, res) => {
    const { from, to } = req.query;

    const today = new Date().toISOString().split('T')[0];
    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dateFrom = from || defaultFrom;
    const dateTo   = to   || today;

    const hasQuery = !!(from || to);
    let error = null;
    let rows = [];

    if (dateFrom > dateTo) {
        error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
    } else {
        rows = await sequelize.query(
            `SELECT
                u.id AS user_id,
                u."fullName" AS full_name,
                COUNT(DISTINCT s.id)::int                                                                                         AS assigned,
                COUNT(DISTINCT CASE WHEN dh."shipmentId" IS NOT NULL THEN s.id END)::int                                          AS delivered,
                COUNT(DISTINCT CASE WHEN dh."shipmentId" IS NOT NULL
                                     AND s."expectedDeliveryDate" IS NOT NULL
                                     AND dh."changedAt"::date <= s."expectedDeliveryDate" THEN s.id END)::int                     AS on_time,
                COUNT(DISTINCT i.id)::int                                                                                         AS incidents
             FROM logitrack.user u
             JOIN logitrack.shipment s
               ON s."deliveryUserId" = u.id
              AND s."createdAt"::date >= :from AND s."createdAt"::date <= :to
             LEFT JOIN logitrack.shipment_history dh
               ON dh."shipmentId" = s.id AND dh."toStatusId" = 4
              AND dh."changedAt"::date >= :from AND dh."changedAt"::date <= :to
             LEFT JOIN logitrack.incident i
               ON i."shipmentId" = s.id
              AND i."createdAt"::date >= :from AND i."createdAt"::date <= :to
             WHERE u."roleId" = 3 AND u.active = true
             GROUP BY u.id, u."fullName"
             HAVING COUNT(DISTINCT s.id) > 0
             ORDER BY COUNT(DISTINCT s.id) DESC`,
            { type: QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
        );

        rows = rows.map(r => ({
            ...r,
            success_pct: r.assigned > 0 ? Math.round(r.delivered / r.assigned * 100) : 0,
        }));
    }

    res.render('report/delivery-performance', {
        dateFrom,
        dateTo,
        error,
        rows,
        hasQuery,
    });
};

module.exports = { getShipmentsByPeriod, getOnTimeDeliveries, getDeliveryPerformance };
