function setupAutocompletado(tipo) {
  let timeout = null;

  const docInput = document.getElementById(`${tipo}-document`);
  const nameInput = document.getElementById(`${tipo}-name`);
  const emailInput = document.getElementById(`${tipo}-email`);
  const phoneInput = document.getElementById(`${tipo}-phone`);
  const phoneDisplay = document.getElementById(`${tipo}-phone-display`);
  const editBtn = document.getElementById(`${tipo}-edit`);

  // El teléfono visible es el -display (lo formatea phone-format.js y sincroniza el
  // hidden -phone). Setear el hidden no actualiza la vista: hay que tocar el display
  // y disparar 'input' para que phone-format reformatee y rellene el hidden.
  function setPhone(val) {
    if (phoneDisplay) {
      phoneDisplay.value = val || '';
      phoneDisplay.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      phoneInput.value = val || '';
    }
  }

  function clearDatos() {
    nameInput.value = '';
    emailInput.value = '';
    setPhone('');
  }

  function blockFields(bloquear) {
    [nameInput, emailInput, phoneDisplay || phoneInput].forEach(input => {
      if (!input) return;
      input.readOnly = bloquear;
      input.style.opacity = bloquear ? '0.6' : '';
      input.style.cursor = bloquear ? 'not-allowed' : '';
    });
    editBtn.classList.toggle('btn-edit-persona--active', !bloquear);
  }

  editBtn.addEventListener('click', () => {
    const editing = editBtn.classList.contains('btn-edit-persona--active');
    blockFields(editing);
  });

  docInput.addEventListener('input', (e) => {
    let doc = e.target.value;

    clearTimeout(timeout);

    timeout = setTimeout(() => {
      doc = limpiarDocumento(doc);
      // Solo limpiamos lo que venía autocompletado de otra persona (campos bloqueados).
      // Si el usuario tipeó los datos a mano, los respetamos aunque borre/acorte el DNI.
      if (doc.length < 6) {
        const venianAutocompletados = nameInput.readOnly;
        blockFields(false);
        if (venianAutocompletados) { clearDatos(); }
        return;
      }

      fetch(`/api/persons?document=${doc}`)
        .then(res => res.json())
        .then(data => {
          if (data) {
            nameInput.value = data.fullName;
            emailInput.value = data.email;
            setPhone(data.phone);

            blockFields(true);
          } else {
            // No existe persona con ese DNI: NO pisamos lo que el usuario escribió;
            // solo limpiamos si los campos venían autocompletados de otra persona.
            const venianAutocompletados = nameInput.readOnly;
            blockFields(false);
            if (venianAutocompletados) { clearDatos(); }
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
      setPhone(data.phone);
    }
  };
}

function limpiarDocumento(doc) {
  return doc.replace(/\./g, '');
}

function mismapersona(docA, docB) {
  return docA && docB && limpiarDocumento(docA) === limpiarDocumento(docB);
}

function mostrarErrorMismaPersona() {
  const isDark = (localStorage.getItem('theme') ?? 'light') === 'dark';
  Swal.fire({
    icon: 'error',
    title: 'Documento duplicado',
    text: 'El remitente y el destinatario no pueden ser la misma persona.',
    confirmButtonText: 'Aceptar',
    confirmButtonColor: isDark ? '#3b82f6' : '#2563eb',
    background: isDark ? '#1e293b' : '#ffffff',
    color: isDark ? '#f1f5f9' : '#1e293b',
  });
}

// inicializamos
const sender = setupAutocompletado('sender');
const recipient = setupAutocompletado('recipient');

// Validación cruzada al cambiar documento
document.getElementById('sender-document').addEventListener('change', () => {
  if (mismapersona(
    document.getElementById('sender-document').value,
    document.getElementById('recipient-document').value
  )) mostrarErrorMismaPersona();
});
document.getElementById('recipient-document').addEventListener('change', () => {
  if (mismapersona(
    document.getElementById('sender-document').value,
    document.getElementById('recipient-document').value
  )) mostrarErrorMismaPersona();
});

// Bloquear submit si misma persona
document.querySelector('form')?.addEventListener('submit', (e) => {
  if (mismapersona(
    document.getElementById('sender-document').value,
    document.getElementById('recipient-document').value
  )) {
    e.preventDefault();
    mostrarErrorMismaPersona();
  }
});

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