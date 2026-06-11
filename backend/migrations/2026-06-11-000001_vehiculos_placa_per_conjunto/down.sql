ALTER TABLE vehiculos DROP CONSTRAINT vehiculos_placa_conjunto_uk;
ALTER TABLE vehiculos ADD CONSTRAINT vehiculos_placa_key UNIQUE (placa);
