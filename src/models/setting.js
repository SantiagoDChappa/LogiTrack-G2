const { DataTypes } = require('sequelize');
const sequelize     = require('../database/connection');

const Setting = sequelize.define('setting', {
    id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key:   { type: DataTypes.STRING,  unique: true, allowNull: false },
    value: { type: DataTypes.TEXT,    allowNull: false },
}, { tableName: 'setting', timestamps: false });

// El base64 del logo es grande; no debe viajar en cada request (auth middleware llama getAll()).
// Se lee aparte sólo por la ruta que sirve la imagen.
const HEAVY_KEYS = ['logo_empresa_data'];

// Cache en memoria con TTL corto. Los settings cambian casi nunca pero se leen en
// CADA request (auth middleware -> getAll; portal `/` -> get x3). Sin cache eso es
// transferencia constante contra Neon (quemaba la cuota de egress del free tier).
// TTL chico => cambios desde Ajustes propagan en <= TTL. set() invalida al instante
// en este proceso (Render free = instancia única; multi-instancia se cubre con el TTL).
const CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS) || 60000;
const keyCache = new Map();   // key -> { value, exp }
let allCache   = null;        // { value, exp }

const get = async (key) => {
    const hit = keyCache.get(key);
    if (hit && hit.exp > Date.now()) { return hit.value; }
    const row = await Setting.findOne({ where: { key } });
    const value = row ? row.value : null;
    keyCache.set(key, { value, exp: Date.now() + CACHE_TTL_MS });
    return value;
};

const set = async (key, value) => {
    await Setting.upsert({ key, value });
    keyCache.delete(key);   // invalida la clave puntual
    allCache = null;        // y el snapshot de getAll
};

const getAll = async () => {
    if (allCache && allCache.exp > Date.now()) { return { ...allCache.value }; }
    const rows   = await Setting.findAll();
    const result = {};
    rows.forEach(r => { if (!HEAVY_KEYS.includes(r.key)) { result[r.key] = r.value; } });
    allCache = { value: result, exp: Date.now() + CACHE_TTL_MS };
    return { ...result };
};

module.exports = { Setting, get, set, getAll };
