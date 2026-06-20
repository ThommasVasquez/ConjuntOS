ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'COP'
    CONSTRAINT inmuebles_moneda_check CHECK (moneda IN ('COP', 'USD'));
