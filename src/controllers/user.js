const userModel      = require('../models/user');
const branchModel    = require('../models/branch');
const { RoleType }   = require('../constants/enums');
const actionLogModel = require('../models/actionLog');
const { generateTempPassword } = require('../utils/password');

const ROLE_LABELS = Object.fromEntries(Object.values(RoleType).map(r => [r.id, r.description]));

const ROLE_CLASSES = {
    [RoleType.SUPERVISOR.id]: 'en_sucursal',
    [RoleType.OPERATOR.id]:   'en_transito',
    [RoleType.DELIVERY.id]:   'pendiente',
    [RoleType.ADMIN.id]:      'en_sucursal',
};

const getIndex = (req, res) => {
    res.render('user/index', { users: [], query: {}, roleLabels: ROLE_LABELS, roleClasses: ROLE_CLASSES, roleTypes: Object.values(RoleType) });
};

const ROLES_REQUIRE_BRANCH = [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id, RoleType.DELIVERY.id];

const validateBranchForRole = (body) => {
  const roleId = Number(body.roleId);
  const branchId = body.branchId ? Number(body.branchId) : null;
  if (ROLES_REQUIRE_BRANCH.includes(roleId) && !branchId) {
    return 'La sucursal es obligatoria para Supervisor, Operador y Repartidor.';
  }
  return null;
};

const createUser = async (req, res) => {
  try {
    const body = req.body;
    const branchError = validateBranchForRole(body);
    if (branchError) {
      const branches = await branchModel.getAll();
      return res.status(400).render('user/new', { body, errors: [branchError], roleTypes: Object.values(RoleType), branches });
    }
    // #1 Primer ingreso: el sistema genera la contraseña temporal (el admin no la tipea).
    // Se muestra una sola vez en la pantalla de éxito para que el admin se la pase al usuario.
    const tempPassword = generateTempPassword();
    const createdUser = await userModel.create({ ...body, password: tempPassword, mustChangePassword: true });
    actionLogModel.record(res.locals.currentUser?.id, 'CREATE', 'USER', createdUser?.id, { fullName: body.fullName, email: body.email, roleId: body.roleId }, req);
    return res.render('user/created', { createdUser, tempPassword });
  } catch (err) {
    console.error('ERROR createUser:', err.message);
    res.status(500).send('Error al crear el usuario: ' + err.message);
  }
};

const searchUsers = async (req, res) => {
    try {
        const { fullName, document, email, roleId, active } = req.query;
        const users = await userModel.search({
            fullName: fullName || '',
            document: document || '',
            email:    email    || '',
            roleId:   roleId   || '',
            active:   active   || ''
        });
        res.render('user/index', {
            users,
            query:       req.query,
            roleLabels:  ROLE_LABELS,
            roleClasses: ROLE_CLASSES,
            roleTypes:   Object.values(RoleType)
        });
    } catch (err) {
        console.error('ERROR searchUsers:', err.message);
        res.status(500).send('Error al buscar usuarios: ' + err.message);
    }
};

const getCreateUserForm = async (req, res) => {
    const branches = await branchModel.getAll();
    res.render('user/new', { body: {}, errors: [], roleTypes: Object.values(RoleType), branches });
};

const getUpdateUser = async (req, res) => {
  const { id } = req.params;
  const [user, branches] = await Promise.all([userModel.getById(id), branchModel.getAll()]);

  const returnUrl = req.query.from || '/user';
  res.render('user/update', { errors: [], user, roleTypes: Object.values(RoleType), branches, returnUrl });
};


const updateUser = async (req, res) => {
  try {
    const branchError = validateBranchForRole(req.body);
    if (branchError) {
      const [user, branches] = await Promise.all([userModel.getById(req.params.id), branchModel.getAll()]);
      const returnUrl = req.query.from || '/user';
      return res.status(400).render('user/update', { errors: [branchError], user: { ...user.toJSON(), ...req.body }, roleTypes: Object.values(RoleType), branches, returnUrl });
    }
    // Sprint 3 - 4.2: normalizar ventana operativa del chofer. Checkbox ausente => false.
    const data = { ...req.body };
    if (String(data.roleId) === '3') {
      data.driverAvailable = data.driverAvailable === 'true' || data.driverAvailable === true || data.driverAvailable === 'on';
      data.driverShiftStart = data.driverShiftStart || null;
      data.driverShiftEnd   = data.driverShiftEnd   || null;
      data.driverUnavailableReason = data.driverUnavailableReason || null;
      data.driverUnavailableUntil  = data.driverUnavailableUntil  || null;
    } else {
      // Si no es delivery, limpiamos campos de turno (evita arrastrar datos viejos)
      data.driverShiftStart = null;
      data.driverShiftEnd   = null;
      data.driverAvailable  = true;
      data.driverUnavailableReason = null;
      data.driverUnavailableUntil  = null;
    }
    await userModel.update(req.params.id, data);
    actionLogModel.record(res.locals.currentUser?.id, 'UPDATE', 'USER', Number(req.params.id), { fullName: data.fullName }, req);
    res.redirect('/user?success=2');
  } catch (err) {
    console.error('ERROR updateuser:', err.message);
    res.status(500).send('Error al actualizar el usuario: ' + err.message);
  }
};


const deleteUser = async (req, res) => {
  try {
    const deletedId = Number(req.params.id);
    await userModel.deleteById(req.params.id);
    actionLogModel.record(res.locals.currentUser?.id, 'DELETE', 'USER', deletedId, null, req);
    res.redirect('/user?success=3');
  } catch (err) {
    console.error('ERROR deleteUser:', err.message);
    res.status(500).send('Error al eliminar el usuario: ' + err.message);
  }
};

// #2 2FA — reset del segundo factor por un admin (el usuario perdió su dispositivo).
// Desactiva el 2FA y revoca los dispositivos confiables; deberá reconfigurarlo al ingresar.
const reset2fa = async (req, res) => {
  try {
    await userModel.disableTwoFactor(req.params.id);
    await require('../models/trustedDevice').removeForUser(req.params.id);
    res.redirect('/user/update/' + req.params.id + '?twofa=reset');
  } catch (err) {
    console.error('ERROR reset2fa:', err.message);
    res.status(500).send('Error al resetear el 2FA: ' + err.message);
  }
};

// LGT-193 — desbloqueo manual de cuenta (un admin la libera antes de los 30 min).
const unlockAccount = async (req, res) => {
  try {
    await userModel.unlockAccount(req.params.id);
    actionLogModel.record(res.locals.currentUser?.id, 'UNLOCK', 'USER', Number(req.params.id), null, req);
    // Si vino desde Auditoría > Seguridad, volvemos ahí en vez de a la ficha del usuario.
    const returnTo = req.body.returnTo;
    const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null;
    res.redirect(safeReturn || '/user/update/' + req.params.id);
  } catch (err) {
    console.error('ERROR unlockAccount:', err.message);
    res.status(500).send('Error al desbloquear la cuenta: ' + err.message);
  }
};

module.exports = { getIndex, searchUsers, getCreateUserForm, createUser, getUpdateUser, updateUser, deleteUser, reset2fa, unlockAccount };
