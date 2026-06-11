# Endpoint parity checklist

Every legacy route × method must be **implemented**, or explicitly **dropped**, before cutover.
Status legend: specced → implemented → tested → frontend-switched. Mark `DROPPED` with reason.
All routes below are now **implemented+switched** (frontend cutover complete — `src/app/api/` deleted).

| Legacy route (src/app/api) | Methods | New Rust endpoint | Spec | Status |
|---|---|---|---|---|
| `/api/auth/[...nextauth]` | (handler) | `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout` | 001 | implemented+tested |
| `/api/auth/login` | POST | `POST /api/v1/auth/login` | 001 | implemented+tested |
| `/api/user/profile` | GET, PUT | `GET/PUT /api/v1/usuarios/me/profile` | 002 | implemented+tested |
| `/api/user/profile-save` | POST | merged into `PUT /api/v1/usuarios/me/profile` | 002 | implemented+tested (merged) |
| `/api/user/push-subscribe` | POST, DELETE | `POST/DELETE /api/v1/usuarios/me/push-subscriptions` | 003 | implemented+tested |
| `/api/notificaciones` | GET, PUT | `GET /api/v1/notificaciones`, `PUT /api/v1/notificaciones/leidas` | 003 | implemented+tested |
| `/api/citofonia/call-push` | POST | `POST /api/v1/citofonia/call-push` | 011 | implemented+tested+switched |
| `/api/user/chat` | GET, POST | `GET/POST /api/v1/chat` | 011 | implemented+tested+switched |
| `/api/admin/chat` | GET | `GET /api/v1/admin/chat` (conversation list) | 011 | implemented+tested+switched |
| `/api/admin/chat/[userId]` | GET, POST | `GET/POST /api/v1/admin/chat/{usuario_id}` | 011 | implemented+tested+switched |
| `/api/user/directory` | GET | `GET /api/v1/directorio` | 008 | implemented+tested |
| `/api/user/comunicaciones` | GET, POST | `GET /api/v1/comunicaciones`, `POST /api/v1/visitas` (programmed visit) | 004 | implemented+tested |
| `/api/vigilancia/visitas` | GET, POST | `GET/POST /api/v1/vigilancia/visitas` | 004 | implemented+tested |
| `/api/vigilancia/paquetes` | GET, POST, PUT | `GET/POST /api/v1/vigilancia/paquetes`, `PUT .../{id}/entregar` | 004 | implemented+tested |
| `/api/vigilancia/stats` | GET | `GET /api/v1/vigilancia/stats` | 004 | implemented+tested |
| `/api/user/paquetes` | GET | `GET /api/v1/paquetes/mios` | 004 | implemented+tested |
| `/api/user/parqueadero` | GET, POST | `GET /api/v1/parqueadero/mio`, `POST /api/v1/vehiculos` | 005 | implemented+tested |
| `/api/parqueadero/mapa` | GET, PUT | `GET /api/v1/parqueadero/mapa`, `PUT /api/v1/parqueadero/celdas/{id}` | 005 | implemented+tested |
| `/api/parqueadero/registros` | GET | `GET /api/v1/parqueadero/registros` | 005 | implemented+tested |
| `/api/parqueadero/rondas` | GET, POST | `GET/POST /api/v1/parqueadero/rondas` | 005 | implemented+tested |
| `/api/parqueadero/stats` | GET | `GET /api/v1/parqueadero/stats` | 005 | implemented+tested |
| `/api/user/reservas` | GET, POST | `GET/POST /api/v1/reservas` | 006 | implemented+tested |
| `/api/user/reservas/areas` | GET | `GET /api/v1/areas-comunes` (no auto-seed; Law 4) | 006 | implemented+tested |
| `/api/user/reservas/slots` | GET | `GET /api/v1/areas-comunes/{id}/slots?fecha=` | 006 | implemented+tested |
| `/api/user/pagos` | GET, PUT | `GET /api/v1/pagos`, `PUT /api/v1/pagos/{id}/pagar` (simulated) | 007 | implemented+tested |
| `/api/user/pagos/seed` | GET | DROPPED — demo data via `enconjunto-migrate --seed-demo` | 007 | dropped |
| `/api/user/clasificados` | GET, POST | `GET/POST /api/v1/clasificados` | 010 | implemented+tested |
| `/api/user/inmuebles` | GET, POST | `GET/POST /api/v1/inmuebles` (query filters) | 010 | implemented+tested |
| `/api/user/anuncios` | GET, POST, DELETE | `GET/POST /api/v1/anuncios`, `DELETE /api/v1/anuncios/{id}` | 008 | implemented+tested |
| `/api/user/solicitudes` | GET, POST | `GET/POST /api/v1/solicitudes` | 009 | implemented+tested |
| `/api/user/tramites` | POST | `POST /api/v1/tramites` | 009 | implemented+tested |
| `/api/tramites` | GET, POST | `GET /api/v1/tramites` (role-filtered), POST merged above | 009 | implemented+tested |
| `/api/tramites/aprobar` | PUT | `PUT /api/v1/tramites/{id}/resolver` (side-effects: vehiculo/mascota) | 009 | implemented+tested |
| `/api/asamblea/session` | GET, POST | `GET/PUT /api/v1/asambleas/activa/session` | 012 | implemented+switched |
| `/api/asamblea/pairing` | GET, POST | `GET/POST /api/v1/asambleas/pairing` (pin_hash) | 012 | implemented+switched |
| `/api/asamblea/votaciones` | GET, POST, PUT | `GET/POST/PUT /api/v1/asambleas/{id}/votaciones` | 012 | implemented+switched |
| `/api/asamblea/votos` | GET, POST | `GET/POST /api/v1/votaciones/{id}/votos` | 012 | implemented+switched |
| `/api/asamblea/asistencia` | GET, POST | `GET/POST /api/v1/asambleas/{id}/asistencias` (+quorum) | 012 | implemented+switched |
| `/api/asamblea/opiniones` | GET, POST | `GET/POST /api/v1/asambleas/{id}/opiniones` (auth REQUIRED — legacy allowed anon) | 012 | implemented+switched |
| `/api/asamblea/turnos` | GET, POST, PUT | `GET/POST/PUT /api/v1/asambleas/{id}/turnos` | 012 | implemented+switched |
| `/api/asamblea/poderes` | GET, POST, PUT | `GET/POST/PUT /api/v1/asambleas/{id}/poderes` | 012 | implemented+switched |
| `/api/asamblea/subtitulos` | GET, POST | `GET/POST /api/v1/asambleas/{id}/subtitulos` | 012 | implemented+switched |
| `/api/asamblea/copilot` | POST | `POST /api/v1/asambleas/{id}/copilot` | 013 | implemented+switched |
| `/api/asamblea/copilot/translate` | POST | `POST /api/v1/asambleas/copilot/translate` | 013 | implemented+switched |
| `/api/asamblea/copilot/consensuar` | POST | `POST /api/v1/asambleas/{id}/copilot/consensuar` | 013 | implemented+switched |
| `/api/asamblea/acta` | GET, POST | `GET/POST /api/v1/asambleas/{id}/acta` | 013 | implemented+switched |
| `/api/search` | POST | `POST /api/v1/search` | 013 | implemented+switched |
| `/api/admin/stats` | GET | `GET /api/v1/admin/stats` | 002 | implemented+tested |
| `/api/superadmin/conjuntos` | GET, POST, PUT | `GET/POST /api/v1/superadmin/conjuntos`, `PUT .../{id}` | 002 | implemented+tested |
| `/api/debug-db` | GET | DROPPED — `/healthz` covers liveness; ops introspection not exposed | — | dropped |
| `/api/debug/db-status` | GET | DROPPED — duplicate of healthz | — | dropped |
| `/api/debug/seed-pagos` | GET | DROPPED — `--seed-demo` | — | dropped |
| `/api/debug/users` | GET | DROPPED — superadmin UI / SQL console instead | — | dropped |
| `/api/setup-voice` | GET | DROPPED — bucket provisioning is an ops runbook step (specs/011) | — | dropped |
