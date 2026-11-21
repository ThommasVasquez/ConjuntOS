-- Per-conjunto nomenclature flag: true = Torre/Bloque + Apto (default for all conjuntos),
-- false = simple unit number only (e.g. 101..680 in Las Brisas PH).
ALTER TABLE conjuntos
    ADD COLUMN IF NOT EXISTS usa_torre BOOLEAN NOT NULL DEFAULT true;

-- Enable simple nomenclature ONLY for Las Brisas PH and clear legacy torre values there.
UPDATE conjuntos
SET usa_torre = false
WHERE subdominio = 'lasbrisasph';

UPDATE usuarios
SET torre = NULL
WHERE conjunto_id = (SELECT id FROM conjuntos WHERE subdominio = 'lasbrisasph');

UPDATE unidades
SET torre = NULL
WHERE conjunto_id = (SELECT id FROM conjuntos WHERE subdominio = 'lasbrisasph');
