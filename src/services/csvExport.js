const COLUMNS = [
    'trackingId',
    'status',
    'createdAt',
    'senderName',
    'senderDocument',
    'senderPhone',
    'senderEmail',
    'recipientName',
    'recipientDocument',
    'recipientPhone',
    'recipientEmail',
    'street',
    'number',
    'floorApartment',
    'province',
    'postalCode',
    'lat',
    'lng',
    'shipmentTypeId',
    'weightKg',
    'packageQty',
    'deliveryUserId',
];

const escape = (v) => {
    if (v === null || v === undefined) { return ''; }
    const s = String(v);
    if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
};

const formatDate = (d) => {
    if (!d) { return ''; }
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) { return ''; }
    return date.toISOString().split('T')[0];
};

const shipmentToRow = (s) => ({
    trackingId:        s.trackingId,
    status:            s.status?.description || '',
    createdAt:         formatDate(s.createdAt),
    senderName:        s.sender?.fullName || '',
    senderDocument:    s.sender?.document || '',
    senderPhone:       s.sender?.phone    || '',
    senderEmail:       s.sender?.email    || '',
    recipientName:     s.recipient?.fullName || '',
    recipientDocument: s.recipient?.document || '',
    recipientPhone:    s.recipient?.phone    || '',
    recipientEmail:    s.recipient?.email    || '',
    street:            s.address?.street    || '',
    number:            s.address?.number    || '',
    floorApartment:    s.address?.floorApartment || '',
    province:          s.address?.province?.description || '',
    postalCode:        s.address?.postalCode || '',
    lat:               s.address?.lat ?? '',
    lng:               s.address?.lng ?? '',
    shipmentTypeId:    s.shipmentTypeId || '',
    weightKg:          s.weightKg ?? '',
    packageQty:        s.packageQty ?? '',
    deliveryUserId:    s.deliveryUserId ?? '',
});

const buildShipmentsCsv = (shipments) => {
    const header = COLUMNS.join(',');
    const lines = shipments.map(s => {
        const row = shipmentToRow(s);
        return COLUMNS.map(col => escape(row[col])).join(',');
    });
    return [header, ...lines].join('\n');
};

module.exports = { buildShipmentsCsv, COLUMNS };
