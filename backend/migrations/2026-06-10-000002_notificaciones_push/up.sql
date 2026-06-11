-- In-app notifications + web-push subscriptions (replaces Usuario.notifPush JSON string).
-- specs/003-notificaciones-push/spec.md

CREATE TABLE notificaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    tipo text NOT NULL,  -- "APROBACION" | "SISTEMA" | "INFO" (open set in legacy; not constrained)
    titulo text NOT NULL,
    mensaje text NOT NULL,
    leida boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notificaciones_usuario_created_idx ON notificaciones (usuario_id, created_at DESC);
CREATE INDEX notificaciones_conjunto_created_idx ON notificaciones (conjunto_id, created_at DESC);

CREATE TABLE push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_usuario_id_idx ON push_subscriptions (usuario_id);
