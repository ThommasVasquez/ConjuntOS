# EN-CONJUNTO — Inventario de funcionalidades

EN-CONJUNTO es una plataforma multi-conjunto (multi-tenant) para la gestión integral de conjuntos residenciales: acceso y seguridad, portería, parqueadero, finanzas, convivencia, asambleas, comunicaciones y asistentes de IA. Toda la operación está aislada por `conjunto_id` y los flujos sensibles se notifican en tiempo real por WebSocket y Web Push.

## Totales

- **Dominios de backend:** 31 routers de dominio montados en `lib.rs` (más rutas de plataforma).
- **Endpoints de backend:** ~212 rutas únicas (método + path), incluidas `/healthz`, el WebSocket `/api/v1/ws`, `/api/v1/openapi.json` y `/docs`.
- **Páginas de frontend:** 38 vistas de la app (+ `landing` y `login` públicos), repartidas por rol — residente (~18), vigilancia (6), parqueadero (2), administración (9) y superadmin/asamblea (2).

> Verificado contra el código el **2026-06-26** mediante revisión multi-agente (un agente por dominio + verificación adversaria). Inventario de rutas: `grep -rE '\.route\(' backend/api/src/domains`. Hallazgos de seguridad/correctitud de esa revisión: ver [`REVISION_BACKEND_2026-06-26.md`](REVISION_BACKEND_2026-06-26.md).

---

## Acceso y seguridad

Autenticación por correo y contraseña con sesión por cookie HttpOnly (`ec_session`) y token Bearer de respaldo para clientes con cookies cross-site bloqueadas. Tiempo real autenticado por ticket WebSocket de corta duración.

- Iniciar sesión con correo y contraseña (con mitigación de enumeración por tiempo vía hash dummy).
- Mantener sesión por cookie HttpOnly o por token Bearer.
- Consultar el perfil de la sesión actual (`/auth/me`, incluye bandera `is_tester`).
- Cerrar sesión limpiando la cookie de sesión.
- Cambiar la propia contraseña verificando la actual (mínimo 8 caracteres) y revocando sesiones previas vía `password_changed_at`.
- Cambiar de rol de forma autoservicio para cuentas de prueba (whitelist de testers), sin poder escalar a SUPER_ADMIN.
- Emitir ticket efímero (`/auth/ws-ticket`, 120 s, `aud=ws`) y abrir el WebSocket para recibir eventos por conjunto y por usuario.
- Respuestas de error estandarizadas en formato problem+json (RFC 7807).

---

## Perfil

Gestión del perfil del residente y administración de usuarios del conjunto por parte del administrador.

**Residente**
- Ver el perfil propio con datos personales, unidad, vehículos, mascotas y trámites solicitados (`/perfil`).
- Editar nombre, teléfono, género, avatar, torre y apartamento (avatar máx. 150 KB, nombre no vacío).
- Auto-declarar torre/apartamento cuando la administración aún no asignó unidad (se crea con coeficiente 0).
- Cambiar la foto de perfil (comprime y persiste), alternar tema claro/oscuro y cerrar sesión.
- Navegar entre vistas de estado: Deuda, Trámites, Mascotas, Vehículos, Reservas, Visitas, Paquetes y Correspondencia.
- Consultar el directorio de citofonía buscable por nombre o número interno (usuarios activos del mismo conjunto).

**Administrador (gestión de residentes, `/admin-residentes`)**
- Listar usuarios con búsqueda por nombre/email y filtro por rol; detalle con unidad, vehículos, mascotas y últimos pagos.
- Editar datos del residente y cambiar su rol o estado (activo/inactivo), incluyendo roles operativos (Vigilante, Supervisor, Encargado de Parqueadero).
- Invitar nuevos residentes por email creando la cuenta con contraseña temporal y `must_change_password`, con asignación automática de número interno único de 4 dígitos.

---

## Comunicaciones

Cartelera oficial, chat directo residente–administración y citofonía/intercomunicador.

**Cartelera y anuncios**
- Ver los últimos 50 anuncios del conjunto (fijados primero), filtrar por categoría y abrir el detalle (`/cartelera`).
- Descargar circulares/documentos adjuntos y compartir el aviso (Web Share o copiar enlace).
- Administración/concejo: publicar, editar, fijar, fechar expiración y eliminar anuncios; notificación automática a todos los residentes y actualización en tiempo real (creado/actualizado/eliminado).
- Directorio de residentes para roles administrativos y de seguridad/parqueadero, con datos de contacto limitados por Habeas Data.

