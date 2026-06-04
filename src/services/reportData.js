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

const getSatisfactionData = async (query = {}, deps = { sequelize, QueryTypes }) => {
    const { dateFrom, dateTo, hasQuery } = resolveDateRange(query);
    const surveyType = query.type || 'all';

    const viewModel = {
        dateFrom,
        dateTo,
        surveyType,
        error: null,
        kpis: { totalSurveys: 0, overallAvg: 0, dimensions: [] },
        trend: [],
        comparison: [],
        distribution: [],
        hasQuery,
        exportQuery: buildExportQuery({ from: dateFrom, to: dateTo, type: surveyType }),
    };

    if (dateFrom > dateTo) {
        viewModel.error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
        return viewModel;
    }

    const deliveryCte = `
        SELECT 'delivery' AS survey_type,
               "overallRating"           AS overall,
               "punctualityRating"       AS dim1,
               "packageConditionRating"  AS dim2,
               "serviceRating"           AS dim3,
               NULL::smallint            AS dim4,
               "createdAt"
          FROM logitrack.delivery_survey
         WHERE "createdAt"::date >= :from AND "createdAt"::date <= :to`;

    const incidentCte = `
        SELECT 'incident' AS survey_type,
               "overallRating"           AS overall,
               "resolutionTimeRating"    AS dim1,
               "communicationRating"     AS dim2,
               "outcomeRating"           AS dim3,
               NULL::smallint            AS dim4,
               "createdAt"
          FROM logitrack.incident_survey
         WHERE "createdAt"::date >= :from AND "createdAt"::date <= :to`;

    let unionCte;
    if (surveyType === 'delivery') {
        unionCte = deliveryCte;
    } else if (surveyType === 'incident') {
        unionCte = incidentCte;
    } else {
        unionCte = `${deliveryCte} UNION ALL ${incidentCte}`;
    }

    const baseCte = `WITH surveys AS (${unionCte})`;
    const replacements = { from: dateFrom, to: dateTo };

    const kpiRows = await deps.sequelize.query(
        `${baseCte}
         SELECT COUNT(*)::int AS total,
                ROUND(AVG(overall), 2)::float AS overall_avg,
                ROUND(AVG(dim1), 2)::float AS dim1_avg,
                ROUND(AVG(dim2), 2)::float AS dim2_avg,
                ROUND(AVG(dim3), 2)::float AS dim3_avg
           FROM surveys`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    const kpi = kpiRows[0] || {};
    viewModel.kpis.totalSurveys = kpi.total || 0;
    viewModel.kpis.overallAvg = kpi.overall_avg || 0;

    if (surveyType === 'incident') {
        viewModel.kpis.dimensions = [
            { label: 'Tiempo de resolución', avg: kpi.dim1_avg || 0 },
            { label: 'Comunicación', avg: kpi.dim2_avg || 0 },
            { label: 'Resultado obtenido', avg: kpi.dim3_avg || 0 },
        ];
    } else if (surveyType === 'delivery') {
        viewModel.kpis.dimensions = [
            { label: 'Puntualidad', avg: kpi.dim1_avg || 0 },
            { label: 'Estado del paquete', avg: kpi.dim2_avg || 0 },
            { label: 'Atención del servicio', avg: kpi.dim3_avg || 0 },
        ];
    } else {
        viewModel.kpis.dimensions = [
            { label: 'Dimensión 1', avg: kpi.dim1_avg || 0 },
            { label: 'Dimensión 2', avg: kpi.dim2_avg || 0 },
            { label: 'Dimensión 3', avg: kpi.dim3_avg || 0 },
        ];
    }

    viewModel.trend = await deps.sequelize.query(
        `${baseCte}
         SELECT TO_CHAR("createdAt", 'YYYY-MM') AS month,
                ROUND(AVG(overall), 2)::float AS avg_overall,
                COUNT(*)::int AS total
           FROM surveys
          GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
          ORDER BY month`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    viewModel.comparison = await deps.sequelize.query(
        `${baseCte}
         SELECT survey_type,
                ROUND(AVG(overall), 2)::float AS avg_overall,
                ROUND(AVG(dim1), 2)::float AS avg_dim1,
                ROUND(AVG(dim2), 2)::float AS avg_dim2,
                ROUND(AVG(dim3), 2)::float AS avg_dim3,
                COUNT(*)::int AS total
           FROM surveys
          GROUP BY survey_type
          ORDER BY survey_type`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    viewModel.distribution = await deps.sequelize.query(
        `${baseCte}
         SELECT overall AS rating, COUNT(*)::int AS count
           FROM surveys
          GROUP BY overall
          ORDER BY overall`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    return viewModel;
};

module.exports = {
    buildExportQuery,
    formatIsoDate,
    getDeliveryPerformanceData,
    getIncidentsByPeriodData,
    getOnTimeDeliveriesData,
    getSatisfactionData,
    getShipmentsByPeriodData,
    resolveDateRange,
};
