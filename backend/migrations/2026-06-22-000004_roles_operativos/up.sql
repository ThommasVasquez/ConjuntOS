-- Agregar roles operativos: administrador de piscina, gym, mantenimiento, limpieza
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN (
        'ARRENDATARIO', 'PROPIETARIO', 'ADMINISTRADOR', 'CONCEJO',
        'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO',
        'SUPER_ADMIN', 'HUESPED_TEMPORAL',
        'ADMINISTRADOR_PISCINA', 'ADMINISTRADOR_GYM',
        'MANTENIMIENTO_LOCATIVO', 'OPERARIO_LIMPIEZA'
    ));
