DROP INDEX IF EXISTS usuarios_conjunto_numero_interno_idx;
ALTER TABLE usuarios DROP COLUMN IF EXISTS numero_interno;
