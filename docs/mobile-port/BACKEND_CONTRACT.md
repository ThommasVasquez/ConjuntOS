# Backend Contract

Consolidated endpoint reference for the Rust API consumed by the Expo port, grouped by domain.

## Auth model (read first)

- **The backend accepts cookie OR Bearer.** On `POST /api/v1/auth/login` the server sets an HttpOnly `ec_session` cookie **and** returns a `token` in the response body specifically for clients where the cross-site cookie is blocked.
- **The native app uses Bearer.** React Native has no shared cookie jar and cross-site cookies are unreliable, so the mobile port stores the login token in **expo-secure-store**, rehydrates `setAuthToken()` on launch, and sends `Authorization: Bearer <token>` on every request. No breaking backend change is required for auth — the Bearer path already exists.
- **All endpoints are multi-tenant** by the caller's `conjunto_id` (derived from JWT claims); cross-tenant access returns empty results or 403.
- **Errors** are RFC-7807 problem+json (`ApiError(status, detail, type)`). Common codes are noted per endpoint.
- **Password changes invalidate tokens**: `PUT /auth/password` updates `password_changed_at`; JWTs with `iat < changed_at` → 401 (note: the WS upgrade does **not** run this revocation check — signature/exp only).
- **Money** fields (e.g. `recaudoMes`, `monto`) serialize as strings/BigDecimal — parse before arithmetic.

---

## Domain: auth

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/login` | public | `LoginRequest {email, password}` | `LoginResponse {user, token}` | Sets HttpOnly `ec_session` cookie AND returns bearer token. 401 invalid creds, 403 deactivated. Email trimmed+lowercased; constant-time dummy hash. |
| GET | `/api/v1/auth/me` | any auth | none | `UserDto` | Re-reads user; sets `is_tester` from whitelist. 401 if user gone. |
| POST | `/api/v1/auth/logout` | public | none | `{ok:true}` | Sends removal cookie. Stateless JWT — bearer not server-revoked here. |
| PUT | `/api/v1/auth/password` | any auth | `ChangePasswordRequest {currentPassword, newPassword}` | `{ok:true}` | new ≥8 chars (400); wrong current (401). Updates `password_changed_at` (invalidates prior JWTs). |
| POST | `/api/v1/auth/switch-role` | auth + whitelisted tester only (403 else) | `SwitchRoleRequest {rol}` (UPPER_SNAKE) | `LoginResponse {user, token}` | Persists role, re-issues session. 400 invalid rol. `is_tester` forced true. |
| GET | `/api/v1/auth/ws-ticket` | any auth | none | `WsTicketResponse {ticket}` | Short-lived token for the WS upgrade query param. 401 if unauth. |

## Domain: usuarios

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/usuarios/me/profile` | any auth (own) | none | `ProfileResponse {user, unidad?, vehiculos[], mascotas[], tramites_solicitados[]}` | Aggregates own user + unit + vehicles + pets + tramites. 401 if user missing. |
| PUT | `/api/v1/usuarios/me/profile` | any auth (own) | `UpdateProfileRequest {nombre?, telefono?, genero?, avatar?, torre?, apto?}` | `ProfileResponse` | Avatar > 150 KB → 400; empty nombre → 400. Bootstraps a unidad if resident gives apto and has none. |
| GET | `/api/v1/usuarios/directorio` | any auth | `?q=Option<String>` | `Vec<DirectorioUsuarioDto> {id, nombre, numero_interno, rol, torre, apto}` | Citofonía directory: active users in caller's conjunto excluding self, optional name/internal-number filter. **Distinct** from `/api/v1/directorio`. |

