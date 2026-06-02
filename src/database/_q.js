require('dotenv').config();
const seq = require('./connection');
(async () => {
    const [cols] = await seq.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='logitrack' AND table_name='user' ORDER BY ordinal_position");
    console.log('USER COLS:', JSON.stringify(cols));
    const [users] = await seq.query("SELECT * FROM logitrack.user WHERE email LIKE 's30%@logitrack.com.ar' ORDER BY email LIMIT 20");
    console.log('USERS_S3:', JSON.stringify(users));
    const [ships] = await seq.query("SELECT id, tracking_id, status_id, delivery_secret_code, portal_token, delivery_mode FROM logitrack.shipment WHERE tracking_id LIKE 'S3-%' ORDER BY tracking_id");
    console.log('SHIPMENTS:', JSON.stringify(ships));
    const [settings] = await seq.query("SELECT key, value FROM logitrack.setting WHERE key LIKE '%notif%' OR key IN ('codigoClaveEntregaObligatorio','bot.enabled','maxAttempts') ORDER BY key");
    console.log('SETTINGS:', JSON.stringify(settings));
    const [wins] = await seq.query('SELECT * FROM logitrack.delivery_time_window ORDER BY id');
    console.log('WINDOWS:', JSON.stringify(wins));
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
