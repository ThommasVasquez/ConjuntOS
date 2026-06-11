ALTER TABLE reservas DROP CONSTRAINT reservas_no_overlap;
-- btree_gist is left installed; other objects may depend on it.
