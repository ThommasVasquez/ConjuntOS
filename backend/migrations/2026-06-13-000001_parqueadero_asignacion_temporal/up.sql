-- Asignación permanente con cláusula temporal (meses) para celdas de parqueadero.
-- asignado_en: cuándo se otorgó. asignado_hasta: cuándo vence (NULL = sin límite).
ALTER TABLE parqueaderos
    ADD COLUMN asignado_en   timestamptz,
    ADD COLUMN asignado_hasta timestamptz;

-- Índice para que el vigilante/jobs encuentren rápido las que vencen pronto.
CREATE INDEX parqueaderos_asignado_hasta_idx
    ON parqueaderos (asignado_hasta)
    WHERE asignado_hasta IS NOT NULL;