## Domain: notificaciones (+ push subscriptions)

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/notificaciones` | any auth | none | `Vec<NotificacionDto>` | Latest 20 of the caller. |
| PUT | `/api/v1/notificaciones/leidas` | any auth | `Option<MarkReadRequest {ids?}>` | `MarkReadResponse {updated}` | Omit body/ids → mark ALL unread read. |
| POST | `/api/v1/usuarios/me/push-subscriptions` | any auth | `PushSubscribeRequest {endpoint, keys:{p256dh, auth}}` | `PushSubscriptionDto` | Upsert by endpoint. **Web-push** (VAPID) registration. See native-push section below for the additive Expo path. |
| DELETE | `/api/v1/usuarios/me/push-subscriptions` | any auth | `PushUnsubscribeRequest {endpoint}` | `{ok:true, deleted}` | Idempotent removal by endpoint. |

## Domain: comunicaciones (anuncios, directorio, visitas/paquetes feed)

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/anuncios` | any auth | none | `Vec<AnuncioDto>` | Latest 50, pinned first. |
| POST | `/api/v1/anuncios` | ADMINISTRADOR or CONCEJO (+SUPER_ADMIN) | `CreateAnuncioRequest {titulo, contenido, tipo, imagen_url?, archivos_url?, fijado?, expires_en?}` | `AnuncioDto` | titulo+contenido required. WS `anuncio/created`; INFO notif to all residents. 403 if not allowed. |
| PUT | `/api/v1/anuncios/{id}` | ADMINISTRADOR or CONCEJO (+SUPER_ADMIN) | `UpdateAnuncioRequest` (all optional) | `AnuncioDto` | 404 if not in conjunto. WS `anuncio/updated`. |
| DELETE | `/api/v1/anuncios/{id}` | ADMINISTRADOR or CONCEJO (+SUPER_ADMIN) | none | `DeleteAnuncioResponse {deleted}` | WS `anuncio/deleted`. |
| GET | `/api/v1/directorio` | ADMINISTRADOR, CONCEJO, VIGILANTE, SUPERVISOR_VIGILANCIA, ENCARGADO_PARQUEADERO (+SUPER_ADMIN) | none | `Vec<DirectorioEntradaDto> {id, nombre, torre, apto, telefono}` | Habeas-Data-limited fields. **Different from** `/api/v1/usuarios/directorio`. NOTE: paquetería consumes the flat `{torre, apto}` shape (verified against the live serializer — no `unidad` nesting). |
| GET | `/api/v1/comunicaciones` | any auth | none | `ComunicacionesDto {visitas[20], paquetes[20]}` | Own latest visits + pending packages. Used by /visitantes (visitas only) and /citofonia (also `parqueadero?`). |

## Domain: pagos

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/pagos` | any auth (own unit) | none | `PagosResponse {pagos[24], recibos[12]}` | Empty arrays if caller has no unit. |
| PUT | `/api/v1/pagos/{id}/pagar` | any auth (must own) | `PagarRequest {metodo}` | `PagoDto` | Payment **SIMULATED** and persisted. 404 if not owned. WS `pago/updated`. **PROD BLOCKER: simulated, not real.** |

## Domain: reservas (areas-comunes)

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/areas-comunes` | any auth | none | `Vec<AreaComunDto>` | Active common areas. |
| GET | `/api/v1/areas-comunes/{id}/slots` | any auth | `?fecha=` | `Vec<SlotDto> {fecha_inicio, fecha_fin}` | Occupied slots for the day. 404 if area not in conjunto. (Client generates bookable slots from open/close + duracionSlot, marking these as blocked.) |
| GET | `/api/v1/reservas` | any auth (own) | none | `Vec<ReservaDto>` | Upcoming, with denormalized `area_nombre`/`area_imagen_url`. Also drives the ProfileHeader story-halo. |
| POST | `/api/v1/reservas` | any auth | `CreateReservaRequest {area_id, fecha_inicio, fecha_fin, notas?}` | `ReservaDto` | fecha_inicio < fecha_fin (400). PENDIENTE if deposit required. 404 area, 409 overlap. WS `reserva/created`. |

## Domain: admin (dashboard stats)

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/stats` | ADMINISTRADOR or CONCEJO (+SUPER_ADMIN) | none | `AdminStatsDto {recaudoMes:String, reservasPendientes:i64}` | Current-month PAGADO sum + pending-reservation count. 403 if not admin-level. |

## Domain: conjuntos (superadmin)

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/superadmin/conjuntos` | SUPER_ADMIN | none | `Vec<ConjuntoDto>` | Cross-tenant list. 403 else. |
| POST | `/api/v1/superadmin/conjuntos` | SUPER_ADMIN | `CreateConjuntoRequest {nombre, nit?, subdominio, direccion?, ciudad?, logo_url?, color_primario?, plan?, representante_legal?, notaria_escritura?, numero_escritura?, fecha_escritura?, matricula_inmobiliaria?, total_unidades?}` | `ConjuntoDto` | Sanitizes subdominio (400). 409 if taken. |
| PUT | `/api/v1/superadmin/conjuntos/{id}` | SUPER_ADMIN | `UpdateConjuntoRequest` (all optional + activo?) | `ConjuntoDto` | 404 if unknown. |

