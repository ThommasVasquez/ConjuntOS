-- Prevent double-booking at the database level (specs/006-reservas). The handler's
-- count-then-insert overlap check is not race-safe under READ COMMITTED: two
-- concurrent requests can both see zero overlaps and both insert. A GiST exclusion
-- constraint makes overlapping bookings of the same area impossible regardless of
-- concurrency. Cancelled reservations are excluded so a freed slot can be re-booked.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservas
    ADD CONSTRAINT reservas_no_overlap
    EXCLUDE USING gist (
        area_id WITH =,
        tstzrange(fecha_inicio, fecha_fin) WITH &&
    )
    WHERE (estado <> 'CANCELADA');
