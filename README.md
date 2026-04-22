# LogiTrack

## Visión

LogiTrack es un sistema de gestión de envíos orientado al registro y seguimiento de paquetes dentro de una organización. El sistema centraliza la información relacionada con los envíos y su estado a lo largo del proceso de distribución, mejorando la visibilidad y el control desde el registro hasta la entrega. Incluye un módulo de Machine Learning integrado que predice demoras y tiempos de entrega en base a datos logísticos reales.

---

## ¿Qué es LogiTrack?

LogiTrack es una aplicación web que permite a los operadores logísticos registrar, consultar y hacer seguimiento de envíos en tiempo real. Desde el momento en que se registra un paquete hasta su entrega final, el sistema mantiene un historial completo de estados, visualiza el trayecto en un mapa y ofrece predicciones inteligentes sobre la entrega.

---

## ¿Para qué sirve?

- **Registrar envíos** con los datos del remitente, destinatario y dirección de entrega, obteniendo un código de seguimiento único (Tracking ID). El peso, cantidad y tipo de envío se guardan desde el alta.
- **Consultar el estado** de cualquier envío en cualquier momento, desde *Pendiente* hasta *Entregado*.
- **Buscar envíos** por Tracking ID, nombre o documento del remitente o destinatario.
- **Actualizar el estado** de un envío a medida que avanza en el proceso de distribución, dejando registro de cada cambio con motivo opcional.
- **Visualizar el trayecto** en un mapa interactivo (Leaflet + OpenStreetMap) con el recorrido origen→destino.
- **Predicción ML integrada** que estima si el envío llegará a tiempo y cuántos días tardará, directamente en el alta, detalle y modificación del envío.
- **Buscar direcciones** con autocompletado inteligente usando Georef (API oficial Argentina) con fallback a Nominatim (OpenStreetMap) para cobertura completa del territorio nacional. El código postal se obtiene automáticamente al seleccionar la dirección.
- **Configurar el origen** del sistema desde Ajustes, con geocodificación automática de la dirección ingresada.

---

## Módulo de Machine Learning

El módulo ML corre integrado dentro del mismo servidor Node.js mediante `child_process`, sin necesidad de un servicio Python separado. Predice:

- **¿El envío llegará demorado?** (clasificación con probabilidad %)
- **¿Cuántos días tardará?** (regresión)

Los modelos se entrenan con un dataset sintético de envíos argentinos y toman como variables: distancia, peso, cantidad de paquetes, tipo de envío, día y mes de despacho, provincia de origen y destino.

---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | EJS, CSS custom (variables), Leaflet.js |
| Backend | Node.js, Express 5 |
| Base de datos | PostgreSQL + Sequelize |
| Machine Learning | Python 3, scikit-learn, pandas, joblib |
| Geocodificación | API Georef (datos.gob.ar) + Nominatim (OSM) |
| Autenticación | JWT + cookies |
| Deploy | Render (servicio único Node+Python) |

---

## ¿Cómo ingresar?

El sistema está disponible en línea, sin necesidad de instalar nada. Ingresá desde cualquier navegador web:

**`https://logitrack-prototipo.onrender.com/`**

---

## Equipo

- Santiago Chappa
- Luca Corigliano
- Maximo Flores