## Domain: citofonia

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| POST | `/api/v1/citofonia/call` | any auth (401 unauth; 503 if LiveKit unconfigured) | `CallRequest {targetPeerId, callerName?}` | `CallResponse {room, token, url, sent}` | `parse_peer_id`: `user-{uuid}` / `numero-{digits}` / `{uuid}-VIGILANTE\|ADMINISTRADOR\|...` / `{uuid}-APTO-{torre}-{numero}`. `resolve_targets` filters to caller's conjunto + active. Ephemeral room `citofonia-{conjuntoId}-{uuid}`. **Push**: queries push_subscriptions for targets, builds payload `{title:'Llamada Entrante', body:'Llamada de citofonia desde {callerName}', data:{url:'/citofonia', room, callerName}}`, sends via `push_sender`; `sent` = successful deliveries. **WS foreground**: `ws_hub.publish(WsEvent{domain:'citofonia', action:'incoming_call', payload:{room, callerName}, target_user_id:uid})`. |
| GET | `/api/v1/citofonia/token` | any auth (403 cross-tenant room; 503 if LiveKit unconfigured) | `?room=` | `CitofoniaTokenDto {token, url}` | Verifies the conjunto embedded in the room name == caller's, else 403. Token `canPublish=true`, identity = user.id. |

## Domain: ws (WebSocket)

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/ws?token=<jwt>` | JWT in `token` query param (NOT the Authorization header — WS can't send custom headers). 401 if verify fails. Root router, not under api_v1. | `WsQuery {token}` (the ws-ticket JWT) | WS upgrade (101); server pushes `WsEvent {domain, action, payload?, target_user_id?}` JSON frames | Ticket flow: obtain a login JWT, open the WS with it. **Does NOT run the password_changed_at revocation check** (signature/exp only). Subscribes to the conjunto's ws_hub. Per-user targeting: if `target_user_id` is set and != this socket's user, skip; else broadcast. Reliable foreground path for citofonía incoming calls; native push is the closed-app fallback. |

WS domains the in-scope screens subscribe to: `notification` (ProfileHeader, all screens), `pago` (pagos, inicio), `anuncio` (inicio), `parqueadero` (inicio), `reserva` (reservas), `citofonia` (citofonía/CallContext), `visita` (visitantes), `solicitud` (pqrs), `paquete` (paquetería; `paquete/created` is per-user `target_user_id`).

## Domain: tramites

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/tramites` | any auth (admin/concejo see conjunto; others own) | none | `Vec<TramiteConSolicitanteDto>` | Latest 50, scoped to conjunto. |
| POST | `/api/v1/tramites` | any auth | `CreateTramiteRequest {tipo, payload (JSON object), documentos?}` | `TramiteDto` | 400 if payload not object. Estado PENDIENTE; notifies admins; WS `tramite/created`. `documentos` items need `mimeType` (`deny_unknown_fields`). |
| PUT | `/api/v1/tramites/{id}/resolver` | ADMINISTRADOR (+SUPER_ADMIN) | `ResolverTramiteRequest {decision, observacion?, parqueadero_id?, meses?}` | `TramiteDto` | 404 not in conjunto; 409 already processed / duplicate placa; 422 payload mismatch. On APROBADO the asset is created in-transaction. WS `tramite/resolved`. |

