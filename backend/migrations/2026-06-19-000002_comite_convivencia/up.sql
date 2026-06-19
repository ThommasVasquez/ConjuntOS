-- ============================================================================
-- Comité de Convivencia — Ley 675 de 2001, Art. 58
-- Flujo: Elección en Asamblea → Caso → Mediación → Acta → Cierre/Escalamiento
-- ============================================================================

-- Registro histórico de cada período del comité (1 año)
CREATE TABLE comite_historicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id UUID NOT NULL REFERENCES conjuntos(id),
    periodo_inicio DATE NOT NULL,
    periodo_fin DATE NOT NULL,
    elegido_en_asamblea_id UUID REFERENCES asambleas(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Miembros activos del comité actual
CREATE TABLE comite_miembros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id UUID NOT NULL REFERENCES conjuntos(id),
    comite_historico_id UUID NOT NULL REFERENCES comite_historicos(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    calidad TEXT NOT NULL CHECK (calidad IN ('PROPIETARIO', 'RESIDENTE')),
    unidad_id UUID NOT NULL REFERENCES unidades(id),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Casos de convivencia (solo conflictos entre vecinos, NO asuntos económicos)
CREATE TABLE casos_convivencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id UUID NOT NULL REFERENCES conjuntos(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('RUIDO', 'MASCOTAS', 'OLORES', 'PARQUEADERO', 'BASURAS', 'OBRAS', 'AMENAZAS', 'ZONAS_COMUNES', 'DAÑOS', 'OTRO')),
    descripcion TEXT NOT NULL,
    unidad_reporta_id UUID NOT NULL REFERENCES unidades(id),
    unidad_reportada_id UUID REFERENCES unidades(id),
    creado_por UUID NOT NULL REFERENCES usuarios(id),
    miembro_asignado_id UUID REFERENCES usuarios(id),
    estado TEXT NOT NULL DEFAULT 'REPORTADO' CHECK (estado IN ('REPORTADO', 'ASIGNADO', 'EN_MEDIACION', 'ACUERDO', 'SIN_ACUERDO', 'ESCALADO', 'ARCHIVADO')),
    resolucion TEXT,
    sesion_mediacion_fecha DATE,
    sesion_mediacion_notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_casos_convivencia_conjunto ON casos_convivencia(conjunto_id);
CREATE INDEX idx_casos_convivencia_estado ON casos_convivencia(estado);
CREATE INDEX idx_casos_convivencia_unidad_reporta ON casos_convivencia(unidad_reporta_id);
CREATE INDEX idx_casos_convivencia_miembro ON casos_convivencia(miembro_asignado_id);

-- Actas de mediación (requisito legal: firmada por partes + comité)
CREATE TABLE actas_convivencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caso_id UUID NOT NULL REFERENCES casos_convivencia(id) ON DELETE CASCADE,
    contenido TEXT NOT NULL,
    pdf_url TEXT,
    firmada BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Firmas del acta (partes + miembros del comité)
CREATE TABLE firmas_actas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acta_id UUID NOT NULL REFERENCES actas_convivencia(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('PARTE_REPORTANTE', 'PARTE_REPORTADA', 'MIEMBRO_COMITE', 'ADMINISTRADOR')),
    firmado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_actas_caso ON actas_convivencia(caso_id);
CREATE INDEX idx_firmas_acta ON firmas_actas(acta_id);
