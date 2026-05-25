const {
    getShipmentsByPeriodData,
    getOnTimeDeliveriesData,
    getDeliveryPerformanceData,
    getIncidentsByPeriodData,
} = require('../services/reportData');
const {
    buildDeliveryPerformanceExport,
    buildIncidentsByPeriodExport,
    buildOnTimeDeliveriesExport,
    buildReportFilename,
    buildShipmentsByPeriodExport,
    renderReportExport,
} = require('../services/reportExport');

const getShipmentsByPeriod = async (req, res) => {
    const viewModel = await getShipmentsByPeriodData(req.query);
    res.render('report/shipments-by-period', viewModel);
};

const getOnTimeDeliveries = async (req, res) => {
    const viewModel = await getOnTimeDeliveriesData(req.query);
    res.render('report/on-time-deliveries', viewModel);
};

const getDeliveryPerformance = async (req, res) => {
    const viewModel = await getDeliveryPerformanceData(req.query);
    res.render('report/delivery-performance', viewModel);
};

const sendExport = (res, definition, format) => {
    const artifact = renderReportExport(definition, format);
    res.setHeader('Content-Type', artifact.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${buildReportFilename(definition.type, artifact.extension)}"`);
    res.send(artifact.body);
};

const exportShipmentsByPeriod = async (req, res) => {
    try {
        const report = await getShipmentsByPeriodData(req.query);
        if (report.error) {
            return res.status(400).send(report.error);
        }
        sendExport(res, buildShipmentsByPeriodExport(report), req.query.format);
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).send(statusCode === 400 ? err.message : 'Error al exportar el reporte');
    }
};

const exportOnTimeDeliveries = async (req, res) => {
    try {
        const report = await getOnTimeDeliveriesData(req.query);
        if (report.error) {
            return res.status(400).send(report.error);
        }
        sendExport(res, buildOnTimeDeliveriesExport(report), req.query.format);
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).send(statusCode === 400 ? err.message : 'Error al exportar el reporte');
    }
};

const exportDeliveryPerformance = async (req, res) => {
    try {
        const report = await getDeliveryPerformanceData(req.query);
        if (report.error) {
            return res.status(400).send(report.error);
        }
        sendExport(res, buildDeliveryPerformanceExport(report), req.query.format);
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).send(statusCode === 400 ? err.message : 'Error al exportar el reporte');
    }
};

const getIncidentsByPeriod = async (req, res) => {
    const viewModel = await getIncidentsByPeriodData(req.query);
    res.render('report/incidents-by-period', viewModel);
};

const exportIncidentsByPeriod = async (req, res) => {
    try {
        const report = await getIncidentsByPeriodData(req.query);
        if (report.error) {
            return res.status(400).send(report.error);
        }
        sendExport(res, buildIncidentsByPeriodExport(report), req.query.format);
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).send(statusCode === 400 ? err.message : 'Error al exportar el reporte');
    }
};

module.exports = {
    exportDeliveryPerformance,
    exportIncidentsByPeriod,
    exportOnTimeDeliveries,
    exportShipmentsByPeriod,
    getDeliveryPerformance,
    getIncidentsByPeriod,
    getOnTimeDeliveries,
    getShipmentsByPeriod,
};
