require('dotenv').config();

// El host (Render) corre en UTC. Fijamos GMT-03 como baseline para que las fechas
// renderizadas con toLocaleString (vistas aún no migradas al helper) no salgan en GMT+00.
// Override por env TZ; el formato fino (zona/12-24hs) se parametriza desde Ajustes.
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

const express = require('express');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const cookieParser = require('cookie-parser');
const app     = express();
const port    = process.env.PORT || 3000;

const sequelize = require('./src/database/connection');
// Load models and associations
require('./src/models/index');
const { runMigrations } = require('./src/database/migrate');
const swaggerSpec = require('./src/docs/swagger');
const { requireAuth, requireSupervisor, requireSupervisorOrOperator } = require('./src/middlewares/auth');

const homeRoutes        = require('./src/routes/home');
const shipmentRoutes    = require('./src/routes/shipment');
const userRoutes        = require('./src/routes/user');
const settingRoutes     = require('./src/routes/setting');
const apiShipmentRoutes = require('./src/routes/api/shipments');
const apiHealthRoutes   = require('./src/routes/api/health');
const apiPredictRoutes   = require('./src/routes/api/predict');
const apiMlHealthRoutes  = require('./src/routes/api/ml-health');
const apiDistanceRoutes = require('./src/routes/api/distance');
const apiSuggestDeliveryRoutes = require('./src/routes/api/suggest-delivery');
const apiValidateAddressRoutes = require('./src/routes/api/validate-address');
const apiAddressSuggestRoutes  = require('./src/routes/api/address-suggest');
const apiRouteRoutes           = require('./src/routes/api/route');
const apiBranchesRoutes        = require('./src/routes/api/branches');
const authRoutes        = require('./src/routes/auth');
const deliveryRoutes = require('./src/routes/delivery');
const scanRoutes     = require('./src/routes/scan');
const personRoutes = require('./src/routes/person');
const portalRoutes        = require('./src/routes/portal');
const chatbotRoutes       = require('./src/routes/chatbot');
const routeRoutes      = require('./src/routes/route');
const transportRoutes  = require('./src/routes/transport');
const zoneRoutes       = require('./src/routes/zone');
const incidentRoutes   = require('./src/routes/incident');
const reportRoutes     = require('./src/routes/report');
const notificationRoutes = require('./src/routes/notification');
const shipmentModificationRoutes = require('./src/routes/shipmentModification');
const fatigueRoutes    = require('./src/routes/fatigue');


// Conecto la base de datos con el sistema y aplico migraciones pendientes.
const path = require('path');

