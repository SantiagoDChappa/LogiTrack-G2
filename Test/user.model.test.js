const bcrypt = require('bcryptjs');

// Mock Sequelize — sin DB real
jest.mock('../src/database/connection', () => ({
    define: jest.fn(() => ({
        findAll:  jest.fn(),
        findOne:  jest.fn(),
        create:   jest.fn(),
        update:   jest.fn(),
        destroy:  jest.fn(),
    })),
    sync: jest.fn(),
}));

// Re-importar después del mock
// Parchamos el modelo que usa userModel internamente
jest.mock('../src/models/user', () => {
    const bcrypt = require('bcryptjs');
    const mockDB = {
        findAll:  jest.fn(),
        findOne:  jest.fn(),
        create:   jest.fn(),
        update:   jest.fn(),
        destroy:  jest.fn(),
    };

    return {
        _db: mockDB,
        getAll:    () => mockDB.findAll(),
        getById:   (id) => mockDB.findOne({ where: { id } }),
        findByEmail: (email) => mockDB.findOne({ where: { email } }),
        existsByEmail: async (email) => {
            const r = await mockDB.findOne({ where: { email } });
            return r !== null;
        },
        existsByDocument: async (doc) => {
            const r = await mockDB.findOne({ where: { document: doc } });
            return r !== null;
        },
        create: async (data) => {
            const hashed = await bcrypt.hash(data.password, 10);
            return mockDB.create({ ...data, password: hashed });
        },
        deleteById: (id) => mockDB.destroy({ where: { id } }),
        update:     (data) => mockDB.update(data, { where: { id: data.id } }),
        existsByEmailExcluding:    jest.fn(),
        existsByDocumentExcluding: jest.fn(),
    };
});

const userModel = require('../src/models/user');
const db = userModel._db;

beforeEach(() => jest.clearAllMocks());

// ── CP-01: Alta de usuario exitosa ────────────────────────────────────────────
describe('create()', () => {
    test('CP-01 hashea la contraseña antes de guardar', async () => {
        db.create.mockResolvedValueOnce({ id: 1 });

        await userModel.create({
            fullName: 'Maximo Flores',
            email:    'flores@test.com',
            password: 'Password123@',
            document: 12345678,
            roleId:   1,
        });

        expect(db.create).toHaveBeenCalledTimes(1);
        const called = db.create.mock.calls[0][0];
        expect(called.password).not.toBe('Password123@');
        expect(await bcrypt.compare('Password123@', called.password)).toBe(true);
    });
});

// ── CP-02: Email ya registrado ────────────────────────────────────────────────
describe('existsByEmail()', () => {
    test('CP-02 retorna true si el email existe', async () => {
        db.findOne.mockResolvedValueOnce({ id: 5 });
        expect(await userModel.existsByEmail('flores@test.com')).toBe(true);
    });

    test('retorna false si el email no existe', async () => {
        db.findOne.mockResolvedValueOnce(null);
        expect(await userModel.existsByEmail('nuevo@test.com')).toBe(false);
    });
});

// ── CP-07: Baja lógica ────────────────────────────────────────────────────────
describe('deleteById()', () => {
    test('CP-07 llama a destroy con el id correcto', async () => {
        db.destroy.mockResolvedValueOnce(1);
        await userModel.deleteById(101);
        expect(db.destroy).toHaveBeenCalledWith({ where: { id: 101 } });
    });
});

// ── findByEmail ───────────────────────────────────────────────────────────────
describe('findByEmail()', () => {
    test('retorna el usuario si existe', async () => {
        const mockUser = { id: 1, email: 'a@b.com' };
        db.findOne.mockResolvedValueOnce(mockUser);
        const result = await userModel.findByEmail('a@b.com');
        expect(result).toEqual(mockUser);
    });

    test('retorna null si no existe', async () => {
        db.findOne.mockResolvedValueOnce(null);
        const result = await userModel.findByEmail('noexiste@b.com');
        expect(result).toBeNull();
    });
});
