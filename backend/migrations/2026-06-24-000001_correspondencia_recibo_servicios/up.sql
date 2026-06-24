-- Add ENERGIA, AGUA, and GAS to correspondencia tipo CHECK constraint
ALTER TABLE correspondencia DROP CONSTRAINT IF EXISTS correspondencia_tipo_check;
ALTER TABLE correspondencia ADD CONSTRAINT correspondencia_tipo_check
    CHECK (tipo IN ('CARTA', 'DOCUMENTO', 'REVISTA', 'OTRO', 'ENERGIA', 'AGUA', 'GAS'));
