# 011 — Chat (user↔admin) & Citofonía

Status: **implemented+tested** (M5b). 9 integration tests passing.

## Purpose

Replaces `/api/user/chat` (GET, POST), `/api/admin/chat` (GET list), `/api/admin/chat/[userId]`
(GET, POST + mark read + resident enrichment), `/api/citofonia/call-push` (POST).

`/api/setup-voice` is **DROPPED** — bucket provisioning is an ops runbook step.

## Schema

Uses existing `chat_admin` table (created in M2 migration):

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| conjunto_id | UUID FK | Tenant scope |
| usuario_id | UUID FK | The resident this thread belongs to |
| mensaje | TEXT | Message body |
| audio_url | TEXT? | Supabase Storage URL for voice note |
| transcripcion | TEXT? | Optional transcription of audio |
| es_de_admin | BOOL | true = admin sent it |
| leido | BOOL | Marked true when admin reads the thread |
| created_at | TIMESTAMPTZ | |

## Endpoints — Resident chat

### `GET /api/v1/chat`
- **Auth**: any authenticated user.
- **Logic**: returns up to 50 messages for the caller (`usuario_id = caller`), ordered oldest first.
- **Response**: `ChatMensajeDto[]` (id, mensaje, audioUrl, transcripcion, esDeAdmin, leido, creadoEn).

### `POST /api/v1/chat`
- **Auth**: any authenticated user.
- **Body**: `{ mensaje: string, audioBase64?: string, transcripcion?: string }`.
- **Logic**:
  1. Validate `mensaje` is non-empty (unless audioBase64 is provided).
  2. If `audioBase64` is provided, upload to Supabase Storage bucket `chat-voice` via `services/storage.rs`, get back the public URL.
  3. Insert into `chat_admin` with `es_de_admin = false`, `leido = false`.
- **Response**: the created `ChatMensajeDto`.

## Endpoints — Admin chat

### `GET /api/v1/admin/chat`
- **Auth**: ADMINISTRADOR.
- **Logic**: returns the conversation list — one summary row per resident who has messaged. Groups by `usuario_id`. Each row shows: last message text, timestamp, unread count, resident info (nombre, avatar, torre, apto).
- **For SUPER_ADMIN**: only shows threads from ADMINISTRADOR users (inter-admin support channel).
- **Response**: `ChatConversacionDto[]` (usuarioId, ultimoMensaje, ultimoTimestamp, noLeidos, residente: { nombre, avatar, torre, apto }).

### `GET /api/v1/admin/chat/{usuario_id}`
- **Auth**: ADMINISTRADOR.
- **Logic**:
  1. Validate the target usuario belongs to the caller's conjunto (Law 2). 404 if not.
  2. Fetch up to 100 messages for that usuario, oldest first.
  3. **Side effect**: mark all non-admin unread messages as `leido = true`.
  4. Enrich with resident info: profile, vehiculos, mascotas.
- **Response**: `{ mensajes: ChatMensajeDto[], residentInfo: { profile, vehicles, pets } }`.

### `POST /api/v1/admin/chat/{usuario_id}`
- **Auth**: ADMINISTRADOR.
- **Body**: `{ mensaje?: string, audioUrl?: string, transcripcion?: string }`.
- **Logic**: at least `mensaje` or `audioUrl` must be present. Insert with `es_de_admin = true`.
- **Response**: the created `ChatMensajeDto`.

## Endpoints — Citofonía

### `POST /api/v1/citofonia/call-push`
- **Auth**: any authenticated user.
- **Body**: `{ targetPeerId: string, callerName: string, callerPeerId: string }`.
- **Logic**: parse `targetPeerId` to resolve target users, then send web-push notifications.

#### Peer-ID resolution (4 patterns)

| Pattern | Example | Resolution |
|---|---|---|
| `user-{userId}` | `user-550e8400...` | Single user by UUID |
| `{conjuntoId}-VIGILANTE` | `abc123-VIGILANTE` | All VIGILANTE users in the conjunto |
| `{conjuntoId}-ADMINISTRADOR` | `abc123-ADMINISTRADOR` | All ADMINISTRADOR users in the conjunto |
| `{conjuntoId}-APTO-{torre}-{numero}` | `abc123-APTO-A-301` | Users linked to that unidad |

For each resolved user:
1. Look up their `push_subscriptions`.
2. Send web-push via `services/push.rs` (`PushSender` trait).

**Push payload**: `{ title: "Llamada Entrante", body: "Llamada de citofonia desde {callerName}", data: { url: "/citofonia", callerName, callerPeerId } }`.

- **Response**: `{ sent: number }`.

## Services

### `services/push.rs`
- `PushSender` trait with `async fn send(&self, subscription: &PushSubscriptionInfo, payload: &[u8]) -> Result<()>`.
- `VapidPushSender`: real implementation using the `web-push` crate with VAPID keys from config.
- `RecordingPushSender`: test double that records all payloads sent (for assertion in tests).
- `AppState` gains a `push_sender: Arc<dyn PushSender>` field.

### `services/storage.rs`
- `StorageService` trait with `async fn upload(&self, bucket: &str, path: &str, data: &[u8], content_type: &str) -> Result<String>`.
- `SupabaseStorage`: real implementation using Supabase Storage REST API (service-role key auth).
- `FakeStorage`: test double that returns deterministic URLs.
- `AppState` gains a `storage: Arc<dyn StorageService>` field.

## Dependencies (new for M5b)

- `web-push` crate — VAPID web push.
- `reqwest` with `rustls-tls` feature — for Supabase Storage REST calls.
- `base64` — decode audioBase64 payloads.
- `wiremock` (dev) — mock Supabase Storage in tests.

## Invariants

- Chat messages are tenant-scoped: a resident can only see their own thread; an admin can only see threads from their conjunto (Law 2).
- Mark-read is a side effect of the admin reading a thread, not a separate endpoint.
- Voice note upload is synchronous within the POST handler; if storage fails, the whole request fails (no dangling messages without audio).
- Peer-ID parsing is a pure function — unit-testable without DB.
- Push failures are logged but do not fail the HTTP response (best-effort delivery).
