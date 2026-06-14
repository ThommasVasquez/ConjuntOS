DROP TABLE IF EXISTS solicitudes_parqueadero;

ALTER TABLE vehiculos DROP CONSTRAINT vehiculos_tipo_check;
ALTER TABLE vehiculos
    ADD CONSTRAINT vehiculos_tipo_check CHECK (tipo IN ('CARRO', 'MOTO'));

DROP INDEX IF EXISTS parqueaderos_categoria_idx;
ALTER TABLE parqueaderos DROP COLUMN categoria;
