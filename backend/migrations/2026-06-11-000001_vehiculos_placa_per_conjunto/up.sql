-- Tenant isolation (constitution Law 2): a license plate must be unique *within*
-- a conjunto, not globally. The original global UNIQUE blocked a plate already
-- registered in another community and leaked cross-tenant existence (probe via
-- 409-vs-200 on POST /vehiculos and on VEHICULO trámite approval).
ALTER TABLE vehiculos DROP CONSTRAINT vehiculos_placa_key;
ALTER TABLE vehiculos
    ADD CONSTRAINT vehiculos_placa_conjunto_uk UNIQUE (conjunto_id, placa);
