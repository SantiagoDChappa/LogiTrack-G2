const userModel = require('../models/user');
const { RoleType } = require('../constants/enums');

const ROLE_LABELS = {
    [RoleType.SUPERVISOR.id]: RoleType.SUPERVISOR.description,
    [RoleType.OPERATOR.id]:   RoleType.OPERATOR.description,
};

const getIndex = (req, res) => {
    res.render('user/index', { users: [], query: {}, roleLabels: ROLE_LABELS, roleTypes: Object.values(RoleType) });
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
        const { fullName, document, email, roleId } = req.query;
        const users = await userModel.search({
            fullName: fullName || '',
            document: document || '',
            email:    email    || '',
            roleId:   roleId   || ''
        });
        res.render('user/index', {
            users,
            query:      req.query,
            roleLabels: ROLE_LABELS,
            roleTypes:  Object.values(RoleType)
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

  res.render('user/update', { errors: [], user, RoleType });
};


const updateUser = async (req, res) => {
  try {
    const body = { ...req.body, id: req.params.id };
    await userModel.update(body);

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
