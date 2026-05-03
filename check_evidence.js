require('dotenv').config();
const s = require('./src/database/connection');

s.query(`
    SELECT 
        id, 
        "shipmentId", 
        "receiverName", 
        "receiverDni",
        CASE WHEN "photoBase64" IS NOT NULL THEN 'foto guardada' ELSE 'sin foto' END as foto,
        CASE WHEN latitude IS NOT NULL THEN 'gps guardado' ELSE 'sin gps' END as gps
    FROM logitrack."deliveryEvidence" 
    ORDER BY id DESC 
    LIMIT 5
`)
.then(([r]) => r.forEach(x => console.log(x)))
.catch(console.error)
.finally(() => s.close());
