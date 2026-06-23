# Test Flows — Guía de Pruebas Manuales

Flujos paso a paso para probar cada funcionalidad de la plataforma.
Cada prueba asume que ya iniciaste sesión con el rol indicado.

---

## 01 — Otto AI (Asistente Legal Ley 675)

**Rol necesario:** Residente o Admin

### 1.1 Preguntar al asistente
1. Abre la página de inicio
2. Busca el campo de texto "Pregúntale a Otto" o el ícono de asistente
3. Escribe una pregunta como _"¿Qué dice la ley 675 sobre asambleas?"_
4. Presiona Enter
5. ✅ Aparece una respuesta coherente basada en la Ley 675

### 1.2 Copiloto de asamblea (Admin)
1. Estando en una asamblea activa, haz clic en "Copiloto"
2. Pregunta algo como _"¿Cuántas personas deben asistir para tener quórum?"_
3. ✅ El asistente responde basado en el orden del día

### 1.3 Generar acta automática (Admin)
1. Al finalizar una asamblea, haz clic en "Generar acta"
2. Espera a que el sistema procese
3. ✅ Aparece un borrador del acta con los puntos discutidos

### 1.4 Descargar acta PDF
1. Desde la asamblea, haz clic en "Descargar PDF"
2. ✅ Se descarga un archivo PDF con el acta oficial

---

## 02 — Asambleas

**Roles necesarios:** Admin (crear y gestionar) + Residente (participar)

### 2.1 Iniciar sesión de asamblea (Admin)
1. Ve a "Asambleas" en el menú
2. Haz clic en "Iniciar sesión"
3. ✅ La asamblea aparece como "En vivo" y se genera un PIN

### 2.2 Vincular dispositivo (Residente)
1. Desde la misma asamblea, haz clic en "Vincular dispositivo"
2. Ingresa el PIN que muestra el admin
3. ✅ Tu dispositivo queda vinculado a la sesión

### 2.3 Registrar asistencia (Residente)
1. Dentro de la asamblea activa, haz clic en "Registrar asistencia"
2. ✅ Aparece tu nombre en la lista de asistentes y se actualiza el % de quórum

### 2.4 Crear votación (Admin)
1. Haz clic en "Nueva votación"
2. Escribe el título (ej. "Aprobación del presupuesto 2026")
3. Agrega opciones (ej. "A favor", "En contra", "Abstención")
4. Haz clic en "Publicar"
5. ✅ La votación aparece visible para todos los participantes

### 2.5 Votar (Residente)
1. Ve a la votación abierta
2. Selecciona una opción
3. Haz clic en "Votar"
4. ✅ Voto registrado. Si intentas votar otra vez, ves un mensaje de error

### 2.6 Delegar voto con poder (Residente)
1. En la asamblea, selecciona "Dar poder"
2. Ingresa los datos del representante
3. El admin verifica el poder
4. ✅ El representante puede votar por ti con tu coeficiente incluido

### 2.7 Pedir turno de palabra (Residente)
1. Haz clic en "Pedir turno"
2. ✅ Tu nombre aparece en la lista de espera
3. El admin avanza turnos: tu estado cambia a "Hablando" y luego "Completado"

### 2.8 Publicar opinión (Residente)
1. Escribe un comentario en el panel de opiniones
2. ✅ Tu opinión aparece visible para todos

---

## 03 — Vehículos

**Rol necesario:** Residente

### 3.1 Registrar vehículo
1. Ve a "Mi Perfil" → "Vehículos"
2. Haz clic en "Agregar vehículo"
3. Completa: placa, marca, modelo, color
4. Haz clic en "Guardar"
5. ✅ El vehículo aparece en tu lista
6. Intenta registrar la misma placa otra vez
7. ✅ Ves un mensaje "Ya existe un vehículo con esta placa"

### 3.2 Actualizar SOAT y tecnomecánica
1. Desde el detalle del vehículo, haz clic en "Documentos"
2. Ingresa las fechas de vencimiento del SOAT y la revisión técnico-mecánica
3. Guarda
4. ✅ Las fechas quedan registradas

### 3.3 Recibir recordatorio
1. ✅ Cuando un documento esté por vencer, recibes una notificación push

---

## 04 — Seguridad (SOS, Visitas QR, Novedades)

**Roles necesarios:** Residente + Guardia

