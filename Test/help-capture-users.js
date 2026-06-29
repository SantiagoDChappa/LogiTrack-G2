'use strict';

/*
 * Crea (o elimina) usuarios TEMPORALES para generar las capturas del centro de
 * ayuda en pantallas de staff. En este entorno supervisor/admin tienen 2FA
 * OBLIGATORIO (el middleware desloguea a un staff sin 2FA), así que el usuario
 * se crea CON 2FA pero con un secreto que generamos acá: el script de capturas
 * genera el código TOTP al vuelo, sin depender de una app de autenticación.
 *
 * Un único usuario ADMIN alcanza: pasa todos los middlewares de supervisor y ve
 * los datos de todas las sucursales.
 *
 *   node Test/help-capture-users.js create    # crea + escribe .capture-creds.json
 *   node Test/help-capture-users.js cleanup   # elimina los usuarios y el archivo
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const { QueryTypes } = require('sequelize');

const sequelize = require('../src/database/connection');
const { User } = require('../src/models/user');
const { encrypt } = require('../src/utils/twoFactorCrypto');
const { RoleType } = require('../src/constants/enums');

const PW = process.env.HELP_PW || 'Test1234!';
const CREDS_FILE = path.join(__dirname, '.capture-creds.json');

// Usuarios temporales. Emails y documentos con marca clara para no confundirlos.
const SPECS = [
    {
        key: 'admin',
        email: 'help.capture.admin@logitrack.local',
        fullName: 'Help Capture Admin',
        document: 990000001,
        roleId: RoleType.ADMIN.id,
        branchId: null,
    },
];

async function create() {
    const creds = {};
    for (const spec of SPECS) {
        const secret = authenticator.generateSecret();
        const password = await bcrypt.hash(PW, 10);
        // Limpieza previa por si quedó de una corrida anterior (email/documento únicos).
        await User.destroy({ where: { email: spec.email } });
        const user = await User.create({
            fullName: spec.fullName,
            email: spec.email,
            password,
            document: spec.document,
            roleId: spec.roleId,
            active: true,
            branchId: spec.branchId,
            onboarded: true,
            mustChangePassword: false,
            twoFactorEnabled: true,
            twoFactorSecret: encrypt(secret),
        });
        creds[spec.key] = { email: spec.email, secret, id: user.id };
        console.error(`  ✔ creado ${spec.key}: ${spec.email} (id ${user.id})`);
    }
    fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
    console.error(`\n  Credenciales en ${path.relative(process.cwd(), CREDS_FILE)} (temporal, se borra en cleanup)`);
}

async function cleanup() {
    const emails = SPECS.map((s) => s.email);
    const users = await User.findAll({ where: { email: emails }, attributes: ['id', 'email'] });
    const ids = users.map((u) => u.id);
    if (!ids.length) {
        console.error('  No hay usuarios de captura para eliminar.');
    } else {
        // Borramos primero las filas hijas (FKs que apuntan a logitrack.user),
        // descubriéndolas dinámicamente, para evitar errores de integridad.
        const fks = await sequelize.query(
            `SELECT tc.table_schema AS schema, tc.table_name AS "table", kcu.column_name AS "column"
               FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage kcu
                 ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
               JOIN information_schema.constraint_column_usage ccu
                 ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
              WHERE tc.constraint_type = 'FOREIGN KEY'
                AND ccu.table_name = 'user' AND ccu.table_schema = 'logitrack'`,
            { type: QueryTypes.SELECT }
        );
        for (const fk of fks) {
            try {
                await sequelize.query(
                    `DELETE FROM "${fk.schema}"."${fk.table}" WHERE "${fk.column}" IN (:ids)`,
                    { replacements: { ids }, type: QueryTypes.DELETE }
                );
            } catch (e) {
                console.error(`  [aviso] no pude limpiar ${fk.table}.${fk.column}: ${e.message}`);
            }
        }
        const deleted = await User.destroy({ where: { id: ids } });
        console.error(`  ✔ eliminados ${deleted} usuario(s): ${users.map((u) => u.email).join(', ')}`);
    }
    if (fs.existsSync(CREDS_FILE)) {
        fs.unlinkSync(CREDS_FILE);
        console.error('  ✔ archivo de credenciales borrado');
    }
}

(async () => {
    const cmd = process.argv[2];
    if (cmd !== 'create' && cmd !== 'cleanup') {
        console.error('Uso: node Test/help-capture-users.js <create|cleanup>');
        process.exit(1);
    }
    try {
        if (cmd === 'create') { await create(); }
        else { await cleanup(); }
    } finally {
        await sequelize.close();
    }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
