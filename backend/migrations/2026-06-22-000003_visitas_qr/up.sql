-- QR visitor pre-registration (F2). A resident pre-registers a visit; the row
-- carries an opaque single-use token (encoded into a QR) valid until token_expira.
-- The gate scans it, which stamps ingreso_at (entry time) exactly once.
ALTER TABLE visitas
    ADD COLUMN token text,
    ADD COLUMN token_expira timestamptz,
    ADD COLUMN ingreso_at timestamptz;

-- Tokens are unique when present; plain visits (no pre-registration) leave it NULL.
CREATE UNIQUE INDEX visitas_token_idx ON visitas (token) WHERE token IS NOT NULL;