**Chat con la administración (`/chat`, `/admin-mensajes`)**
- Enviar mensajes de texto, imágenes (galería/cámara), archivos y notas de voz (grabar/cancelar/enviar); reproducir audios recibidos.
- El huésped temporal enruta sus mensajes al hilo de su propietario.
- Administración: bandeja de conversaciones agrupada por residente con conteo de no leídos, vista de hilo con ficha del residente (perfil, vehículos, mascotas), marcado automático de leídos y respuesta con texto o audio.
- Configurar la disponibilidad del administrador (recibir llamadas / recibir mensajes) por conjunto.

**Citofonía (`/citofonia`, `/directorio`)**
- Llamada/videollamada en tiempo real (LiveKit) entre residentes, vigilancia y administración.
- Llamar a un usuario, a un rol (Vigilante/Administrador), a un número interno o a un apartamento (torre + número) del propio conjunto.
- Notificación de llamada entrante por Web Push (app cerrada) y WebSocket (pestaña abierta); contestar, rechazar o colgar.

---

## Vigilancia y portería

Consola de portería para registrar visitas, paquetes, correspondencia y novedades, con flujos de aprobación del residente y QR.

**Vigilancia (`/vigilancia`, `/control-visitas`, `/paqueteria`, `/correspondencia`, `/novedades-seguridad`)**
- Panel con estadísticas del día: Visitas Hoy, Paquetes Pendientes y Residentes Activos.
- Registrar visitas dirigidas a un residente (peatonal/vehicular con placa) y ver la bitácora del día con estado por badge (Pendiente/Aprobada/Rechazada).
- Escanear el QR de un pase pre-registrado para validar el ingreso en un toque.
- Registrar paquetes y correspondencia/recibos de servicios públicos (con remitente y descripción), notificando al residente, y marcarlos como entregados.
- Registrar y resolver novedades de seguridad con tipo, ubicación y severidad.
- Actualización en tiempo real del inventario y la bitácora vía WebSocket.

**Residente**
- Agendar visitas propias y generar un pase con QR de un solo uso; compartir por WhatsApp o reenviar (`/visitantes`).
- Aprobar o rechazar visitas pendientes registradas por el vigilante (sin aprobación no ingresan).
- Centro de comunicaciones con visitas, paquetes y correspondencia pendientes; consultar los paquetes propios en portería.

**CCTV y rondas (`/seguridad`)**
- Grilla de cámaras simuladas (Lobby, Sótano, Portería, Ascensores) con congelar/reanudar y filtro térmico.
- Rondas de vigilancia con hallazgos; rondas NFC con puntos etiquetados, registro de checkpoints (Web NFC), barra de progreso y cierre de ronda solo al visitar todos los puntos.

---

## Parqueadero

Mapa de celdas, asignaciones con aprobación, sesiones de cobro de visitante, reservas de cupo y rondas de verificación.

**Residente (`/parqueadero`)**
- Ver vehículos propios y celdas asignadas; registrar un vehículo (placa, marca, color, tipo) solicitando aprobación.
- Aprobar o rechazar la asignación de un parqueadero de visitante (consentimiento del inquilino).
- Ver sesiones de cobro de visitante activas con cuenta regresiva del tiempo gratis y monto acumulado en vivo.
- Aprobar o rechazar cobros cargados al apartamento (con monto); aprobar genera pago pendiente y libera el vehículo.
- Reservar cupo de visitante (tipo, hora de llegada, duración, nombre, placa) con disponibilidad por solapamiento; cancelar la propia reserva.
- Ver el historial de accesos y leer/aceptar el reglamento de parqueo.

**Operación (`/mapa-parqueadero`, `/bitacora-parqueadero`, `/admin-parqueadero`)**
- Mapa interactivo por niveles con estado y ocupante de cada celda (Libre/Ocupado/Reservado, vencida si expiró vigencia).
- Crear celdas individuales o por lote (prefijo + cantidad, hasta 500) por tipo (residente/visitante/discapacitado) y categoría (carro/moto/bici).
- Asignar, liberar y cambiar estado de celdas con flujo de aprobación: celda de residente la aprueba el administrador, celda de visitante la aprueba el inquilino.
- Sesiones de cobro de visitante: 2 horas gratis con bolsa diaria por apartamento (24 h rodante), un solo gratis concurrente y tarifa prorrateada por minuto; avisos automáticos por scheduler 20 min antes de empezar el cobro.
- Cerrar/liquidar la sesión (visitante pagó en sitio o cargo al apartamento, que retiene el vehículo) y gestionar vehículos retenidos.
- Reservas próximas para portería con marcado de "Llegó"; bitácora inmutable de movimientos/solicitudes (administrador), con edición/borrado reservado al super admin.
- Rondas de verificación y rondas NFC con checkpoints; estadísticas de ocupación.

