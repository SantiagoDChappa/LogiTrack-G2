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

const DELIVERY_DIMS = [
    { key: 'dim1', label: 'Puntualidad' },
    { key: 'dim2', label: 'Estado del paquete' },
    { key: 'dim3', label: 'Atención del servicio' },
];
const INCIDENT_DIMS = [
    { key: 'dim1', label: 'Tiempo de resolución' },
    { key: 'dim2', label: 'Comunicación' },
    { key: 'dim3', label: 'Resultado obtenido' },
];

const getDimensionLabels = (surveyType) => {
    if (surveyType === 'delivery') { return DELIVERY_DIMS; }
    if (surveyType === 'incident') { return INCIDENT_DIMS; }
    return DELIVERY_DIMS;
};

const getComparisonDimLabels = () => ({
    delivery: DELIVERY_DIMS.map((d) => d.label),
    incident: INCIDENT_DIMS.map((d) => d.label),
});

const ELIGIBLE_DELIVERY_STATUSES = [4, 5];

const computeNps = (distribution) => {
    let promoters = 0;
    let detractors = 0;
    let total = 0;
    (distribution || []).forEach((d) => {
        const count = d.count || 0;
        total += count;
        if (d.rating >= 4) { promoters += count; }
        if (d.rating <= 2) { detractors += count; }
    });
    if (total === 0) { return 0; }
    return Math.round((promoters - detractors) / total * 100);
};

