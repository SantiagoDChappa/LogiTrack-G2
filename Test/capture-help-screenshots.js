/**
 * Captura de pantallas para el manual de usuario (Centro de ayuda).
 *
 * Genera las imágenes que consumen los artículos de /help y las guarda en
 * public/images/help/<slug>/<archivo>.png siguiendo la convención del manual.
 *
 * Requisitos (una sola vez):
 *   npm i -D playwright
 *   npx playwright install chromium
 *
 * Uso:
 *   1. Levantá la app:           npm run dev   (o npm start)
 *   2. Corré las capturas:       npm run help:screenshots
 *
 * Configuración por variables de entorno (todas opcionales):
 *   HELP_BASE_URL   URL base de la app           (default http://localhost:3000)
 *   HELP_PW         contraseña de las cuentas     (default Test1234!)
 *   HELP_EMAIL_SUP  email supervisor (roleId 1)   (default supervisor@test.com)
 *   HELP_EMAIL_OPE  email operador  (roleId 2)    (default operador@test.com)
 *   HELP_EMAIL_REP  email repartidor(roleId 3)    (default repartidor@test.com)
 *   HELP_EMAIL_ADM  email admin     (roleId 4)    (default admin@test.com)
 *
 * El script es resiliente: si un selector no existe, captura el viewport y avisa,
 * sin abortar el resto. Re-ejecutarlo regenera las capturas cuando cambie la UI.
 */
'use strict';

/* global document */ // usado dentro de page.evaluate (contexto del navegador)

const fs = require('fs');
const { authenticator } = require('otplib');
authenticator.options = { window: 1 };
const path = require('path');

let chromium;
try {
    ({ chromium } = require('playwright'));
} catch {
    console.error('\n[help:screenshots] Falta Playwright. Instalalo con:');
    console.error('  npm i -D playwright');
    console.error('  npx playwright install chromium\n');
    process.exit(1);
}