## Domain: solicitudes (PQRS)

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/solicitudes` | any auth (admin/concejo see conjunto; others own) | none | `Vec<SolicitudDto>` | Latest 50. **DTO note:** uses `createdAt` (the page mistakenly reads `creadoEn`). |
| POST | `/api/v1/solicitudes` | any auth | `CreateSolicitudRequest {categoria, tipo?(default Mantenimiento), descripcion(req), urgente?(false), imagenes?}` | `SolicitudDto` | 400 if descripcion blank. Estado ABIERTA; notifies admins; WS `solicitud/created`. |

## Domain: vigilancia (visitas, paquetes)

| Method | Path | Roles | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/vigilancia/visitas` | ROLES_VIGILANCIA [Vigilante, SupervisorVigilancia, Administrador] (+SuperAdmin) | none | `Vec<VisitaVigilanciaDto>` | Today's visits. 403 else. |
| POST | `/api/v1/vigilancia/visitas` | ROLES_VIGILANCIA | `CreateVisitaVigilanciaRequest {usuario_id, nombre, tipo, vehiculo_tipo?, placa?, fecha?, tiene_parqueadero?, observacion?}` | `VisitaDto` | 400 blank nombre; 404 recipient not in conjunto. WS `visita/created`. |
| POST | `/api/v1/visitas` | any auth (resident schedules own) | `CreateVisitaResidenteRequest {nombre, tipo, vehiculo_tipo?, placa?, fecha?, tiene_parqueadero?, observacion?}` | `VisitaDto` | 400 blank nombre. usuario_id forced to caller. WS `visita/created`. **(This is the endpoint the citofonía Add-Visita stub should call.)** |
| GET | `/api/v1/vigilancia/paquetes` | ROLES_VIGILANCIA | none | `Vec<PaqueteVigilanciaDto>` | Latest 50 (EN_PORTERIA). |
| POST | `/api/v1/vigilancia/paquetes` | ROLES_VIGILANCIA | `CreatePaqueteRequest {usuario_id, descripcion, remitente}` | `PaqueteDto` | 400 blank fields; 404 recipient not in conjunto. Recipient notified; WS `paquete/created` with `target_user_id=usuario_id`. |
| PUT | `/api/v1/vigilancia/paquetes/{id}/entregar` | ROLES_VIGILANCIA | none | `PaqueteDto` | 404 not in conjunto. WS `paquete/delivered`. |
| GET | `/api/v1/vigilancia/stats` | ROLES_VIGILANCIA | none | `VigilanciaStatsDto {visitas_hoy, paquetes_pendientes, total_residentes}` | Gate dashboard counters. |
| GET | `/api/v1/paquetes/mios` | any auth (own) | none | `Vec<PaqueteDto>` | Own packages waiting at the gate (limit 100). |

## Domain: parqueadero

