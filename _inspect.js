require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const s = new Sequelize(process.env.DATABASE_URL, { dialect:'postgres', logging:false, dialectOptions:{ ssl:{ require:true, rejectUnauthorized:false } } });
const q = (sql) => s.query(sql, { type: QueryTypes.SELECT });
(async()=>{
 try{
  await s.authenticate();
  const reg=['fatigue_check','fatigue_config','fatigue_audit','fatigue_pattern_counter','route_fatigue_session','driver_fatigue_status','route','route_stop','transport','incident','incident_type','incidentHistory','incident_history','person','shipment','address'];
  console.log('=== to_regclass existence ===');
  for(const t of reg){ const r=await q(`SELECT to_regclass('logitrack."${t}"') AS x`); console.log((r[0].x?'OK  ':'MISS')+' '+t); }

  console.log('\n=== incident_type rows ===');
  console.table(await q(`SELECT id,code,description,active FROM logitrack.incident_type ORDER BY id`).catch(e=>[{err:e.message}]));

  console.log('\n=== fatigue_config rows ===');
  console.table(await q(`SELECT * FROM logitrack.fatigue_config ORDER BY id`).catch(e=>[{err:e.message}]));

  console.log('\n=== max ids ===');
  for(const t of ['route','transport','shipment','person','address','incident']){
    const r=await q(`SELECT max(id) m, count(*) c FROM logitrack."${t}"`).catch(e=>[{m:'ERR:'+e.message,c:''}]);
    console.log(t, JSON.stringify(r[0]));
  }
 }catch(e){ console.error('ERR', e.message); } finally { await s.close(); }
})();
