-- Parqueadero v7: RESERVAS de cupo de visitante (con antelación).
--
-- El residente reserva un CUPO de parqueadero de visitante (no una celda
-- específica) para una visita que llega en carro o moto. Indica:
--   - tipo de vehículo (CARRO/MOTO) → la disponibilidad se cuenta por tipo,
--     porque una bahía de carro no sirve para moto y viceversa.
--   - hora tentativa de llegada.
--   - duración estimada de la estancia, o "tiempo libre" (sin hora de salida).
--
-- La disponibilidad se calcula por SOLAPAMIENTO: en la franja [llegada, fin]
-- hay un cupo libre si el número de reservas activas que se solapan es menor
-- que el número de celdas de visitante de esa categoría. El residente solo ve
-- si quedan cupos; NO elige la celda. El vigilante asigna la celda física
-- cuando la visita llega (con el flujo de asignación de visitante que ya existe).
--
-- Estados:
--   PENDIENTE → reservada, la visita aún no llega.
--   LLEGO     → el vigilante marcó la llegada / asignó celda (enlaza sesión).
--   CANCELADA → el residente la canceló.
--   VENCIDA   → pasó la ventana de gracia sin que la visita llegara (limpieza).

CREATE TABLE reservas_visitante_parqueadero (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    -- Residente que reserva (responsable de la visita).
    residente_id uuid NOT NULL REFERENCES usuarios(id),
    residente_nombre text NOT NULL,
    unidad_id uuid REFERENCES unidades(id),
    -- Categoría de celda requerida (CARRO/MOTO/BICI), define el pool a contar.
    categoria text NOT NULL DEFAULT 'CARRO'
        CONSTRAINT reservas_vis_categoria_check
        CHECK (categoria IN ('CARRO', 'MOTO', 'BICI')),
    -- Datos opcionales de la visita.
    visitante_nombre text,
    placa text,
    -- Ventana reservada.
    llegada_estimada timestamptz NOT NULL,
    -- Duración estimada en minutos. NULL = tiempo libre (sin hora de salida).
    duracion_minutos integer
        CONSTRAINT reservas_vis_duracion_check
        CHECK (duracion_minutos IS NULL OR duracion_minutos > 0),
    -- Fin estimado de la franja (llegada + duración). NULL si es tiempo libre;
    -- para el cálculo de solapamiento, "tiempo libre" usa un horizonte fijo.
    fin_estimado timestamptz,
    estado text NOT NULL DEFAULT 'PENDIENTE'
        CONSTRAINT reservas_vis_estado_check
        CHECK (estado IN ('PENDIENTE', 'LLEGO', 'CANCELADA', 'VENCIDA')),
    -- Enlace a la sesión de cobro cuando la visita llega y se asigna celda.
    sesion_id uuid REFERENCES sesiones_parqueadero(id),
    notas text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Disponibilidad: contar reservas activas por conjunto+categoría que se solapan
-- con una franja. Index para acelerar el rango.
CREATE INDEX reservas_vis_solape_idx
    ON reservas_visitante_parqueadero (conjunto_id, categoria, estado, llegada_estimada);

-- Las reservas de un residente (su lista).
CREATE INDEX reservas_vis_residente_idx
    ON reservas_visitante_parqueadero (conjunto_id, residente_id, estado);