> Full set (roadmap screens). In-scope screens (`/inicio`, `/perfil`) use only `solicitudes/mias`, `cargos/mios`, the resident approve/reject endpoints, and `stats`.

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/v1/parqueadero/mio` | any auth | Own vehicles + assigned cells (`ParqueaderoMioDto`). |
| POST | `/api/v1/vehiculos` | any auth | `CreateVehiculoRequest {placa, marca?, modelo?, color?, tipo}`. 400 blank, 409 dup placa. WS `vehiculo/created`. |
| GET | `/api/v1/parqueadero/mapa` | ROLES_GESTION_CELDAS [EncargadoParqueadero, SupervisorVigilancia, Administrador, Vigilante] (+SuperAdmin) | Every cell + occupant. |
| POST | `/api/v1/parqueadero/celdas` | ROLES_PARQUEADERO [EncargadoParqueadero, SupervisorVigilancia, Administrador] (+SuperAdmin) | Batch (prefijo+cantidad, max 500) or single. WS `celdas_creadas`. |
| PUT | `/api/v1/parqueadero/celdas/{id}` | ROLES_GESTION_CELDAS | `UpdateCeldaRequest {estado}` → `MovimientoResultadoDto`. Residente cell + non-admin → pendiente solicitud. |
| POST | `/api/v1/parqueadero/celdas/{id}/asignar` | ROLES_GESTION_CELDAS | `AsignarCeldaRequest {usuario_id, meses?, estimado_minutos?, placa?}`. 409 occupied. VISITANTE→resident approval; RESIDENTE+non-admin→admin approval. |
| POST | `/api/v1/parqueadero/celdas/{id}/liberar` | ROLES_GESTION_CELDAS | Releases; closes active visitor charge. WS `celda_liberada`. |
| GET | `/api/v1/parqueadero/registros` | ROLES_REGISTROS [+Vigilante] | Latest 50 audit; Vigilante sees own only. |
| GET / POST | `/api/v1/parqueadero/rondas` | GET any auth; POST ROLES_RONDAS [EncargadoParqueadero, Vigilante, SupervisorVigilancia] | `CreateRondaRequest {hallazgos, completada}`. WS `ronda_created`. |
| GET | `/api/v1/parqueadero/stats` | ROLES_PARQUEADERO | `ParqueaderoStatsDto {total, ocupados, libres, porcentaje_ocupacion}`. (HomeEstacionamiento.) |
| GET | `/api/v1/parqueadero/solicitudes` | ROLES_LOG [Administrador] (+SuperAdmin) | Immutable movement log. |
| GET | `/api/v1/parqueadero/solicitudes/mias` | any auth (resident inbox) | Visitor-cell requests awaiting this resident. |
| POST | `/api/v1/parqueadero/solicitudes/{id}/inquilino/aprobar\|rechazar` | the intended resident (403/404 from repo) | Approve → visitor cell assigned. WS `celda_asignada`/`solicitud_resuelta`. **(Used by /inicio.)** |
| POST | `/api/v1/parqueadero/solicitudes/{id}/aprobar\|rechazar` | ROLES_LOG [Administrador] (+SuperAdmin) | Approve+execute. WS `celda_updated`/`solicitud_resuelta`. |
| PUT / DELETE | `/api/v1/parqueadero/solicitudes/{id}` | SuperAdmin only | Edit/delete log entry. |
| GET | `/api/v1/parqueadero/sesiones/mias` | any auth (resident) | Active visitor sessions w/ countdown. |
| GET | `/api/v1/parqueadero/sesiones/celda/{id}` | ROLES_GESTION_CELDAS | Active session for a cell. |
| POST | `/api/v1/parqueadero/sesiones/{id}/cerrar` | ROLES_GESTION_CELDAS | `CerrarSesionRequest {liquidacion}`. May leave charge RETENIDA (vehicle held, resident notified). WS `celda_liberada`/`sesion_cerrada`. |
| GET | `/api/v1/parqueadero/cargos/mios` | any auth (resident) | Closed sessions w/ charge awaiting this resident. **(Used by /inicio.)** |
| POST | `/api/v1/parqueadero/cargos/{id}/aprobar\|rechazar` | the charge's resident (403/404 from repo) | Approve → payment created + cell released. WS `cargo_resuelto`/`celda_liberada`. **(Used by /inicio.)** |
| GET | `/api/v1/parqueadero/reservas/disponibilidad` | any auth | `?categoria=CARRO\|MOTO\|BICI&llegada=ISO&duracionMinutos=`. 400 invalid. |
| POST / GET / DELETE | `/api/v1/parqueadero/reservas` `/mias` `/{id}` | any auth (resident; owner for delete) | `CrearReservaVisitanteRequest`. 409 no slots. WS `reserva_creada`/`reserva_cancelada`. |
| GET | `/api/v1/parqueadero/reservas/proximas` | ROLES_RESERVAS_PORTERIA [+Vigilante] | Porter view. |
| POST | `/api/v1/parqueadero/reservas/{id}/llegada` | ROLES_RESERVAS_PORTERIA | WS `reserva_llegada`. |

## Domain: inmuebles / clasificados (roadmap)

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/v1/inmuebles` | any auth | `?tipo_negocio=&tipo_unidad=&habitaciones=`. Latest 50 DISPONIBLE + own. |
| POST | `/api/v1/inmuebles` | any auth | `CreateInmuebleRequest {titulo, descripcion, precio?, tipo_negocio, tipo_unidad, habitaciones?, banos?, area?, imagenes?, caracteristicas?}`. WS `inmueble/created`. |
| GET | `/api/v1/clasificados` | any auth | Latest 50 active w/ seller contact. |
| POST | `/api/v1/clasificados` | any auth | `CreateClasificadoRequest {nombre, categoria, descripcion?, precio?, imagen_url?, telefono?, whatsapp?}`. WS `clasificado/created`. |

## Domain: chat (roadmap — resident + admin inbox)

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET / POST | `/api/v1/chat` | any auth (resident) | Last 50 own; POST `CreateChatRequest {mensaje?, audio_base64?, transcripcion?}`. audio uploaded to bucket. WS `chat/message`. |
| GET | `/api/v1/admin/chat` | ADMIN_ROLES [Administrador, Concejo, SuperAdmin] | Conversations by resident. |
| GET / POST | `/api/v1/admin/chat/{usuario_id}` | ADMIN_ROLES | GET → thread + marks read (WS `chat/read` target_user_id); POST `AdminChatRequest {mensaje?, audio_url?, audio_base64?, transcripcion?}` (es_de_admin=true). |