### 4.1 Activar SOS (Residente)
1. En la página de inicio, busca el "Botón de Pánico (SOS)"
2. Haz clic en el botón
3. Selecciona el tipo de emergencia: Seguridad, Médica, Incendio u Otro
4. ✅ Ves una tarjeta roja con "Alerta SOS activa" y un mensaje de confirmación
5. ✅ El guardia en vigilancia ve la alerta en su pantalla en tiempo real

### 4.2 Cancelar SOS (Residente)
1. Con la alerta activa, busca el botón "Cancelar alerta"
2. Haz clic en "Cancelar alerta"
3. ✅ La tarjeta roja desaparece y ves "Alerta SOS cancelada"

### 4.3 Atender SOS (Guardia)
1. Cuando un residente activa SOS, ves la alerta en tu consola
2. Haz clic en "Atender"
3. ✅ La alerta cambia a estado "Atendida"

### 4.4 Resolver SOS (Guardia)
1. Desde la alerta atendida, haz clic en "Resolver"
2. ✅ La alerta se cierra. El residente ve el mensaje "Tu alerta fue atendida y resuelta"
3. ✅ Si el residente recarga la página, ya no ve la tarjeta roja

### 4.5 Preregistrar visita con QR (Residente)
1. Ve a "Visitas" → "Programar visita"
2. Ingresa nombre del visitante, tipo (peatonal/vehicular), placa si aplica
3. Guarda
4. ✅ Recibes un código QR para compartir con tu visitante

### 4.6 Escanear QR en portería (Guardia)
1. El visitante muestra el QR
2. Escanea el código desde el panel de vigilancia
3. ✅ Se registra el ingreso automáticamente con los datos del visitante

### 4.7 Registrar novedad (Guardia)
1. Ve a "Novedades" en el panel de vigilancia
2. Haz clic en "Nueva novedad"
3. Selecciona tipo, escribe descripción
4. Guarda
5. ✅ La novedad aparece en el listado

### 4.8 Resolver novedad (Guardia)
1. Desde una novedad abierta, haz clic en "Resolver"
2. ✅ La novedad se marca como resuelta

---

## 05 — Reservas de Áreas Comunes

**Rol necesario:** Residente

### 5.1 Ver áreas disponibles
1. Ve a "Reservas" en el menú
2. ✅ Ves el listado de áreas comunes (salón comunal, piscina, gimnasio, etc.)

### 5.2 Consultar disponibilidad
1. Selecciona un área
2. Elige una fecha
3. ✅ Ves los horarios ocupados y libres

### 5.3 Crear reserva
1. Elige un horario disponible
2. Confirma la reserva
3. ✅ Aparece un mensaje de confirmación

### 5.4 Conflicto de horario
1. Intenta crear otra reserva en el mismo horario
2. ✅ Ves un mensaje "El área ya está reservada en ese horario"

### 5.5 Verificar QR en la puerta (Admin de área)
1. Desde el panel del área, busca la reserva de hoy
2. Escanea el QR del residente o ingresa el código
3. ✅ El sistema confirma "Reserva verificada"

---

## 06 — PQRS (Solicitudes)

**Roles necesarios:** Residente + Administrador/Mantenimiento

### 6.1 Crear solicitud (Residente)
1. Ve a "PQRS" o "Solicitudes"
2. Haz clic en "Nueva solicitud"
3. Selecciona categoría (plomería, electricidad, etc.) y tipo (petición, queja, reclamo, sugerencia, mantenimiento)
4. Marca "Urgente" si aplica
5. Si quieres, adjunta fotos
6. Haz clic en "Enviar"
7. ✅ La solicitud aparece en tu lista con estado "Abierta"

### 6.2 Agregar comentario (Residente)
1. Abre el detalle de tu solicitud
2. Escribe un comentario y adjunta foto si deseas
3. Envía
4. ✅ El comentario aparece en la cronología

### 6.3 Ver solicitudes asignadas (Mantenimiento)
1. Ve a "Mis solicitudes asignadas"
2. ✅ Ves solo las solicitudes que te han asignado

### 6.4 Cambiar estado (Mantenimiento)
1. Abre una solicitud
2. Cambia el estado: "En progreso"
3. ✅ El residente ve el cambio en tiempo real

### 6.5 Resolver solicitud
1. Cambia el estado a "Completada"
2. ✅ El residente recibe notificación

---

## 07 — Comunicados y Cartelera

**Roles necesarios:** Admin (crear) + Residente (ver)

