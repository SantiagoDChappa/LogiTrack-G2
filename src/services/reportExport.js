const { formatIsoDate } = require('./reportData');

const CSV_MIME = 'text/csv; charset=utf-8';
const PDF_MIME = 'application/pdf';
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN_X = 40;
const PAGE_MARGIN_TOP = 32;
const PAGE_MARGIN_BOTTOM = 36;
const CONTENT_WIDTH = PAGE_WIDTH - (PAGE_MARGIN_X * 2);

const COLORS = {
    headerBg:     [20, 46, 78],
    headerAccent: [79, 156, 249],
    textDark:     [15, 23, 42],
    textMuted:    [100, 116, 139],
    border:       [203, 213, 225],
    rowAlt:       [248, 250, 252],
    tableHeader:  [226, 232, 240],
    panelBg:      [248, 250, 252],
    white:        [255, 255, 255],
};

const REPORT_TYPES = {
    SHIPMENTS_BY_PERIOD: 'volumen_envios',
    ON_TIME_DELIVERIES: 'entregas_a_tiempo',
    DELIVERY_PERFORMANCE: 'rendimiento_repartidores',
    INCIDENTS_BY_PERIOD: 'fallas_por_periodo',
    SATISFACTION: 'satisfaccion_cliente',
};

const escapeCsv = (value) => {
    if (value === null || value === undefined) { return ''; }
    const stringValue = String(value);
    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
};

const buildCsv = (columns, rows) => {
    const header = columns.join(',');
    const data = rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(','));
    return [header, ...data].join('\n');
};

const normalizePdfText = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapePdfText = (value) => normalizePdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const wrapPdfLine = (line, maxLength = 94) => {
    const normalized = normalizePdfText(line);
    if (!normalized) { return ['']; }

    const words = normalized.split(' ');
    const lines = [];
    let current = '';

    words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxLength) {
            current = candidate;
            return;
        }

        if (current) {
            lines.push(current);
        }

        if (word.length <= maxLength) {
            current = word;
            return;
        }

        let pending = word;
        while (pending.length > maxLength) {
            lines.push(pending.slice(0, maxLength - 1) + '-');
            pending = pending.slice(maxLength - 1);
        }
        current = pending;
    });

    if (current) {
        lines.push(current);
    }

    return lines;
};

const estimateCharWidth = (fontSize, font = 'F1') => fontSize * (font === 'F2' ? 0.58 : 0.54);

const wrapPdfText = (text, maxWidth, fontSize, font = 'F1') => {
    const maxChars = Math.max(1, Math.floor(maxWidth / estimateCharWidth(fontSize, font)));
    return wrapPdfLine(text, maxChars);
};

const colorToPdf = (rgb, operator) => `${rgb.map((value) => (value / 255).toFixed(3)).join(' ')} ${operator}`;

const toPdfY = (top, height = 0) => PAGE_HEIGHT - top - height;

const rectOp = (x, top, width, height, fillColor) => [
    'q',
    colorToPdf(fillColor, 'rg'),
    `${x.toFixed(2)} ${toPdfY(top, height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`,
    'f',
    'Q',
].join('\n');

const strokeRectOp = (x, top, width, height, strokeColor, lineWidth = 1) => [
    'q',
    `${lineWidth.toFixed(2)} w`,
    colorToPdf(strokeColor, 'RG'),
    `${x.toFixed(2)} ${toPdfY(top, height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`,
    'S',
    'Q',
].join('\n');

const lineOp = (x1, top1, x2, top2, strokeColor, lineWidth = 1) => [
    'q',
    `${lineWidth.toFixed(2)} w`,
    colorToPdf(strokeColor, 'RG'),
    `${x1.toFixed(2)} ${toPdfY(top1).toFixed(2)} m`,
    `${x2.toFixed(2)} ${toPdfY(top2).toFixed(2)} l`,
    'S',
    'Q',
].join('\n');

