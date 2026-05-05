const { validate, resolveProvinceId, resolveStatusId } = require('../src/services/shipmentRowValidator');

const validRow = () => ({
    senderName:        'Juan Perez',
    senderDocument:    '12345678',
    senderPhone:       '1123456789',
    senderEmail:       'juan@example.com',
    recipientName:     'Maria Garcia',
    recipientDocument: '87654321',
    recipientPhone:    '1198765432',
    recipientEmail:    'maria@example.com',
    street:            'Av. Corrientes',
    number:            '1234',
    floorApartment:    '3 B',
    province:          '24',
    postalCode:        'C1043',
    shipmentTypeId:    '1',
    weightKg:          '2.5',
    packageQty:        '1',
    status:            'Entregado',
});

describe('shipmentRowValidator.validate', () => {
    test('una fila válida pasa y devuelve datos normalizados', () => {
        const r = validate(validRow());
        expect(r.ok).toBe(true);
        expect(r.errors).toEqual([]);
        expect(r.normalized.senderDocument).toBe(12345678);
        expect(r.normalized.weightKg).toBe(2.5);
        expect(r.normalized.packageQty).toBe(1);
        expect(r.normalized.provinceId).toBe(24);
        expect(r.normalized.statusId).toBe(4); // DELIVERED
    });

    test('senderName vacío genera error', () => {
        const row = validRow();
        row.senderName = '';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'senderName' }));
    });

    test('senderEmail con formato inválido genera error', () => {
        const row = validRow();
        row.senderEmail = 'no-es-email';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'senderEmail' }));
    });

    test('senderEmail vacío es aceptado (campo opcional)', () => {
        const row = validRow();
        row.senderEmail = '';
        const r = validate(row);
        expect(r.ok).toBe(true);
    });

    test('DNI fuera de rango genera error', () => {
        const row = validRow();
        row.senderDocument = '99';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'senderDocument' }));
    });

    test('mismo DNI en sender y recipient genera error', () => {
        const row = validRow();
        row.recipientDocument = row.senderDocument;
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({
            field: 'recipientDocument',
            message: expect.stringContaining('no pueden ser la misma persona'),
        }));
    });

    test('teléfono con letras genera error', () => {
        const row = validRow();
        row.senderPhone = '11abc';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'senderPhone' }));
    });

    test('peso fuera de rango genera error', () => {
        const row = validRow();
        row.weightKg = '5000';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'weightKg' }));
    });

    test('packageQty no entero genera error', () => {
        const row = validRow();
        row.packageQty = '1.5';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'packageQty' }));
    });

    test('province como nombre se resuelve a id', () => {
        const row = validRow();
        row.province = 'Buenos Aires';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.provinceId).toBe(1);
    });

    test('province inexistente genera error', () => {
        const row = validRow();
        row.province = 'Atlantida';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'province' }));
    });

    test('número de calle 0 o negativo genera error', () => {
        const row = validRow();
        row.number = '0';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'number' }));
    });

    test('floorApartment > 20 caracteres genera error', () => {
        const row = validRow();
        row.floorApartment = 'A'.repeat(25);
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'floorApartment' }));
    });

    test('legacyTrackingId opcional se preserva en normalized', () => {
        const row = validRow();
        row.legacyTrackingId = 'LEG-001';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.legacyTrackingId).toBe('LEG-001');
    });

    test('legacyTrackingId vacío deja el campo null', () => {
        const row = validRow();
        row.legacyTrackingId = '';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.legacyTrackingId).toBe(null);
    });

    test('legacyTrackingId > 100 caracteres genera error', () => {
        const row = validRow();
        row.legacyTrackingId = 'X'.repeat(105);
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'legacyTrackingId' }));
    });

    test('status faltante genera error', () => {
        const row = validRow();
        delete row.status;
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'status' }));
    });

    test('status "Pendiente" se rechaza (no es estado terminal)', () => {
        const row = validRow();
        row.status = 'Pendiente';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({
            field:   'status',
            message: expect.stringContaining('Solo se aceptan envíos cerrados'),
        }));
    });

    test('status "En Transito" se rechaza', () => {
        const row = validRow();
        row.status = 'En Transito';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'status' }));
    });

    test('status "Cancelado" devuelve statusId 5', () => {
        const row = validRow();
        row.status = 'Cancelado';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.statusId).toBe(5);
    });

    test('status como id numérico también funciona (4 y 5)', () => {
        const row = validRow();
        row.status = '4';
        const r1 = validate(row);
        expect(r1.ok).toBe(true);
        expect(r1.normalized.statusId).toBe(4);

        row.status = '5';
        const r2 = validate(row);
        expect(r2.ok).toBe(true);
        expect(r2.normalized.statusId).toBe(5);
    });

    test('status con id de estado activo (1, 2, 3) se rechaza', () => {
        const row = validRow();
        for (const invalid of ['1', '2', '3']) {
            row.status = invalid;
            const r = validate(row);
            expect(r.ok).toBe(false);
            expect(r.errors).toContainEqual(expect.objectContaining({ field: 'status' }));
        }
    });
});

describe('resolveProvinceId', () => {
    test('id numérico se preserva', () => {
        expect(resolveProvinceId('5')).toBe(5);
        expect(resolveProvinceId(5)).toBe(5);
    });
    test('nombre canónico se resuelve', () => {
        expect(resolveProvinceId('Córdoba')).toBe(5);
        expect(resolveProvinceId('CABA')).toBe(24);
    });
    test('valor desconocido devuelve null', () => {
        expect(resolveProvinceId('Patagonia')).toBe(null);
    });
    test('valor vacío devuelve null', () => {
        expect(resolveProvinceId('')).toBe(null);
        expect(resolveProvinceId(null)).toBe(null);
    });
});

describe('resolveStatusId', () => {
    test('acepta DELIVERED en variantes y devuelve 4', () => {
        expect(resolveStatusId('Entregado')).toBe(4);
        expect(resolveStatusId('entregado')).toBe(4);
        expect(resolveStatusId('ENTREGADO')).toBe(4);
        expect(resolveStatusId('delivered')).toBe(4);
        expect(resolveStatusId('4')).toBe(4);
    });
    test('acepta CANCELLED en variantes y devuelve 5', () => {
        expect(resolveStatusId('Cancelado')).toBe(5);
        expect(resolveStatusId('cancelled')).toBe(5);
        expect(resolveStatusId('canceled')).toBe(5);
        expect(resolveStatusId('5')).toBe(5);
    });
    test('rechaza estados activos y desconocidos', () => {
        expect(resolveStatusId('Pendiente')).toBe(null);
        expect(resolveStatusId('En Transito')).toBe(null);
        expect(resolveStatusId('1')).toBe(null);
        expect(resolveStatusId('cualquiercosa')).toBe(null);
    });
    test('valor vacío devuelve null', () => {
        expect(resolveStatusId('')).toBe(null);
        expect(resolveStatusId(null)).toBe(null);
    });
});
