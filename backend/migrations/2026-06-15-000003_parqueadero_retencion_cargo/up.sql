-- Parqueadero v6: RETENCIÓN del vehículo hasta que el residente acepte el cargo.
--
-- Regla de negocio (corrección crítica): cuando el operario de portería elige
-- "Cargar al apartamento", el vehículo NO debe poder salir hasta que el
-- residente apruebe el cobro. Antes la celda se liberaba de inmediato y el
-- cargo quedaba "pendiente" después — el visitante ya se había ido.
--
-- Nuevo estado de sesión: 'RETENIDA'.
--   ACTIVA   → el vehículo está estacionado, corre el tiempo/cobro.
--   RETENIDA → el operario pidió cargar al apto; el vehículo está en portería
--              esperando la decisión del residente. La celda sigue OCUPADA.
--   CERRADA  → resuelto (residente aprobó y se cargó al apto, o el visitante
--              pagó en sitio). La celda queda liberada.
--
-- Transiciones desde RETENIDA:
--   - residente APRUEBA  → CERRADA, liquidacion=CARGADO_APTO, se crea el pago,
--                          se libera la celda, se avisa a portería.
--   - residente RECHAZA  → sigue RETENIDA, liquidacion=CARGADO_APTO_RECHAZADO;
--                          portería debe cobrar al visitante en sitio.
--   - visitante PAGA en sitio (válvula de escape) → CERRADA, VISITANTE_PAGO,
--                          se libera la celda.

ALTER TABLE sesiones_parqueadero
    DROP CONSTRAINT sesiones_parqueadero_estado_check;
ALTER TABLE sesiones_parqueadero
    ADD CONSTRAINT sesiones_parqueadero_estado_check
    CHECK (estado IN ('ACTIVA', 'RETENIDA', 'CERRADA'));

-- El índice único de "una sesión por celda" cubría solo ACTIVA. Ahora una
-- celda RETENIDA tampoco puede recibir otra sesión: ampliamos a ACTIVA+RETENIDA.
DROP INDEX IF EXISTS sesiones_parqueadero_celda_activa_uidx;
CREATE UNIQUE INDEX sesiones_parqueadero_celda_viva_uidx
    ON sesiones_parqueadero (parqueadero_id)
    WHERE estado IN ('ACTIVA', 'RETENIDA');
