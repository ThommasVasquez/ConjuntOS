-- Puntos estratégicos de ronda con NFC.
-- El administrador asigna un tag NFC (UID único) a cada punto.
CREATE TABLE puntos_ronda (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id) ON DELETE CASCADE,
    nfc_uid VARCHAR(64) UNIQUE NOT NULL,
    nombre VARCHAR NOT NULL,
    ubicacion VARCHAR,
    orden INTEGER NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX puntos_ronda_conjunto_idx ON puntos_ronda (conjunto_id, orden);
CREATE INDEX puntos_ronda_nfc_uid_idx ON puntos_ronda (nfc_uid);

CREATE TABLE checkpoints_ronda (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ronda_id uuid NOT NULL REFERENCES rondas_parqueadero(id) ON DELETE CASCADE,
    punto_id uuid NOT NULL REFERENCES puntos_ronda(id) ON DELETE RESTRICT,
    nfc_uid VARCHAR(64) NOT NULL,
    verificado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE(ronda_id, punto_id)
);

CREATE INDEX checkpoints_ronda_ronda_idx ON checkpoints_ronda (ronda_id);
