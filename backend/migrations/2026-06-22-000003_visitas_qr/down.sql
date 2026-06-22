DROP INDEX IF EXISTS visitas_token_idx;
ALTER TABLE visitas
    DROP COLUMN token,
    DROP COLUMN token_expira,
    DROP COLUMN ingreso_at;