### 7.1 Crear anuncio (Admin)
1. Ve a "Comunicados" o "Cartelera"
2. Haz clic en "Nuevo anuncio"
3. Escribe título, contenido, selecciona tipo (General, Urgente, Mantenimiento, Evento)
4. Opcional: marca "Fijar al inicio", agrega imagen, fecha de expiración
5. Publica
6. ✅ El anuncio aparece en la cartelera
7. ✅ Los residentes reciben notificación push

### 7.2 Ver anuncios (Residente)
1. Ve a "Cartelera"
2. ✅ Los anuncios fijados aparecen primero, luego los más recientes

### 7.3 Fijar anuncio (Admin)
1. Edita un anuncio existente
2. Activa "Fijar al inicio"
3. ✅ El anuncio se mueve al tope de la cartelera

### 7.4 Eliminar anuncio (Admin)
1. Desde un anuncio, haz clic en "Eliminar"
2. ✅ El anuncio desaparece de la cartelera de todos

### 7.5 Ver directorio (Admin o Guardia)
1. Ve a "Directorio"
2. ✅ Ves lista de residentes con nombre, torre, apto y teléfono

---

## 08 — Perfiles

**Rol necesario:** Residente

### 8.1 Iniciar sesión
1. Ve a la página de login
2. Ingresa email y contraseña
3. Haz clic en "Iniciar sesión"
4. ✅ Entras al sistema con tu nombre y rol visible

### 8.2 Ver perfil
1. Ve a "Mi Perfil"
2. ✅ Ves tu información: nombre, teléfono, torre, apto
3. ✅ Ves tus vehículos, mascotas, deuda pendiente, reservas y paquetes

### 8.3 Editar perfil
1. Haz clic en "Editar"
2. Cambia tu nombre o teléfono
3. Guarda
4. ✅ Los cambios se ven reflejados

### 8.4 Cambiar avatar
1. Haz clic en tu foto de perfil
2. Selecciona una imagen (máximo 150 KB)
3. ✅ La nueva foto se muestra

### 8.5 Cambiar contraseña
1. Ve a "Seguridad" o "Cambiar contraseña"
2. Ingresa contraseña actual y la nueva
3. Guarda
4. ✅ Puedes iniciar sesión con la nueva contraseña

---

## 09 — Mascotas y Vacunas

**Roles necesarios:** Residente + Admin

### 9.1 Solicitar registro de mascota (Residente)
1. Ve a "Trámites"
2. Haz clic en "Nuevo trámite"
3. Selecciona tipo "Mascota"
4. Ingresa nombre, raza, color
5. Envía
6. ✅ El trámite aparece como "Pendiente"

### 9.2 Aprobar mascota (Admin)
1. Ve a "Trámites" en el panel admin
2. Busca el trámite pendiente
3. Haz clic en "Aprobar"
4. ✅ La mascota queda registrada
5. ✅ El residente recibe notificación

### 9.3 Registrar vacuna (Residente)
1. Desde el perfil, ve a tu mascota
2. Haz clic en "Agregar vacuna"
3. Ingresa nombre, fecha de aplicación, próxima fecha
4. Guarda
5. ✅ La vacuna aparece en el listado

### 9.4 Recibir recordatorio de vacuna
1. ✅ Cuando una vacuna esté próxima a vencer, recibes notificación push

---

## 10 — Cartera (Pagos)

**Rol necesario:** Residente

### 10.1 Ver cartera
1. Ve a "Cartera" o "Pagos"
2. ✅ Ves las cuotas de administración y recibos de servicios
3. ✅ Ves el total de deuda pendiente

### 10.2 Pagar cuota (modo simulado)
1. Selecciona una cuota pendiente
2. Haz clic en "Pagar"
3. Selecciona método de pago (PSE, Tarjeta, Nequi, Daviplata, Efectivo)
4. Confirma
5. ✅ La cuota cambia a estado "Pagada"

---

## 11 — Dashboard (Admin)

**Rol necesario:** Admin

### 11.1 Ver dashboard
1. Ve al panel de administración
2. ✅ Ves estadísticas del conjunto:
   - Total de unidades
   - Total de usuarios
   - Usuarios por rol (propietarios, arrendatarios, etc.)
   - Usuarios por torre
   - Nuevos registros del mes
   - Usuarios activos en los últimos 30 días

---

## 12 — Encomiendas (Paquetes y Correspondencia)

**Roles necesarios:** Guardia + Residente

### 12.1 Registrar paquete (Guardia)
1. Ve a "Paquetes" en el panel de vigilancia
2. Haz clic en "Nuevo paquete"
3. Selecciona el residente destinatario
4. Ingresa descripción y remitente
5. Guarda
6. ✅ El paquete aparece en la lista "En portería"
7. ✅ El residente recibe notificación

