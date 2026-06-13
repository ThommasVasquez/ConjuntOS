DROP INDEX IF EXISTS parqueaderos_asignado_hasta_idx;
ALTER TABLE parqueaderos
    DROP COLUMN IF EXISTS asignado_hasta,
    DROP COLUMN IF EXISTS asignado_en;