const getSatisfactionData = async (query = {}, deps = { sequelize, QueryTypes }) => {
    const { dateFrom, dateTo, hasQuery } = resolveDateRange(query);
    const surveyType = query.type || 'all';
    const branchId = query.branchId ? Number(query.branchId) : null;
    const incidentTypeId = query.incidentTypeId ? Number(query.incidentTypeId) : null;
    const deliveryStatus = query.deliveryStatus ? Number(query.deliveryStatus) : null;

    const viewModel = {
        dateFrom,
        dateTo,
        surveyType,
        branchId,
        incidentTypeId,
        deliveryStatus,
        error: null,
        kpis: { totalSurveys: 0, overallAvg: 0, nps: 0, dimensions: [], responseRate: null },
        trend: [],
        comparison: [],
        distribution: [],
        recentComments: [],
        incidentTypes: [],
        comparisonDimLabels: getComparisonDimLabels(surveyType),
        hasQuery,
        exportQuery: buildExportQuery({
            from: dateFrom, to: dateTo, type: surveyType,
            ...(branchId ? { branchId } : {}),
            ...(incidentTypeId ? { incidentTypeId } : {}),
            ...(deliveryStatus ? { deliveryStatus } : {}),
        }),
    };

    if (dateFrom > dateTo) {
        viewModel.error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
        return viewModel;
    }

    viewModel.incidentTypes = await deps.sequelize.query(
        // "Otro" al final, igual que en el resto de los dropdowns.
        `SELECT id, description FROM logitrack.incident_type WHERE active = true
         ORDER BY (CASE WHEN code = 'OTHER' THEN 1 ELSE 0 END), id`,
        { type: deps.QueryTypes.SELECT }
    );

    const branchFilter = branchId ? `AND s."currentBranchId" = :branchId` : '';
    const deliveryStatusFilter = deliveryStatus
        ? `AND s."statusId" = :deliveryStatus`
        : `AND s."statusId" IN (${ELIGIBLE_DELIVERY_STATUSES.join(',')})`;
    const incidentTypeFilter = incidentTypeId ? `AND i."incidentTypeId" = :incidentTypeId` : '';

    const replacements = { from: dateFrom, to: dateTo };
    if (branchId) { replacements.branchId = branchId; }
    if (incidentTypeId) { replacements.incidentTypeId = incidentTypeId; }
    if (deliveryStatus) { replacements.deliveryStatus = deliveryStatus; }

    const deliveryCte = `
        SELECT 'delivery' AS survey_type,
               ds."overallRating"           AS overall,
               ds."punctualityRating"       AS dim1,
               ds."packageConditionRating"  AS dim2,
               ds."serviceRating"           AS dim3,
               ds."createdAt"
          FROM logitrack.delivery_survey ds
          JOIN logitrack.shipment s ON s.id = ds."shipmentId"
         WHERE ds."createdAt"::date >= :from AND ds."createdAt"::date <= :to
           ${deliveryStatusFilter} ${branchFilter}`;

    const incidentCte = `
        SELECT 'incident' AS survey_type,
               isv."overallRating"           AS overall,
               isv."resolutionTimeRating"    AS dim1,
               isv."communicationRating"     AS dim2,
               isv."outcomeRating"           AS dim3,
               isv."createdAt"
          FROM logitrack.incident_survey isv
          JOIN logitrack.incident i ON i.id = isv."incidentId"
          JOIN logitrack.shipment s ON s.id = i."shipmentId"
         WHERE isv."createdAt"::date >= :from AND isv."createdAt"::date <= :to
           ${incidentTypeFilter} ${branchFilter}`;

    let unionCte;
    if (surveyType === 'delivery') {
        unionCte = deliveryCte;
    } else if (surveyType === 'incident') {
        unionCte = incidentCte;
    } else {
        unionCte = `${deliveryCte} UNION ALL ${incidentCte}`;
    }

    const baseCte = `WITH surveys AS (${unionCte})`;

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

    const dims = getDimensionLabels(surveyType);
    viewModel.kpis.dimensions = dims.map((d) => ({
        label: d.label,
        avg: kpi[`${d.key}_avg`] || 0,
    }));

    const responseRateParts = [];
    if (surveyType !== 'incident') {
        responseRateParts.push(`
            SELECT 'delivery' AS src,
                   COUNT(*)::int AS eligible,
                   COUNT(ds.id)::int AS responded
              FROM logitrack.shipment s
              LEFT JOIN logitrack.delivery_survey ds ON ds."shipmentId" = s.id
             WHERE s."statusId" IN (${ELIGIBLE_DELIVERY_STATUSES.join(',')})
               AND s."updatedAt"::date >= :from AND s."updatedAt"::date <= :to
               ${deliveryStatus ? `AND s."statusId" = :deliveryStatus` : ''}
               ${branchFilter}`);
    }
    if (surveyType !== 'delivery') {
        responseRateParts.push(`
            SELECT 'incident' AS src,
                   COUNT(*)::int AS eligible,
                   COUNT(isv.id)::int AS responded
              FROM logitrack.incident i
              LEFT JOIN logitrack.incident_survey isv ON isv."incidentId" = i.id
              ${branchId ? `JOIN logitrack.shipment s ON s.id = i."shipmentId"` : ''}
             WHERE i.status = 'CLOSED'
               AND i."updatedAt"::date >= :from AND i."updatedAt"::date <= :to
               ${incidentTypeFilter}
               ${branchId ? `AND s."currentBranchId" = :branchId` : ''}`);
    }

    const responseRateRows = await deps.sequelize.query(
        `SELECT SUM(eligible)::int AS eligible, SUM(responded)::int AS responded
           FROM (${responseRateParts.join(' UNION ALL ')}) sub`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    const rr = responseRateRows[0] || {};
    const eligible = rr.eligible || 0;
    const responded = rr.responded || 0;
    viewModel.kpis.responseRate = {
        eligible,
        responded,
        pending: eligible - responded,
        pct: eligible > 0 ? Math.round(responded / eligible * 100) : 0,
    };

    viewModel.trend = await deps.sequelize.query(
        `${baseCte}
         SELECT TO_CHAR("createdAt", 'YYYY-MM') AS month,
                ROUND(AVG(overall), 2)::float AS avg_overall,
                COUNT(*)::int AS total,
                COUNT(CASE WHEN overall >= 4 THEN 1 END)::int AS promoters,
                COUNT(CASE WHEN overall <= 2 THEN 1 END)::int AS detractors
           FROM surveys
          GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
          ORDER BY month`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    viewModel.trend = viewModel.trend.map((row) => ({
        ...row,
        nps: row.total > 0 ? Math.round((row.promoters - row.detractors) / row.total * 100) : 0,
    }));

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

    viewModel.kpis.nps = computeNps(viewModel.distribution);

    const commentParts = [];
    if (surveyType !== 'incident') {
        commentParts.push(`
            SELECT 'delivery' AS survey_type, ds."overallRating" AS rating,
                   ds.comment, ds."createdAt",
                   'ENV-' || ds."shipmentId" AS ref
              FROM logitrack.delivery_survey ds
              JOIN logitrack.shipment s ON s.id = ds."shipmentId"
             WHERE ds.comment IS NOT NULL AND ds.comment <> ''
               AND ds."createdAt"::date >= :from AND ds."createdAt"::date <= :to
               ${deliveryStatusFilter} ${branchFilter}`);
    }
    if (surveyType !== 'delivery') {
        commentParts.push(`
            SELECT 'incident' AS survey_type, isv."overallRating" AS rating,
                   isv.comment, isv."createdAt",
                   'INC-' || isv."incidentId" AS ref
              FROM logitrack.incident_survey isv
              JOIN logitrack.incident i ON i.id = isv."incidentId"
              JOIN logitrack.shipment s ON s.id = i."shipmentId"
             WHERE isv.comment IS NOT NULL AND isv.comment <> ''
               AND isv."createdAt"::date >= :from AND isv."createdAt"::date <= :to
               ${incidentTypeFilter} ${branchFilter}`);
    }

    viewModel.recentComments = await deps.sequelize.query(
        `SELECT * FROM (${commentParts.join(' UNION ALL ')}) c
          ORDER BY c."createdAt" DESC LIMIT 10`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    return viewModel;
};

module.exports = {
    buildExportQuery,
    computeNps,
    formatIsoDate,
    getDeliveryPerformanceData,
    getIncidentsByPeriodData,
    getOnTimeDeliveriesData,
    getSatisfactionData,
    getShipmentsByPeriodData,
    resolveDateRange,
};
