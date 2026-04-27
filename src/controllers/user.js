const userModel = require('../models/user');
const { RoleType } = require('../constants/enums');

const ROLE_LABELS = Object.fromEntries(Object.values(RoleType).map(r => [r.id, r.description]));

const ROLE_CLASSES = {
    [RoleType.SUPERVISOR.id]: 'en_sucursal',
    [RoleType.OPERATOR.id]:   'en_transito',
    [RoleType.DELIVERY.id]:   'pendiente',
};

const getIndex = (req, res) => {
    res.render('user/index', { users: [], query: {}, roleLabels: ROLE_LABELS, roleClasses: ROLE_CLASSES, roleTypes: Object.values(RoleType) });
};

const createUser = async (req, res) => {
  try {
    const body = req.body;

    //Creo el envio
    await userModel.create(body);
    
    res.redirect('/user?success=1');
  } catch (err) {
    console.error('ERROR createUser:', err.message);
    res.status(500).send(err.message);
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
        res.status(500).send(err.message);
    }
};

const getCreateUserForm = (req, res) => {
    res.render('user/new', { body: {}, errors: [], roleTypes: Object.values(RoleType) });
};

const getUpdateUser  = async (req, res) => {
  const { id }    = req.params;
  const user = await userModel.getById(id);

  const returnUrl = req.query.from || '/user';
  res.render('user/update', { errors: [], user, roleTypes: Object.values(RoleType), returnUrl });
};


const updateUser = async (req, res) => {
  try {
    await userModel.update(req.params.id, req.body);
    res.redirect('/user?success=2');
  } catch (err) {
    console.error('ERROR updateuser:', err.message);
    res.status(500).send(err.message);
  }
};


const deleteUser = async (req, res) => {
  try {
    await userModel.deleteById(req.params.id);
    res.redirect('/user?success=3');
  } catch (err) {
    console.error('ERROR deleteUser:', err.message);
    res.status(500).send(err.message);
  }
};

module.exports = { getIndex, searchUsers, getCreateUserForm, createUser, getUpdateUser, updateUser, deleteUser };
