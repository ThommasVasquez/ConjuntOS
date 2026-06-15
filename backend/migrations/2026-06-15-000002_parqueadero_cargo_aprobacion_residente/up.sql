-- Parqueadero v5: el cargo "Cargar al apartamento" requiere aprobación del
-- residente, informándole el monto. Cuando el operario cierra con CARGADO_APTO,
-- la sesión NO crea el pago de inmediato: queda en CARGADO_APTO_PENDIENTE con el
-- monto congelado. El residente ve el monto y decide:
--   - aprobar  → liquidacion pasa a CARGADO_APTO y se crea el pago pendiente.
--   - rechazar → liquidacion pasa a CARGADO_APTO_RECHAZADO (queda como disputa,
--                sin pago; el admin lo ve en el log).

-- Ampliar el CHECK de liquidacion con los dos nuevos estados del cargo.
ALTER TABLE sesiones_parqueadero
    DROP CONSTRAINT sesiones_parqueadero_liquidacion_check;

ALTER TABLE sesiones_parqueadero
    ADD CONSTRAINT sesiones_parqueadero_liquidacion_check
    CHECK (liquidacion IS NULL OR liquidacion IN (
        'VISITANTE_PAGO',
        'CARGADO_APTO',
        'CARGADO_APTO_PENDIENTE',
        'CARGADO_APTO_RECHAZADO',
        'SIN_COBRO'
    ));

-- Momento en que el residente resolvió (aprobó/rechazó) el cargo a su apto.
ALTER TABLE sesiones_parqueadero
    ADD COLUMN cargo_resuelto_en timestamptz;
