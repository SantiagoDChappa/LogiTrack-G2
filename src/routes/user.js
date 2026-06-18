const express = require('express');
const router = express.Router();
const { getIndex, searchUsers, getCreateUserForm, createUser, getUpdateUser, updateUser, deleteUser, reset2fa } = require('../controllers/user.js');
const { validateUser, handleValidationErrors, validateUpdateUser, handleUpdateValidationErrors } = require('../middlewares/user.js');
const { requireAdmin } = require('../middlewares/auth.js');

router.get('/',           requireAdmin, getIndex);
router.get('/search',     requireAdmin, searchUsers);
router.get('/new',        requireAdmin, getCreateUserForm);
router.post('/new',       requireAdmin, validateUser, handleValidationErrors, createUser);
router.get('/update/:id', requireAdmin, getUpdateUser);
router.post('/update/:id', requireAdmin, validateUpdateUser, handleUpdateValidationErrors, updateUser);
router.post('/delete/:id', requireAdmin, deleteUser);
// #2 2FA — reset del segundo factor de un usuario (solo admin).
router.post('/:id/2fa/reset', requireAdmin, reset2fa);

module.exports = router;