### 12.2 Ver mis paquetes (Residente)
1. Ve a "Mis paquetes" o revisa tu inicio
2. ✅ Ves los paquetes que tienes en portería

### 12.3 Entregar paquete (Guardia)
1. Cuando el residente recoge, busca el paquete
2. Haz clic en "Entregar"
3. ✅ El paquete se marca como "Entregado"

### 12.4 Registrar correspondencia (Guardia)
1. Ve a "Correspondencia"
2. Haz clic en "Nueva"
3. Selecciona el residente
4. Guarda
5. ✅ La correspondencia queda registrada

### 12.5 Entregar correspondencia (Guardia)
1. Busca la correspondencia
2. Haz clic en "Entregar"
3. ✅ Se marca como entregada

---

## 13 — Convivencia (Multas y Comité)

**Roles necesarios:** Admin + Residente

### 13.1 Emitir multa (Admin)
1. Ve a "Multas" o "Convivencia"
2. Haz clic en "Nueva multa"
3. Selecciona el residente, ingresa monto y motivo
4. Guarda
5. ✅ La multa aparece en el listado con estado "Impuesta"
6. ✅ El residente ve la multa en su cartera

### 13.2 Apelar multa (Residente)
1. Desde el detalle de la multa, haz clic en "Apelar"
2. ✅ La multa cambia a estado "Apelada"

### 13.3 Anular multa (Admin)
1. Desde una multa impuesta o apelada, haz clic en "Anular"
2. ✅ La multa cambia a "Anulada"
3. ✅ Desaparece de la cartera del residente

### 13.4 Crear comité de convivencia (Admin)
1. Ve a "Comité de convivencia"
2. Haz clic en "Crear comité" (período 2 años)
3. Agrega miembros
4. ✅ El comité queda activo

### 13.5 Abrir caso de convivencia (Admin)
1. Haz clic en "Nuevo caso"
2. Ingresa descripción, unidad afectada y tipo
3. Guarda
4. ✅ El caso aparece en el listado

### 13.6 Asignar miembro al caso
1. Desde el caso, haz clic en "Asignar"
2. Selecciona un miembro del comité
3. ✅ El miembro queda asignado

### 13.7 Registrar mediación
1. Una vez investigado, haz clic en "Registrar mediación"
2. Ingresa el resultado
3. ✅ La mediación queda registrada

### 13.8 Generar y firmar acta
1. Haz clic en "Generar acta"
2. Revisa el documento
3. Haz clic en "Firmar"
4. ✅ El acta queda firmada digitalmente

---

## 14 — Encuestas

**Roles necesarios:** Admin (crear) + Residente (votar)

### 14.1 Crear encuesta (Admin)
1. Ve a "Encuestas"
2. Haz clic en "Nueva encuesta"
3. Escribe título, agrega al menos 2 opciones
4. Elige si es anónima y si tiene fecha de cierre
5. Publica
6. ✅ La encuesta aparece visible para todos los residentes

### 14.2 Votar (Residente)
1. Ve a la encuesta abierta
2. Selecciona una opción
3. Confirma
4. ✅ Voto registrado
5. ✅ Ves los resultados actualizados en tiempo real

### 14.3 Evitar voto duplicado
1. Intenta votar otra vez en la misma encuesta
2. ✅ Ves mensaje "Ya votaste en esta encuesta"

### 14.4 Cerrar encuesta (Admin)
1. Desde la encuesta activa, haz clic en "Cerrar"
2. ✅ La encuesta se cierra y ya no acepta votos

---

## 15 — Clasificados

**Rol necesario:** Residente

### 15.1 Publicar clasificado
1. Ve a "Clasificados"
2. Haz clic en "Publicar"
3. Ingresa nombre del producto/servicio, categoría, descripción
4. Opcional: precio, imagen, WhatsApp
5. Publica
6. ✅ El clasificado aparece en el listado general

### 15.2 Ver clasificados
1. Ve a "Clasificados"
2. ✅ Ves los últimos 50 clasificados activos
3. ✅ Cada uno muestra el nombre del vendedor y su teléfono

### 15.3 Contactar al vendedor
1. Desde un clasificado, ves el número de teléfono del vendedor
2. Haz clic para llamar o enviar WhatsApp
3. ✅ Se abre tu app de teléfono/WhatsApp
