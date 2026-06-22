-- Monetary fines from the comité de convivencia (F5, Ley 675). A fine may stem
-- from a caso, is owed by a resident, and is linked to a payable Pago so it shows
-- in their cartera. Issued by ADMINISTRADOR only (enforced in the handler).
CREATE TABLE multas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id uuid NOT NULL REFERENCES conjuntos(id),
    caso_id uuid REFERENCES casos_convivencia(id),
    usuario_id uuid NOT NULL REFERENCES usuarios(id),
    pago_id uuid REFERENCES pagos(id),
    monto numeric NOT NULL,
    motivo text NOT NULL,
    estado text NOT NULL DEFAULT 'IMPUESTA'
        CONSTRAINT multas_estado_check CHECK (estado IN ('IMPUESTA', 'PAGADA', 'APELADA', 'ANULADA')),
    fecha_limite date,
    pdf_url text,
    creada_por uuid NOT NULL REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX multas_usuario_idx ON multas (conjunto_id, usuario_id);
