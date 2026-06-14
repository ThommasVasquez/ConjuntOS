-- Parqueadero v3: aprobación por INQUILINO para celdas de visitante.
-- Una asignación de celda VISITANTE la aprueba el residente/inquilino que recibe
-- la visita (NO el admin). Queda en el log del admin solo como lectura.

-- 1) Nuevo estado PENDIENTE_INQUILINO en el log de solicitudes.
ALTER TABLE solicitudes_parqueadero
    DROP CONSTRAINT solicitudes_parqueadero_estado_check;
ALTER TABLE solicitudes_parqueadero
    ADD CONSTRAINT solicitudes_parqueadero_estado_check
    CHECK (estado IN ('PENDIENTE', 'PENDIENTE_INQUILINO', 'APROBADA', 'RECHAZADA', 'EJECUTADA'));

-- 2) Destinatario: el inquilino que debe dar el visto bueno (snapshot del nombre).
ALTER TABLE solicitudes_parqueadero
    ADD COLUMN destinatario_id uuid REFERENCES usuarios(id),
    ADD COLUMN destinatario_nombre text;

CREATE INDEX solicitudes_parqueadero_destinatario_idx
    ON solicitudes_parqueadero (conjunto_id, destinatario_id)
    WHERE destinatario_id IS NOT NULL;
