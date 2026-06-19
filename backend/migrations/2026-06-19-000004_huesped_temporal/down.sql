DROP INDEX IF EXISTS idx_pases_temporales_usuario;
ALTER TABLE pases_temporales DROP COLUMN IF EXISTS usuario_id;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN (
        'ARRENDATARIO', 'PROPIETARIO', 'ADMINISTRADOR', 'CONCEJO',
        'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO',
        'SUPER_ADMIN'
    ));
