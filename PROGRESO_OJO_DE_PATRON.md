# Progreso de desarrollo — Ojo de Patrón + Notificaciones

> Estado del trabajo sobre las US corregidas/nuevas. Actualizar a medida que se avanza.
> Rama de trabajo: `prototype`. Commits: `[LGT-XX]: título`, autor SantiagoDChappa, sin co-autor.

## Contexto
Revisión de las US contra el prototipo (código real) y desarrollo de los gaps.
Epics involucradas: **Ojo de Patrón** (LGT-189), **Notificación y comunicación** (LGT-20), **Incidencias** (LGT-169).

---

## ✅ HECHO

### Fase 1 — Config base
- **LGT-160** — `src/jobs/delayDetectionJob.js`: umbral de "demora significativa" ahora por **% de la duración del viaje** (`Setting('delay_threshold_pct')`, default 15%) en vez de fecha fija. Span = `expectedDeliveryDate − createdAt` (granularidad día). Demora permitida = `ceil(span·%/100)`.
- **LGT-196** — `src/services/fatigue/config.js` + `src/views/fatigue/config.ejs`: nuevo parámetro `recheckRestMin` (descanso para reintentar prueba en ruta; default 30, rango 1–720) + UI.
- **LGT-199** — `src/models/route.js`: nuevo estado `RouteStatus.PAUSED_FATIGUE = 7` (ruta pausada en viaje, distinto de `BLOCKED_FATIGUE = 6` al inicio).

### Fase 2 — Re-chequeo en ruta (backend + UI conductor)
- **LGT-199 backend**:
  - `src/database/migrations/030_route_fatigue_recheck.sql`: tabla `route_fatigue_session`.
  - `src/models/routeFatigueSession.js`: modelo + enum `RecheckState` (DRIVING/STOPPED/RECHECK_PENDING/PAUSED).
  - `src/services/fatigue/recheck.js`: lógica de timers (detención, disparo por umbral, descanso, reset/pausa). Helpers puros testeables.
  - `src/routes/delivery.js`: endpoints `/route/:id/fatigue/{stopped,resume,recheck-status}` + `fatigue-recheck` endurecido (guardRetry, set estado ruta, reset conteo). **Namespaced bajo `/fatigue/` para no colisionar con la pausa operativa** (`/route/:id/pause|resume` ya existía).
- **UI conductor unificada** — `src/views/delivery/route.ejs`:
  - Modal de consentimiento (LGT-190) con datos Ley 25.326.
  - Prueba de reacción (tap, anula toque anticipado) y prueba de voz (mantener-presionado, mock por duración) — LGT-191/198.
  - Gate de inicio: consentimiento + prueba antes de `/start` (reemplaza auto-start ciego).
  - Widget "🛑 Estoy detenido" con poll de estado y lanzamiento de re-chequeo (LGT-199).
  - Nota de alcance: prueba mock sin micrófono real (decisión universitaria documentada en LGT-199).

### Fase 3 — Reasignación de ruta (LGT-193 Esc.9/10, LGT-190 Esc.7)
- `services/fatigue/index.js`: `reassignRoute()` — transfiere la ruta a otro transporte de la misma sucursal (RBAC supervisor de origen, una ruta activa por conductor), conserva envíos, vuelve a PLANNED, limpia sesión de fatiga, audita.
- `controllers/fatigue.js`: `reassign` (rechaza Admin, Esc.10) + pasa transportes de la sucursal al panel.
- `routes/fatigue.js`: `POST /fatigue/reassign`. `views/fatigue/index.ejs`: selector + botón "Reasignar ruta".

### Fase 4 — Gestión supervisor + patrón + notificación
- **LGT-195** (`4a`): `release()` con motivos estructurados (`falso_positivo` apta sin nueva prueba; `autorizado_descanso`/`otro` requieren rehacer); reanuda ruta PAUSED→IN_ROUTE o reabre RECHECK_PENDING; valida "Otro" ≥10 chars. Controller + view actualizados.
- **LGT-197** (`4b`): migración `031_fatigue_pattern_review.sql` + campos de revisión en el contador; `bumpPatternCounter` detecta y **notifica al Supervisor** al cruzar umbral (una vez); `reviewPattern()` marcar revisado/descartado; endpoint `POST /fatigue/pattern/review` + UI.
- **LGT-194** (`4c`): `notifyBlock`/`notifyPattern` ahora **envían email real** (best-effort vía `notification/emailSender`) además de auditoría/panel.

### Verificación
- `node --check` OK en todos los .js. `eslint` sin errores (solo warnings preexistentes de console).
- JS inyectado en `route.ejs` validado en aislamiento.
- **Migraciones nuevas a aplicar (en orden):** `030_route_fatigue_recheck`, `031_fatigue_pattern_review`, `032_incident_damage_resolution`, `033_driver_fatigue_status`, `034_shipment_delay_recovered`, `035_shipment_delay_recovered_seeds`. Settings opcionales: `delay_threshold_pct` (15), `delay_reminder_days` (1).

### Para correr
```bash
node src/database/migrate.js   # aplica 030..035
# opcional: Setting.set('delay_threshold_pct','15'); Setting.set('delay_reminder_days','1')
```

---

## Sesión 2 — gaps cerrados ✅

