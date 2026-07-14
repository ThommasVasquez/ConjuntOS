-- Extend the existing `documentos` table for general document management.
-- Adds description, uploader reference, publication date, and visibility control.

ALTER TABLE documentos
  ADD COLUMN descripcion TEXT NOT NULL DEFAULT '',
  ADD COLUMN subido_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN fecha_publicacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN visible_residentes BOOLEAN NOT NULL DEFAULT TRUE;

-- Extend CatDoc enum with new categories for external company reports, etc.
-- The CHECK constraint on `categoria` is managed by the text_enum! macro in Rust;
-- we just need the column to accept the new string values (it already does — TEXT type).