---

## Reservas de áreas comunes

Catálogo de zonas comunes con reglas, reserva con QR y panel de administración.

**Residente (`/reservas`)**
- Ver el catálogo de áreas activas (piscina, gimnasio, salón, etc.) con precio/depósito, horario, días y capacidad.
- Ver la disponibilidad de un área en una fecha (franjas ocupadas) y reservar indicando día y franja, con bloqueo automático por solapamiento.
- Reservas que requieren depósito quedan PENDIENTE hasta pagar; si no, CONFIRMADA.
- Ver reservas propias vigentes y mostrar el QR de acceso de cada una.

**Administración (`/admin-areas`)**
- Crear, listar (activas e inactivas), editar y eliminar áreas (capacidad, horario, días, duración de slot, depósito y monto); eliminación bloqueada si hay reservas activas.
- Panel de reservas del conjunto con filtros por estado, área y rango de fechas, con datos del residente (nombre, torre, apto).
- Verificación de reserva por escaneo de QR/ID por el personal de control de acceso (admins de área restringidos a su propia área).

---

## Pagos y finanzas

Estado de cuenta del residente, pasarela de pago (Nequi/Mock) y tablero financiero administrativo.

**Residente (`/pagos`)**
- Ver cuotas de administración (pendientes/pagadas) y recibos de servicios públicos de la unidad.
- Pagar cuotas en línea con Nequi ingresando el celular; seguimiento y reconciliación del estado del pago (polling) y actualizaciones en tiempo real por WebSocket.
- Ver y gestionar las multas propias.

**Administración (`/admin-finanzas`, `/admin-analytics`)**
- Tablero KPI: recaudo del mes, morosidad, gastos del mes, balance, total de unidades y unidades al día.
- Historial de pagos paginado con filtros por estado, unidad y rango de fechas.
- Gestión de gastos (egresos): crear (monto > 0), listar con filtros por categoría/fecha, editar y eliminar.
- Reporte de morosidad por unidad con monto adeudado y número de recibos vencidos.
- Panel de estadísticas de administración (recaudo del mes y reservas pendientes).

---

## PQRS y solicitudes de servicio

Peticiones, quejas y reclamos con flujo de tickets, asignación a operarios y SLA.

**Residente (`/pqrs`)**
- Radicar una PQRS con categoría, tipo de servicio, descripción, marca de urgencia e imágenes; ver resumen (total/abiertas/resueltas) y estado por radicado.
- Ver el detalle del ticket con comentarios e historial de transiciones.

**Operarios y administración (`/admin-pqrs`)**
- Bandeja de tickets asignados para mantenimiento locativo y operario de limpieza.
- Flujo de estados (Abierta → Asignada → En progreso → Resuelta/Cerrada) con notas e imágenes, restringido al operario asignado o al administrador.
- SLA automático según urgencia (4 h urgente / 48 h normal) y tablero de estadísticas (totales por estado, SLA vencidos, tiempo promedio de resolución).
- Asignación de proveedor/responsable, cambio de prioridad, comentarios internos e historial de transiciones.
- Notificaciones a los administradores al crear la PQRS y avisos en tiempo real al residente cuando cambia el estado.

---

## Trámites

Solicitudes de vinculación de vehículos y mascotas con aprobación administrativa.

**Residente (`/perfil`)**
- Crear trámites (vehículo, mascota, otro) en estado PENDIENTE adjuntando documentos en base64.
- Crear trámites rápidos (cambiar celular, correo, clave) y ver el estado de las solicitudes enviadas.

**Administración (`/admin-novedades`)**
- Bandeja de trámites con vista diferenciada (residente ve los suyos, administración ve todos) y notificación automática al crearse.
- Aprobar o rechazar con observación; al aprobar, alta automática del activo (vehículo/mascota) en una sola transacción.
- Al aprobar un vehículo, asignar opcionalmente una celda de parqueadero con cláusula temporal en meses (3/6/12/24 o sin vencimiento) y crear una celda al vuelo si no hay disponibles.
- Validación del tipo de celda (rechaza si no existe o está ocupada) que aborta toda la aprobación sin dejar el trámite a medias; notificación al solicitante y eventos en tiempo real.

