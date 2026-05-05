/* eslint-disable no-console */
/**
 * Script: seedUsers.js
 * Crea 4 usuarios por cada rol y exporta las credenciales en un archivo Excel.
 *
 * Uso: node src/scripts/seedUsers.js
 *
 * Requiere: DATABASE_URL en .env
 *           exceljs instalado (npm install exceljs)
 */

require('dotenv').config();
const bcrypt    = require('bcryptjs');
const path      = require('path');
const ExcelJS   = require('exceljs');
const sequelize = require('../database/connection');
const { User }  = require('../models/user');

const SALT_ROUNDS = 12;

// ── Definición de roles (debe coincidir con logitrack.roleType) ──────────────
const ROLES = [
    { id: 1, name: 'Supervisor'    },
    { id: 2, name: 'Operador'      },
    { id: 3, name: 'Repartidor'    },
    { id: 4, name: 'Administrador' },
];

// ── Generación de usuarios: 4 por rol ────────────────────────────────────────
const buildUsers = () => {
    const users = [];
    let docBase = 90000001;

    for (const role of ROLES) {
        for (let i = 1; i <= 4; i++) {
            const roleLower  = role.name.toLowerCase().replace(/\s+/g, '');
            const email      = `${roleLower}${i}@logitrack.com.ar`;
            const password   = `${roleLower}${i}_2025`;
            const fullName   = `${role.name} ${i}`;
            const document   = docBase++;

            users.push({ fullName, email, password, document, roleId: role.id, roleName: role.name });
        }
    }

    return users;
};

// ── Inserción en la base de datos ────────────────────────────────────────────
const seedDatabase = async (users) => {
    const results = [];

    for (const u of users) {
        try {
            const hashedPassword = await bcrypt.hash(u.password, SALT_ROUNDS);
            await User.create({
                fullName: u.fullName,
                email:    u.email,
                password: hashedPassword,
                document: u.document,
                roleId:   u.roleId,
                active:   true,
            });
            results.push({ ...u, status: 'creado' });
            console.log(`  ✓ ${u.email}`);
        } catch (err) {
            const msg = err.message || String(err);
            results.push({ ...u, status: `error: ${msg}` });
            console.warn(`  ✗ ${u.email} — ${msg}`);
        }
    }

    return results;
};

// ── Exportación a Excel ───────────────────────────────────────────────────────
const exportExcel = async (results) => {
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'LogiTrack';
    wb.created  = new Date();

    const ws = wb.addWorksheet('Credenciales');

    // Encabezados
    ws.columns = [
        { header: 'Nombre completo', key: 'fullName', width: 22 },
        { header: 'Email',           key: 'email',    width: 36 },
        { header: 'Contraseña',      key: 'password', width: 20 },
        { header: 'DNI / Documento', key: 'document', width: 18 },
        { header: 'Rol',             key: 'roleName', width: 16 },
        { header: 'Estado',          key: 'status',   width: 20 },
    ];

    // Estilo de cabecera
    const headerRow = ws.getRow(1);
    headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height    = 20;

    // Colores alternados por rol
    const roleColors = {
        'Supervisor':    'FFD6E4F0',
        'Operador':      'FFD9EAD3',
        'Repartidor':    'FFFFF2CC',
        'Administrador': 'FFFCE5CD',
    };

    for (const r of results) {
        const row = ws.addRow(r);
        const color = roleColors[r.roleName] || 'FFFFFFFF';
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        row.alignment = { vertical: 'middle' };

        // Marcar errores en rojo
        if (r.status.startsWith('error')) {
            row.getCell('status').font = { color: { argb: 'FFCC0000' }, bold: true };
        } else {
            row.getCell('status').font = { color: { argb: 'FF274E13' } };
        }
    }

    // Bordes en todas las celdas con datos
    ws.eachRow((row) => {
        row.eachCell((cell) => {
            cell.border = {
                top:    { style: 'thin' },
                left:   { style: 'thin' },
                bottom: { style: 'thin' },
                right:  { style: 'thin' },
            };
        });
    });

    const outPath = path.join(process.cwd(), 'credenciales_usuarios.xlsx');
    await wb.xlsx.writeFile(outPath);
    return outPath;
};

// ── Main ──────────────────────────────────────────────────────────────────────
const main = async () => {
    try {
        console.log('Conectando a la base de datos...');
        await sequelize.authenticate();
        console.log('Conexión exitosa.\n');

        const users = buildUsers();

        console.log(`Insertando ${users.length} usuarios (4 por rol)...`);
        const results = await seedDatabase(users);

        console.log('\nExportando Excel...');
        const xlsxPath = await exportExcel(results);
        console.log(`\nArchivo generado: ${xlsxPath}`);

        const ok  = results.filter(r => r.status === 'creado').length;
        const err = results.filter(r => r.status.startsWith('error')).length;
        console.log(`\nResumen: ${ok} creados, ${err} errores.`);
    } catch (err) {
        console.error('Error fatal:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
};

main();
