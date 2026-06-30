const personModel = require('../src/models/person');
const shipmentModel = require('../src/models/shipment');
const sequelize = require('../src/database/connection');

describe('Fixes Validation (Person & Shipment)', () => {
    afterAll(async () => {
        await sequelize.close();
    });

    test('personModel.createOrUpdate should NOT use personTypeId', async () => {
        const spy = jest.spyOn(personModel.Person, 'findOne').mockResolvedValue(null);
        const createSpy = jest.spyOn(personModel.Person, 'create').mockResolvedValue({});

        await personModel.createOrUpdate({
            name: 'Test',
            document: 123,
            phone: '123',
            email: 'test@test.com'
        });

        // Verify personTypeId NOT in create call
        expect(createSpy).toHaveBeenCalledWith(
            expect.not.objectContaining({ personTypeId: expect.anything() })
        );

        spy.mockRestore();
        createSpy.mockRestore();
    });

    test('shipmentModel should allow duplicate participants (existsByDocument removed)', () => {
        // If it was there, it would be a function. Now undefined.
        expect(shipmentModel.existsByDocument).toBeUndefined();
    });

    test('Person model definition should be clean of personTypeId', () => {
        expect(personModel.Person.rawAttributes.personTypeId).toBeUndefined();
    });
});