---

## Clasificados e inmobiliaria

Marketplace interno vecino-a-vecino y avisos de inmuebles.

**Clasificados (`/clasificados`)**
- Ver el tablón de los 50 anuncios activos más recientes; buscar por texto y filtrar por categoría.
- Marcar favorito (like) y contactar al vendedor por WhatsApp con mensaje prellenado.
- Publicar un anuncio con foto, título, categoría, precio en COP, descripción y datos de contacto.
- Notificación en tiempo real a todo el conjunto al publicar.

**Inmobiliaria (`/inmobiliaria`)**
- Marketplace de inmuebles del conjunto: hasta 50 anuncios disponibles más los propios en cualquier estado.
- Filtrar por tipo de negocio (venta/arriendo) y tipo de unidad (apartamento, parqueadero, habitación); ver detalle con galería y características.
- Publicar ofertas con fotos/videos, precio (COP/USD), área, habitaciones/baños y contacto; editar las propias publicaciones y cambiar su estado (disponible/vendido/alquilado/oculto).

---

## Asamblea

Asamblea en vivo con video LiveKit, agenda, votaciones ponderadas, asistencia, quórum, opiniones, turnos de palabra y poderes.

**Asistente / residente (`/asamblea`)**
- Ver el banner de "Sesión en Vivo" y entrar; ver el título y el punto actual del orden del día.
- Video en vivo (LiveRoom) con la descripción del punto actual.
- Pedir turno de palabra y ver la cola de turnos (Espera/Hablando).
- Votar opciones de una votación abierta (voto ponderado por coeficiente de copropiedad, incluyendo poderes verificados, con prevención de doble voto) y ver resultados en vivo.
- Registrar asistencia (tipo VIRTUAL) y ver el quórum (coeficiente presente vs total) y la lista de poderes.
- Muro de opiniones de los asistentes y emparejamiento de dispositivos por PIN temporal.

**Administración**
- Controlar el estado de la sesión con bloqueo optimista por versión y sincronización en tiempo real por WebSocket.
- Crear y abrir/cerrar/reabrir votaciones (una sola activa a la vez); avanzar el punto de la agenda.
- Dar turnos de palabra; gestionar poderes (otorgante/apoderado) con verificación exclusiva de la administración.
- Token LiveKit por sala con permiso de publicación según el rol.

---

## IA / Asistente

Copiloto de asamblea, asistente legal para residentes y herramientas de IA (Gemini) para actas, traducción y consenso.

- Asistente "Otto" para residentes, fundamentado en la Ley 675 de 2001, con orientación entre módulos de la app y preguntas sugeridas (`/asistente`).
- Copiloto de IA para administradores durante la asamblea (responde sobre el orden del día y la gestión del conjunto).
- Traducción en vivo de textos de la asamblea a inglés, portugués o francés.
- Síntesis de consenso de IA que concilia las opiniones de los copropietarios.
- Generación automática del acta oficial (formato legal Markdown) con upsert y notificación en tiempo real; consulta del acta y exportación a PDF descargable.
- Subtítulos/transcripción en vivo por orador, difundidos por WebSocket.

---

## SOS / pánico

Botón de pánico para residentes con consola de seguridad y máquina de estados de la emergencia.

**Residente**
- Activar una alerta SOS con tipo de emergencia, nota y ubicación; una sola alerta activa por residente (índice único parcial).
- Recuperar la propia alerta activa al recargar la app y cancelarla mientras siga ABIERTA.

**Seguridad**
- Consola que lista las alertas activas (ABIERTA/ATENDIDA) con nombre, torre y apto del reportante.
- Atender y resolver alertas (ABIERTA → ATENDIDA → RESUELTA) con auditoría de quién y cuándo.
- Notificación en tiempo real por WebSocket y Web Push a la seguridad de turno.

---

## Multas

Sanciones a residentes vinculadas opcionalmente al comité de convivencia, con cobro en cartera y máquina de estados.

