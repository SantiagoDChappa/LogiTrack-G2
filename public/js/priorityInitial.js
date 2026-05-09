document.getElementById('weight-kg').addEventListener('input', handleChange);
document.getElementById('shipment-type').addEventListener('change', handleChange);
document.getElementById('address-lat').addEventListener('input', handleChange);
document.getElementById('address-lng').addEventListener('input', handleChange);

let timeout = null

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

    document.getElementById('initial-priority').textContent = castPriorityToString(result.priority);

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
    default: return '-';
  }
}

function getFormData() {
  return {
    weight: parseInt(document.getElementById('weight-kg').value),
    type: parseInt(document.getElementById('shipment-type').value),
    destinationUbication: {
      lat: parseFloat(document.getElementById('address-lat').value),
      lng: parseFloat(document.getElementById('address-lng').value)
    }
  }
};