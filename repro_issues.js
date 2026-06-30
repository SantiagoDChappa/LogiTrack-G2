
/* eslint-disable no-console */
const shipmentModel = require('./src/models/shipment');
const personModel = require('./src/models/person');
const userModel = require('./src/models/user');
const sequelize = require('./src/database/connection');

async function testIssues() {
    try {
        console.log('--- VALIDANDO ERRORES ---');

        // 1. Validar bloqueo de duplicados involucrados
        console.log('\n1. Test: Bloqueo de duplicados');
        const doc = 12345678;
        // Simulamos lo que hace el middleware
        const exists = await shipmentModel.existsByDocument(doc);
        console.log(`¿Existe ya un envío para el documento ${doc}? ${exists}`);
        
        // Si creamos uno, el siguiente debería dar 'true'
        // Pero primero necesitamos una persona
        const person = await personModel.create({
            name: 'Test Person',
            document: doc,
            phone: '123',
            email: 'test@test.com',
            personTypeId: 1
        });
        
        // Creamos un envío mínimo
        const _shipment = await shipmentModel.Shipment.create({
            trackingId: 'TEST-001',
            statusId: 1,
            senderId: person.id,
            recipientId: person.id, // mismo solo para test
            addressId: 1 // asumimos que existe o fallará por FK, pero lo importante es existsByDocument
        }).catch(err => console.log('Error esperado al crear (FKs):', err.message));

        const existsAfter = await shipmentModel.existsByDocument(doc);
        console.log(`¿Existe envío después de crear? ${existsAfter}`);
        if (existsAfter) {
            console.log('CONFIRMADO: existsByDocument bloquea cualquier documento que ya haya tenido un envío.');
        }

        // 2. Validar personTypeId redundante
        console.log('\n2. Test: personTypeId redundante');
        const personData = await personModel.findByDocument(doc);
        console.log('Persona creada tiene personTypeId:', personData.personTypeId);
        
        // 3. Validar baja lógica vs borrado
        console.log('\n3. Test: Baja lógica (active=false)');
        const user = await userModel.create({
            fullName: 'Test User',
            email: 'user@test.com',
            password: 'password',
            document: 999,
            roleId: 1
        });
        console.log('Usuario creado id:', user.id, 'active:', user.active);
        
        await userModel.deleteById(user.id);
        const userAfter = await userModel.getById(user.id);
        console.log('Usuario después de deleteById active:', userAfter.active);
        if (userAfter.active === false) {
            console.log('CONFIRMADO: deleteById hace baja lógica (active=false), no borra físicamente.');
        }

    } catch (error) {
        console.error('Error en tests:', error);
    } finally {
        await sequelize.close();
    }
}

testIssues();