const BASE_URL = (process.env.HELP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const PW = process.env.HELP_PW || 'Test1234!';
const OUT_ROOT = path.join(__dirname, '..', 'public', 'images', 'help');

// Overrides opcionales por env. Si no se setean, se descubren leyendo el
// selector de "Cuenta de prueba" del login (cuentas reales del entorno).
// NOTA: en este entorno supervisor y admin tienen 2FA obligatorio. operador y
// repartidor tienen cuentas sin 2FA. Para capturar pantallas de supervisor/admin,
// seteá HELP_EMAIL_SUP/ADM (cuenta con 2FA YA configurado) + HELP_TOTP_SUP/ADM
// (el secreto base32 de la app de autenticación de esa cuenta).
const ACCOUNT_OVERRIDES = {
    supervisor: process.env.HELP_EMAIL_SUP || null,
    operador:   process.env.HELP_EMAIL_OPE || 'operador@logitrack.com.ar',
    repartidor: process.env.HELP_EMAIL_REP || 'repartidor@logitrack.com.ar',
    admin:      process.env.HELP_EMAIL_ADM || null,
};

// Secreto TOTP (base32) por rol, para pasar el segundo factor automáticamente.
const TOTP_SECRETS = {
    supervisor: process.env.HELP_TOTP_SUP || null,
    admin:      process.env.HELP_TOTP_ADM || null,
};

// Ancho de captura tipo "escritorio" para que las imágenes queden consistentes.
const VIEWPORT = { width: 1366, height: 850 };

/**
 * Lista de capturas a generar.
 *   slug:    carpeta destino (= slug del artículo)
 *   file:    nombre del archivo .png
 *   role:    cuenta con la que se navega
 *   url:     ruta relativa a capturar
 *   waitFor: (opcional) selector a esperar antes de capturar
 *   element: (opcional) selector a recortar; si falta, captura el viewport
 *   caption: (informativo) qué muestra la captura
 */
const TARGETS = [
    // --- primeros-pasos ---
    { slug: 'primeros-pasos', file: '01-inicio.png', role: 'operador', url: '/home',
      waitFor: '.main-content', caption: 'Inicio con menú lateral y barra superior' },
    { slug: 'primeros-pasos', file: '02-busqueda.png', role: 'operador', url: '/home',
      waitFor: '.top-header', element: '.top-header', caption: 'Barra superior con búsqueda, notificaciones y perfil' },

    // --- envios ---
    { slug: 'envios', file: '01-listado.png', role: 'operador', url: '/shipment',
      waitFor: '.main-content', caption: 'Listado de envíos' },
    { slug: 'envios', file: '02-crear.png', role: 'operador', url: '/shipment/new',
      waitFor: 'form', caption: 'Formulario de alta de envío' },

    // --- busqueda-universal ---
    { slug: 'busqueda-universal', file: '01-barra.png', role: 'operador', url: '/home',
      waitFor: '.top-header', element: '.top-header', caption: 'Barra de búsqueda del header' },
    { slug: 'busqueda-universal', file: '02-resultados.png', role: 'operador', url: '/home',
      waitFor: '#univ-search-input',
      type: { selector: '#univ-search-input', text: process.env.HELP_SEARCH_Q || 'ENV' },
      waitAfterType: '#univ-search-panel:not([hidden])',
      caption: 'Resultados de la búsqueda en vivo' },

    // --- panel-general ---
    { slug: 'panel-general', file: '01-panel.png', role: 'operador', url: '/home',
      waitFor: '.main-content', element: '.main-content', caption: 'Panel general con KPIs y accesos rápidos' },

    // --- mi-ruteo (repartidor) ---
    { slug: 'mi-ruteo', file: '01-mi-ruteo.png', role: 'repartidor', url: '/delivery',
      waitFor: '.main-content', caption: 'Mi Ruteo: ruta activa, progreso e historial' },

    // --- entregas-repartidor ---
    { slug: 'entregas-repartidor', file: '01-recorrido.png', role: 'repartidor',
      urlFrom: { page: '/delivery', linkSelector: 'a[href*="/delivery/route/"]', match: '^/delivery/route/\\d+$' },
      url: '/delivery', waitFor: '.main-content', caption: 'Recorrido de la ruta: mapa, paradas y estado de cada entrega' },

    // --- incidencias-repartidor ---
    { slug: 'incidencias-repartidor', file: '01-listado.png', role: 'repartidor', url: '/incident',
      waitFor: '.main-content', caption: 'Mis incidencias: listado con estado, prioridad y tipo' },
    { slug: 'incidencias-repartidor', file: '02-reportar.png', role: 'repartidor', url: '/incident/new',
      waitFor: '.main-content', caption: 'Reportar incidencia: envío, tipo, prioridad y descripción' },

    // ===== Pantallas de staff (capturadas como admin: ve todo y pasa los RBAC de supervisor) =====

    // --- Operaciones ---
    { slug: 'kanban', file: '01-tablero.png', role: 'admin', url: '/shipment/kanban',
      waitFor: '.main-content', caption: 'Tablero Kanban: envíos por estado en columnas' },
    { slug: 'ruteo', file: '01-ruteo.png', role: 'admin', url: '/route',
      waitFor: '.main-content', caption: 'Ruteo: selección de envíos, optimización y despacho' },
    { slug: 'incidencias', file: '01-listado.png', role: 'admin', url: '/incident',
      waitFor: '.main-content', caption: 'Incidencias: listado con estado, origen, prioridad y tipo' },
    { slug: 'incidencias', file: '02-crear.png', role: 'admin', url: '/incident/new',
      waitFor: '.main-content', caption: 'Alta de incidencia: envío, tipo, prioridad y descripción' },
    { slug: 'modificaciones-portal', file: '01-cola.png', role: 'admin', url: '/shipment/modifications',
      waitFor: '.main-content', caption: 'Modificaciones del portal: cola de solicitudes de clientes' },
    { slug: 'reportes', file: '01-volumen.png', role: 'admin', url: '/report/shipments-by-period',
      waitFor: '.main-content', caption: 'Reporte de volumen de envíos por período' },
    { slug: 'ojo-patron', file: '01-monitor.png', role: 'admin', url: '/fatigue',
      waitFor: '.main-content', caption: 'Ojo de Patrón: monitoreo de fatiga por repartidor' },
    { slug: 'notificaciones', file: '01-centro.png', role: 'admin', url: '/notifications',
      waitFor: '.main-content', caption: 'Centro de notificaciones con el historial de alertas' },

    // --- Administración ---
    { slug: 'import-csv', file: '01-importar.png', role: 'admin', url: '/shipment/import',
      waitFor: '.main-content', caption: 'Importar CSV: carga masiva con validación de filas' },
    { slug: 'usuarios-ajustes', file: '01-usuarios.png', role: 'admin', url: '/user/new',
      waitFor: '.main-content', caption: 'Alta de usuario: rol, sucursal y datos personales' },
    { slug: 'usuarios-ajustes', file: '02-ajustes.png', role: 'admin', url: '/setting/general',
      waitFor: '.main-content', caption: 'Ajustes del sistema: datos de empresa y parámetros' },
    { slug: 'transportes-zonas', file: '01-transportes.png', role: 'admin', url: '/transport',
      waitFor: '.main-content', caption: 'Transportes: flota con patente, tipo y repartidor' },
    { slug: 'transportes-zonas', file: '02-zonas.png', role: 'admin', url: '/zone',
      waitFor: '.main-content', caption: 'Zonas de cobertura asociadas a los transportes' },

    // --- Novedades jun 2026 ---
    { slug: 'cobro-envios', file: '01-detalle.png', role: 'operador',
      urlFrom: { page: '/shipment/search', linkSelector: 'a.detalle[href*="/shipment/detail/"]', match: '^/shipment/detail/\\d+' },
      url: '/shipment/search', waitFor: '#shipment-payment-block', element: '#shipment-payment-block',
      caption: 'Detalle del envío: badge de cobro y formulario Registrar cobro' },
    { slug: 'copiloto-voz', file: '01-controles.png', role: 'repartidor',
      urlFrom: { page: '/delivery', linkSelector: 'a[href*="/delivery/route/"]', match: '^/delivery/route/\\d+$' },
      url: '/delivery', waitFor: '#btn-voice',
      clipSelectors: ['#btn-voice', '#btn-voice-wake'],
      caption: 'Copiloto de voz: micrófono y modo escucha en la barra de acciones' },
];

async function login(page, email, role) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('#user-email', email);
    await page.fill('#password', PW);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
        page.click('.login-btn'),
    ]);
    let url = page.url();

    // Segundo factor: si hay secreto TOTP para el rol, generamos el código y lo enviamos.
    if (url.includes('/login/2fa') && !url.includes('/login/2fa/setup')) {
        const secret = TOTP_SECRETS[role];
        if (!secret) {
            throw new Error(`"${email}" pide 2FA y no hay secreto TOTP para el rol "${role}" (seteá HELP_TOTP_${role === 'admin' ? 'ADM' : 'SUP'})`);
        }
        const code = authenticator.generate(secret);
        await page.fill('#token', code);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
            page.click('.login-btn'),
        ]);
        url = page.url();
    }

    if (url.includes('/login/2fa/setup')) {
        throw new Error(`"${email}" requiere ENROLAR 2FA (setup). Usá una cuenta con 2FA ya configurado.`);
    }
    if (url.includes('/login/2fa')) {
        throw new Error(`2FA falló para ${email} (¿secreto TOTP incorrecto o reloj desfasado?)`);
    }
    if (url.includes('/login')) {
        const err = await page.$eval('.login-error', (n) => n.textContent.trim()).catch(() => '');
        throw new Error(`Login falló para ${email}${err ? ' (' + err + ')' : ' (¿credenciales?)'}`);
    }
}

