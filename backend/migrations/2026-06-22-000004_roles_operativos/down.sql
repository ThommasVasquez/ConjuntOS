-- Revertir: quitar roles operativos; restaurar CHECK previo
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN (
        'ARRENDATARIO', 'PROPIETARIO', 'ADMINISTRADOR', 'CONCEJO',
        'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO',
        'SUPER_ADMIN', 'HUESPED_TEMPORAL'
    ));
