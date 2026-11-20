DELETE FROM anuncios WHERE tipo = 'CONJUNTOS';
ALTER TABLE anuncios DROP CONSTRAINT IF EXISTS anuncios_tipo_check;
ALTER TABLE anuncios
    ADD CONSTRAINT anuncios_tipo_check
    CHECK (tipo IN ('GENERAL', 'URGENTE', 'MANTENIMIENTO', 'EVENTO'));
