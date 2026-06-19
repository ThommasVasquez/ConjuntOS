-- Permitir HUESPED_TEMPORAL en el CHECK de usuarios.rol
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN (
        'ARRENDATARIO', 'PROPIETARIO', 'ADMINISTRADOR', 'CONCEJO',
        'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO',
        'SUPER_ADMIN', 'HUESPED_TEMPORAL'
    ));

-- Vincular pase temporal a un usuario (el huésped)
ALTER TABLE pases_temporales ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id);
CREATE INDEX IF NOT EXISTS idx_pases_temporales_usuario ON pases_temporales(usuario_id);
