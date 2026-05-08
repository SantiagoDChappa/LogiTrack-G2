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

    test('status "Pendiente" se acepta y devuelve statusId 1', () => {
        const row = validRow();
        row.status = 'Pendiente';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.statusId).toBe(1);
    });

    test('status "En Transito" se acepta y devuelve statusId 2', () => {
        const row = validRow();
        row.status = 'En Transito';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.statusId).toBe(2);
    });

    test('status "En Sucursal" se acepta y devuelve statusId 3', () => {
        const row = validRow();
        row.status = 'En Sucursal';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.statusId).toBe(3);
    });

    test('status "Cancelado" devuelve statusId 5', () => {
        const row = validRow();
        row.status = 'Cancelado';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.statusId).toBe(5);
    });

    test('status como id numérico funciona para los 5 estados', () => {
        const row = validRow();
        for (const id of [1, 2, 3, 4, 5]) {
            row.status = String(id);
            const r = validate(row);
            expect(r.ok).toBe(true);
            expect(r.normalized.statusId).toBe(id);
        }
    });

    test('status con valor desconocido se rechaza con mensaje listando los 5 estados', () => {
        const row = validRow();
        row.status = 'ChupaCabras';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({
            field:   'status',
            message: expect.stringContaining('Estados permitidos'),
        }));
    });

    test('deliveryUserDocument opcional se preserva en normalized', () => {
        const row = validRow();
        row.deliveryUserDocument = '30000001';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.deliveryUserDocument).toBe(30000001);
    });

    test('deliveryUserDocument vacío deja el campo null', () => {
        const row = validRow();
        row.deliveryUserDocument = '';
        const r = validate(row);
        expect(r.ok).toBe(true);
        expect(r.normalized.deliveryUserDocument).toBe(null);
    });

    test('deliveryUserDocument fuera de rango genera error', () => {
        const row = validRow();
        row.deliveryUserDocument = '99';
        const r = validate(row);
        expect(r.ok).toBe(false);
        expect(r.errors).toContainEqual(expect.objectContaining({ field: 'deliveryUserDocument' }));
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
    test('acepta PENDING en variantes y devuelve 1', () => {
        expect(resolveStatusId('Pendiente')).toBe(1);
        expect(resolveStatusId('pending')).toBe(1);
        expect(resolveStatusId('1')).toBe(1);
    });
    test('acepta IN_TRANSIT en variantes y devuelve 2', () => {
        expect(resolveStatusId('En Transito')).toBe(2);
        expect(resolveStatusId('en_transito')).toBe(2);
        expect(resolveStatusId('in transit')).toBe(2);
        expect(resolveStatusId('2')).toBe(2);
    });
    test('acepta AT_BRANCH en variantes y devuelve 3', () => {
        expect(resolveStatusId('En Sucursal')).toBe(3);
        expect(resolveStatusId('en_sucursal')).toBe(3);
        expect(resolveStatusId('at_branch')).toBe(3);
        expect(resolveStatusId('3')).toBe(3);
    });
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
    test('rechaza valores desconocidos', () => {
        expect(resolveStatusId('cualquiercosa')).toBe(null);
        expect(resolveStatusId('6')).toBe(null);
        expect(resolveStatusId('0')).toBe(null);
    });
    test('valor vacío devuelve null', () => {
        expect(resolveStatusId('')).toBe(null);
        expect(resolveStatusId(null)).toBe(null);
    });
});
