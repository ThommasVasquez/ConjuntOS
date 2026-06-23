# EN-CONJUNTO — Inventario de funcionalidades

_Verificado contra el código el 2026-06-23: **32 dominios backend**, **~130 endpoints REST**
(31 routers `.merge()` en `lib.rs` + `/healthz`, `/api/v1/ws`, `/api/v1/openapi.json`, `/docs`),
frontend Next.js con **38 páginas**. Inventario de rutas: `grep -rE '\.route\(' backend/api/src/domains`._

Leyenda: ✅ implementado + probado · 🟡 implementado (sin tests dedicados) · ⚠️ parcial / diferido

---

## Backend (Rust / Axum) — ~130 endpoints

### ✅ Autenticación y multi-tenancy (M1–M2)
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/password`, `GET /auth/ws-ticket`
- JWT + cookie httpOnly, token en memoria, ws-ticket corto (120s)
- Revocación de sesión vía `password_changed_at`
- Aislamiento por conjunto (tenant guards) en todos los dominios
- 7 tests auth + role-gate

### ✅ Usuarios y entidades core
- `GET/PUT /usuarios/me/profile` (bootstrap de unidad), conjuntos, unidades
- `GET /admin/stats` (panel admin con datos reales)
- `GET/POST/PUT /superadmin/conjuntos` (gestión multi-conjunto)

### ✅ Vigilancia (M4)
- Visitas: `POST /visitas`, `GET/POST /vigilancia/visitas`
- Paquetes: `GET /vigilancia/paquetes`, `GET /paquetes/mios`, `PUT /vigilancia/paquetes/{id}/entregar`
- Comunicaciones de portería, `GET /vigilancia/stats`
- 13 tests M4 (incluye notificaciones transaccionales)

### ✅ Parqueadero (M4)
- Mapa de celdas, `PUT /parqueadero/celdas/{id}` (con auditoría)
- Vehículos (`POST /vehiculos`, unique por conjunto), rondas, registros, stats

### ✅ Reservas (M4)
- Áreas comunes + slots, `GET/POST /reservas`
- Constraint GiST anti-doble-reserva (409 en solapamiento)

### ✅ Pagos (M4)
- `GET /pagos`, `PUT /pagos/{id}/pagar` (pago simulado)
- Gastos y recibos públicos para panel financiero

### ✅ Comunicaciones (M5a)
- **Anuncios/Novedades**: `GET/POST /anuncios`, `DELETE /anuncios/{id}` (fijados primero)
- Directorio con gate de rol + campos habeas data

### ✅ Solicitudes y trámites (M5a)
- `GET/POST /solicitudes` (notifica admins)
- `GET/POST /tramites`, `PUT /tramites/{id}/resolver` (aprobar trámite crea vehículo/mascota en una transacción)

### ✅ Clasificados e inmuebles (M5a)
- `GET/POST /clasificados`, `GET/POST /inmuebles`
- Categorías alineadas frontend↔backend (bug corregido en review)

### ✅ Chat y citofonía (M5b)
- Chat residente↔admin: `GET/POST /chat`, `GET /admin/chat`, `GET/POST /admin/chat/{usuario_id}`
- Citofonía LiveKit (audio): `POST /citofonia/call`, `GET /citofonia/token` + Web Push VAPID
- 11 tests M5b (aislamiento de tenant, gates de rol)

### 🟡 Asamblea (M6) — 20 endpoints
- Ciclo completo: sesiones, asistencias, poderes, turnos, votaciones, votos, pairing por PIN, token LiveKit
- Endurecido en seguridad: IDOR de poderes, doble-conteo de coeficiente, voto sin unidad (corregidos en review)
- Sin tests de integración dedicados aún

### 🟡 IA / búsqueda (M7) — 8 endpoints
- Búsqueda semántica (`POST /search`), copiloto de asamblea, generación de acta, traducción, subtítulos (Gemini)
- Sin tests de integración dedicados aún

### 🟡 Dominios nuevos (M8+) — añadidos desde 2026-06-12
- **SOS / pánico**: `POST /sos`, `GET /sos/activa`, `POST /sos/{id}/atender|cancelar|resolver` (botón de pánico residente + vigilancia, backstop 1 alerta activa/usuario)
- **Multas**: `GET /multas`, `POST /multas/{id}/anular|apelar` (admin emite, residente apela)
- **Encuestas**: `GET /encuestas`, `POST /encuestas/{id}/votar|cerrar` (votación online; admin/concejo/super_admin crean y cierran)
- **Comité de convivencia**: `GET/PUT /convivencia/casos`, `…/asignar|mediacion|acta`, `GET/POST /convivencia/comite`, actas firmables
- **Pases temporales**: `POST /pases-temporales`, `GET /pases-temporales/mis-pases|mi-pase`, `…/validar/{codigo}`, `…/{id}/revocar`
- **Analytics / demografía**: `GET /admin/analytics/demografia`, `GET /admin/morosidad`, `GET /admin/status-config`
- **Ad-spaces (banners)**: `GET /ad-spaces/active`, `POST /ad-spaces/{id}/click|impress`, `GET /admin/ad-spaces`
- **IA unificada**: `POST /ai/asistente` (un solo endpoint "pregunta lo que sea", aterrizado en Ley 675)
- **Documentos**: gestión documental por conjunto
- Parqueadero ampliado: reservas de celda, sesiones, rondas con checkpoints, cargos/aprobaciones

### ✅ Infraestructura
- `/healthz` con ping a BD, RFC-7807 errors, CORS, TimeoutLayer (30s→408)
- CatchPanicLayer, graceful shutdown (SIGTERM), WebSocket con auth por ticket
- Almacenamiento S3/MinIO (sin fallback falso; falla fuerte si no está configurado)

### ⚠️ Diferido
- **Push notifications (VAPID web-push)**: solo log, deps removidas en M9 — pendiente de construir
- **Migrate `--verify`**: solo cuenta filas (checks FK/campos diferidos)

---

## Frontend (Next.js 15 + Tailwind v4) — 38 páginas

✅ Tema **azul**. Residente: inicio, cartelera, encuestas, clasificados, perfil, pagos,
pqrs, reservas, chat, directorio, citofonía, mi-estancia, novedades, pases-temporales,
inmobiliaria, comité-convivencia, asistente (IA), parqueadero, visitantes.
Vigilancia: vigilancia, control-visitas, correspondencia, paquetería, novedades-seguridad,
seguridad. Parqueadero: mapa-parqueadero, bitácora-parqueadero.
Admin: admin-analytics, admin-areas, admin-banners, admin-finanzas, admin-mensajes,
admin-novedades, admin-parqueadero, admin-pqrs, admin-residentes. Superadmin. Público: login,
landing. Asamblea (LiveKit).

Cliente API centralizado (`src/lib/api/client.ts`) con prefijo `/api/v1`,
credenciales por cookie + Bearer en memoria, parsing de errores problem+json.

---

## Datos demo (`--seed-demo`)

Conjunto Demo totalmente poblado e idempotente: 10 usuarios (1+ por rol), 5 unidades,
6 anuncios, 5 mascotas, 4 vehículos, 5 pagos, 4 áreas comunes, 3 reservas, 3 visitas,
3 paquetes, 4 notificaciones, 4 documentos, 4 gastos, 3 recibos. Ver `TEST_CREDENTIALS.md`.

---

## E2E (Playwright)

- **Smoke** (`e2e/01-*`…`14-*`) — cada vista carga sin rebotar a `/login`.
- **`e2e/realistic-journeys.spec.ts`** — 38 journeys "usuario real": abre cada vista por rol,
  rellena inputs visibles, abre formularios y cancela (o envía con `SUBMIT=1`). Corre contra
  el stack local (`baseURL=localhost:3000`).
- **`e2e/prod-1000users.spec.ts`** — 1000 lecturas concurrentes contra prod (solo lectura, sin
  escrituras). `LOAD_USERS=N` ajusta el volumen. Verificado a 30 → 100% OK, p95 ~615ms.
  ⚠️ `api.conjuntos.app` está tras Cloudflare: una ráfaga de 1000 puede gatillar rate-limit de CF.

## Estado de verificación (ground truth)

| Check | Resultado |
|---|---|
| `cargo test --workspace` | ✅ 65/65 (sin tests dedicados para dominios M8+) |
| `cargo clippy -p enconjunto-migrate -- -D warnings` | ✅ 0 warnings |
| `cargo fmt --check` (migrate) | ✅ limpio |
| `--seed-demo` contra Postgres real | ✅ idempotente |
| `pnpm playwright test --list` | ✅ 39 tests (38 journeys + 1 carga) |
| `prod-1000users` @ LOAD_USERS=30 | ✅ 30/30 OK (100%) |
