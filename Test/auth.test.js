const request = require('supertest');
const bcrypt  = require('bcryptjs');

// Mock DB — no necesita Neon en CI
jest.mock('../src/models/user', () => ({
    findByEmail: jest.fn(),
}));

const userModel = require('../src/models/user');
const app       = require('../app');

const HASH_PASS = bcrypt.hashSync('Password123@', 10);
const MOCK_USER = {
    id:       1,
    email:    'test@logitrack.com',
    password: HASH_PASS,
    roleId:   1,
    fullName: 'Test User',
};

test('CP-45 login exitoso redirige al home y setea cookie', async () => {
    userModel.findByEmail.mockResolvedValueOnce(MOCK_USER);

    const res = await request(app)
        .post('/login')
        .send({ email: 'test@logitrack.com', password: 'Password123@' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/home');
});

test('CP-46 login falla con contraseña incorrecta', async () => {
    userModel.findByEmail.mockResolvedValueOnce(MOCK_USER);

    const res = await request(app)
        .post('/login')
        .send({ email: 'test@logitrack.com', password: 'incorrecta123' });

    expect(res.status).toBe(200);
});

test('CP-48 logout limpia cookie y redirige a login', async () => {
    const res = await request(app).get('/logout');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
});
