require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const cookieParser = require('cookie-parser');
const app     = express();
const port    = process.env.PORT || 3000;

const sequelize = require('./src/database/connection');
// Load models and associations
require('./src/models/index');
const { runMigrations } = require('./src/database/migrate');
const swaggerSpec = require('./src/docs/swagger');
const { requireAuth, requireSupervisor } = require('./src/middlewares/auth');

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
const authRoutes        = require('./src/routes/auth');
const deliveryRoutes = require('./src/routes/delivery');
const scanRoutes     = require('./src/routes/scan');
const personRoutes = require('./src/routes/person');
const portalRoutes        = require('./src/routes/portal');
const chatbotRoutes       = require('./src/routes/chatbot');
const routeRoutes      = require('./src/routes/route');
const transportRoutes  = require('./src/routes/transport');
const zoneRoutes       = require('./src/routes/zone');

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

app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// Helpers globales para EJS
app.use((req, res, next) => {
    res.locals.fmtMoney = (n) => '$' + Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    res.locals.fmtNumber = (n, dec = 2) => Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    next();
});

// Rutas Publicas
app.use('/', portalRoutes);
app.use('/chatbot', chatbotRoutes);
app.use('/', authRoutes);


app.use(apiHealthRoutes);

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
app.use('/api-docs',      requireAuth, requireSupervisor, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/delivery', requireAuth, deliveryRoutes);
app.use('/scan',     requireAuth, scanRoutes);
const routeCtrl = require('./src/controllers/route');
app.get('/route/scan/:id',           requireAuth, routeCtrl.getScanPage);
app.post('/route/scan/:id/dispatch', requireAuth, routeCtrl.dispatchRoute);
app.use('/route',     requireAuth, requireSupervisor, routeRoutes);
app.use('/transport', requireAuth, requireSupervisor, transportRoutes);
app.use('/zone',      requireAuth, requireSupervisor, zoneRoutes);

;
app.use('/api/persons',personRoutes);

/*app.use((req, res) => {
    const token = req.cookies?.token;
    if (token) {
        try {
            require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
            return res.redirect('/');
        } catch {
            res.clearCookie('token');
        }
    }
    res.redirect('/login');
});*/

if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.warn(`LogiTrack running at http://localhost:${port}`);
    });
}

module.exports = app;