const textBlockOp = ({ x, top, lines, font = 'F1', fontSize = 12, color = COLORS.textDark, leading }) => {
    const normalizedLines = (lines && lines.length > 0 ? lines : ['']).map(escapePdfText);
    const lineLeading = leading || fontSize + 4;
    const operations = [
        'BT',
        `/${font} ${fontSize} Tf`,
        colorToPdf(color, 'rg'),
        `1 0 0 1 ${x.toFixed(2)} ${toPdfY(top).toFixed(2)} Tm`,
        `${lineLeading.toFixed(2)} TL`,
        `(${normalizedLines[0]}) Tj`,
    ];

    normalizedLines.slice(1).forEach((line) => {
        operations.push(`T* (${line}) Tj`);
    });

    operations.push('ET');
    return operations.join('\n');
};

const createPdfPage = (definition) => {
    const headerPaddingX = 24;
    const titleMaxWidth = CONTENT_WIDTH - (headerPaddingX * 2);
    const titleFontSize = 18;
    const subtitleFontSize = 10;
    const titleLeading = 20;
    const subtitleLeading = 12;
    const titleLines = wrapPdfText(definition.title, titleMaxWidth, titleFontSize, 'F2');
    const subtitle = definition.pdfDefinition?.subtitle || 'Reporte exportado desde LogiTrack';
    const subtitleLines = wrapPdfText(subtitle, titleMaxWidth, subtitleFontSize);
    const titleTop = PAGE_MARGIN_TOP + 28;
    const titleBlockHeight = titleFontSize + (Math.max(titleLines.length, 1) - 1) * titleLeading;
    const subtitleTop = titleTop + titleBlockHeight + 14;
    const subtitleBlockHeight = subtitleFontSize + (Math.max(subtitleLines.length, 1) - 1) * subtitleLeading;
    const headerHeight = Math.max(84, (subtitleTop - PAGE_MARGIN_TOP) + subtitleBlockHeight + 18);
    const page = { content: [], cursorY: PAGE_MARGIN_TOP + headerHeight + 20 };

    page.content.push(rectOp(PAGE_MARGIN_X, PAGE_MARGIN_TOP, CONTENT_WIDTH, headerHeight, COLORS.headerBg));
    page.content.push(rectOp(PAGE_MARGIN_X, PAGE_MARGIN_TOP, 12, headerHeight, COLORS.headerAccent));
    page.content.push(textBlockOp({
        x: PAGE_MARGIN_X + 24,
        top: titleTop,
        lines: titleLines,
        font: 'F2',
        fontSize: titleFontSize,
        color: COLORS.white,
        leading: titleLeading,
    }));
    page.content.push(textBlockOp({
        x: PAGE_MARGIN_X + 24,
        top: subtitleTop,
        lines: subtitleLines,
        font: 'F1',
        fontSize: subtitleFontSize,
        color: [226, 232, 240],
        leading: subtitleLeading,
    }));

    return page;
};

