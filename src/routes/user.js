const express = require('express');
const router = express.Router();
const { getIndex, searchUsers, getCreateUserForm, createUser, getUpdateUser, updateUser, deleteUser } = require('../controllers/user.js');
const { validateUser, handleValidationErrors, validateUpdateUser, handleUpdateValidationErrors } = require('../middlewares/user.js');
const { requireAdmin } = require('../middlewares/auth.js');

router.get('/',           requireAdmin, getIndex);
router.get('/search',     requireAdmin, searchUsers);
router.get('/new',        requireAdmin, getCreateUserForm);
router.post('/new',       requireAdmin, validateUser, handleValidationErrors, createUser);
router.get('/update/:id', requireAdmin, getUpdateUser);
router.post('/update/:id', requireAdmin, validateUpdateUser, handleUpdateValidationErrors, updateUser);
router.post('/delete/:id', requireAdmin, deleteUser);

module.exports = router;