async function dismissTour(page) {
    await page.evaluate(() => {
        document.querySelectorAll(
            '.driver-overlay, .driver-popover, .driver-popover-wrapper, .driver-stage, .driver-page-overlay, svg.driver-overlay, #tfa-nudge, #whats-new-backdrop'
        ).forEach((el) => el.remove());
        document.documentElement.classList.remove('driver-active', 'driver-fade', 'driver-simple');
        if (document.body) { document.body.classList.remove('driver-active', 'driver-fade'); }
        document.documentElement.style.overflow = '';
        if (document.body) { document.body.style.overflow = ''; }
    }).catch(() => {});
    await page.waitForTimeout(150);
}

async function screenshotUnion(page, selectors, dest) {
    const box = await page.evaluate((sels) => {
        const pad = 10;
        let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
        for (const sel of sels) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            minX = Math.min(minX, r.left);
            minY = Math.min(minY, r.top);
            maxX = Math.max(maxX, r.right);
            maxY = Math.max(maxY, r.bottom);
        }
        if (!Number.isFinite(minX)) return null;
        return {
            x: Math.max(0, minX - pad),
            y: Math.max(0, minY - pad),
            width: maxX - minX + pad * 2,
            height: maxY - minY + pad * 2,
        };
    }, selectors);
    if (!box || box.width < 1 || box.height < 1) return false;
    await page.screenshot({ path: dest, clip: box });
    return true;
}

