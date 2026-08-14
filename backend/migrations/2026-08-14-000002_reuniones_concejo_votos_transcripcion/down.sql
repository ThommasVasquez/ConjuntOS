ALTER TABLE reuniones_concejo 
DROP COLUMN IF EXISTS votaciones,
DROP COLUMN IF EXISTS transcripcion_detallada,
DROP COLUMN IF EXISTS resumen_ia;
