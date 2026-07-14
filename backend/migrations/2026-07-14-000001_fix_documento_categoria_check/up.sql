-- Fix documentos_categoria_check to include all CatDoc enum values.
-- The original migration only included 5 values; the Rust enum has 10.

ALTER TABLE documentos DROP CONSTRAINT IF EXISTS documentos_categoria_check;

ALTER TABLE documentos ADD CONSTRAINT documentos_categoria_check
  CHECK (categoria IN (
    'CONVIVENCIA',
    'MASCOTAS',
    'PARQUEADERO',
    'REGLAMENTO',
    'INFORME_EMPRESA',
    'ACTA',
    'CONTRATO',
    'CUENTA_COBRO',
    'CIRCULAR',
    'OTRO'
  ));
