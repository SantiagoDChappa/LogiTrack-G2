function setupAutocompletado(tipo) {
  let timeout = null;

  const docInput = document.getElementById(`${tipo}-document`);
  const nameInput = document.getElementById(`${tipo}-name`);
  const emailInput = document.getElementById(`${tipo}-email`);
  const phoneInput = document.getElementById(`${tipo}-phone`);
  const editBtn = document.getElementById(`${tipo}-edit`);

  function blockFields(bloquear) {
    [nameInput, emailInput, phoneInput].forEach(input => {
      input.readOnly = bloquear;
      input.style.backgroundColor = bloquear ? '#eee' : '#fff';
    });
  }

  editBtn.addEventListener('click', () => {
    blockFields(false);
  });

  docInput.addEventListener('input', (e) => {
    let doc = e.target.value;

    clearTimeout(timeout);

    timeout = setTimeout(() => {
      doc = limpiarDocumento(doc);
      if (doc.length < 6) {
        blockFields(false);
        nameInput.value = '';
        emailInput.value = '';
        phoneInput.value = '';
        return;
      }

      fetch(`/api/persons?document=${doc}`)
        .then(res => res.json())
        .then(data => {
          if (data) {
            nameInput.value = data.fullName;
            emailInput.value = data.email;
            phoneInput.value = data.phone;

            blockFields(true);
          } else {
            blockFields(false);
            nameInput.value = '';
            emailInput.value = '';
            phoneInput.value = '';
          }

          // 🔁 chequeo sincronización
          sincronizarSiMismoDocumento();
        })
        .catch(() => blockFields(false));

    }, 500);
  });

  return {
    getDocumento: () => docInput.value,
    setDatos: (data) => {
      nameInput.value = data.fullName;
      emailInput.value = data.email;
      phoneInput.value = data.phone;
    }
  };
}

function limpiarDocumento(doc) {
  return doc.replace(/\./g, '');
}

// inicializamos
const sender = setupAutocompletado('sender');
const recipient = setupAutocompletado('recipient');


// 🔁 sincronización automática
function sincronizarSiMismoDocumento() {
  const docRem = sender.getDocumento();
  const docDest = recipient.getDocumento();

  if (docRem && docRem === docDest) {
    recipient.setDatos({
      fullName: document.getElementById('sender-name').value,
      email: document.getElementById('sender-email').value,
      phone: document.getElementById('sender-phone').value
    });
  }
}