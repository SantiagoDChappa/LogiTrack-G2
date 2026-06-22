'use strict';

const express = require('express');
const request = require('supertest');

const helpRoutes = require('../src/routes/help');

const buildApp = (currentUser) => {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', require('path').join(__dirname, '../src/views'));
    app.use((req, res, next) => {
        res.locals.currentUser = currentUser;
        res.locals.assetVersion = 'test';
        res.locals.nombreEmpresa = 'LogiTrack';
        next();
    });
    app.use('/help', helpRoutes);
    app.use((req, res) => res.status(404).send('not found'));
    return app;
};

describe('Help center', () => {
    test('admin ve el índice de ayuda', async () => {
        const res = await request(buildApp({ id: 1, roleId: 4, fullName: 'Admin' }))
            .get('/help')
            .expect(200);

        expect(res.text).toContain('Centro de ayuda');
        expect(res.text).toContain('Importar envíos por CSV');
    });

    test('repartidor no ve artículos de admin', async () => {
        const res = await request(buildApp({ id: 2, roleId: 3, fullName: 'Repartidor' }))
            .get('/help')
            .expect(200);

        expect(res.text).toContain('Mi ruteo');
        expect(res.text).not.toContain('Importar envíos por CSV');
    });

    test('artículo accesible por rol', async () => {
        await request(buildApp({ id: 2, roleId: 3, fullName: 'Repartidor' }))
            .get('/help/mi-ruteo')
            .expect(200);
    });

    test('artículo restringido devuelve 404', async () => {
        await request(buildApp({ id: 2, roleId: 3, fullName: 'Repartidor' }))
            .get('/help/import-csv')
            .expect(404);
    });

    test('glosario accesible para todos los roles staff y repartidor', async () => {
        const res = await request(buildApp({ id: 3, roleId: 3, fullName: 'Repartidor' }))
            .get('/help/glosario')
            .expect(200);

        expect(res.text).toContain('Glosario');
        expect(res.text).toContain('Ojo de Patrón');
    });

    test('índice muestra banner de glosario y tours', async () => {
        const res = await request(buildApp({ id: 1, roleId: 4, fullName: 'Admin' }))
            .get('/help')
            .expect(200);

        expect(res.text).toContain('Tours contextuales');
        expect(res.text).toContain('/help/glosario');
    });

    test('operador ve portal-cliente-staff pero no transportes-zonas', async () => {
        const res = await request(buildApp({ id: 4, roleId: 2, fullName: 'Operador' }))
            .get('/help')
            .expect(200);

        expect(res.text).toContain('Portal del cliente');
        expect(res.text).not.toContain('Transportes y zonas');
    });
});