- Administración/concejo: emitir una multa (opcionalmente ligada a un caso del comité), generando un cobro en la cartera del residente (vencimiento 30 días por defecto) y un PDF de notificación best-effort conforme a la Ley 675.
- Anular una multa eliminando el cobro pendiente asociado para no dejar deuda huérfana.
- Residente: ver las multas propias y apelar una multa propia (IMPUESTA → APELADA) sin bloquear su pagabilidad.
- Listado con visibilidad por rol (residente ve las suyas; administración ve todas) y máquina de estados (IMPUESTA, APELADA, ANULADA, PAGADA) que rechaza transiciones inválidas.
- Notificación al residente y eventos en tiempo real al imponer/actualizar.

---

## Encuestas

Votaciones de opinión del conjunto con resultados en vivo (`/encuestas`).

- Administración/concejo: crear encuestas con título, descripción y al menos 2 opciones; modo de selección única o múltiple; encuestas anónimas; fecha de cierre.
- Cerrar manualmente una encuesta o cierre automático al llegar `cierra_at`.
- Residente: votar (un solo voto por persona vía gate de participación única) y ver resultados en vivo con conteo y porcentaje; indicador personalizado de "ya voté".
- Difusión en tiempo real por WebSocket de creación y actualización; listado de las encuestas recientes.

---

## Comité de convivencia

Gestión del comité conforme a la Ley 675/2001 y seguimiento de casos de convivencia (`/comite-convivencia`).

- Crear períodos de comité y ver el vigente con alerta de vencimiento a 30 días e histórico; validación legal (mínimo 3 miembros e impar).
- Agregar y desactivar miembros (calidad y unidad), manteniendo la paridad impar.
- Registrar y seguir casos: creación (unidad que reporta y unidad reportada), listado filtrable por estado y tipo, actualización de estado/resolución y tablero de estadísticas.
- Asignar un miembro del comité a un caso; registrar sesiones de mediación (ACUERDO/SIN_ACUERDO) y generar el acta de mediación (Art. 58).
- Firma de actas por las partes (reportante, reportada, miembro del comité, administrador) con marcado automático al reunir las firmas.
- Catálogo de unidades con residente para selectores y notificaciones en tiempo real de todos los eventos de convivencia.

---

## Pases temporales

Pases de acceso temporal para huéspedes con permisos por área, vehículos y cuenta de huésped (`/pases-temporales`).

- Propietario/administración: emitir un pase con código de acceso único de 8 caracteres, fechas de inicio/fin, permisos por área (gimnasio, piscina, entrada/salida, vehículo, asamblea) y vehículos autorizados.
- Creación automática de una cuenta HUESPED_TEMPORAL cuando se indica email (usa el código como contraseña inicial).
- Listar los pases emitidos con su estado (Activo/Expirado/Revocado), editar (incluye reemplazo completo de vehículos), revocar (desactiva la cuenta del huésped) y copiar el código.
- Huésped: consultar su pase activo y sus vehículos.
- Validación del código en portería con detalle de permisos y vehículos.
- Expiración automática: cada 30 minutos un scheduler marca como expirados los pases vencidos y desactiva sus cuentas de huésped.

---

## Documentos (vehículos y mascotas)

Vencimientos de documentos vehiculares y carné de vacunas de mascotas, que alimentan los recordatorios.

- Registrar y actualizar las fechas de vencimiento de SOAT y tecnomecánica de vehículos propios.
- Consultar el historial de vacunas de cada mascota (ordenado por próxima dosis).
- Agregar vacunas (nombre, fecha de aplicación, próxima dosis, certificado adjunto) y eliminar registros.
- Alimentar el motor de recordatorios para avisar antes de que venzan documentos del vehículo o vacunas de la mascota.

---

## Banners / Ad-spaces

Espacios publicitarios programables con métricas, y panel demográfico orientado a anunciantes.

- Administración: crear, listar, ver, editar y eliminar espacios publicitarios (nombre, posición, imagen, enlace, empresa, fechas de vigencia) y activar/desactivar (`/admin-banners`).
- Métricas por anuncio: impresiones, clics y CTR.
- Residente: feed de anuncios activos y vigentes; ver banners (registra impresión y clic, abre enlace externo).
- Panel demográfico para administradores (`/admin-analytics`): total de unidades y usuarios, nuevos del mes, activos en 30 días, desglose por rol y por torre, con nota agregada de datos clave para anunciantes (vista de solo lectura).

---

## Notificaciones

Bandeja in-app, tiempo real y push del navegador multi-dispositivo.