const buildPdf = (definition) => {
    const pdfDefinition = definition.pdfDefinition || {};
    const pages = [createPdfPage(definition)];

    const getCurrentPage = () => pages[pages.length - 1];
    const ensureSpace = (requiredHeight) => {
        const currentPage = getCurrentPage();
        if (currentPage.cursorY + requiredHeight <= PAGE_HEIGHT - PAGE_MARGIN_BOTTOM) {
            return currentPage;
        }

        const nextPage = createPdfPage(definition);
        pages.push(nextPage);
        return nextPage;
    };

    const addGap = (height) => {
        getCurrentPage().cursorY += height;
    };

    const drawSectionTitle = (title) => {
        const currentPage = ensureSpace(32);
        currentPage.content.push(textBlockOp({
            x: PAGE_MARGIN_X,
            top: currentPage.cursorY + 18,
            lines: wrapPdfText(title, CONTENT_WIDTH, 15, 'F2'),
            font: 'F2',
            fontSize: 15,
            color: COLORS.textDark,
            leading: 16,
        }));
        currentPage.content.push(lineOp(PAGE_MARGIN_X, currentPage.cursorY + 24, PAGE_MARGIN_X + CONTENT_WIDTH, currentPage.cursorY + 24, COLORS.border, 1));
        currentPage.cursorY += 32;
    };

    const drawSummaryPanel = () => {
        const items = pdfDefinition.summaryItems || [];
        if (items.length === 0) { return; }

        drawSectionTitle(pdfDefinition.summaryTitle || 'Resumen');

        const labelWidth = 170;
        const valueWidth = CONTENT_WIDTH - labelWidth - 24;
        const rowGap = 10;
        const rows = items.map((item) => {
            const labelLines = wrapPdfText(item.label, labelWidth, 9, 'F2');
            const valueLines = wrapPdfText(item.value, valueWidth, 10);
            const rowHeight = Math.max(
                24,
                10 + (Math.max(labelLines.length, valueLines.length) * 13)
            );

            return { ...item, labelLines, valueLines, rowHeight };
        });

        let panelHeight = 16;
        rows.forEach((row, index) => {
            panelHeight += row.rowHeight;
            if (index < rows.length - 1) {
                panelHeight += rowGap;
            }
        });
        panelHeight += 16;

        const currentPage = ensureSpace(panelHeight + 8);
        currentPage.content.push(rectOp(PAGE_MARGIN_X, currentPage.cursorY, CONTENT_WIDTH, panelHeight, COLORS.panelBg));
        currentPage.content.push(strokeRectOp(PAGE_MARGIN_X, currentPage.cursorY, CONTENT_WIDTH, panelHeight, COLORS.border, 0.8));

        let rowY = currentPage.cursorY + 18;
        rows.forEach((row, index) => {
            currentPage.content.push(textBlockOp({
                x: PAGE_MARGIN_X + 14,
                top: rowY + 10,
                lines: row.labelLines,
                font: 'F2',
                fontSize: 9,
                color: COLORS.textMuted,
                leading: 13,
            }));
            currentPage.content.push(textBlockOp({
                x: PAGE_MARGIN_X + 14 + labelWidth,
                top: rowY + 10,
                lines: row.valueLines,
                font: 'F1',
                fontSize: 10,
                color: COLORS.textDark,
                leading: 13,
            }));

            rowY += row.rowHeight;

            if (index < rows.length - 1) {
                currentPage.content.push(lineOp(
                    PAGE_MARGIN_X + 14,
                    rowY + 2,
                    PAGE_MARGIN_X + CONTENT_WIDTH - 14,
                    rowY + 2,
                    COLORS.border,
                    0.6
                ));
                rowY += rowGap;
            }
        });

        currentPage.cursorY += panelHeight;
    };

    const drawTable = () => {
        const table = pdfDefinition.table;
        if (!table) { return; }

        drawSectionTitle(table.title || 'Detalle');

        const columns = table.columns || [];
        const rows = table.rows || [];
        const paddingX = 8;
        const cellLeading = 12;
        const headerHeight = 24;
        const colWidths = columns.map((column) => CONTENT_WIDTH * (column.width || 1 / columns.length));

        const drawHeader = () => {
            const currentPage = ensureSpace(headerHeight + 8);
            currentPage.content.push(rectOp(PAGE_MARGIN_X, currentPage.cursorY, CONTENT_WIDTH, headerHeight, COLORS.tableHeader));
            currentPage.content.push(strokeRectOp(PAGE_MARGIN_X, currentPage.cursorY, CONTENT_WIDTH, headerHeight, COLORS.border, 0.7));

            let currentX = PAGE_MARGIN_X;
            columns.forEach((column, index) => {
                currentPage.content.push(textBlockOp({
                    x: currentX + paddingX,
                    top: currentPage.cursorY + 15,
                    lines: wrapPdfText(column.label, colWidths[index] - (paddingX * 2), 8, 'F2'),
                    font: 'F2',
                    fontSize: 8,
                    color: COLORS.textDark,
                    leading: 10,
                }));
                currentX += colWidths[index];
                if (index < columns.length - 1) {
                    currentPage.content.push(lineOp(currentX, currentPage.cursorY, currentX, currentPage.cursorY + headerHeight, COLORS.border, 0.7));
                }
            });

            currentPage.cursorY += headerHeight;
        };

        drawHeader();

        if (rows.length === 0) {
            const currentPage = ensureSpace(34);
            currentPage.content.push(textBlockOp({
                x: PAGE_MARGIN_X + 6,
                top: currentPage.cursorY + 18,
                lines: wrapPdfText(table.emptyMessage || 'No hay datos para mostrar.', CONTENT_WIDTH - 12, 10),
                font: 'F1',
                fontSize: 10,
                color: COLORS.textMuted,
                leading: 12,
            }));
            currentPage.cursorY += 30;
            return;
        }

        rows.forEach((row, rowIndex) => {
            const cellLines = columns.map((column, index) =>
                wrapPdfText(row[column.key], colWidths[index] - (paddingX * 2), 9.5, column.font || 'F1')
            );
            const rowHeight = Math.max(
                24,
                ...cellLines.map((lines) => 10 + (lines.length * cellLeading))
            );

            let currentPage = getCurrentPage();
            if (currentPage.cursorY + rowHeight > PAGE_HEIGHT - PAGE_MARGIN_BOTTOM) {
                ensureSpace(PAGE_HEIGHT);
                drawHeader();
                currentPage = getCurrentPage();
            }

            const fillColor = rowIndex % 2 === 0 ? COLORS.white : COLORS.rowAlt;
            currentPage.content.push(rectOp(PAGE_MARGIN_X, currentPage.cursorY, CONTENT_WIDTH, rowHeight, fillColor));
            currentPage.content.push(strokeRectOp(PAGE_MARGIN_X, currentPage.cursorY, CONTENT_WIDTH, rowHeight, COLORS.border, 0.7));

            let currentX = PAGE_MARGIN_X;
            columns.forEach((column, index) => {
                currentPage.content.push(textBlockOp({
                    x: currentX + paddingX,
                    top: currentPage.cursorY + 15,
                    lines: cellLines[index],
                    font: column.font || 'F1',
                    fontSize: 9.5,
                    color: COLORS.textDark,
                    leading: cellLeading,
                }));
                currentX += colWidths[index];
                if (index < columns.length - 1) {
                    currentPage.content.push(lineOp(currentX, currentPage.cursorY, currentX, currentPage.cursorY + rowHeight, COLORS.border, 0.7));
                }
            });

            currentPage.cursorY += rowHeight;
        });
    };

    drawSummaryPanel();
    addGap(6);
    drawTable();

    const totalPages = pages.length;
    const finalPages = pages.map((page, index) => ({
        ...page,
        content: [
            ...page.content,
            textBlockOp({
                x: PAGE_MARGIN_X,
                top: PAGE_HEIGHT - 18,
                lines: [`Generado por LogiTrack | Pagina ${index + 1} de ${totalPages}`],
                font: 'F1',
                fontSize: 8,
                color: COLORS.textMuted,
            }),
        ],
    }));

    const objects = [];
    const fontObjectId = 3;
    const fontBoldObjectId = 4;
    const pageObjectIds = [];
    const contentObjectIds = [];

    objects[0] = null;
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

    let nextObjectId = 5;
    finalPages.forEach(() => {
        pageObjectIds.push(nextObjectId++);
        contentObjectIds.push(nextObjectId++);
    });

    objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

    finalPages.forEach((page, index) => {
        const pageObjectId = pageObjectIds[index];
        const contentObjectId = contentObjectIds[index];
        const stream = page.content.join('\n');
        const streamLength = Buffer.byteLength(stream, 'utf8');

        objects[pageObjectId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
        objects[contentObjectId] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
    });

    const chunks = ['%PDF-1.4\n'];
    const offsets = [0];

    for (let index = 1; index < objects.length; index += 1) {
        if (!objects[index]) { continue; }
        offsets[index] = Buffer.byteLength(chunks.join(''), 'utf8');
        chunks.push(`${index} 0 obj\n${objects[index]}\nendobj\n`);
    }

    const xrefOffset = Buffer.byteLength(chunks.join(''), 'utf8');
    const maxObjectId = objects.length - 1;

    chunks.push(`xref\n0 ${maxObjectId + 1}\n`);
    chunks.push('0000000000 65535 f \n');
    for (let index = 1; index <= maxObjectId; index += 1) {
        const offset = offsets[index] || 0;
        chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    }
    chunks.push(`trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    return Buffer.from(chunks.join(''), 'utf8');
};

const buildReportFilename = (reportType, extension, now = new Date()) =>
    `reporte_${reportType}_${formatIsoDate(now)}.${extension}`;

const toPercent = (value) => Number(value).toFixed(1);

const describeSegmentBy = (segmentBy) => {
    if (segmentBy === 'deliveryUser') { return 'repartidor'; }
    if (segmentBy === 'zone') { return 'zona'; }
    return 'sin segmentacion';
};

const buildShipmentsByPeriodExport = ({ dateFrom, dateTo, totalShipments, statusTotals }) => {
    const columns = ['fecha_desde', 'fecha_hasta', 'estado', 'cantidad', 'porcentaje'];
    const rows = statusTotals.map((row) => ({
        fecha_desde: dateFrom,
        fecha_hasta: dateTo,
        estado: row.status_label,
        cantidad: row.total,
        porcentaje: totalShipments > 0 ? toPercent(row.total / totalShipments * 100) : '0.0',
    }));

    return {
        type: REPORT_TYPES.SHIPMENTS_BY_PERIOD,
        title: 'Reporte - Volumen de Envios por Periodo',
        columns,
        rows,
        pdfDefinition: {
            subtitle: 'Distribucion de envios por estado en el periodo seleccionado',
            summaryItems: [
                { label: 'Periodo', value: `${dateFrom} a ${dateTo}` },
                { label: 'Total de envios', value: String(totalShipments) },
            ],
            table: {
                title: 'Detalle por estado',
                emptyMessage: 'No hay envios para el periodo seleccionado.',
                columns: [
                    { key: 'estado', label: 'Estado', width: 0.50, font: 'F2' },
                    { key: 'cantidad', label: 'Cantidad', width: 0.20 },
                    { key: 'porcentaje', label: '%', width: 0.30 },
                ],
                rows: rows.map((row) => ({
                    estado: row.estado,
                    cantidad: String(row.cantidad),
                    porcentaje: `${row.porcentaje}%`,
                })),
            },
        },
    };
};

const buildOnTimeDeliveriesExport = ({ dateFrom, dateTo, segmentBy, summary, segments }) => {
    const columns = ['fecha_desde', 'fecha_hasta', 'segmentacion', 'segmento', 'total', 'a_tiempo', 'con_demora', 'porcentaje_a_tiempo'];
    const rows = segments.length > 0
        ? segments.map((segment) => ({
            fecha_desde: dateFrom,
            fecha_hasta: dateTo,
            segmentacion: describeSegmentBy(segmentBy),
            segmento: segment.label,
            total: segment.total,
            a_tiempo: segment.on_time,
            con_demora: segment.total - segment.on_time,
            porcentaje_a_tiempo: segment.total > 0 ? toPercent(segment.on_time / segment.total * 100) : '0.0',
        }))
        : [{
            fecha_desde: dateFrom,
            fecha_hasta: dateTo,
            segmentacion: describeSegmentBy(segmentBy),
            segmento: segmentBy ? 'Sin datos de segmentacion' : 'General',
            total: summary?.total || 0,
            a_tiempo: summary?.on_time || 0,
            con_demora: summary?.late || 0,
            porcentaje_a_tiempo: summary?.total > 0 ? toPercent(summary.on_time / summary.total * 100) : '0.0',
        }];

    return {
        type: REPORT_TYPES.ON_TIME_DELIVERIES,
        title: 'Reporte - Entregas a Tiempo',
        columns,
        rows,
        pdfDefinition: {
            subtitle: 'Seguimiento del cumplimiento de entregas frente a la fecha estimada',
            summaryItems: [
                { label: 'Periodo', value: `${dateFrom} a ${dateTo}` },
                { label: 'Segmentacion', value: describeSegmentBy(segmentBy) },
                { label: 'Total entregas', value: String(summary?.total || 0) },
                { label: 'A tiempo', value: String(summary?.on_time || 0) },
                { label: 'Con demora', value: String(summary?.late || 0) },
            ],
            table: {
                title: segmentBy ? `Detalle por ${describeSegmentBy(segmentBy)}` : 'Resumen general',
                emptyMessage: 'No hay entregas para el periodo seleccionado.',
                columns: [
                    { key: 'segmento', label: segmentBy ? 'Segmento' : 'Vista', width: 0.34, font: 'F2' },
                    { key: 'total', label: 'Total', width: 0.14 },
                    { key: 'a_tiempo', label: 'A tiempo', width: 0.16 },
                    { key: 'con_demora', label: 'Demora', width: 0.16 },
                    { key: 'porcentaje_a_tiempo', label: '% a tiempo', width: 0.20 },
                ],
                rows: rows.map((row) => ({
                    segmento: row.segmento,
                    total: String(row.total),
                    a_tiempo: String(row.a_tiempo),
                    con_demora: String(row.con_demora),
                    porcentaje_a_tiempo: `${row.porcentaje_a_tiempo}%`,
                })),
            },
        },
    };
};

const buildDeliveryPerformanceExport = ({ dateFrom, dateTo, rows: performanceRows }) => {
    const columns = ['fecha_desde', 'fecha_hasta', 'repartidor', 'asignados', 'entregados', 'a_tiempo', 'incidencias', 'porcentaje_exito'];
    const rows = performanceRows.map((row) => ({
        fecha_desde: dateFrom,
        fecha_hasta: dateTo,
        repartidor: row.full_name,
        asignados: row.assigned,
        entregados: row.delivered,
        a_tiempo: row.on_time,
        incidencias: row.incidents,
        porcentaje_exito: String(row.success_pct),
    }));

    return {
        type: REPORT_TYPES.DELIVERY_PERFORMANCE,
        title: 'Reporte - Rendimiento de Repartidores',
        columns,
        rows,
        pdfDefinition: {
            subtitle: 'Comparativa operativa por repartidor en el periodo consultado',
            summaryItems: [
                { label: 'Periodo', value: `${dateFrom} a ${dateTo}` },
                { label: 'Repartidores con actividad', value: String(performanceRows.length) },
            ],
            table: {
                title: 'Detalle por repartidor',
                emptyMessage: 'No hay repartidores con actividad para el periodo seleccionado.',
                columns: [
                    { key: 'repartidor', label: 'Repartidor', width: 0.34, font: 'F2' },
                    { key: 'asignados', label: 'Asignados', width: 0.13 },
                    { key: 'entregados', label: 'Entregados', width: 0.13 },
                    { key: 'a_tiempo', label: 'A tiempo', width: 0.12 },
                    { key: 'incidencias', label: 'Incid.', width: 0.10 },
                    { key: 'porcentaje_exito', label: '% exito', width: 0.18 },
                ],
                rows: rows.map((row) => ({
                    repartidor: row.repartidor,
                    asignados: String(row.asignados),
                    entregados: String(row.entregados),
                    a_tiempo: String(row.a_tiempo),
                    incidencias: String(row.incidencias),
                    porcentaje_exito: `${row.porcentaje_exito}%`,
                })),
            },
        },
    };
};

const buildIncidentsByPeriodExport = ({ dateFrom, dateTo, rows: incidentRows, totalIncidents }) => {
    const columns = ['fecha_desde', 'fecha_hasta', 'tipo_incidencia', 'total', 'abiertas', 'resueltas', 'procedentes', 'no_procedentes', 'sin_clasificar', 'porcentaje'];
    const rows = incidentRows.map((row) => ({
        fecha_desde: dateFrom,
        fecha_hasta: dateTo,
        tipo_incidencia: row.incident_type,
        total: row.total,
        abiertas: row.open,
        resueltas: row.resolved,
        procedentes: row.procedente,
        no_procedentes: row.no_procedente,
        sin_clasificar: row.sin_clasificar,
        porcentaje: totalIncidents > 0 ? toPercent(row.total / totalIncidents * 100) : '0.0',
    }));

    return {
        type: REPORT_TYPES.INCIDENTS_BY_PERIOD,
        title: 'Reporte - Fallas de Envios por Periodo',
        columns,
        rows,
        pdfDefinition: {
            subtitle: 'Distribucion de incidencias por tipo en el periodo seleccionado',
            summaryItems: [
                { label: 'Periodo', value: `${dateFrom} a ${dateTo}` },
                { label: 'Total de incidencias', value: String(totalIncidents) },
            ],
            table: {
                title: 'Detalle por tipo de incidencia',
                emptyMessage: 'No hay incidencias para el periodo seleccionado.',
                columns: [
                    { key: 'tipo_incidencia', label: 'Tipo', width: 0.28, font: 'F2' },
                    { key: 'total', label: 'Total', width: 0.10 },
                    { key: 'abiertas', label: 'Abiertas', width: 0.12 },
                    { key: 'resueltas', label: 'Resueltas', width: 0.12 },
                    { key: 'procedentes', label: 'Proc.', width: 0.10 },
                    { key: 'no_procedentes', label: 'No proc.', width: 0.11 },
                    { key: 'sin_clasificar', label: 'Sin clasif.', width: 0.11 },
                    { key: 'porcentaje', label: '%', width: 0.06 },
                ],
                rows: rows.map((row) => ({
                    tipo_incidencia: row.tipo_incidencia,
                    total: String(row.total),
                    abiertas: String(row.abiertas),
                    resueltas: String(row.resueltas),
                    procedentes: String(row.procedentes),
                    no_procedentes: String(row.no_procedentes),
                    sin_clasificar: String(row.sin_clasificar),
                    porcentaje: `${row.porcentaje}%`,
                })),
            },
        },
    };
};

const renderReportExport = (definition, format) => {
    const normalizedFormat = String(format || '').toLowerCase();
    if (normalizedFormat === 'csv') {
        return {
            contentType: CSV_MIME,
            extension: 'csv',
            body: buildCsv(definition.columns, definition.rows),
        };
    }

    if (normalizedFormat === 'pdf') {
        return {
            contentType: PDF_MIME,
            extension: 'pdf',
            body: buildPdf(definition),
        };
    }

    const error = new Error('Formato de exportacion no soportado');
    error.statusCode = 400;
    throw error;
};

const DELIVERY_DIM_LABELS = ['Puntualidad', 'Estado del paquete', 'Atencion del servicio'];
const INCIDENT_DIM_LABELS = ['Tiempo de resolucion', 'Comunicacion', 'Resultado obtenido'];

const getDimLabelsForType = (surveyType) => {
    if (surveyType === 'delivery') { return DELIVERY_DIM_LABELS; }
    if (surveyType === 'incident') { return INCIDENT_DIM_LABELS; }
    return DELIVERY_DIM_LABELS;
};

const getDimLabelsForRow = (rowType) =>
    rowType === 'incident' ? INCIDENT_DIM_LABELS : DELIVERY_DIM_LABELS;

const buildSatisfactionExport = ({ dateFrom, dateTo, surveyType, kpis, comparison, distribution, recentComments }) => {
    const dimLabels = getDimLabelsForType(surveyType);

    const columns = ['fecha_desde', 'fecha_hasta', 'tipo', 'total', 'promedio_general', 'dim1', 'dim2', 'dim3'];
    const rows = comparison.map((row) => {
        const rowDims = getDimLabelsForRow(row.survey_type);
        return {
            fecha_desde: dateFrom,
            fecha_hasta: dateTo,
            tipo: row.survey_type === 'delivery' ? 'Entregas' : 'Incidencias',
            total: row.total,
            promedio_general: toPercent(row.avg_overall),
            dim1: toPercent(row.avg_dim1),
            dim2: toPercent(row.avg_dim2),
            dim3: toPercent(row.avg_dim3),
            dim1_label: rowDims[0],
            dim2_label: rowDims[1],
            dim3_label: rowDims[2],
        };
    });

    const distSummary = distribution.map((d) => `${d.rating} estrellas: ${d.count}`).join(', ');
    const rr = kpis.responseRate || {};
    const rrText = rr.eligible
        ? `${rr.responded} de ${rr.eligible} (${rr.pct}%)`
        : 'Sin datos';
    const npsValue = kpis.nps !== undefined ? kpis.nps : 0;

    const pdfTableColumns = [
        { key: 'tipo', label: 'Tipo', width: 0.20, font: 'F2' },
        { key: 'total', label: 'Total', width: 0.10 },
        { key: 'promedio_general', label: 'General', width: 0.12 },
        { key: 'dim1_display', label: dimLabels[0], width: 0.20 },
        { key: 'dim2_display', label: dimLabels[1], width: 0.20 },
        { key: 'dim3_display', label: dimLabels[2], width: 0.18 },
    ];

    const pdfTableRows = rows.map((row) => ({
        tipo: row.tipo,
        total: String(row.total),
        promedio_general: row.promedio_general,
        dim1_display: `${row.dim1} (${row.dim1_label})`,
        dim2_display: `${row.dim2} (${row.dim2_label})`,
        dim3_display: `${row.dim3} (${row.dim3_label})`,
    }));

    const commentsSummary = (recentComments || []).slice(0, 5).map((c) => {
        const typeTag = c.survey_type === 'delivery' ? 'Entrega' : 'Incidencia';
        return `[${typeTag} ${c.ref}] ${'*'.repeat(c.rating)} - ${String(c.comment).slice(0, 120)}`;
    }).join(' | ');

    return {
        type: REPORT_TYPES.SATISFACTION,
        title: 'Reporte - Satisfaccion del Cliente',
        columns,
        rows,
        pdfDefinition: {
            subtitle: `Indicadores de encuestas (${surveyType === 'all' ? 'Todas' : surveyType === 'delivery' ? 'Entregas' : 'Incidencias'})`,
            summaryItems: [
                { label: 'Periodo', value: `${dateFrom} a ${dateTo}` },
                { label: 'Total encuestas', value: String(kpis.totalSurveys) },
                { label: 'NPS (Net Promoter Score)', value: `${npsValue > 0 ? '+' : ''}${npsValue}` },
                { label: 'Promedio general', value: `${toPercent(kpis.overallAvg)} / 5.0` },
                ...kpis.dimensions.map((d) => ({ label: d.label, value: `${toPercent(d.avg)} / 5.0` })),
                { label: 'Tasa de respuesta', value: rrText },
                { label: 'Distribucion', value: distSummary || 'Sin datos' },
                ...(commentsSummary ? [{ label: 'Comentarios recientes', value: commentsSummary }] : []),
            ],
            table: {
                title: 'Detalle por tipo de encuesta',
                emptyMessage: 'No hay encuestas para el periodo seleccionado.',
                columns: pdfTableColumns,
                rows: pdfTableRows,
            },
        },
    };
};

module.exports = {
    REPORT_TYPES,
    buildDeliveryPerformanceExport,
    buildIncidentsByPeriodExport,
    buildOnTimeDeliveriesExport,
    buildPdf,
    buildReportFilename,
    buildSatisfactionExport,
    buildShipmentsByPeriodExport,
    buildCsv,
    renderReportExport,
};
