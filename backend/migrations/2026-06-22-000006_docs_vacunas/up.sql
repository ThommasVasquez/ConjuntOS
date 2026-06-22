-- Vehicle document expiry (F6) + pet vaccine control (F7). Both feed the reusable
-- expiry-reminder engine via gather_due.
ALTER TABLE vehiculos
    ADD COLUMN soat_vence date,
    ADD COLUMN tecnomecanica_vence date;

CREATE TABLE mascotas_vacunas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    mascota_id uuid NOT NULL REFERENCES mascotas(id) ON DELETE CASCADE,
    vacuna text NOT NULL,
    fecha_aplicacion date,
    proxima date,
    certificado_url text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mascotas_vacunas_mascota_idx ON mascotas_vacunas (mascota_id);
CREATE INDEX mascotas_vacunas_proxima_idx ON mascotas_vacunas (proxima);
