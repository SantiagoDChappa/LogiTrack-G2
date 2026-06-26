# CV-01 — Interacción por voz base · Casos de Prueba (manuales)

> Pruebas paso a paso para ejecutar **en Chrome** (target del repartidor). La Web Speech API
> necesita un navegador real con micrófono; por eso estas pruebas son manuales.

---

## Precondiciones generales (válidas para todos los casos, salvo aclaración)

- **Navegador:** Google Chrome actualizado (escritorio o Android).
- **Conexión segura:** la app servida por HTTPS (o `localhost`), si no, el micrófono no se habilita.
- **Permiso de micrófono:** otorgado al sitio (salvo en TC-06, que prueba el caso contrario).
- **Sesión:** logueado como **repartidor**.
- **Ruta:** entrar a una **ruta en curso** propia (`/delivery/route/:id` con la ruta iniciada).
- **Audio del dispositivo:** volumen audible (para escuchar las respuestas y los sonidos).

**Cómo reconocer los estados del botón 🎤:**
- Reposo: azul claro, sin animación.
- Escuchando: azul intenso, **pulsando**.
- Procesando: violeta.
- Respondiendo: celeste.
- No disponible: atenuado (gris).

---

## TC-01 — Activación exitosa (CA1)

**Precondición:** botón 🎤 en reposo.

**Pasos:**
1. Tocar el botón 🎤.

**Resultado esperado:**
- Suena un **beep corto** de inicio.
- El botón cambia a **azul pulsante** (estado "escuchando").
- Aparece la **burbuja** con el texto "Escuchando…".
- El navegador escucha el micrófono.

---

## TC-02 — Indicación de procesando y respuesta (CA2)

**Precondición:** TC-01 ejecutado (copiloto escuchando).

**Pasos:**
1. Decir *"¿Cuál es mi próxima entrega?"*.
2. Dejar de hablar.

**Resultado esperado:**
- El botón pasa a **violeta** ("Procesando…") por un instante.
- Luego pasa a **celeste** ("Respondiendo…") y el sistema **habla** la respuesta.
- Al terminar, el botón vuelve a **reposo** (azul claro).

---

## TC-03 — La respuesta también es visible (CA3)

**Precondición:** copiloto acaba de responder algo (TC-02).

**Pasos:**
1. Observar la pantalla mientras el sistema habla.

**Resultado esperado:**
- La **burbuja** muestra el **mismo texto** que se escucha por voz.
- El texto permanece visible unos segundos y luego se oculta.

---

## TC-04 — Lectura entendible de direcciones (CA4)

**Precondición:** la próxima entrega tiene una dirección que incluye una abreviatura (ej.: "Av. Rivadavia 1234"). *(Si no hay, validar con cualquier dirección.)*

**Pasos:**
1. Tocar 🎤 y decir *"¿Cuál es mi próxima entrega?"*.

**Resultado esperado:**
- El sistema dice la dirección de forma **natural**: "Avenida Rivadavia 1234" (no "Av punto Rivadavia").
- El número y el nombre del destinatario se entienden con claridad.

---

## TC-05 — No se detecta voz (CA5)

**Precondición:** botón en reposo.

**Pasos:**
1. Tocar 🎤.
2. **No decir nada** y esperar (hasta ~7 segundos).

**Resultado esperado:**
- El copiloto **deja de escuchar solo** (botón vuelve a reposo).
- Mensaje (voz + burbuja): *"No escuché nada, tocá para hablar de nuevo."*
- **No se ejecuta ninguna acción.**

---

## TC-06 — Permiso de micrófono no otorgado (CA6)

**Precondición:** **bloquear** el permiso de micrófono del sitio (candado de la barra de direcciones → Micrófono → Bloquear). Recargar la página.

**Pasos:**
1. Tocar 🎤.

**Resultado esperado:**
- Aparece un aviso claro (ventana + burbuja) explicando que **no hay permiso de micrófono** y **cómo habilitarlo**.
- El copiloto **no escucha**, pero **el resto de la app sigue funcionando** (botones de pausa, incidente, etc. operativos).

**Post-condición:** volver a habilitar el micrófono para los siguientes casos.

---

## TC-07 — Cancelar mientras escucha (CA7)

**Precondición:** copiloto escuchando (botón azul pulsante).

**Pasos:**
1. Tocar 🎤 **de nuevo** (mientras escucha).

**Resultado esperado:**
- El copiloto **deja de escuchar de inmediato** (botón vuelve a reposo).
- **No se ejecuta ninguna acción** ni se muestra error.

---

## TC-08 — Orden no reconocida (CA8)

**Precondición:** botón en reposo.

**Pasos:**
1. Tocar 🎤 y decir algo **sin sentido** para la app (ej.: *"qué lindo día hace hoy"*).

**Resultado esperado:**
- Mensaje (voz + burbuja): *"No entendí, ¿podés repetir? Podés decir ¿qué puedo decir?"*.
- El copiloto **vuelve a escuchar** automáticamente.
- **No se ejecuta ninguna acción.**

---

## TC-09 — Orden ambigua (CA9)

**Precondición:** botón en reposo.

**Pasos:**
1. Tocar 🎤 y decir solo una palabra compartida por **dos comandos**. Ejemplos verificados:
   - *"ruta"* → aparece en "pausar ruta" y "retomar ruta".
   - *"entrega"* → aparece en "próxima entrega" y "entrega fallida".
2. Cuando el sistema pregunte cuál, responder con uno (ej.: *"retomar ruta"* o *"el primero"*).

