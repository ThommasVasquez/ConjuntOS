# 016 — Citofonía sobre LiveKit + TURN (con push VAPID real)

> Estado: **DRAFT** · Reemplaza el transporte de la citofonía descrita en `specs/011-chat-citofonia`.
> Decisiones tomadas: LiveKit **self-hosted + coturn** · **solo audio** · **reemplazo directo de PeerJS** (sin feature flag) · wake-up por **Web Push VAPID**.

## 1. Objetivo

Migrar la citofonía de ConjuntOS desde **PeerJS** (broker público `0.peerjs.com`, sin TURN) a **LiveKit self-hosted** con **TURN**, y reemplazar el stub de push (`LogOnlyPushSender`) por un **emisor Web Push VAPID real**, de modo que una llamada de citofonía:

1. Conecte **audio bidireccional** de extremo a extremo de forma confiable, **incluso tras NAT simétrico / redes restrictivas** (gracias a TURN).
2. **Despierte el teléfono** del residente cuando la app no está abierta (push VAPID real → Service Worker → unirse a la sala).
3. No dependa de ningún servicio público externo de señalización.

### Usuarios / actores
- **Portería (VIGILANTE)**, **Administración (ADMINISTRADOR)**, **Residentes (por apartamento)** — los mismos roles y targeting de hoy.
- Multi-tenant: toda llamada está acotada a un `conjunto_id`; nunca debe cruzar conjuntos.

### No-objetivos (fuera de alcance)
- Video / cámara de puerta (solo audio).
- Push nativo FCM/APNs (se usa Web Push VAPID).
- Cambiar la citofonía a LiveKit Cloud.
- Tocar el uso de LiveKit en Asamblea (`012-asamblea`) — debe seguir funcionando igual.

## 2. Modelo de la llamada (room + ring)

A diferencia de PeerJS (peerId fijo + `peer-unavailable`), LiveKit es por **sala**. El que llama crea una sala efímera por llamada; el destinatario se une cuando contesta/despierta.

- **Room name:** `citofonia-{conjuntoId}-{uuid}` (el `conjuntoId` embebido permite verificar tenancy del que se une, igual que `parse_peer_id`).
- **Targeting de a quién timbrar:** se conserva tal cual (los 4 patrones de peerId → `parse_peer_id` → `resolve_targets`). El peerId solo se usa para **resolver a qué usuarios mandar el push**, ya no como dirección de medios.
- **Tokens:** se emiten con el `generate_token` existente (`services/livekit.rs`), `can_publish=true`, `can_subscribe=true`, audio-only.

### Endpoints backend (nuevos / cambian)
| Método | Ruta | Quién | Hace |
|---|---|---|---|
| `POST` | `/citofonia/call` | el que llama | Resuelve targets, genera `room`, emite token del llamante, envía push VAPID a los targets, responde `{ room, token, url, sent }`. **Reemplaza** `call-push`. |
| `GET` | `/citofonia/token?room={room}` | el que contesta | Verifica que el `conjuntoId` embebido en `room` == conjunto del usuario; emite token para esa sala. Responde `{ token, url }`. (Espeja Asamblea.) |

- Si LiveKit no está configurado → `503 "LiveKit no configurado"` (igual que Asamblea).
- Si VAPID no está configurado → el push falla de forma observable; `sent` refleja **envíos reales** (jamás contar como enviado lo que solo se logueó). Sin suscripciones → `sent: 0`.

### Payload de push (cambia)
De `{ url, callerName, callerPeerId }` a:
```json
{ "title": "Llamada Entrante", "body": "Llamada de citofonía desde {callerName}",
  "data": { "url": "/citofonia", "room": "citofonia-{conjuntoId}-{uuid}", "callerName": "..." } }
```
El Service Worker (`public/sw.js`) pasa `room` en el mensaje `ANSWER_CALL` (en vez de `callerPeerId`).

## 3. Estructura del proyecto (archivos a tocar)

**Backend (Rust / axum / diesel-async)**
- `backend/api/Cargo.toml` — añadir crate `web-push`.
- `backend/api/src/services/push.rs` — `WebPushSender` real (VAPID); `create_push_sender` devuelve el real cuando `vapid_*` están presentes, si no `LogOnlyPushSender` cuyo `send()` retorna `Err` mapeable (no Ok silencioso).
- `backend/api/src/domains/citofonia/handlers.rs` — reemplazar `call_push` por `call`; añadir `citofonia_token`; **conservar** `parse_peer_id` y `resolve_targets` y sus tests.
- DTOs en citofonía (`CallRequest`, `CallResponse`, `CitofoniaTokenDto`).
- `backend/api/tests/m5b_test.rs` — actualizar tests de call-push al nuevo flujo `call` + token; añadir test de rechazo cross-tenant en `token`.

