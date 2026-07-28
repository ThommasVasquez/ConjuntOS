-- One open assembly per conjunto. `get_active_session` selects the active row
-- with `.first()`, so a second active row would silently make "the current
-- assembly" ambiguous. POST /asambleas pre-checks and returns a friendly 409;
-- this index is the guard that survives two concurrent creates.

CREATE UNIQUE INDEX asambleas_una_activa_por_conjunto
    ON asambleas (conjunto_id)
    WHERE activa;
