const userModel = require('../src/models/user');
const sequelize = require('../src/database/connection');

describe('User Logical Delete', () => {
    afterAll(async () => {
        await sequelize.close();
    });

    test('deleteById should mark user as inactive, not remove from DB', async () => {
        // Mock User.update to track changes
        const spy = jest.spyOn(userModel.User, 'update').mockResolvedValue([1]);
        
        await userModel.deleteById(999);
        
        // Verify active: false was sent to DB
        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ active: false }),
            expect.any(Object)
        );
        
        spy.mockRestore();
    });

    test('search should filter by active status', async () => {
        const spy = jest.spyOn(userModel.User, 'findAll').mockResolvedValue([]);
        
        await userModel.search({ active: 'false' });
        
        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ active: false })
            })
        );
        
        spy.mockRestore();
    });
});
