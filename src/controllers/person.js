const personModel = require('../models/person');

const getPersonAutoComplete = async (req, res) => {
   const { document } = req.query;

  if (!document) {
    return res.status(400).json({ error: 'Documento requerido' });
  }

  const person = await personModel.findByDocument(document);

  if (!person) {
    return res.json(null); // 👈 mejor que 404
  }

  const personDTO = {
    fullName: person.fullName,
    email: person.email,
    phone: person.phone
  };

  return res.json(personDTO);
};

module.exports = { getPersonAutoComplete };