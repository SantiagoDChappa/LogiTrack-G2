const inputNombre = document.getElementById('nombre');
const inputDni = document.getElementById('documento');

inputNombre.addEventListener('input', (e) => {
    let valor = e.target.value;

    // 1. Solo letras (incluye acentos) y espacios
    valor = valor.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');

    // 2. Reemplazar múltiples espacios por uno solo
    valor = valor.replace(/\s+/g, ' ');

    // 3. Eliminar espacios al inicio
    valor = valor.replace(/^\s+/, '');

    e.target.value = valor;
});

// 4. Eliminar espacio al final cuando pierde el foco
inputNombre.addEventListener('blur', (e) => {
    e.target.value = e.target.value.trim();
});

// Formatear y validar mientras escribe
inputDni.addEventListener('input', (e) => {
    let valor = e.target.value;

    // 1. Eliminar todo lo que no sea número
    valor = valor.replace(/\D/g, '');

    // 2. Limitar a 8 dígitos (máximo DNI)
    valor = valor.slice(0, 8);

    // 3. Formatear con puntos (ej: 43503924 -> 43.503.924)
    valor = valor.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    e.target.value = valor;
});

// Validación final al salir del campo
inputDni.addEventListener('blur', (e) => {
    let valor = e.target.value.replace(/\D/g, '');

    if (valor.length < 7 || valor.length > 8) {
        alert('El DNI debe tener entre 7 y 8 números');
        e.target.focus();
    }
});

const textarea = document.getElementById('observacion');
const contador = document.getElementById('contador');

const max = textarea.maxLength;

textarea.addEventListener('input', () => {
    const restantes = max - textarea.value.length;
    contador.textContent = `${restantes} caracteres restantes`;

    // Opcional: cambiar color cuando se acerca al límite
    if (restantes <= 20) {
        contador.style.color = 'red';
    } else {
        contador.style.color = '#666';
    }
});

const form = document.getElementById('form-entrega');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(form));

    // limpiar DNI
    data.documento = data.documento.replace(/\D/g, '');

    console.log(data);

    const res = await fetch('/shipment/delivered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        alert('Entrega registrada');
        form.reset();
    } else {
        alert('Error');
    }
});