async function capture(context, target) {
    const page = await context.newPage();
    const dir = path.join(OUT_ROOT, target.slug);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, target.file);

    try {
        let url = target.url;
        // URL dinámica: navegamos a una página índice y tomamos el primer link
        // que matchee (ej: la ruta activa del repartidor en /delivery).
        if (target.urlFrom) {
            await page.goto(`${BASE_URL}${target.urlFrom.page}`, { waitUntil: 'networkidle' });
            const re = new RegExp(target.urlFrom.match);
            const href = await page.$$eval(
                target.urlFrom.linkSelector,
                (as, pattern) => {
                    const rx = new RegExp(pattern);
                    const found = as.map((a) => a.getAttribute('href')).find((h) => h && rx.test(h));
                    return found || null;
                },
                target.urlFrom.match
            ).catch(() => null);
            if (href && re.test(href)) { url = href; }
            else { console.warn(`  [aviso] no encontré URL dinámica para ${target.slug}/${target.file}`); }
        }
        await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle' });
        if (target.waitFor) {
            await page.waitForSelector(target.waitFor, { timeout: 8000 }).catch(() => {});
        }
        if (target.type && target.type.selector) {
            await page.click(target.type.selector).catch(() => {});
            await page.fill(target.type.selector, target.type.text).catch(() => {});
            if (target.waitAfterType) {
                await page.waitForSelector(target.waitAfterType, { timeout: 6000 }).catch(() => {});
            }
            await page.waitForTimeout(600); // debounce de la búsqueda
        }
        await page.waitForTimeout(400); // pequeño respiro para fuentes/íconos

        // Tour de onboarding y modal de novedades pueden tapar la captura.
        await dismissTour(page);

        if (target.element) {
            await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
            }, target.element).catch(() => {});
            await page.waitForTimeout(200);
        }

        let shot = null;
        if (target.clipSelectors && target.clipSelectors.length) {
            for (const sel of target.clipSelectors) {
                await page.evaluate((s) => {
                    const el = document.querySelector(s);
                    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
                }, sel).catch(() => {});
            }
            await page.waitForTimeout(200);
            const ok = await screenshotUnion(page, target.clipSelectors, dest);
            if (ok) {
                console.log(`  ✔ ${target.slug}/${target.file}`);
                return;
            }
            console.warn(`  [aviso] no pude recortar ${target.clipSelectors.join(', ')}`);
        }
        if (target.element) {
            shot = await page.$(target.element);
        }
        if (shot) {
            await shot.screenshot({ path: dest });
        } else {
            if (target.element) {
                console.warn(`  [aviso] no se encontró "${target.element}", capturo viewport`);
            }
            await page.screenshot({ path: dest, fullPage: !!target.fullPage });
        }
        console.log(`  ✔ ${target.slug}/${target.file}`);
    } catch (err) {
        console.error(`  ✘ ${target.slug}/${target.file}: ${err.message}`);
    } finally {
        await page.close();
    }
}

