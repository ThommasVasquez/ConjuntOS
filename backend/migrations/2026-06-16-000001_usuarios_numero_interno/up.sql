-- Número interno de citofonía: código de 4 dígitos único por conjunto, inmutable.
ALTER TABLE usuarios ADD COLUMN numero_interno TEXT;

-- Backfill de usuarios existentes: 0001, 0002, ... por conjunto (orden de creación).
WITH numbered AS (
    SELECT id,
           LPAD(
               (ROW_NUMBER() OVER (PARTITION BY conjunto_id ORDER BY created_at, id))::text,
               4, '0'
           ) AS num
    FROM usuarios
)
UPDATE usuarios u
SET numero_interno = n.num
FROM numbered n
WHERE u.id = n.id;

ALTER TABLE usuarios ALTER COLUMN numero_interno SET NOT NULL;

-- Único por conjunto (global dentro del conjunto, rango 0001-9999).
CREATE UNIQUE INDEX usuarios_conjunto_numero_interno_idx
    ON usuarios (conjunto_id, numero_interno);