- **LGT-195 Esc.7/8** ✅: tabla/modelo `driver_fatigue_status` (033). Rechazo de consentimiento inhabilita **cross-ruta** (gate en `delivery.js`). Supervisor restablece consentimiento/prueba desde el panel (`/fatigue/driver/restore`).
- **LGT-204 push** ✅: `notifySenderIfDamage` avisa por email al **remitente** al crear incidencia de daño (hook en `incident.js` → `notifyIncidentCreated`). Detección por tipo `PACKAGE_BROKEN`.
- **LGT-160 Esc.6** ✅: evento `SHIPMENT_DELAY_RECOVERED` (034/035) + `processRecoveries` en el job (avisa y limpia `delayNotifiedAt` cuando deja de estar demorado).
- **LGT-160 Esc.3** ✅ (ya estaba): el template `SHIPMENT_DELAYED` ya incluye `{{trackingUrl}}` y `{{selfServiceUrl}}` (reprogramar/retiro).
- **LGT-147** ✅: `incidentAssignment.pickLeastLoadedAssignee` — el alta automática (`incidentAutoGen`) asigna al staff de la sucursal con **menos incidencias abiertas** (carga + ubicación).
- **LGT-194 Esc.6** ✅: `resolveRecipients` registra fallback a administradores si la sucursal no tiene supervisores.

## ⏳ Lo único que queda

- **LGT-194 Esc.5** (preferencias de canal por usuario): NO implementado. Decisión de alcance: no hay store de preferencias por-usuario; las notificaciones internas van por email + panel. Construir un `user_notification_pref` sería el trabajo pendiente si se quiere.
- **LGT-147 especialidad/disponibilidad horaria**: el criterio implementado es carga + sucursal. Especialidad y turnos necesitan datos nuevos en el modelo (skills/horarios).
- **Operativo**: aplicar migraciones 030..035 y probar en la app (no hay acceso a Neon desde acá). Sin tests automáticos (repo en 0).

### Fase 6 — Reportes (LGT-180/181)  ✅ YA EN CÓDIGO
- El reporte de satisfacción (`controllers/report.js` → `getSatisfactionData`, `services/reportExport.js`, `views/report/satisfaction.ejs`) **ya distingue** `survey_type` *delivery* (post-envío, LGT-181) vs *incidencias* (post-incidencia, LGT-180), con promedio general, dimensiones, distribución por estrellas y export. Status Jira desactualizado. **No requiere desarrollo.**

---

## Auditoría a fondo — Incidencias (144–155) y Portal (163–168)
Mapeo US → artefacto que la implementa (presencia confirmada en código; no se revisó línea por línea cada AC). Conclusión: **ambas épicas están sustancialmente construidas.**

| US | Implementación en código |
|----|--------------------------|
| LGT-144 alta cliente | `portal.js` (`/portal/incident*`), `incidentEmailValidation.js`, vistas `portal/incident*` |
| LGT-145 generación automática | `services/incidentAutoGen.js` |
| LGT-146 tipos + reglas (+checklist plantilla) | `incidentRules.js`, `incidentTaskTemplate*`, `incident/templates.ejs` |
| LGT-147 asignación inteligente | `incidentRules.js` (asignación) — *En Desarrollo* |
| LGT-148 trazabilidad (+ejecución checklist) | `incidentHistory.js`, `incidentChecklist.js`, `incidentTask*` |
| LGT-149 comunicación cliente/operador | `postIncidentResponse` (portal) + respuesta staff en `incident.js` |
| LGT-150 evidencias | `incidentAttachment.js`, upload + `getIncidentAttachment` |
| LGT-151 cierre automático | `services/incidentAutoClose.js` |
| LGT-152 flujo/timeline | historial + `incident/detail.ejs`, `portal` timeline |
| LGT-153 chatbot demoras | `services/chatbot/*` |
| LGT-154/158/160 recuperación/reprogramación/notif | `selfService.ejs`, `delayDetectionJob.js`, `portalModificationService.js` |
| LGT-155/168 encuestas | `incidentSurvey.js`, `deliverySurvey.js`, vistas `portal/...Survey*` |
| LGT-161 config canales/preferencias | `incidentNotifConfig.js`, `notificationConfig.js` |
| LGT-163 consulta envíos portal | `getShipmentList/Detail`, `portalShipmentView.js` |
| LGT-164 modificación en curso | `portalModificationService.js`, `shipmentModificationRequest.js` |
| LGT-165 consulta incidencias portal | `getIncidentList`, `misEnviosIncidentsList.ejs` |
| LGT-166 respuesta + evidencia | `postIncidentResponse`, `misEnviosIncidentDetail.ejs` |
| LGT-167 seguimiento resolución | timeline en `misEnviosIncidentDetail.ejs` |

**Gaps a verificar manualmente (no bloqueantes):** LGT-147 (figura *En Desarrollo*: confirmar criterios de carga/especialidad/ubicación), y los AC de preferencias de canal por usuario (LGT-161/194).

---

## Decisiones de alcance registradas
- **LGT-199**: re-chequeo MANUAL (botón "Estoy detenido") — sin detección automática por movimiento (no testeable en marco universitario; mismo criterio que geolocalización por sucursal). Documentado como comentario en el ticket.
- **LGT-197**: gestión por **Supervisor** de sucursal de origen; Admin solo configura parámetros.
- **LGT-193/190**: reasignación = misma mecánica; al inicio reasigna Supervisor, en viaje rehace prueba tras descanso.
