-- Añadir huesped_id para identificar qué huésped envió cada mensaje en el chat.
-- Cuando un HUESPED_TEMPORAL envía un mensaje, usuario_id = propietario_id
-- y huesped_id = el id del huésped. Así el propietario ve los mensajes en su
-- hilo y se puede identificar al huésped que los envió.
ALTER TABLE chat_admin ADD COLUMN IF NOT EXISTS huesped_id UUID REFERENCES usuarios(id);
CREATE INDEX IF NOT EXISTS idx_chat_admin_huesped ON chat_admin(huesped_id);
