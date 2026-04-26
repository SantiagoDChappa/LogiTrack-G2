const shipmentModel        = require('../models/shipment');
const personModel          = require('../models/person');
const provinceModel        = require('../models/province');
const addressModel         = require('../models/address');
const statusModel          = require('../models/status');
const shipmentHistoryModel = require('../models/shipmentHistory');
const typeShipmentModel    = require('../models/typeShipment');
const settingModel         = require('../models/setting');
const { PersonType }       = require('../constants/enums');
const { PROVINCES }        = require('../utils/provinces');
const { notifyStatusChange } = require('../utils/notifications');


const home = async (req, res) => {
    const statuses = await statusModel.getAll();
    res.render('shipment/index', { shipments: [], query: {}, statuses });
};

const searchShipments = async (req, res) => {
    const { trackingId, role, name, document, senderName, senderDocument, recipientName, recipientDocument, statusIds } = req.query;
    const query = {
        trackingId,
        role,
        name:              name?.trim(),
        document:          document?.trim(),
        senderName:        senderName?.trim(),
        senderDocument:    senderDocument?.trim(),
        recipientName:     recipientName?.trim(),
        recipientDocument: recipientDocument?.trim(),
        statusIds:         statusIds ? [].concat(statusIds) : []
    };
    const [shipments, statuses] = await Promise.all([
        shipmentModel.search(query),
        statusModel.getAll()
    ]);
    res.render('shipment/index', { shipments, query, statuses });
};

const getDetail = async (req, res) => {
    const { id } = req.params;
    const [shipment, history, originLat, originLng, originStreet, originNumber] = await Promise.all([
        shipmentModel.getById(id),
        shipmentHistoryModel.getByShipmentId(id),
        settingModel.get('origin_lat'),
        settingModel.get('origin_lng'),
        settingModel.get('origin_street'),
        settingModel.get('origin_number'),
    ]);

    const destProv = PROVINCES[shipment.address.provinceId];
    const destLat  = shipment.address.lat  || (destProv ? destProv.lat  : null);
    const destLng  = shipment.address.lng  || (destProv ? destProv.lng  : null);
    const mapData = {
        origin: {
            lat:   parseFloat(originLat)  || -34.6037,
            lng:   parseFloat(originLng)  || -58.3816,
            label: [originStreet, originNumber].filter(Boolean).join(' ') || 'Origen',
        },
        destination: destLat ? {
            lat:   destLat,
            lng:   destLng,
            label: [shipment.address.street, shipment.address.number].filter(Boolean).join(' ')
                   || (destProv ? destProv.name : ''),
        } : null,
    };

    res.render('shipment/detail', { shipment, history, mapData });
};

const getNewShipmentForm = async (req, res) => {
    const provinces     = await provinceModel.getAll();
    const typesShipment = await typeShipmentModel.getAll();
    res.render('shipment/new', { errors: [], body: {}, provinces, typesShipment });
};

const createShipment = async (req, res) => {
  try {
    const body = req.body;
    //Creo el remitente
    const sender = await personModel.create({
        name:         body.senderName,
        document:     body.senderDocument,
        phone:        body.senderPhone,
        email:        body.senderEmail,
        personTypeId: PersonType.SENDER.id
    });

    //Creo el destinatario
    const recipient = await personModel.create({
        name:         body.recipientName,
        document:     body.recipientDocument,
        phone:        body.recipientPhone,
        email:        body.recipientEmail,
        personTypeId: PersonType.RECIPIENT.id
    });
    //Creo la direccion del envio
    const address = await addressModel.create({
        street:         body.street,
        number:         body.number,
        provinceId:     body.province,
        postalCode:     body.postalCode,
        floorApartment: body.floorApartment,
        lat:            body.addressLat ? parseFloat(body.addressLat) : null,
        lng:            body.addressLng ? parseFloat(body.addressLng) : null,
    });

    //Creo el envio
    await shipmentModel.create({
        senderId:       sender.id,
        recipientId:    recipient.id,
        addressId:      address.id,
        shipmentTypeId: body.shipmentTypeId || null,
        weightKg:       body.weightKg       || null,
        packageQty:     body.packageQty      || null,
    });
    
    res.redirect('/shipment?success=1');
  } catch (err) {
    console.error('ERROR createShipment:', err.message);
    res.status(500).send(err.message);
  }
};