## Domain: asamblea + ai (roadmap)

Live-assembly endpoints (session, votaciones, votos, asistencias, opiniones, turnos, poderes, livekit-token) and AI endpoints (`/asambleas/{id}/copilot`, `/copilot/translate`, `/copilot/consensuar`, `/acta`, `/subtitulos`, and the resident `POST /api/v1/search` assistant used by `/inicio`'s SearchModal). The in-scope screens use only:
- `GET /api/v1/asambleas/activa/session` → `Option<AsambleaDto>` (inicio live-assembly banner).
- `POST /api/v1/search` `SearchRequest {query, contexto?}` → `SearchResponse {respuesta, fuentes:[]}` (400 if query < 2 chars; 503 if GEMINI unconfigured) — inicio SearchModal AI.

## Domain: uploads (roadmap, used by tramites/avatar offloading)

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/api/v1/uploads/imagen` | any auth | `UploadImagenRequest {data (data URL/base64), carpeta?}` → `{url}`. 400 malformed/unsupported (png/jpeg/webp/gif/svg); stored at `{carpeta}/{conjunto_id}/{uuid}.{ext}`; returns short URL so callers persist only the URL. |

---

## Additive native-push endpoint (NEW — required for the Expo port)

The existing `POST /api/v1/usuarios/me/push-subscriptions` accepts a **web-push** `PushSubscribeRequest {endpoint, keys:{p256dh, auth}}` and the citofonía push path sends via the web-push VAPID sender. **Native (iOS/Android) has no Service Worker and no Web Push** — Expo apps register an Expo/native device token instead. This must be added **alongside** (not replacing) the web-push contract so web and native can coexist.

### What the backend needs to add

1. **Accept a native token shape.** Either extend the existing endpoint with a discriminated body, or add a sibling route. Recommended discriminated body on the same endpoint:

   ```jsonc
   // Native registration (Expo / FCM / APNs)
   POST /api/v1/usuarios/me/push-subscriptions
   {
     "platform": "expo",            // or "fcm" | "apns"
     "token": "ExponentPushToken[xxxxxxxx]",
     "deviceId": "<stable per-install id>"  // optional, for dedupe across reinstalls
   }
   ```
   - Upsert keyed on `token` (mirrors the web-push `endpoint` upsert). Store `platform` so the sender picks the right transport.
   - The existing web-push body `{endpoint, keys:{p256dh, auth}}` keeps working unchanged.
   - `DELETE` accepts `{token}` (native) OR `{endpoint}` (web) for idempotent removal on logout / token rotation.
   - The RN client **re-registers the token on every profile load** (idempotent), matching the web behavior.

2. **Add a native push sender alongside the web-push VAPID sender.** The citofonía dispatch currently builds a `PushSubscriptionInfo` per target and calls `state.push_sender.send(sub_info, payload)`. Generalize the dispatch so that, per target, it fans out to **whichever subscriptions exist** for that user: web-push subscriptions go through the existing VAPID sender; native tokens go through an Expo Push (HTTP `https://exp.host/--/api/v2/push/send`) or direct FCM/APNs sender. `sent` continues to count successful deliveries across both transports.

3. **Keep the payload data contract identical.** Native pushes must carry the same `data` the app deep-links on:
   ```jsonc
   {
     "title": "Llamada Entrante",
     "body":  "Llamada de citofonia desde {callerName}",
     "data":  { "url": "/citofonia", "room": "<room>", "callerName": "<name>" }
   }
   ```
   On the device, `expo-notifications` `addNotificationResponseReceivedListener` reads `data.room`/`data.callerName`, deep-links to `/citofonia`, and calls `joinRoom(room)`. The WS `citofonia/incoming_call` event remains the foreground path; native push is the closed/background-app fallback (mirroring how web used the Service Worker).

4. **No change to the call/token endpoints.** `POST /citofonia/call` and `GET /citofonia/token` are transport-agnostic and stay as-is; only the subscription registration and the sender fan-out change.

> Net: the auth contract is unchanged (cookie OR Bearer already supported). The only additive backend work for the mobile port is native-push token registration + a native sender wired into the existing citofonía (and any other notification) dispatch, coexisting with web-push VAPID.
