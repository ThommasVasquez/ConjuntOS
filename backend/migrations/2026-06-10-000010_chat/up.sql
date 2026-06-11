-- Resident ↔ administration chat. specs/011-chat-citofonia/spec.md
-- conjunto_id added (legacy scoped only through usuario).

CREATE TABLE chat_admin (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),  -- the resident side of the thread
    mensaje text NOT NULL,
    audio_url text,        -- Supabase Storage "chat-voice" bucket object URL
    transcripcion text,
    es_de_admin boolean NOT NULL DEFAULT false,
    leido boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_admin_usuario_created_idx ON chat_admin (usuario_id, created_at DESC);
CREATE INDEX chat_admin_conjunto_created_idx ON chat_admin (conjunto_id, created_at DESC);
CREATE INDEX chat_admin_no_leidos_idx ON chat_admin (conjunto_id, leido) WHERE NOT leido;
