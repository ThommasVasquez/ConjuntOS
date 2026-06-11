# 003 — Notificaciones & Web Push

> IMPLEMENTED (M4) — `backend/api/src/domains/notificaciones/`.

## Purpose
In-app notifications + web-push subscriptions. Replaces `/api/notificaciones` (GET, PUT)
and `/api/user/push-subscribe` (POST, DELETE).

## Surface (implemented)
- `GET /api/v1/notificaciones` → latest 20 of the caller, newest first.
  `[{ id, tipo, titulo, mensaje, leida, createdAt }]`
- `PUT /api/v1/notificaciones/leidas` → marks own notifications read.
  Optional body `{ ids?: [uuid] }`; without it (or without `ids`) marks ALL unread.
  Response `{ updated: number }`.
- `POST /api/v1/usuarios/me/push-subscriptions`
  body `{ endpoint, keys: { p256dh, auth } }` — upsert on `endpoint` (multi-device,
  re-subscribing re-binds the endpoint to the current user/keys).
  Response `{ id, endpoint, createdAt }`.
- `DELETE /api/v1/usuarios/me/push-subscriptions` body `{ endpoint }` — idempotent,
  scoped to the caller. Response `{ ok: true, deleted: n }`.

## Internal helper
`notificaciones::repo::create_notificacion(conn, conjunto_id, usuario_id, tipo, titulo, mensaje)`
— single entry point used by other domains (vigilancia paquetes today; anuncios,
solicitudes, tramites later). `tipo` is an open text set (legacy parity).

## Notes
- Push *sending* (`PushSender` trait + VAPID, `services/push.rs`) is NOT part of M4;
  subscriptions are stored and ready for it.
- Tables: `notificaciones`, `push_subscriptions` (endpoint UNIQUE).
