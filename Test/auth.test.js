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

// ── CP-45: Login exitoso ──────────────────────────────────────────────────────
test('CP-45 login exitoso redirige al home y setea cookie', async () => {
    userModel.findByEmail.mockResolvedValueOnce(MOCK_USER);

    const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@logitrack.com', password: 'Password123@' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/home');
    expect(res.headers['set-cookie']).toBeDefined();
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/i);
});

// ── CP-46: Credenciales incorrectas ──────────────────────────────────────────
test('CP-46 login falla con contraseña incorrecta', async () => {
    userModel.findByEmail.mockResolvedValueOnce(MOCK_USER);

    const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@logitrack.com', password: 'incorrecta123' });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Email o contraseña incorrectos/);
});

// ── CP-46b: Email no existe ───────────────────────────────────────────────────
test('CP-46b login falla con email inexistente', async () => {
    userModel.findByEmail.mockResolvedValueOnce(null);

    const res = await request(app)
        .post('/auth/login')
        .send({ email: 'noexiste@test.com', password: 'Password123@' });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Email o contraseña incorrectos/);
});

// ── CP-48: Logout ─────────────────────────────────────────────────────────────
test('CP-48 logout limpia cookie y redirige a login', async () => {
    const res = await request(app).get('/auth/logout');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    // cookie borrada: expires en el pasado o Max-Age=0
    expect(cookie).toMatch(/token=;|Max-Age=0/i);
});

// ── Cookie seguridad ──────────────────────────────────────────────────────────
test('cookie JWT tiene flag HttpOnly', async () => {
    userModel.findByEmail.mockResolvedValueOnce(MOCK_USER);

    const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@logitrack.com', password: 'Password123@' });

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
});
