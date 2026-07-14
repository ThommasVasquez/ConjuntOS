-- Revert to the original CHECK constraint (5 values only).

ALTER TABLE documentos DROP CONSTRAINT IF EXISTS documentos_categoria_check;

ALTER TABLE documentos ADD CONSTRAINT documentos_categoria_check
  CHECK (categoria IN ('CONVIVENCIA', 'MASCOTAS', 'PARQUEADERO', 'REGLAMENTO', 'OTRO'));