**Frontend (Next.js / React)**
- `src/components/providers/CallContext.tsx` — quitar PeerJS; usar `Room` de `livekit-client` (audio-only). Conservar tonos (Web Audio) y UI; `startCall` → `POST /citofonia/call` → conecta a `room` con token. Contestar → `GET /citofonia/token` → conecta.
- `public/sw.js` — `ANSWER_CALL` lleva `room` en vez de `callerPeerId`.
- `src/app/(app)/citofonia/page.tsx` — adaptar al flujo basado en sala si aplica.
- `package.json` — **eliminar** `peerjs`.

**Infra / despliegue**
- `docker-compose.yml` — servicio `livekit` de `--dev` a config real (`livekit.yaml` con keys y TURN); servicio TURN (coturn) **o** TURN embebido de LiveKit; abrir puertos UDP.
- `livekit.yaml` (+ `coturn`/turnserver.conf si standalone) — config nueva.
- `DEPLOYMENT_ENV.md` — `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, `LIVEKIT_*` reales, dominio/cert TURN.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en el front (suscripción push ya existe en `notificaciones`).

> **Decisión a confirmar en /plan:** TURN embebido de LiveKit (TURN/TLS, menos ops, recomendado por LiveKit) **vs** coturn standalone (lo que elegiste). Ambos cumplen el requisito de NAT; el plan fijará uno.

## 4. Estilo de código
- **Rust:** seguir el patrón existente — routers axum, `ApiResult`/`ApiError`, handlers diesel-async, `#[serde(rename_all="camelCase")]` en DTOs, tenancy con `conjunto_id` en cada query. Reusar `services/livekit::generate_token`.
- **Frontend:** mantener el patrón de `CallContext` (refs + context) y reusar el patrón de `LiveRoom.tsx` (`livekit-client` / `@livekit/components-react`). Sin libs nuevas salvo necesidad.
- Sin secretos en el repo; valores reales por env.

## 5. Estrategia de pruebas (la prueba es la evidencia)
**Unit (Rust)**
- `WebPushSender`: construye request VAPID correcta; `send()` éxito vs error; factory devuelve real cuando hay keys y stub-que-falla cuando no.
- `parse_peer_id` / room-tenant: conservar tests; añadir rechazo cross-tenant en `token` (room con otro `conjuntoId` → vacío/403).

**Integración (Rust, `m5b_test.rs`)**
- `POST /citofonia/call` con target válido → `200 { room, token, url, sent>0 }` (con suscripción sembrada).
- Sin suscripciones → `sent: 0`. LiveKit no configurado → `503`.
- `GET /citofonia/token?room=...` mismo conjunto → token válido; otro conjunto → rechazado.

**E2E manual (criterio "todo funciona")**
1. Dos navegadores, ambos en `/citofonia`: portería llama a un apto → **audio conecta** por LiveKit (verificar pista de audio activa en ambos).
2. Cerrar la app del destinatario → la llamada dispara push → **llega notificación** → al tocar, abre `/citofonia`, se une a la sala y **conecta audio**.
3. Detrás de NAT restrictivo / red corporativa → la llamada conecta y el **candidato ICE seleccionado es `relay`** (TURN en uso). Evidencia: `chrome://webrtc-internals` o stats de LiveKit.
4. No quedan referencias a `peerjs` / `0.peerjs.com`; `cargo test` y `pnpm build` pasan; **Asamblea sigue funcionando**.

## 6. Límites (boundaries)
**Siempre**
- Preservar aislamiento multi-tenant (`conjunto_id` en todo; verificar el `conjuntoId` embebido en el room).
- Solo audio. Reusar `generate_token` existente. Mantener Asamblea intacta.
- Correr `cargo test` + `pnpm build` (y `pnpm lint` si aplica) antes de dar por hecha una tarea.
- `graphify update .` tras modificar código.

**Preguntar primero**
- Provisionar dominio/certificados TLS reales para TURN; abrir puertos UDP en producción.
- Generar/rotar llaves VAPID y llaves LiveKit reales.
- Cualquier cambio que incurra en costo de infra.
- Commit / push (no commitear sin pedirlo).

**Nunca**
- Commitear secretos (VAPID private key, LiveKit secret, credenciales TURN) al repo.
- Romper el aislamiento entre conjuntos.
- Volver a contar como `sent` un push que no se envió.
- Eliminar o degradar el uso de LiveKit en Asamblea.
- Dejar dependencia de `0.peerjs.com` ni de ningún broker público.

## Criterios de aceptación (resumen verificable)
- [ ] PeerJS eliminado del front y de `package.json`; sin referencias a broker público.
- [ ] `POST /citofonia/call` y `GET /citofonia/token` implementados, con tenancy y 503 si LiveKit no configurado.
- [ ] `WebPushSender` VAPID real; `sent` refleja envíos reales; tests verdes.
- [ ] `sw.js` y `CallContext` usan `room` + LiveKit (audio-only); tonos/UI conservados.
- [ ] LiveKit self-hosted con TURN funcionando; llamada conecta vía `relay` tras NAT.
- [ ] E2E: llamada con app abierta y con app cerrada (push despierta) conectan audio.
- [ ] Asamblea (LiveKit) sigue funcionando; `cargo test` + `pnpm build` pasan.
