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
        otherDetails: [],
        totalIncidents: 0,
        hasQuery,
        exportQuery: buildExportQuery({ from: dateFrom, to: dateTo }),
    };

    if (dateFrom > dateTo) {
        viewModel.error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
        return viewModel;
    }

    // LGT-211: además del total/abiertas/resueltas, se desglosa por PROCEDENCIA
    // (resolution): procedentes / no procedentes / aún sin clasificar, dentro de cada tipo.
    viewModel.rows = await deps.sequelize.query(
        `SELECT
            it.id            AS incident_type_id,
            it.code          AS incident_type_code,
            it.description   AS incident_type,
            COUNT(i.id)::int AS total,
            COUNT(CASE WHEN i.status IN ('OPEN', 'IN_REVIEW') THEN 1 END)::int AS open,
            COUNT(CASE WHEN i.status NOT IN ('OPEN', 'IN_REVIEW') THEN 1 END)::int AS resolved,
            COUNT(CASE WHEN i.resolution = 'PROCEDENTE' THEN 1 END)::int    AS procedente,
            COUNT(CASE WHEN i.resolution = 'NO_PROCEDENTE' THEN 1 END)::int AS no_procedente,
            COUNT(CASE WHEN i.resolution IS NULL THEN 1 END)::int           AS sin_clasificar
         FROM logitrack.incident i
         JOIN logitrack.incident_type it ON it.id = i."incidentTypeId"
         WHERE i."createdAt"::date >= :from AND i."createdAt"::date <= :to
         GROUP BY it.id, it.code, it.description
         ORDER BY total DESC`,
        { type: deps.QueryTypes.SELECT, replacements: { from: dateFrom, to: dateTo } }
    );

    // LGT-211 Esc.2: el tipo "Otro" se cuenta como una categoría más (ya entra arriba) y
    // además se puede consultar el texto libre informado en cada incidencia de ese tipo.
    viewModel.otherDetails = await deps.sequelize.query(
        `SELECT
            i.id                 AS id,
            i.description        AS description,
            i.resolution         AS resolution,
            i."createdAt"        AS created_at
         FROM logitrack.incident i
         JOIN logitrack.incident_type it ON it.id = i."incidentTypeId"
         WHERE it.code = 'OTHER' AND i."createdAt"::date >= :from AND i."createdAt"::date <= :to
         ORDER BY i."createdAt" DESC`,
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
    return [];
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
               AND s."createdAt"::date >= :from AND s."createdAt"::date <= :to
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
               AND i."createdAt"::date >= :from AND i."createdAt"::date <= :to
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

// ─── Sprint 5: CTE base Predicción vs Realidad ───────────────────────────────

const buildPvrBaseCte = (branchFilter = '') => `
    WITH delivery_event AS (
        SELECT DISTINCT ON ("shipmentId") "shipmentId", "changedAt" AS delivered_at
        FROM logitrack.shipment_history
        WHERE "toStatusId" = 4
        ORDER BY "shipmentId", "changedAt" ASC
    ),
    latest_pred AS (
        SELECT DISTINCT ON ("shipmentId") "shipmentId", "predictedDays", "delayProbability"
        FROM logitrack."shipmentPrediction"
        WHERE "actualDays" IS NOT NULL
        ORDER BY "shipmentId", "createdAt" DESC
    ),
    pvr AS (
        SELECT
            s.id AS shipment_id,
            s."trackingId",
            s."zoneId"        AS zone_id,
            z.name            AS zone_name,
            s."deliveryUserId"  AS driver_id,
            u."fullName"        AS driver_name,
            s."transportId"     AS transport_id,
            t.name              AS transport_name,
            t.plate             AS transport_plate,
            s."expectedDeliveryDate" AS expected_delivery_date,
            lp."predictedDays"  AS predicted_days,
            -- actual_days: cast a numeric antes de ROUND porque EXTRACT devuelve double precision
            GREATEST(1, ROUND((EXTRACT(EPOCH FROM (de.delivered_at - s."createdAt")) / 86400.0)::numeric, 1))::float AS actual_days,
            (GREATEST(1, ROUND((EXTRACT(EPOCH FROM (de.delivered_at - s."createdAt")) / 86400.0)::numeric, 1)) > lp."predictedDays") AS was_delayed,
            lp."delayProbability" AS delay_probability,
            (GREATEST(1, ROUND((EXTRACT(EPOCH FROM (de.delivered_at - s."createdAt")) / 86400.0)::numeric, 1)) - lp."predictedDays") AS delta,
            de.delivered_at,
            EXTRACT(DOW FROM de.delivered_at) AS day_of_week
        FROM logitrack.shipment s
        JOIN latest_pred lp ON lp."shipmentId" = s.id
        JOIN delivery_event de ON de."shipmentId" = s.id
        LEFT JOIN logitrack.zone z ON z.id = s."zoneId"
        LEFT JOIN logitrack.user u ON u.id = s."deliveryUserId"
        LEFT JOIN logitrack.transport t ON t.id = s."transportId"
        WHERE de.delivered_at::date >= :from AND de.delivered_at::date <= :to
          ${branchFilter}
    )`;

// ─── Sprint 5: Dashboard Supervisor ──────────────────────────────────────────

const getDashboardOperacionesData = async (query = {}, branchId = null, deps = { sequelize, QueryTypes }) => {
    const { dateFrom, dateTo, hasQuery } = resolveDateRange(query);

    const viewModel = {
        dateFrom, dateTo, error: null, hasQuery,
        branchId,
        statusSummary: [],
        delayedShipments: [],
        delayedByZone: [],
        delayedBySeverity: [],
        delayedByStatus: [],
        topFailingZones: [],
        delayedTrend: [],
        kpis: { total: 0, delivered: 0, in_transit: 0, delayed_count: 0, otif_pct: null, otif_on_time: 0, otif_delivered: 0 },
        exportQuery: buildExportQuery({ from: dateFrom, to: dateTo }),
    };

    if (dateFrom > dateTo) {
        viewModel.error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
        return viewModel;
    }

    const branchCond  = branchId ? `AND s."currentBranchId" = :branchId` : '';
    const branchCond2 = branchId ? `AND u."branchId" = :branchId` : '';
    const replacements = { from: dateFrom, to: dateTo, ...(branchId ? { branchId } : {}) };

    // Resumen por estado
    viewModel.statusSummary = await deps.sequelize.query(
        `SELECT s."statusId", st.description AS status_label, COUNT(s.id)::int AS total
         FROM logitrack.shipment s
         JOIN logitrack.status st ON st.id = s."statusId"
         WHERE s."createdAt"::date >= :from AND s."createdAt"::date <= :to ${branchCond}
         GROUP BY s."statusId", st.description ORDER BY total DESC`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // Envíos retrasados del período seleccionado (acotado a createdAt para ser coherente con los demás KPIs)
    viewModel.delayedShipments = await deps.sequelize.query(
        `SELECT s.id, s."trackingId", s."expectedDeliveryDate",
                z.name AS zone_name, u."fullName" AS driver_name,
                (CURRENT_DATE - s."expectedDeliveryDate")::int AS days_overdue
         FROM logitrack.shipment s
         LEFT JOIN logitrack.zone z ON z.id = s."zoneId"
         LEFT JOIN logitrack.user u ON u.id = s."deliveryUserId"
         WHERE s."statusId" IN (2, 6, 7)
           AND s."expectedDeliveryDate" IS NOT NULL
           AND s."expectedDeliveryDate" < CURRENT_DATE
           AND s."createdAt"::date >= :from AND s."createdAt"::date <= :to ${branchCond}
         ORDER BY days_overdue DESC LIMIT 50`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // Demoras por estado: en qué punto del proceso se atasca
    viewModel.delayedByStatus = await deps.sequelize.query(
        `SELECT st.description AS status_label, s."statusId", COUNT(*)::int AS total
         FROM logitrack.shipment s
         JOIN logitrack.status st ON st.id = s."statusId"
         WHERE s."statusId" IN (2, 6, 7)
           AND s."expectedDeliveryDate" IS NOT NULL
           AND s."expectedDeliveryDate" < CURRENT_DATE
           AND s."createdAt"::date >= :from AND s."createdAt"::date <= :to ${branchCond}
         GROUP BY s."statusId", st.description ORDER BY total DESC`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // Distribución de demoras por banda de severidad
    viewModel.delayedBySeverity = await deps.sequelize.query(
        `SELECT
            CASE
                WHEN (CURRENT_DATE - s."expectedDeliveryDate") <= 7  THEN '1–7 días'
                WHEN (CURRENT_DATE - s."expectedDeliveryDate") <= 14 THEN '8–14 días'
                WHEN (CURRENT_DATE - s."expectedDeliveryDate") <= 30 THEN '15–30 días'
                ELSE '+30 días'
            END AS banda,
            CASE
                WHEN (CURRENT_DATE - s."expectedDeliveryDate") <= 7  THEN 1
                WHEN (CURRENT_DATE - s."expectedDeliveryDate") <= 14 THEN 2
                WHEN (CURRENT_DATE - s."expectedDeliveryDate") <= 30 THEN 3
                ELSE 4
            END AS orden,
            COUNT(*)::int AS total
         FROM logitrack.shipment s
         WHERE s."statusId" IN (2, 6, 7)
           AND s."expectedDeliveryDate" IS NOT NULL
           AND s."expectedDeliveryDate" < CURRENT_DATE
           AND s."createdAt"::date >= :from AND s."createdAt"::date <= :to ${branchCond}
         GROUP BY banda, orden ORDER BY orden`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // Demoras por zona: con repartidor vs sin asignar (para gráfico)
    viewModel.delayedByZone = await deps.sequelize.query(
        `SELECT COALESCE(z.name, 'Sin zona') AS zone_name,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE s."deliveryUserId" IS NOT NULL)::int AS con_repartidor,
                COUNT(*) FILTER (WHERE s."deliveryUserId" IS NULL)::int AS sin_asignar
         FROM logitrack.shipment s
         LEFT JOIN logitrack.zone z ON z.id = s."zoneId"
         WHERE s."statusId" IN (2, 6, 7)
           AND s."expectedDeliveryDate" IS NOT NULL
           AND s."expectedDeliveryDate" < CURRENT_DATE
           AND s."createdAt"::date >= :from AND s."createdAt"::date <= :to ${branchCond}
         GROUP BY z.name ORDER BY total DESC`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // Top 5 zonas con mayor tasa de fallo
    viewModel.topFailingZones = await deps.sequelize.query(
        `WITH zs AS (
            SELECT s."zoneId", COUNT(DISTINCT s.id) AS total
            FROM logitrack.shipment s
            WHERE s."createdAt"::date >= :from AND s."createdAt"::date <= :to ${branchCond}
              AND s."zoneId" IS NOT NULL GROUP BY s."zoneId"
         ),
         zf AS (
            SELECT s."zoneId", COUNT(DISTINCT h."shipmentId") AS fails
            FROM logitrack.shipment_history h
            JOIN logitrack.shipment s ON s.id = h."shipmentId"
            WHERE h."toStatusId" = 9
              AND s."createdAt"::date >= :from AND s."createdAt"::date <= :to ${branchCond}
              AND s."zoneId" IS NOT NULL GROUP BY s."zoneId"
         )
         SELECT z.name AS zone_name,
                COALESCE(zs.total, 0)::int AS total_shipments,
                COALESCE(zf.fails, 0)::int AS failed_attempts,
                CASE WHEN COALESCE(zs.total,0)>0
                     THEN ROUND(COALESCE(zf.fails,0)*100.0/zs.total,1) ELSE 0
                END::float AS failure_rate
         FROM logitrack.zone z
         LEFT JOIN zs ON zs."zoneId" = z.id
         LEFT JOIN zf ON zf."zoneId" = z.id
         WHERE COALESCE(zs.total,0) > 0
         ORDER BY failure_rate DESC LIMIT 5`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // KPIs rápidos
    const totals = viewModel.statusSummary;
    viewModel.kpis.total      = totals.reduce((s, r) => s + r.total, 0);
    viewModel.kpis.delivered  = (totals.find(r => r.statusId === 4) || {}).total || 0;
    viewModel.kpis.in_transit = (totals.find(r => r.statusId === 2) || {}).total || 0;
    // delayed_count: envíos del período actualmente vencidos (mismo universo que los demás KPIs)
    const [delayedCount] = await deps.sequelize.query(
        `SELECT COUNT(*)::int AS cnt
         FROM logitrack.shipment s
         WHERE s."statusId" IN (2, 6, 7)
           AND s."expectedDeliveryDate" IS NOT NULL
           AND s."expectedDeliveryDate" < CURRENT_DATE
           AND s."createdAt"::date >= :from AND s."createdAt"::date <= :to ${branchCond}`,
        { type: deps.QueryTypes.SELECT, replacements }
    );
    viewModel.kpis.delayed_count = delayedCount?.cnt || 0;

    // OTIF basado en historial — filtra por sucursal del repartidor (branchCond2) para no excluir
    // entregas ya completadas donde currentBranchId puede ser NULL o incorrecto.
    const [otifKpi] = await deps.sequelize.query(
        `SELECT COUNT(DISTINCT s.id)::int AS delivered,
                COUNT(DISTINCT CASE WHEN h."changedAt"::date <= s."expectedDeliveryDate" THEN s.id END)::int AS on_time
         FROM logitrack.shipment s
         JOIN logitrack.shipment_history h ON h."shipmentId" = s.id AND h."toStatusId" = 4
         LEFT JOIN logitrack.user u ON u.id = s."deliveryUserId"
         WHERE s."createdAt"::date >= :from AND s."createdAt"::date <= :to
           AND s."expectedDeliveryDate" IS NOT NULL ${branchCond2}`,
        { type: deps.QueryTypes.SELECT, replacements }
    );
    viewModel.kpis.otif_pct = otifKpi?.delivered > 0
        ? Math.round(otifKpi.on_time / otifKpi.delivered * 1000) / 10
        : null;
    viewModel.kpis.otif_on_time = otifKpi?.on_time || 0;
    viewModel.kpis.otif_delivered = otifKpi?.delivered || 0;

    viewModel.delayedTrend = await deps.sequelize.query(
        `SELECT TO_CHAR(DATE_TRUNC('week', s."expectedDeliveryDate"), 'YYYY-MM-DD') AS week_start,
                COUNT(*)::int AS delayed
         FROM logitrack.shipment s
         WHERE s."statusId" IN (2, 6, 7)
           AND s."expectedDeliveryDate" IS NOT NULL
           AND s."expectedDeliveryDate" < CURRENT_DATE
           AND s."createdAt"::date >= :from AND s."createdAt"::date <= :to ${branchCond}
         GROUP BY DATE_TRUNC('week', s."expectedDeliveryDate")
         ORDER BY week_start`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    return viewModel;
};

// ─── Sprint 5: Dashboard Administrador ───────────────────────────────────────

const getDashboardDesempenoData = async (query = {}, deps = { sequelize, QueryTypes }) => {
    const { dateFrom, dateTo, hasQuery } = resolveDateRange(query);

    const viewModel = {
        dateFrom, dateTo, error: null, hasQuery,
        kpis: { total: 0, otif_pct: null, otif_base: 0, otif_on_time: 0, avg_delta: null, avg_predicted: null, avg_actual: null },
        zonePvr: [], driverPvr: [], weeklyEvolution: [],
        cycleTime: null,
        patterns: null,
        exportQuery: buildExportQuery({ from: dateFrom, to: dateTo }),
    };

    if (dateFrom > dateTo) {
        viewModel.error = 'La fecha de inicio no puede ser mayor a la fecha de fin.';
        return viewModel;
    }

    const replacements = { from: dateFrom, to: dateTo };
    const pvrCte = buildPvrBaseCte();

    // KPIs globales de predicción (total, avg_predicted, avg_actual, avg_delta)
    const [kpi] = await deps.sequelize.query(
        `${pvrCte}
         SELECT COUNT(*)::int AS total,
                ROUND(AVG(predicted_days),1)::float AS avg_predicted,
                ROUND(AVG(actual_days)::numeric,1)::float    AS avg_actual,
                ROUND(AVG(delta)::numeric,1)::float           AS avg_delta,
                COUNT(CASE WHEN expected_delivery_date IS NOT NULL THEN 1 END)::int AS otif_base,
                COUNT(CASE WHEN delivered_at::date <= expected_delivery_date THEN 1 END)::int AS otif_on_time,
                ROUND(COUNT(CASE WHEN delivered_at::date <= expected_delivery_date THEN 1 END)*100.0
                      / NULLIF(COUNT(CASE WHEN expected_delivery_date IS NOT NULL THEN 1 END),0),1)::float AS otif_pct
         FROM pvr`,
        { type: deps.QueryTypes.SELECT, replacements }
    );
    if (kpi) { viewModel.kpis = { ...viewModel.kpis, ...kpi }; }

    // Ciclo del envío: tiempo de preparación (creación→tránsito) vs tránsito (tránsito→entrega)
    const [cycleRow] = await deps.sequelize.query(
        `WITH primera_entrega AS (
             SELECT DISTINCT ON ("shipmentId") "shipmentId", "changedAt" AS delivered_at
             FROM logitrack.shipment_history WHERE "toStatusId" = 4
             ORDER BY "shipmentId", "changedAt" ASC
         ),
         primer_transito AS (
             SELECT DISTINCT ON ("shipmentId") "shipmentId", "changedAt" AS transit_at
             FROM logitrack.shipment_history WHERE "toStatusId" = 2
             ORDER BY "shipmentId", "changedAt" ASC
         ),
         latest_pred AS (
             SELECT DISTINCT ON ("shipmentId") "shipmentId", "predictedDays"
             FROM logitrack."shipmentPrediction"
             WHERE "actualDays" IS NOT NULL
             ORDER BY "shipmentId", "createdAt" DESC
         )
         SELECT COUNT(*)::int AS total,
                ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (pt.transit_at   - s."createdAt"))   / 86400.0))::numeric, 1)::float AS avg_prep_days,
                ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (pe.delivered_at - pt.transit_at))   / 86400.0))::numeric, 1)::float AS avg_transit_days,
                ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (pe.delivered_at - s."createdAt"))   / 86400.0))::numeric, 1)::float AS avg_total_days,
                ROUND(AVG(lp."predictedDays")::numeric, 1)::float AS avg_predicted_days
         FROM logitrack.shipment s
         JOIN latest_pred lp    ON lp."shipmentId"  = s.id
         JOIN primera_entrega pe ON pe."shipmentId" = s.id
         JOIN primer_transito  pt ON pt."shipmentId" = s.id
         WHERE pe.delivered_at::date >= :from AND pe.delivered_at::date <= :to
           AND pt.transit_at <= pe.delivered_at`,
        { type: deps.QueryTypes.SELECT, replacements }
    );
    viewModel.cycleTime = (cycleRow && cycleRow.total > 0) ? cycleRow : null;

    // Por destino (zona) — incluye "Sin zona" para que el total reconcilie con el KPI global.
    // Conductores distintos con demora para detectar patrones estructurales.
    viewModel.zonePvr = await deps.sequelize.query(
        `${pvrCte}
         SELECT zone_id, COALESCE(zone_name, 'Sin zona') AS zone_name,
                COUNT(*)::int AS total,
                COUNT(CASE WHEN was_delayed IS TRUE THEN 1 END)::int AS total_delayed,
                ROUND(COUNT(CASE WHEN was_delayed IS TRUE THEN 1 END)*100.0/NULLIF(COUNT(*),0),0)::int AS delay_rate,
                COUNT(DISTINCT CASE WHEN was_delayed IS TRUE THEN driver_id END)::int AS distinct_drivers_delayed,
                ROUND(AVG(predicted_days),1)::float AS avg_predicted,
                ROUND(AVG(actual_days)::numeric,1)::float AS avg_actual,
                ROUND(AVG(delta)::numeric,1)::float        AS avg_delta,
                ROUND(COUNT(CASE WHEN delivered_at::date <= expected_delivery_date THEN 1 END)*100.0
                      /NULLIF(COUNT(CASE WHEN expected_delivery_date IS NOT NULL THEN 1 END),0),1)::float AS otif_pct
         FROM pvr
         GROUP BY zone_id, zone_name ORDER BY (zone_id IS NULL), delay_rate DESC NULLS LAST, total DESC`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // Por repartidor (viaje completo — último driver asignado)
    viewModel.driverPvr = await deps.sequelize.query(
        `${pvrCte}
         SELECT driver_id, driver_name,
                COUNT(*)::int AS total,
                COUNT(CASE WHEN was_delayed IS TRUE THEN 1 END)::int AS total_delayed,
                ROUND(COUNT(CASE WHEN was_delayed IS TRUE THEN 1 END)*100.0/NULLIF(COUNT(*),0),0)::int AS delay_rate,
                ROUND(AVG(predicted_days),1)::float AS avg_predicted,
                ROUND(AVG(actual_days)::numeric,1)::float    AS avg_actual,
                ROUND(AVG(delta)::numeric,1)::float           AS avg_delta,
                ROUND(COUNT(CASE WHEN delivered_at::date <= expected_delivery_date THEN 1 END)*100.0
                      /NULLIF(COUNT(CASE WHEN expected_delivery_date IS NOT NULL THEN 1 END),0),1)::float AS otif_pct
         FROM pvr WHERE driver_id IS NOT NULL
         GROUP BY driver_id, driver_name ORDER BY delay_rate DESC NULLS LAST, total DESC`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // Zona más demorada por repartidor — query separado para evitar CTEs anidados
    const driverZoneRows = await deps.sequelize.query(
        `${pvrCte}
         SELECT driver_id, zone_id, zone_name, COUNT(*)::int AS cnt
         FROM pvr
         WHERE was_delayed IS TRUE AND zone_id IS NOT NULL
         GROUP BY driver_id, zone_id, zone_name
         ORDER BY driver_id, cnt DESC`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // Mapa zone_id → estadísticas (construido a partir de zonePvr ya calculado)
    const zoneStatsMap = {};
    for (const z of viewModel.zonePvr) {
        if (z.zone_id != null) {
            zoneStatsMap[z.zone_id] = { delay_rate: z.delay_rate, distinct_drivers: z.distinct_drivers_delayed || 0 };
        }
    }
    // Mapa driver_id → zona principal demorada (primera aparición = mayor cnt por el ORDER BY)
    const driverTopZone = {};
    for (const row of driverZoneRows) {
        if (!driverTopZone[row.driver_id]) { driverTopZone[row.driver_id] = row; }
    }
    // Enriquecer driverPvr con contexto de zona
    viewModel.driverPvr = viewModel.driverPvr.map((d) => {
        const topZone = driverTopZone[d.driver_id];
        const stats   = topZone ? (zoneStatsMap[topZone.zone_id] || null) : null;
        return {
            ...d,
            main_delayed_zone:         topZone ? topZone.zone_name : null,
            main_zone_delay_rate:      stats   ? stats.delay_rate  : null,
            main_zone_distinct_drivers: stats  ? stats.distinct_drivers : 0,
        };
    });

    // Evolución semanal
    viewModel.weeklyEvolution = await deps.sequelize.query(
        `${pvrCte}
         SELECT TO_CHAR(delivered_at, 'IYYY-IW') AS week_key,
                DATE_TRUNC('week', MIN(delivered_at))::date AS week_start,
                COUNT(*)::int AS total,
                ROUND(AVG(delta)::numeric,1)::float AS avg_delta,
                ROUND(COUNT(CASE WHEN delivered_at::date <= expected_delivery_date THEN 1 END)*100.0/NULLIF(COUNT(CASE WHEN expected_delivery_date IS NOT NULL THEN 1 END),0),1)::float AS otif_pct
         FROM pvr
         GROUP BY TO_CHAR(delivered_at, 'IYYY-IW')
         ORDER BY week_key`,
        { type: deps.QueryTypes.SELECT, replacements }
    );

    // Patrones detectados — sintetizados a partir de los datos ya calculados
    const structuralZones = viewModel.zonePvr
        .filter(z => z.delay_rate >= 40 && (z.distinct_drivers_delayed || 0) >= 3 && z.total >= 3)
        .slice(0, 3);
    const prepDominant = Boolean(
        viewModel.cycleTime && viewModel.cycleTime.avg_prep_days > viewModel.cycleTime.avg_transit_days
    );
    viewModel.patterns = { structuralZones, prepDominant };

    return viewModel;
};

module.exports = {
    buildExportQuery,
    computeNps,
    formatIsoDate,
    getDeliveryPerformanceData,
    getDashboardDesempenoData,
    getDashboardOperacionesData,
    getIncidentsByPeriodData,
    getOnTimeDeliveriesData,
    getSatisfactionData,
    getShipmentsByPeriodData,
    resolveDateRange,
};