// Descubre las cuentas de prueba reales leyendo el selector del login,
// salvo que se hayan fijado por variables de entorno.
async function resolveAccounts(browser, overrides) {
    const map = { ...overrides };
    const labelToRole = {
        'Supervisor': 'supervisor', 'Operador': 'operador',
        'Repartidor': 'repartidor', 'Administrador': 'admin',
    };
    const page = await browser.newPage();
    try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
        const groups = await page.$$eval('#dev-accounts optgroup', (ogs) =>
            ogs.map((og) => ({
                label: og.label,
                emails: Array.from(og.querySelectorAll('option'))
                    .map((o) => o.value).filter(Boolean),
            }))
        );
        for (const g of groups) {
            const role = labelToRole[g.label];
            if (role && !map[role] && g.emails.length) { map[role] = g.emails[0]; }
        }
    } catch (e) {
        console.error('  [aviso] no pude leer cuentas del login:', e.message);
    } finally {
        await page.close();
    }
    return map;
}

// Credenciales de usuarios temporales creados por help-capture-users.js
// (email + secreto TOTP de supervisor/admin para pasar el 2FA automáticamente).
function loadCaptureCreds() {
    try {
        const f = path.join(__dirname, '.capture-creds.json');
        if (fs.existsSync(f)) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
    } catch { /* sin credenciales */ }
    return {};
}

async function main() {
    console.log(`\n[help:screenshots] Base URL: ${BASE_URL}`);
    fs.mkdirSync(OUT_ROOT, { recursive: true });

    // Si hay usuarios temporales creados, usamos su email + secreto TOTP (salvo override por env).
    const creds = loadCaptureCreds();
    for (const role of ['supervisor', 'admin']) {
        if (!ACCOUNT_OVERRIDES[role] && creds[role] && creds[role].email) {
            ACCOUNT_OVERRIDES[role] = creds[role].email;
        }
        if (!TOTP_SECRETS[role] && creds[role] && creds[role].secret) {
            TOTP_SECRETS[role] = creds[role].secret;
        }
    }

    const browser = await chromium.launch();
    const accounts = await resolveAccounts(browser, ACCOUNT_OVERRIDES);

    // Agrupamos las capturas por rol para loguear una sola vez por cuenta.
    const byRole = TARGETS.reduce((acc, t) => {
        (acc[t.role] = acc[t.role] || []).push(t);
        return acc;
    }, {});

    for (const [role, targets] of Object.entries(byRole)) {
        const email = accounts[role];
        if (!email) {
            console.error(`  ✘ sin cuenta para rol "${role}" — salteo (seteá HELP_EMAIL_* o creá la cuenta)`);
            continue;
        }
        console.log(`\n▶ Rol "${role}" (${email})`);
        const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
        const page = await context.newPage();
        try {
            await login(page, email, role);
        } catch (err) {
            console.error(`  ✘ ${err.message} — salteo las capturas de este rol`);
            await context.close();
            continue;
        }
        // Marcamos la cuenta como onboarded para que el tour no se autolance
        // ni redirija a /home en la primera navegación a otra pantalla.
        await page.evaluate(() => fetch('/api/onboarding/complete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
        }).catch(() => {})).catch(() => {});
        await page.waitForTimeout(300);
        await page.close();
        for (const target of targets) {
            await capture(context, target);
        }
        await context.close();
    }

    await browser.close();
    console.log('\n[help:screenshots] Listo. Imágenes en public/images/help/<slug>/\n');
}

main().catch((err) => {
    console.error('Error fatal:', err);
    process.exit(1);
});
