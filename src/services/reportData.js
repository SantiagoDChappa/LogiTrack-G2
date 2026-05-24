const sequelize = require('../database/connection');
const { QueryTypes } = require('sequelize');
const { URLSearchParams } = require('url');

const formatIsoDate = (date) => {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) { return ''; }
    return value.toISOString().split('T')[0];
};

const getDefaultDateRange = () => {
    const today = new Date();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return {
        today: formatIsoDate(today),
        defaultFrom: formatIsoDate(from),
    };
};

const buildExportQuery = (params) => new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== null && value !== undefined && value !== '')
).toString();

const resolveDateRange = (query = {}) => {
    const { today, defaultFrom } = getDefaultDateRange();
    const dateFrom = query.from || defaultFrom;
    const dateTo = query.to || today;

    return {
        dateFrom,
        dateTo,
        hasQuery: Boolean(query.from || query.to),
    };
};

const getShipmentsByPeriodData = async (query = {}, deps = { sequelize, QueryTypes }) => {
    const { dateFrom, dateTo, hasQuery } = resolveDateRange(query);

    const viewModel = {
        dateFrom,
        dateTo,
        error: null,
        statusTotals: [],
        totalShipments: 0,
        hasQuery,
        exportQuery: buildExportQuery({ from: dateFrom, to: dateTo }),
    };

    if (dateFrom > dateTo) {
        viewModel.error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
        return viewModel;
    }

    viewModel.statusTotals = await deps.sequelize.query(
        `SELECT s."statusId", st.description AS status_label, COUNT(s.id)::int AS total
           FROM logitrack.shipment s
           JOIN logitrack.status st ON st.id = s."statusId"
          WHERE s."createdAt"::date >= :from AND s."createdAt"::date <= :to
          GROUP BY s."statusId", st.description
          ORDER BY total DESC`,
        { type: deps.QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
    );

    viewModel.totalShipments = viewModel.statusTotals.reduce((sum, row) => sum + row.total, 0);
    return viewModel;
};

const getOnTimeDeliveriesData = async (query = {}, deps = { sequelize, QueryTypes }) => {
    const { dateFrom, dateTo, hasQuery } = resolveDateRange(query);
    const segmentBy = query.segmentBy || '';

    const viewModel = {
        dateFrom,
        dateTo,
        segmentBy,
        error: null,
        summary: null,
        segments: [],
        hasQuery,
        exportQuery: buildExportQuery({ from: dateFrom, to: dateTo, segmentBy }),
    };

    if (dateFrom > dateTo) {
        viewModel.error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
        return viewModel;
    }

    const [summaryRow] = await deps.sequelize.query(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(CASE WHEN h."changedAt"::date <= s."expectedDeliveryDate" THEN 1 END)::int AS on_time,
            COUNT(CASE WHEN h."changedAt"::date >  s."expectedDeliveryDate" THEN 1 END)::int AS late
         FROM logitrack.shipment s
         JOIN logitrack.shipment_history h ON h."shipmentId" = s.id AND h."toStatusId" = 4
         WHERE h."changedAt"::date >= :from AND h."changedAt"::date <= :to
           AND s."expectedDeliveryDate" IS NOT NULL`,
        { type: deps.QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
    );

    viewModel.summary = summaryRow;

    if (!summaryRow || summaryRow.total === 0) {
        return viewModel;
    }

    const baseWhere = `
        h."changedAt"::date >= :from AND h."changedAt"::date <= :to
        AND s."expectedDeliveryDate" IS NOT NULL`;

    if (segmentBy === 'deliveryUser') {
        viewModel.segments = await deps.sequelize.query(
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
            { type: deps.QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
        );
    } else if (segmentBy === 'zone') {
        viewModel.segments = await deps.sequelize.query(
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
            { type: deps.QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
        );
    }

    return viewModel;
};

const getDeliveryPerformanceData = async (query = {}, deps = { sequelize, QueryTypes }) => {
    const { dateFrom, dateTo, hasQuery } = resolveDateRange(query);

    const viewModel = {
        dateFrom,
        dateTo,
        error: null,
        rows: [],
        hasQuery,
        exportQuery: buildExportQuery({ from: dateFrom, to: dateTo }),
    };

    if (dateFrom > dateTo) {
        viewModel.error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
        return viewModel;
    }

    const rows = await deps.sequelize.query(
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
        { type: deps.QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
    );

    viewModel.rows = rows.map((row) => ({
        ...row,
        success_pct: row.assigned > 0 ? Math.round(row.delivered / row.assigned * 100) : 0,
    }));

    return viewModel;
};

const getIncidentsByPeriodData = async (query = {}, deps = { sequelize, QueryTypes }) => {
    const { dateFrom, dateTo, hasQuery } = resolveDateRange(query);

    const viewModel = {
        dateFrom,
        dateTo,
        error: null,
        rows: [],
        totalIncidents: 0,
        hasQuery,
        exportQuery: buildExportQuery({ from: dateFrom, to: dateTo }),
    };

    if (dateFrom > dateTo) {
        viewModel.error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
        return viewModel;
    }

    viewModel.rows = await deps.sequelize.query(
        `SELECT
            it.id            AS incident_type_id,
            it.description   AS incident_type,
            COUNT(i.id)::int AS total,
            COUNT(CASE WHEN i.status IN ('OPEN', 'IN_REVIEW') THEN 1 END)::int AS open,
            COUNT(CASE WHEN i.status NOT IN ('OPEN', 'IN_REVIEW') THEN 1 END)::int AS resolved
         FROM logitrack.incident i
         JOIN logitrack.incident_type it ON it.id = i."incidentTypeId"
         WHERE i."createdAt"::date >= :from AND i."createdAt"::date <= :to
         GROUP BY it.id, it.description
         ORDER BY total DESC`,
        { type: deps.QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
    );

    viewModel.totalIncidents = viewModel.rows.reduce((sum, row) => sum + row.total, 0);
    return viewModel;
};

module.exports = {
    buildExportQuery,
    formatIsoDate,
    getDeliveryPerformanceData,
    getIncidentsByPeriodData,
    getOnTimeDeliveriesData,
    getShipmentsByPeriodData,
    resolveDateRange,
};
