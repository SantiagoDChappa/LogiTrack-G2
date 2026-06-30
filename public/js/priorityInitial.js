// Prioridad inicial en vivo. Se recalcula al cambiar peso, tipo, dirección destino
// o —en retiro por sucursal— la sucursal elegida. En modalidad "branch_pickup" no
// hay dirección de entrega: las coordenadas de destino salen de la sucursal.
document.getElementById('weight-kg').addEventListener('input', handleChange);
document.getElementById('shipment-type').addEventListener('change', handleChange);
document.getElementById('address-lat').addEventListener('input', handleChange);
document.getElementById('address-lng').addEventListener('input', handleChange);

// Retiro por sucursal: la sucursal aporta lat/lng de destino.
document.getElementById('pickup-branch-id')?.addEventListener('change', handleChange);
document.querySelectorAll('input[name="deliveryMode"]').forEach(r =>
  r.addEventListener('change', handleChange));

let timeout = null

function getDeliveryMode() {
  const checked = document.querySelector('input[name="deliveryMode"]:checked');
  return checked ? checked.value : 'home';
}

// Coordenadas de destino según modalidad: dirección (home) o sucursal (branch_pickup).
function getDestCoords() {
  if (getDeliveryMode() === 'branch_pickup') {
    const opt = document.getElementById('pickup-branch-id')?.selectedOptions[0];
    return {
      lat: opt ? parseFloat(opt.dataset.lat) : NaN,
      lng: opt ? parseFloat(opt.dataset.lng) : NaN,
    };
  }
  return {
    lat: parseFloat(document.getElementById('address-lat').value),
    lng: parseFloat(document.getElementById('address-lng').value),
  };
}

function handleChange() {
  const data = getFormData();

  if (isNaN(data.weight) || data.weight <= 0 || isNaN(data.type) || isNaN(data.destinationUbication.lat) || isNaN(data.destinationUbication.lng)) {
    console.log('Invalid data provided');
    return;
  }


  clearTimeout(timeout);

  timeout = setTimeout(() => {
    callBackend(data);
  }, 1000)

}

async function callBackend(data) {
  try {
    const res = await fetch('/shipment/calculate-initial-priority', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error('Error en la request');

    const result = await res.json();

    const el = document.getElementById('initial-priority');
    el.textContent = castPriorityToString(result.priority);
    el.className = 'priority-badge ' + priorityClass(result.priority);

  } catch (error) {
    console.error(error);
  }
}

function castPriorityToString(number) {
  switch (number) {
    case 1: return 'Baja';
    case 2: return 'Media';
    case 3: return 'Alta';
    case 4: return 'Urgente';
    default: return '—';
  }
}

function priorityClass(number) {
  switch (number) {
    case 1: return 'priority-badge--low';
    case 2: return 'priority-badge--mid';
    case 3: return 'priority-badge--high';
    case 4: return 'priority-badge--urgent';
    default: return 'priority-badge--none';
  }
}

function getFormData() {
  return {
    weight: parseInt(document.getElementById('weight-kg').value),
    type: parseInt(document.getElementById('shipment-type').value),
    destinationUbication: getDestCoords()
  }
};