- Bandeja in-app con las últimas 20 notificaciones del usuario; marcar como leídas de forma individual (por ids) o todas a la vez.
- Recepción en tiempo real vía WebSocket (`notification.created`) cuando otros módulos generan avisos (paquetes, trámites, anuncios, etc.).
- Suscripción a notificaciones push del navegador (web-push) con soporte multi-dispositivo y cancelación por dispositivo.

---

## Superadmin / multi-conjunto

Panel de superadministrador para gestionar los conjuntos (tenants) de la plataforma (`/superadmin`).

- Registrar nuevos conjuntos con datos legales (NIT, representante legal, notaría y número de escritura, fecha de escritura, matrícula inmobiliaria, total de unidades).
- Configurar la marca: subdominio único (saneado), logo y color primario; asignar el plan de suscripción.
- Listar todos los conjuntos registrados, editar sus datos y activar/desactivar conjuntos.
- Actualización en tiempo real de la lista vía WebSocket.

---

## Infraestructura (transversal)

Servicios de plataforma que sostienen todos los módulos.

- Tiempo real por WebSocket por conjunto y por usuario, autenticado con ticket efímero.
- Videollamada por LiveKit (citofonía y asamblea) con tokens por sala y permisos de publicación por rol.
- Subida de imágenes (PNG, JPG, WEBP, GIF, SVG) por data URL/base64 y de archivos genéricos (PDF, Word, Excel, CSV, ZIP, audio, video) hasta 16 MiB, con almacenamiento en objeto remoto (MinIO/S3) segmentado por conjunto y URL pública.
- Notificaciones push (Web Push) con suscripciones multi-dispositivo.
- Sondas y documentación de servicio: `/healthz`, especificación OpenAPI (`/api/v1/openapi.json`) y documentación HTML interactiva (`/docs`).
- Errores estandarizados en problem+json (RFC 7807); el API se sirve detrás de Cloudflare.

---

## Apéndice — Endpoints por dominio