**Resultado esperado:**
- El sistema **no ejecuta nada** todavía: **pregunta** cuál de las dos acciones se quiso (ej.: *"¿Quisiste decir registrar pausa o retomar ruta?"*).
- Tras la respuesta, ejecuta el comando elegido.
- Si la respuesta no aclara, el sistema cancela sin hacer nada (*"Listo, no hago nada"*).
- Si en cambio se dice el comando **completo** (ej.: *"retomar ruta"*), va directo, sin preguntar.

---

## TC-10 — Orden válida fuera de contexto (CA10)

**Precondición:** la ruta **NO está en pausa**, botón en reposo.

**Pasos:**
1. Tocar 🎤 y decir *"Retomar ruta"*.

**Resultado esperado:**
- El sistema **explica por qué no aplica**: *"No hay ninguna pausa activa para retomar."*
- **No se ejecuta ninguna acción.**

---

## TC-11 — Conocer los comandos disponibles (CA11)

**Precondición:** botón en reposo.

**Pasos:**
1. Tocar 🎤 y decir *"¿Qué puedo decir?"* (o *"Ayuda"*).

**Resultado esperado:**
- El sistema **enuncia por voz** la lista de comandos principales (próxima entrega, registrar pausa, retomar ruta, reportar zona insegura, entrega fallida).
- La **misma lista** se ve en la burbuja.

---

## TC-12 — Nueva orden interrumpe la respuesta en curso (CA12)

**Precondición:** botón en reposo.

**Pasos:**
1. Tocar 🎤, decir *"¿Qué puedo decir?"* (respuesta larga).
2. **Mientras el sistema habla**, tocar 🎤 otra vez.

**Resultado esperado:**
- La respuesta en curso **se corta de inmediato**.
- El copiloto **empieza a escuchar** la nueva orden (botón azul pulsante).

---

## TC-13 — Dispositivo sin soporte de voz (CA13)

**Precondición:** abrir la ruta en un navegador **sin** Web Speech API (ej.: **Firefox**, o simular en Chrome DevTools borrando `window.SpeechRecognition` y `window.webkitSpeechRecognition` antes de cargar).

**Pasos:**
1. Abrir la ruta.
2. Tocar 🎤.

**Resultado esperado:**
- El botón aparece **atenuado** (no disponible).
- Al tocarlo, aparece un aviso claro: *"El copiloto de voz no está disponible en este navegador. Podés seguir usando todos los botones normalmente."*
- **Todos los botones normales** de la app (pausa, incidente, pánico, recentrar) **siguen funcionando** sin cambios.

---

## TC-14 — Doble toque rápido no abre dos escuchas (nota de robustez)

**Precondición:** botón en reposo.

**Pasos:**
1. Tocar 🎤 **dos veces muy rápido**.

**Resultado esperado:**
- No se abren dos escuchas simultáneas: el segundo toque **cancela** (queda en reposo) o mantiene una sola escucha.
- No hay errores ni estados "trabados".

---

## TC-15 — Próxima entrega con datos reales (happy path)

**Precondición:** la ruta tiene al menos una entrega **pendiente**.

**Pasos:**
1. Tocar 🎤 y decir *"¿Cuál es mi próxima entrega?"*.

**Resultado esperado:**
- El sistema dice la **dirección** y el **destinatario** de la siguiente parada pendiente (la de menor orden no completada).
- No menciona paradas ya completadas.

---

## TC-16 — Sin entregas pendientes

**Precondición:** una ruta con **todas las entregas completadas** (o sin paradas pendientes).

**Pasos:**
1. Tocar 🎤 y decir *"¿Cuál es mi próxima entrega?"*.

**Resultado esperado:**
- El sistema responde: *"No te quedan entregas pendientes."*

---

## TC-17 — En ruta de solo lectura no hay copiloto

**Precondición:** abrir una ruta **finalizada o cancelada** (modo solo lectura).

**Pasos:**
1. Observar la barra de botones flotantes.

**Resultado esperado:**
- El botón 🎤 **no aparece** (el copiloto no se carga en rutas de solo lectura).

---

## TC-18 — Comando de acción placeholder (CV-03..05 aún no implementados)

**Precondición:** botón en reposo, ruta en curso.

**Pasos:**
1. Tocar 🎤 y decir *"Reportar zona insegura"*.

**Resultado esperado:**
- El sistema reconoce el comando y responde: *"Reconocí reportar zona insegura. Esta acción se activa en el próximo paso."*
- **No registra nada todavía** (la acción real es CV-04).

> Nota: este comportamiento es esperado en CV-01. La acción real se valida cuando se implemente su historia.

---

## Planilla de resultados

| Caso | Criterio | Resultado (✅/❌) | Observaciones |
|---|---|---|---|
| TC-01 | CA1 |  |  |
| TC-02 | CA2 |  |  |
| TC-03 | CA3 |  |  |
| TC-04 | CA4 |  |  |
| TC-05 | CA5 |  |  |
| TC-06 | CA6 |  |  |
| TC-07 | CA7 |  |  |
| TC-08 | CA8 |  |  |
| TC-09 | CA9 |  |  |
| TC-10 | CA10 |  |  |
| TC-11 | CA11 |  |  |
| TC-12 | CA12 |  |  |
| TC-13 | CA13 |  |  |
| TC-14 | robustez |  |  |
| TC-15 | CA1-4 |  |  |
| TC-16 | CV-02 base |  |  |
| TC-17 | alcance |  |  |
| TC-18 | alcance |  |  |

---

## Entorno de prueba sugerido

- **Principal:** Chrome en Android (target real del repartidor).
- **Secundario:** Chrome de escritorio (más cómodo para depurar; abrir la consola con F12 para ver errores).
- **Para TC-13:** Firefox o Chrome con la API deshabilitada.
