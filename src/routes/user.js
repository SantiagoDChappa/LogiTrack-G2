const express = require('express');
const router = express.Router();
const { getIndex, searchUsers, getCreateUserForm, createUser, getUpdateUser, updateUser, deleteUser } = require('../controllers/user.js');
const { validateUser, handleValidationErrors, validateUpdateUser, handleUpdateValidationErrors } = require('../middlewares/user.js');

router.get('/',           getIndex);
router.get('/search',     searchUsers);
router.get('/new',        getCreateUserForm);
router.post('/new',       validateUser, handleValidationErrors, createUser);
router.get('/update/:id', getUpdateUser);
router.post('/update/:id', validateUpdateUser, handleUpdateValidationErrors, updateUser);
router.post('/delete/:id', deleteUser);

module.exports = router;