| Dominio | Endpoints | Rutas clave |
|---|---:|---|
| auth_routes | 6 | `POST /auth/login`, `GET /auth/me`, `PUT /auth/password`, `GET /auth/ws-ticket` |
| usuarios | 3 | `GET/PUT /usuarios/me/profile`, `GET /usuarios/directorio` |
| conjuntos | 3 | `GET/POST /superadmin/conjuntos`, `PUT /superadmin/conjuntos/{id}` |
| notificaciones | 4 | `GET /notificaciones`, `PUT /notificaciones/leidas`, `POST/DELETE /usuarios/me/push-subscriptions` |
| vigilancia | 18 | `GET/POST /vigilancia/visitas`, `POST /vigilancia/paquetes`, `POST /visitas/preregistro`, `POST /visitas/scan` |
| parqueadero | 35 | `GET /parqueadero/mapa`, `POST /parqueadero/celdas/{id}/asignar`, `POST /parqueadero/sesiones/{id}/cerrar`, `POST /parqueadero/reservas` |
| reservas | 6 | `GET /areas-comunes`, `GET/POST /reservas`, `GET /reservas/{id}/verificar` |
| pagos | 3 | `GET /pagos`, `PUT /pagos/{id}/pagar`, `GET /pagos/{id}/estado` |
| comunicaciones | 5 | `GET/POST /anuncios`, `PUT/DELETE /anuncios/{id}`, `GET /directorio` |
| solicitudes | 7 | `GET/POST /solicitudes`, `PUT /solicitudes/{id}/estado`, `POST /solicitudes/{id}/comentarios` |
| tramites | 3 | `GET/POST /tramites`, `PUT /tramites/{id}/resolver` |
| uploads | 2 | `POST /uploads/imagen`, `POST /uploads/archivo` |
| clasificados | 2 | `GET/POST /clasificados` |
| inmuebles | 3 | `GET/POST /inmuebles`, `PUT /inmuebles/{id}` |
| admin_areas | 5 | `GET/POST /admin/areas-comunes`, `PUT/DELETE /admin/areas-comunes/{id}`, `GET /admin/reservas` |
| ad_spaces | 8 | `GET/POST /admin/ad-spaces`, `GET /ad-spaces/active`, `POST /ad-spaces/{id}/impress`, `POST /ad-spaces/{id}/click` |
| admin_finanzas | 7 | `GET /admin/finanzas/resumen`, `GET /admin/pagos`, `GET/POST /admin/gastos`, `GET /admin/morosidad` |
| admin_stats | 3 | `GET /admin/stats`, `GET/POST /admin/status-config` |
| analytics | 1 | `GET /admin/analytics/demografia` |
| admin_usuarios | 4 | `POST /admin/usuarios/invitar`, `GET /admin/usuarios`, `GET/PUT /admin/usuarios/{id}` |
| servicios | 6 | `GET /admin/solicitudes`, `GET /admin/solicitudes/stats`, `PUT /admin/solicitudes/{id}`, `GET /admin/solicitudes/{id}/historial` |
| chat | 5 | `GET/POST /chat`, `GET /admin/chat`, `GET/POST /admin/chat/{usuario_id}` |
| citofonia | 2 | `POST /citofonia/call`, `GET /citofonia/token` |
| asamblea | 20 | `GET/PUT /asambleas/activa/session`, `POST /asambleas/{id}/votaciones`, `POST /votaciones/{id}/votos`, `GET /asambleas/{id}/livekit-token` |
| ai | 9 | `POST /asambleas/{id}/copilot`, `POST /asambleas/{id}/acta`, `GET /asambleas/{id}/acta/pdf`, `POST /ai/asistente` |
| pases_temporales | 6 | `POST /pases-temporales`, `GET /pases-temporales/mi-pase`, `GET /pases-temporales/validar/{codigo}`, `PUT /pases-temporales/{id}/revocar` |
| comite_convivencia | 14 | `GET/POST /convivencia/comite`, `GET/POST /convivencia/casos`, `POST /convivencia/casos/{id}/mediacion`, `POST /convivencia/actas/{id}/firmar` |
| sos | 6 | `POST/GET /sos`, `GET /sos/activa`, `POST /sos/{id}/atender`, `POST /sos/{id}/resolver`, `POST /sos/{id}/cancelar` |
| encuestas | 4 | `GET/POST /encuestas`, `POST /encuestas/{id}/votar`, `POST /encuestas/{id}/cerrar` |
| multas | 4 | `GET/POST /multas`, `POST /multas/{id}/apelar`, `POST /multas/{id}/anular` |
| documentos | 4 | `PUT /vehiculos/{id}/documentos`, `GET/POST /mascotas/{id}/vacunas`, `DELETE /vacunas/{id}` |
| _plataforma_ | 4 | `GET /healthz`, `GET /api/v1/ws`, `GET /api/v1/openapi.json`, `GET /docs` |
| **Total** | **~212** | 31 dominios + plataforma |

> Los conteos por dominio son filas `método+path`; algunas rutas registran varios métodos. La autenticación y el WebSocket se revisaron también desde un grupo transversal de seguridad (`core_auth`), no listado aquí para no duplicar.
---

## Datos demo (`--seed-demo`)

Conjunto Demo totalmente poblado e idempotente (subdominio `demo`), con metadatos Ley 675,
`unidades` reales y al menos una cuenta por rol. Credenciales y contenido en
[`TEST_CREDENTIALS.md`](TEST_CREDENTIALS.md). Guard de seguridad: el seeder exige
`ENCONJUNTO_ALLOW_SEED=1` y **nunca** debe correrse contra producción.

---

## E2E (Playwright)

- **Smoke** (`e2e/01-*`…`14-*`) — cada vista carga sin rebotar a `/login`.
- **`e2e/30-all-roles-journeys.spec.ts`** — los 13 roles vía una cuenta tester (`switch-role`,
  stack local `docker-compose.e2e.yml`); recorre menús, vistas y formularios por rol.
- **`e2e/prod-pages.spec.ts` / `e2e/prod-switchrole.spec.ts`** — las vistas por rol contra el
  dominio real **app.conjuntos.app**, **solo lectura**.
- **`e2e/40-screenshots.spec.ts`** — captura PNG de cada vista por rol en `screenshots/<ROL>/`
  (login de cuenta demo standalone; solo lectura, no usa `switch-role`).

---

## Revisión de backend (2026-06-26)

Revisión multi-agente de los 31 dominios + capa de autenticación/WebSocket. Resumen:
**1 critical, 6 high, 25 medium, 54 low** (86 hallazgos confirmados, 1 refutado). Detalle,
ubicaciones `file:line` y correcciones propuestas en
[`REVISION_BACKEND_2026-06-26.md`](REVISION_BACKEND_2026-06-26.md).