if (process.env.NODE_ENV === 'test') {
    sequelize.authenticate()
        .then(() => console.warn('Base de datos conectada (test)'))
        .catch(err => console.error('Error de DB (test):', err));
} else {
    sequelize.authenticate()
        .then(() => runMigrations())
        .then(() => console.warn('Base de datos conectada y migrada'))
        .catch(err => console.error('Error de DB:', err));
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Headers de seguridad (X-Frame-Options, nosniff, HSTS en prod, etc.).
// CSP deshabilitado: las vistas usan inline scripts/styles y CDNs (Leaflet, SweetAlert).
const helmet = require('helmet');
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// Compresion gzip de todas las respuestas (HTML/CSS/JS/JSON). Reduce payload ~70%.
// threshold 1KB: no comprime respuestas chicas (costo CPU > beneficio).
app.use(compression({ threshold: 1024 }));

// Assets estaticos con cache de 7 dias en prod (1 dia en dev). Evita re-download
// de CSS/JS/imagenes en cada navegacion. Cambios se invalidan editando el archivo
// (express agrega ETag por default).
const STATIC_MAX_AGE_MS = process.env.NODE_ENV === 'production'
    ? 7 * 24 * 60 * 60 * 1000   // 7 dias
    : 1 * 60 * 60 * 1000;        // 1 hora dev
app.use(express.static('public', {
    maxAge: STATIC_MAX_AGE_MS,
    etag: true,
    lastModified: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// Helpers globales para EJS
const { IncidentStatusLabel, IncidentResolutionLabel } = require('./src/constants/enums');
app.use((req, res, next) => {
    res.locals.fmtMoney = (n) => '$' + Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    res.locals.fmtNumber = (n, dec = 2) => Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    res.locals.IncidentStatusLabel = IncidentStatusLabel;
    res.locals.IncidentResolutionLabel = IncidentResolutionLabel;
    next();
});

// Rutas Publicas
app.use('/', portalRoutes);
app.use('/chatbot', chatbotRoutes);
app.use('/', authRoutes);


app.use('/api/health', apiHealthRoutes);

// Logo institucional servido desde la base (público: login, portal, encabezado).
app.use('/brand', require('./src/routes/brand'));

// Rutas Protegidas
app.use('/home', requireAuth, homeRoutes);
app.use('/user',          requireAuth, requireSupervisor, userRoutes);
app.use('/shipment',      requireAuth, shipmentRoutes);
app.use('/setting',       requireAuth, requireSupervisor, settingRoutes);
app.use('/api/shipments', requireAuth, requireSupervisor, apiShipmentRoutes);
app.use('/api/predict',    requireAuth, apiPredictRoutes);
app.use('/api/ml-health',  requireAuth, apiMlHealthRoutes);
app.use('/api/distance',         requireAuth, apiDistanceRoutes);
app.use('/api/suggest-delivery', requireAuth, apiSuggestDeliveryRoutes);
app.use('/api/validate-address',  requireAuth, apiValidateAddressRoutes);
app.use('/api/address-suggest',   requireAuth, apiAddressSuggestRoutes);
app.use('/api/route',             requireAuth, apiRouteRoutes);
app.use('/api/branches',          requireAuth, apiBranchesRoutes);
app.use('/api-docs',      requireAuth, requireSupervisor, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/delivery', requireAuth, deliveryRoutes);
app.use('/scan',     requireAuth, scanRoutes);
const routeCtrl = require('./src/controllers/route');
app.get('/route/scan/:id',           requireAuth, routeCtrl.getScanPage);
app.post('/route/scan/:id/dispatch', requireAuth, routeCtrl.dispatchRoute);
app.use('/route',     requireAuth, requireSupervisor, routeRoutes);
app.use('/transport', requireAuth, requireSupervisor, transportRoutes);
app.use('/zone',      requireAuth, requireSupervisor, zoneRoutes);
app.use('/incident',  requireAuth, incidentRoutes);
app.use('/shipment/modifications', requireAuth, requireSupervisorOrOperator, shipmentModificationRoutes);
app.use('/report',    requireAuth, requireSupervisor, reportRoutes);
app.use('/notification', requireAuth, requireSupervisor, notificationRoutes);
app.use('/fatigue',   requireAuth, fatigueRoutes);

// PII (nombre/email/telefono por documento): SOLO usuarios logueados.
app.use('/api/persons', requireAuth, personRoutes);

// ── 404: ruta no encontrada ──────────────────────────────────────────────
app.use((req, res) => {
    // APIs reciben JSON; navegacion recibe la pagina de error.
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Recurso no encontrado' });
    }
    res.status(404).render('error', { status: 404, message: 'Página no encontrada' });
});

// ── Error handler global: evita stack traces o paginas en blanco ─────────
// Express 5 enruta promesas rechazadas de controllers async hasta aca.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);
    if (res.headersSent) { return; }
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
    res.status(500).render('error', {
        status:  500,
        message: 'Ocurrió un error inesperado. Intentá de nuevo.',
        // stack solo visible fuera de produccion (error.ejs ya lo oculta en prod).
        stack:   process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

if (process.env.ENABLE_EMAIL_JOBS === 'true') {
    const scheduler = require('./src/cron/scheduler');
    scheduler.startSchedulers();
};


if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.warn(`LogiTrack running at http://localhost:${port}`);
        // Sprint 3 - 4.1 / 3.2: backfill async (no bloquea boot)
        require('./src/utils/backfillShipmentTokens').run().catch(() => {});
    });
}

module.exports = app;