const getUpdateShipment = async (req, res) => {
  const { id } = req.params;
  const [provinces, statuses, shipment, history, typesShipment, originLat, originLng, originStreet, originNumber] = await Promise.all([
      provinceModel.getAll(),
      statusModel.getAll(),
      shipmentModel.getById(id),
      shipmentHistoryModel.getByShipmentId(id),
      typeShipmentModel.getAll(),
      settingModel.get('origin_lat'),
      settingModel.get('origin_lng'),
      settingModel.get('origin_street'),
      settingModel.get('origin_number'),
  ]);

  const destProv = PROVINCES[shipment.address.provinceId];
  const destLat  = shipment.address.lat  || (destProv ? destProv.lat  : null);
  const destLng  = shipment.address.lng  || (destProv ? destProv.lng  : null);
  const mapData = {
      origin: {
          lat:   parseFloat(originLat)  || -34.6037,
          lng:   parseFloat(originLng)  || -58.3816,
          label: [originStreet, originNumber].filter(Boolean).join(' ') || 'Origen',
      },
      destination: destLat ? {
          lat:   destLat,
          lng:   destLng,
          label: [shipment.address.street, shipment.address.number].filter(Boolean).join(' ') || (destProv ? destProv.name : ''),
      } : null,
  };

  res.render('shipment/update', { errors: [], shipment, provinces, statuses, history, typesShipment, mapData });
};

const updateShipment = async (req, res) => {
  try {
    const { id }      = req.params;
    const body        = { ...req.body, id };
    const currentUser = res.locals.currentUser;
    const { RoleType, Status } = require('../constants/enums');
    const isOperator  = currentUser.roleId === RoleType.OPERATOR.id;

    const shipment = await shipmentModel.getById(id);
    if (!shipment) return res.status(404).send('Envío no encontrado');

    // Escenario 3: operador no puede editar un envío Entregado o Cancelado
    if (isOperator && (shipment.statusId === Status.DELIVERED.id || shipment.statusId === Status.CANCELLED.id)) {
      return res.redirect(`/shipment/update/${id}`);
    }

    if (body.newStatusId) {
      if (isOperator) {
        return res.status(403).send('Solo los supervisores pueden cambiar el estado del envío');
      }
      const newStatus = await statusModel.getById(Number(body.newStatusId));
      // Solo registrar si realmente cambia de estado (evita duplicados por doble submit)
      if (shipment.statusId !== Number(body.newStatusId)) {
        await shipmentHistoryModel.create({
          shipmentId:   id,
          fromStatusId: shipment.statusId,
          toStatusId:   Number(body.newStatusId),
          comment:      body.statusComment || null
        });
        await shipmentModel.updateStatus(id, Number(body.newStatusId));
        if (newStatus) notifyStatusChange(shipment, newStatus.description);
      }
    }

    if (isOperator) {
      body.street         = shipment.address.street;
      body.number         = shipment.address.number;
      body.province       = shipment.address.provinceId;
      body.postalCode     = shipment.address.postalCode;
      body.floorApartment = shipment.address.floorApartment;
      body.addressLat     = shipment.address.lat;
      body.addressLng     = shipment.address.lng;
      body.weightKg       = shipment.weightKg;
      body.packageQty     = shipment.packageQty;
      body.shipmentTypeId = shipment.shipmentTypeId;
    }

    await shipmentModel.update(body);
    res.redirect('/shipment?success=2');
  } catch (err) {
    console.error('ERROR updateShipment:', err.message);
    res.status(500).send(err.message);
  }
};

const updateShipmentStatus = async (req, res) => {
  try {
    const { id }                   = req.params;
    const { newStatusId, comment } = req.body;
    const [shipment, newStatus]    = await Promise.all([
        shipmentModel.getById(id),
        statusModel.getById(Number(newStatusId)),
    ]);

    await shipmentHistoryModel.create({
        shipmentId:   id,
        fromStatusId: shipment.statusId,
        toStatusId:   Number(newStatusId),
        comment:      comment || null
    });

    await shipmentModel.updateStatus(id, Number(newStatusId));
    if (newStatus) notifyStatusChange(shipment, newStatus.description);

    res.redirect(`/shipment/update/${id}`);
  } catch (err) {
    console.error('ERROR updateShipmentStatus:', err.message);
    res.status(500).send(err.message);
  }
};

module.exports = { home, getDetail, getNewShipmentForm, getUpdateShipment, createShipment, updateShipment, updateShipmentStatus, searchShipments };
