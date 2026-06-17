-- ADDITIVE: native (Expo / FCM / APNs) push tokens for the mobile port.
-- Coexists with push_subscriptions (web-push / VAPID); does NOT replace it.
-- See docs/mobile-port/BACKEND_CONTRACT.md "Additive native-push endpoint".
--
-- Native (iOS/Android) apps have no Service Worker and no Web Push, so they
-- register a device push token instead of an {endpoint, p256dh, auth} triple.
-- The citofonía dispatch fans out to BOTH tables per target.

CREATE TABLE native_push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    platform text NOT NULL,          -- 'expo' | 'fcm' | 'apns'
    token text NOT NULL UNIQUE,      -- upsert key (mirrors push_subscriptions.endpoint)
    device_id text,                  -- optional stable per-install id, for dedupe across reinstalls
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX native_push_tokens_usuario_id_idx ON native_push_tokens (usuario_id);
