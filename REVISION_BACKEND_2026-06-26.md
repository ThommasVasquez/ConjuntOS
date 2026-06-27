# Revisión de backend y endpoints — 2026-06-26

## 1) Resumen ejecutivo

**Cobertura:** 32 dominios de backend y 217 entradas de endpoint revisadas (el dominio `core_auth` re-documenta parte de `auth_routes`, por lo que hay solapamiento parcial en los flujos de autenticación/WebSocket). La capa frontend (residente, vigilancia, parqueadero, admin, superadmin/asamblea) se inventarió como contexto de superficie, sin hallazgos propios.

**Hallazgos por severidad** (solo `verdict = confirmed`; no hubo `uncertain`; se excluye 1 `refuted`):

| Severidad | Confirmados |
|-----------|-------------|
| Critical  | 1 |
| High      | 6 |
| Medium    | 25 |
| Low       | 54 |
| **Total confirmados** | **86** |
| Refutados (excluidos del conteo) | 1 |

Temas transversales recurrentes: IDOR cross-tenant por handlers que omiten el filtro `conjunto_id` / la verificación de propiedad; escrituras multi-statement sin `conn.transaction()` (atomicidad / TOCTOU); difusión de PII por canal WebSocket conjunto-wide; panics por entrada de usuario no validada (mitigados por `CatchPanicLayer` → 500); SQL por `format!()`/interpolación; y handlers de mutación que olvidan `guard::require(...)`.

---

## 2) Hallazgos confirmados

### CRITICAL

#### C1. Toma de cuenta / escalada de privilegios vía `upsert_usuario_huesped`
- **Dominio:** pases_temporales
- **Location:** `backend/api/src/domains/pases_temporales/repo.rs:141`
- **Por qué importa:** El upsert hace match solo por `email + conjunto_id` (sin filtro de `rol`) y sobrescribe `password_hash` y `activo=true` de cualquier fila existente. Un PROPIETARIO emite un pase con `email_huesped` = el correo de un ADMINISTRADOR del mismo conjunto; la nueva contraseña es el hash del código de acceso de 8 caracteres, que se devuelve en claro en `PaseTemporalDto.codigo_acceso`. Resultado: reseteo de credenciales a un valor conocido + reactivación → login como la cuenta privilegiada. Corolario DoS: `revocar_pase` desactiva (`activo=false`) la cuenta real vinculada.
- **Fix:** En `upsert_usuario_huesped`, restringir el match/actualización a filas con `rol = HuespedTemporal` (`...filter(usuarios::rol.eq(HuespedTemporal))`); nunca pisar `password_hash`/`activo` de una cuenta no-huésped. Si el email pertenece a otro rol, abortar con `Conflict`. Idealmente, desacoplar la cuenta de huésped del email de un residente existente.

---

### HIGH

#### H1. IDOR cross-tenant: GET de comentarios de PQRS sin filtro de conjunto
- **Dominio:** solicitudes
- **Location:** `backend/api/src/domains/solicitudes/handlers.rs:298-306` (repo `repo.rs:193-196`)
- **Por qué importa:** El handler `comentarios` solo autentica (`_user`) y llama `repo::comentarios_por_ticket(&mut conn, id)`, que filtra únicamente por `ticket_id`. Cualquier usuario autenticado de cualquier conjunto puede leer los comentarios de un ticket de otro tenant conociendo su UUID. Es el único handler del archivo sin `solicitud_por_id(.., user.conjunto_id)`.
- **Fix:** Cargar el ticket con `solicitud_por_id(&mut conn, id, user.conjunto_id)` (404 si no pertenece) y verificar relación creador/asignado/admin antes de leer; o añadir `conjunto_id` al `WHERE` del repo vía join con `solicitudes_servicio`.

#### H2. IDOR cross-tenant: comentarios internos de servicio (admin)
- **Dominio:** servicios
- **Location:** `backend/api/src/domains/servicios.rs:229` (repo `repo.rs:189-198`)
- **Por qué importa:** `listar_comentarios` aplica solo `guard::require_admin` (rol, no tenant) y llama `comentarios_por_ticket(&mut conn, id)` sin verificar pertenencia. Un admin del conjunto A lee `contenido` y `usuario_id` de comentarios internos de tickets de otros conjuntos.
- **Fix:** Anteponer `repo::solicitud_por_id(&mut conn, id, user.conjunto_id)` (como ya hace `agregar_comentario` en `servicios.rs:177`) y 404 si no pertenece al tenant.

#### H3. IDOR cross-tenant: historial de transiciones de servicio
- **Dominio:** servicios
- **Location:** `backend/api/src/domains/servicios.rs:240` (repo `repo.rs:213-222`)
- **Por qué importa:** `listar_transiciones` repite el patrón de H2: solo `require_admin`, luego `transiciones_por_ticket(&mut conn, id)` filtrado solo por `ticket_id`. Expone `estado_anterior/nuevo` y `usuario_id` de tickets ajenos.
- **Fix:** Igual que H2: validar tenant con `solicitud_por_id(.., user.conjunto_id)` antes de listar.

#### H4. Subida de SVG permite XSS almacenado
- **Dominio:** uploads
- **Location:** `backend/api/src/domains/uploads/handlers.rs:40`
- **Por qué importa:** El allowlist de imágenes incluye `"image/svg+xml"`; el `content_type` viene del cliente y se persiste verbatim (`storage.rs:65`). Un SVG con `<script>` servido inline con ese Content-Type ejecuta JS al visualizarse (XSS almacenado). El único particionado es por tenant (no mitiga).
- **Fix:** Quitar SVG del allowlist, o sanitizar el contenido (eliminar `<script>`/handlers/`xlink`), forzar `Content-Disposition: attachment` y una CSP restrictiva al servir, y nunca confiar en el Content-Type declarado por el cliente.

#### H5. `firmar_acta` sin guard de rol ni validación de firmante permite forjar un acta firmada
- **Dominio:** comite_convivencia
- **Location:** `backend/api/src/domains/comite_convivencia/handlers.rs:415-447`
- **Por qué importa:** Único handler del dominio que no llama `guard::require`. Solo valida tenant. `tipo` es un `String` libre sin validación, sin comprobar que `user.id` sea esa parte ni dedup por usuario. La completitud se calcula con `HashSet<tipo>.len() >= 4`, así que un único residente puede hacer 4 POST con 4 `tipo` distintos y marcar `firmada=true`.
- **Fix:** Añadir `guard::require` apropiado; validar `tipo` contra un enum cerrado; verificar que `user.id` corresponde a la parte declarada; deduplicar firmas por `(acta_id, usuario_id, tipo)` con UNIQUE; contar firmantes verificados, no strings arbitrarios.

#### H6. Relleno de urna en encuestas de selección múltiple
- **Dominio:** encuestas
- **Location:** `backend/api/src/domains/encuestas.rs:247-290`
- **Por qué importa:** En encuestas `multiple`, `seleccion` solo filtra IDs válidos, no deduplica; el guard de cardinalidad solo aplica a encuestas de opción única. `{ "opciones": ["o1","o1","o1",...] }` inserta N filas y `tally` cuenta cada una → una sola participación infla arbitrariamente una opción. No hay UNIQUE en `(encuesta_id, usuario_id, opcion_id)`.
- **Fix:** Deduplicar `seleccion` con un `HashSet` antes de insertar; añadir índice UNIQUE `(encuesta_id, usuario_id, opcion_id)`; opcionalmente limitar la cardinalidad máxima de selección.

---

### MEDIUM

#### M1. QR de visita "de un solo uso" canjeable varias veces (TOCTOU)
- **Dominio:** vigilancia — **Location:** `backend/api/src/domains/vigilancia/preregistro.rs:163-179`
- **Por qué importa:** `escanear()` hace SELECT → validar → UPDATE no condicional (`.find(visita.id)` = `WHERE id=$1`), sin transacción ni `FOR UPDATE` ni filtro `ingreso_at IS NULL`. Dos escaneos concurrentes redimen el mismo token.
- **Fix:** UPDATE atómico `...filter(ingreso_at.is_null()).set(ingreso_at.eq(now()))` y verificar filas afectadas (0 → token ya usado).

#### M2. Difusión de PII de portería a todo el conjunto por WebSocket
- **Dominio:** vigilancia — **Location:** `backend/api/src/domains/vigilancia/handlers.rs:282-305,506-530`
- **Por qué importa:** Varios handlers (`entregar_paquete`, `entregar_correspondencia`, `escanear/ingreso`, `crear_visita_residente`, `crear_novedad`) publican con `target_user_id: None` → broadcast conjunto-wide; cualquier residente con ticket WS recibe placa, documento, remitente y descripción. No hay guard de rol en la suscripción WS.
- **Fix:** Dirigir estos eventos al destinatario (`target_user_id: Some(usuario_id)`) o a un canal de rol vigilancia; segmentar la suscripción WS por rol/canal en lugar del canal único del conjunto.

#### M3. Asignación de celda de residente sin validar tenant del destino (cross-tenant + fuga PII vía mapa)
- **Dominio:** parqueadero — **Location:** `backend/api/src/domains/parqueadero/repo.rs:238`
- **Por qué importa:** La rama RESIDENTE no valida que `residente_id` pertenezca al conjunto (la rama VISITANTE sí); la FK es global. `mapa` hace `left_join(usuarios)` sin filtrar `usuarios.conjunto_id`, exponiendo nombre/torre/apto de un usuario de otro conjunto.
- **Fix:** Validar el destino con `obtener_usuario(&mut conn, user.conjunto_id, residente_id)` en la rama RESIDENTE (directa, payload de solicitud y `aprobar_solicitud`); añadir `usuarios::conjunto_id.eq(conjunto_id)` al join de `mapa`.

#### M4. `verificar_reserva` no restringe al admin de área a su propia área
- **Dominio:** reservas — **Location:** `backend/api/src/domains/reservas/handlers.rs:217-249`
- **Por qué importa:** `find_reserva_by_id` filtra solo `conjunto_id + id`; falta el guard por área que sí existe en `listar_reservas_area_hoy`. Un `AdministradorPiscina` lee PII (nombre/torre/apto) de reservas de gimnasio/salón.
- **Fix:** Tras cargar la reserva, validar que su `area_id` coincide con el área asignada del admin (mismo patrón de `listar_reservas_area_hoy:186-194`).

#### M5. `crear_reserva` ignora las restricciones del área
- **Dominio:** reservas — **Location:** `backend/api/src/domains/reservas/repo.rs:148-208`
- **Por qué importa:** No se leen `hora_apertura/cierre`, `dias_disponibles`, `duracion_slot` ni `capacidad_max`; toda área se trata como exclusiva (capacidad 1) y se aceptan horarios/días fuera de regla.
- **Fix:** Validar la franja contra horario/días/duración del área y, para `capacidad_max > 1`, contar solapamientos contra la capacidad en vez de rechazar cualquier concurrencia.

#### M6. Guard de pago no atómico permite doble cobro (TOCTOU)
- **Dominio:** pagos — **Location:** `backend/api/src/domains/pagos/handlers.rs:75`
- **Por qué importa:** Read-check-act sin lock ni transacción; `pago_por_id` es `.first()` sin `for_update`, y el UPDATE de `aplicar_estado_pago` no incluye `estado = Pendiente` en el WHERE. Dos PUT concurrentes llaman `cobrar()` dos veces.
- **Fix:** Envolver en `conn.transaction`, hacer `SELECT ... FOR UPDATE` y/o UPDATE condicional `...filter(estado.eq(Pendiente))` con verificación de filas afectadas antes de cobrar.

#### M7. SQL por interpolación en `actualizar_ticket`
- **Dominio:** solicitudes — **Location:** `backend/api/src/domains/solicitudes/repo.rs:125-155`
- **Por qué importa:** El UPDATE se arma con `format!()` y se ejecuta vía `diesel::sql_query`. Hoy los valores son enums/UUID/timestamps (no inyectable), pero rompe el invariante de parametrización y es frágil ante cambios futuros.
- **Fix:** Reescribir como `diesel::update(...).set(AsChangeset)` con binds tipados (como ya hace `set_imagenes`).

#### M8. Content-Type controlado por el cliente sin verificación de magic bytes
- **Dominio:** uploads — **Location:** `backend/api/src/domains/uploads/handlers.rs:67`
- **Por qué importa:** El `content_type` se toma del data URL del usuario y nunca se valida contra los bytes reales. `/uploads/archivo` carece de allowlist y persiste el tipo arbitrario verbatim → spoofing de contenido / posible XSS al servir inline.
- **Fix:** Detectar el tipo real por sniffing de bytes mágicos; aplicar allowlist también en `/archivo`; servir con Content-Type derivado del servidor y `Content-Disposition: attachment` para no-imágenes.

#### M9. Actualización de inmueble no atómica (hasta 14 UPDATE sin transacción)
- **Dominio:** inmuebles — **Location:** `backend/api/src/domains/inmuebles/repo.rs:69-138`
- **Por qué importa:** Un `execute().await?` por campo en autocommit; un fallo a mitad de secuencia deja la fila parcialmente actualizada.
- **Fix:** Envolver en `conn.transaction(...)` o construir un único `AsChangeset` con los campos `Some`.

#### M10. Tracking público (impress/click) sin auth ni filtro de conjunto
- **Dominio:** ad_spaces — **Location:** `backend/api/src/domains/ad_spaces/handlers.rs:211-235; repo.rs:89-103`
- **Por qué importa:** Los handlers no usan `AuthUser` y el repo filtra solo por `id`; cualquiera (cross-tenant, sin auth, sin rate limit) infla impresiones/clics de cualquier anuncio.
- **Fix:** Requerir contexto de conjunto (al menos filtrar/derivar `conjunto_id` del anuncio + verificar vigencia) y mitigar abuso (dedupe por sesión/IP, rate-limit en infra). Considerar firmar el id del anuncio en el feed.

#### M11. `editar_gasto` no valida `monto > 0`
- **Dominio:** admin_finanzas — **Location:** `backend/api/src/domains/admin_finanzas.rs:661`
- **Por qué importa:** `crear_gasto` rechaza montos no positivos, pero la edición aplica `req.monto` sin chequeo; un admin puede persistir 0 o negativo y distorsionar `gastos_mes/balance`.
- **Fix:** Replicar `if monto <= 0 { BadRequest }` en `editar_gasto` antes del UPDATE.

#### M12. Guard de asignación de rol solo bloquea SUPER_ADMIN
- **Dominio:** admin_usuarios — **Location:** `backend/api/src/domains/admin_usuarios.rs:503`
- **Por qué importa:** `ensure_assignable_rol` solo veta `SuperAdmin`; `require_admin` admite CONCEJO. Un CONCEJO puede invitar/promover a ADMINISTRADOR (escalada intra-tenant).
- **Fix:** Definir una jerarquía: solo SUPER_ADMIN/ADMINISTRADOR pueden asignar ADMINISTRADOR; CONCEJO restringido a roles inferiores. Validar tanto el rol destino como el del actor.

#### M13. UPDATE de ticket por interpolación sin filtro de conjunto
- **Dominio:** servicios — **Location:** `backend/api/src/domains/solicitudes/repo.rs:154`
- **Por qué importa:** `actualizar_ticket` arma el SQL completo con `format!()` (`WHERE id = '{}'`), sin `conjunto_id`; el aislamiento depende solo del chequeo previo del handler. No inyectable hoy, pero frágil.
- **Fix:** UPDATE tipado con binds y `WHERE id = ? AND conjunto_id = ?` (defensa en profundidad).

#### M14. Huésped temporal puede leer todo el hilo privado propietario↔administración
- **Dominio:** chat — **Location:** `backend/api/src/domains/chat/handlers.rs:45-52`
- **Por qué importa:** La rama de huésped llama `list_user_messages(conjunto_id, propietario_id)`, que no filtra por `huesped_id`; devuelve los mensajes privados del propietario, las respuestas del admin y los de otros huéspedes. La función correcta `list_huesped_messages` (filtra `huesped_id`) es código muerto.
- **Fix:** Usar `list_huesped_messages` (filtrando `huesped_id = user.id`) en la rama de huésped.

#### M15. Panic por input de usuario en `parse_peer_id` (`split_at` en frontera no-UTF8)
- **Dominio:** citofonia — **Location:** `backend/api/src/domains/citofonia/handlers.rs:100`
- **Por qué importa:** Valida longitud en bytes y luego `split_at(36)`; un char multibyte que cruce el byte 36 hace panic (→ 500 vía `CatchPanicLayer`). `target_peer_id` viene del body.
- **Fix:** Validar con `str::char_indices`/`get(..36)` (o parsear el UUID con `Uuid::parse_str` sobre un slice seguro) y devolver `PeerTarget::Invalid`/400 en vez de panic.

#### M16. `create_subtitulo` sin guard de rol (suplantación de subtítulos en vivo)
- **Dominio:** ai — **Location:** `backend/api/src/domains/ai/handlers.rs:309`
- **Por qué importa:** A diferencia de `copilot`/`consensuar`/`generate_acta`, no llama `guard::require(ADMIN_ROLES)`. `speaker` es cliente-controlado y el subtítulo se difunde por WS a todo el conjunto: cualquier residente inyecta/suplanta texto en la transcripción.
- **Fix:** Añadir `guard::require(&user, ADMIN_ROLES)?` y/o derivar `speaker` del usuario autenticado, no del body.

#### M17. `crear_pase` no valida que `unidad_id` pertenezca al conjunto
- **Dominio:** pases_temporales — **Location:** `backend/api/src/domains/pases_temporales/handlers.rs:82`
- **Por qué importa:** `body.unidad_id` se inserta crudo (también en el usuario huésped); no se verifica que la unidad sea del conjunto ni que el propietario sea su titular. Permite referenciar unidades de otro tenant.
- **Fix:** Verificar que la `unidad_id` exista en `user.conjunto_id` (y que el propietario sea titular) antes de crear el pase/huésped.

#### M18. `validar_pase` sin guard de rol
- **Dominio:** pases_temporales — **Location:** `backend/api/src/domains/pases_temporales/handlers.rs:211`
- **Por qué importa:** Solo toma `AuthUser`; cualquier autenticado del conjunto (incluido un HUESPED_TEMPORAL) puede consultar códigos y leer nombre del huésped/anfitrión, permisos y placas. El intent es "portería" (vigilancia/admin).
- **Fix:** Añadir `guard::require` con los roles de portería/admin.

#### M19. `actualizar_caso` construye SQL crudo por interpolación
- **Dominio:** comite_convivencia — **Location:** `backend/api/src/domains/comite_convivencia/repo.rs:189-205`
- **Por qué importa:** UPDATE por concatenación ejecutado con `diesel::sql_query`; `resolucion` se escapa a mano. Mitigado hoy, pero patrón frágil.
- **Fix:** UPDATE parametrizado con `AsChangeset`/binds.

#### M20. `crear_caso` no valida que las unidades pertenezcan al conjunto
- **Dominio:** comite_convivencia — **Location:** `backend/api/src/domains/comite_convivencia/handlers.rs:230-237`
- **Por qué importa:** `unidad_reporta_id`/`unidad_reportada_id` se insertan sin validar tenant; `unidad_embed` filtra solo por `id` (sin `conjunto_id`), devolviendo torre/número y nombre del residente de otra unidad/tenant.
- **Fix:** Validar ambas unidades contra `user.conjunto_id` al crear; añadir `conjunto_id` al filtro de `unidad_embed`.

#### M21. `agregar_miembro` inserta antes de validar la paridad y sin transacción
- **Dominio:** comite_convivencia — **Location:** `backend/api/src/domains/comite_convivencia/handlers.rs:164-176`
- **Por qué importa:** El INSERT se persiste antes de contar; si el total queda par, devuelve `BadRequest` pero la fila ya está committeada → comité con número par pese al error.
- **Fix:** Calcular el conteo resultante antes de insertar, o envolver INSERT+validación en `conn.transaction` con rollback si queda par.

#### M22. Difusión de PII de emergencia (SOS) por WebSocket a todo el conjunto
- **Dominio:** sos — **Location:** `backend/api/src/domains/sos.rs:193-203`
- **Por qué importa:** El evento `SOS CREATED` se publica como broadcast conjunto-wide con `SosDto` completo (nombre, torre, apto, nota, ubicación); cualquier autenticado conectado por WS lo recibe sin guard de rol. El "solo seguridad" es convención de frontend.
- **Fix:** Dirigir el evento a un canal de rol seguridad o filtrar la suscripción WS por rol; minimizar PII en el payload broadcast.

#### M23. Escritura de voto no atómica (participación y votos fuera de transacción)
- **Dominio:** encuestas — **Location:** `backend/api/src/domains/encuestas.rs:260-290`
- **Por qué importa:** El INSERT de participación y el de votos son sentencias independientes; si falla el segundo, el usuario queda `ya_vote=true` sin votos y no puede reintentar (UNIQUE → Conflict).
- **Fix:** Envolver ambos inserts en `conn.transaction(...)`.

#### M24. Emisión de multa no atómica → cobro huérfano
- **Dominio:** multas — **Location:** `backend/api/src/domains/multas.rs:176-206`
- **Por qué importa:** INSERT en `pagos` y luego en `multas` sin transacción (con generación de PDF en medio); si falla el insert de la multa, queda un cobro Pendiente en cartera sin multa asociada.
- **Fix:** Envolver ambos inserts en `conn.transaction`; mover el PDF (best-effort) fuera de la sección transaccional.

#### M25. El logout no revoca el JWT (Bearer válido tras cerrar sesión)
- **Dominio:** core_auth — **Location:** `backend/api/src/domains/auth_routes.rs:199`
- **Por qué importa:** `logout()` solo elimina la cookie; el JWT stateless (exp 30 días) sigue válido. Un Bearer filtrado sobrevive al logout; la única revocación stateless es `password_changed_at`, que logout no toca.
- **Fix:** Implementar denylist de tokens (jti) o bump de un `sessions_invalidated_at`/`token_version` por usuario verificado en el extractor; reducir el TTL del Bearer.

---

### LOW

#### Auth / autorización
- **L1. `switch-role` permite auto-escalada de rol persistente** — auth_routes — `backend/api/src/domains/auth_routes.rs:148-191`. Solo veta SuperAdmin; ADMINISTRADOR es alcanzable. Seguro hoy (TESTER_EMAILS vacío). **Fix:** allowlist de roles destino para testers (excluir todo rol admin-tier), o deshabilitar la ruta en prod.
- **L2. `registrar_checkpoint` escribe contra rondas de otro staff del conjunto** — parqueadero — `handlers.rs:1388`. `ronda_por_id` solo filtra `conjunto_id`, no `usuario_id`. **Fix:** verificar `ronda.usuario_id == user.id`.
- **L3. Vinculación admin-de-área-a-área por nombre frágil** — reservas — `handlers.rs:186-194`. Autoriza comparando `area.nombre` con literal "Piscina"/"Gimnasio". **Fix:** vincular admin↔área por FK/identificador estable.
- **L4. `editar_usuario` no valida el rol actual: se puede degradar/desactivar un SUPER_ADMIN del mismo conjunto** — admin_usuarios — `admin_usuarios.rs:586`. **Fix:** rechazar si la fila destino tiene rol superior al actor.
- **L5. Token de citofonía no verifica que el solicitante fuese convocado** — citofonia — `handlers.rs:354`. Solo valida el conjunto embebido; emite token `can_publish=true` a cualquier mismo-conjunto que conozca el room. **Fix:** persistir destinatarios de la sala y validar membresía.
- **L6. `create_pairing` no exige rol de administrador** — asamblea — `handlers.rs:180`. Cualquier autenticado crea pairings PIN. **Fix:** `guard::require(ADMIN_ROLES)`.
- **L7. WS upgrade omite revocación por cambio de contraseña y cuenta activa** — core_auth — `ws.rs:33`. Ticket (TTL 120s) valida solo exp+aud. **Fix:** consultar `password_changed_at`/`activo` en el handshake WS.
- **L8. Divulgación de estado de cuenta en login (403 vs 401)** — core_auth — `auth_routes.rs:82`. El 403 (cuenta desactivada) ocurre tras validar contraseña → confirma email+password válidos. **Fix:** devolver 401 genérico también para cuentas desactivadas, o validar `activo` antes del check de password con timing constante.
- **L9. `logout` sin protección CSRF** — core_auth — `auth_routes.rs:199`. POST "simple" cross-site con cookie SameSite=None fuerza logout. **Fix:** exigir `AuthUser`/token CSRF o método no-simple.
- **L10. ADMINISTRADOR/SUPER_ADMIN no pueden revocar/editar pases que no emitieron** — pases_temporales — `handlers.rs:282`. `propietario_id != user.id` → Forbidden incluso para admins. **Fix:** permitir bypass por rol admin manteniendo el chequeo de propiedad para PROPIETARIO.
- **L11. `list_votos` expone el voto individual a cualquier miembro del conjunto** — asamblea — `handlers.rs:296`. Sin guard; `VotoDto` lleva `usuario_id`+`respuesta`. **Fix:** restringir a admin o respetar el flag de anonimato.

#### Aislamiento de tenant (defensa en profundidad)
- **L12. `find_unidad` no filtra por `conjunto_id`** — usuarios — `repo.rs:77`. No explotable hoy. **Fix:** añadir filtro `conjunto_id`.
- **L13. Hijack de suscripción push por `on_conflict` solo sobre `endpoint`** — notificaciones — `repo.rs:122`. El upsert reasigna `conjunto_id/usuario_id` sin verificar dueño. **Fix:** conflicto compuesto `(usuario_id, endpoint)` o verificar propietario previo.
- **L14. UPDATE de `cancelar_reserva` sin filtro `conjunto_id`** — parqueadero — `reservas.rs:262`. Mitigado por el SELECT previo. **Fix:** reincluir `conjunto_id` en el WHERE del UPDATE.
- **L15. `obtener_inmueble` no filtra por conjunto (oráculo 403 vs 404)** — inmuebles — `repo.rs:57-67`, `handlers.rs:132-135`. **Fix:** filtrar por `conjunto_id` y unificar a 404.
- **L16. Sub-consultas unidad/vehículos/mascotas sin filtro de `conjunto_id`** — admin_usuarios — `admin_usuarios.rs:574`. Mitigado por `find_user_in_conjunto`. **Fix:** añadir filtro `conjunto_id` explícito.
- **L17. Envío de huésped no valida que el propietario del pase pertenezca al conjunto del token** — chat — `handlers.rs:110-121`. **Fix:** assert `pase.propietario_id ∈ user.conjunto_id`.
- **L18. `pase_por_id` sin filtro de `conjunto_id` (oráculo de existencia)** — pases_temporales — `repo.rs:56`. **Fix:** filtrar `conjunto_id`, unificar NotFound/Forbidden.
- **L19. `crear_comite`/`agregar_miembro` aceptan `usuario_id`/`unidad_id` sin validar tenant** — comite_convivencia — `handlers.rs:129-136`. **Fix:** validar IDs contra `user.conjunto_id`; filtrar `conjunto_id` en `usuario_embed`/`unidad_embed`.
- **L20. `asignar_miembro` no valida que el miembro pertenezca al comité/conjunto** — comite_convivencia — `handlers.rs:287`. **Fix:** verificar que `miembro_id` sea miembro activo del comité del conjunto.
- **L21. Oráculo de existencia SOS por NotFound vs Forbidden** — sos — `sos.rs:290-299`. `.find(id)` sin `conjunto_id`. **Fix:** filtrar `conjunto_id` y homogeneizar respuestas.
- **L22. `eliminar_vacuna` busca por id sin filtro de `conjunto_id`** — documentos — `documentos.rs:150`. Mitigado por `verificar_mascota`. **Fix:** añadir filtro `conjunto_id` al lookup.

#### Correctitud / robustez
- **L23. PUT con cuerpo vacío produce 500** — conjuntos — `repo.rs:67`. Changeset vacío → `QueryBuilderError` → 500. **Fix:** validar "al menos un cambio" → 400/no-op.
- **L24. Validación inconsistente del nombre entre create y update** — conjuntos — `handlers.rs:107`. Update no valida nombre vacío. **Fix:** replicar `trim().is_empty()`.
- **L25. PUT con body vacío en áreas → 500** — admin_areas — `admin_areas.rs:486`. **Fix:** rechazar changeset vacío con 400.
- **L26. `editar_area` no valida horario/días vacíos** — admin_areas — `admin_areas.rs:238`. **Fix:** reusar `validate_area_fields` en update.
- **L27. PUT `/admin/gastos/{id}` con cuerpo vacío → 500** — admin_finanzas — `admin_finanzas.rs:657`. **Fix:** validar no-op → 400/200.
- **L28. Overflow aritmético en offset de paginación con `page` extremo** — admin_finanzas — `admin_finanzas.rs:304`. `q.page` sin cota máxima. **Fix:** clamp de `page` y usar `checked_mul`/`saturating`.
- **L29. `aprobar_visita` no valida la transición de estado** — vigilancia — `repo.rs:394-422`. Sin máquina de estados. **Fix:** filtrar `estado = Pendiente` y/o `ingreso_at IS NULL`.
- **L30. Panic por overflow al sumar meses (asignación de celda)** — parqueadero — `repo.rs:211`. `Months::new(m as u32)` con `m` sin cota. **Fix:** cota superior de `meses` → BadRequest; usar `checked_add_months`.
- **L31. Panic por overflow de fecha con `meses` grande al aprobar trámite** — tramites — `repo.rs:129`. Mismo patrón. **Fix:** validar rango de `meses`; `checked_add_months`.
- **L32. `slots_ocupados` omite reservas que cruzan medianoche** — reservas — `repo.rs:40-62`. Solo display (el overlap de reserva es correcto). **Fix:** incluir reservas cuyo intervalo solape el día.
- **L33. Cobro antes de persistir: la referencia de la pasarela se pierde si falla el UPDATE** — pagos — `handlers.rs:87`. **Fix:** pre-registrar la referencia / transacción; reconciliar por `wompi_ref` aunque sea NULL.
- **L34. Divergencia entre listado por unidad y pago por usuario** — pagos — `repo.rs:33`. El listado expone pagos de co-residentes sin atribución; pagar da 404. **Fix:** unificar criterio (por usuario o exponer `usuario_id` y permitir/denegar coherentemente).
- **L35. `agregar_comentario` no rechaza contenido vacío** — solicitudes — `handlers.rs:334-338`. **Fix:** `if trim().is_empty() { BadRequest }`.
- **L36. Límite de tamaño inconsistente (16 MiB inalcanzable; `subir_imagen` sin límite explícito)** — uploads — `handlers.rs:203`. Body cap global 12 MiB. **Fix:** alinear los límites y validar tamaño decodificado por endpoint.
- **L37. Sin validación de precio/área ni longitud de textos en inmuebles** — inmuebles — `handlers.rs:65-69`. Acepta negativos/cero. **Fix:** validar `precio>0`, `area>=0`, longitudes; CHECK en BD.
- **L38. La actualización de inmueble nunca refresca `updated_at`** — inmuebles — `repo.rs:69-135`. Sin trigger. **Fix:** `set(updated_at.eq(now()))` o trigger de BD.
- **L39. Sin validación de coherencia de fechas (`fin_en >= inicio_en`) en ad-spaces** — ad_spaces — `handlers.rs:70-90`, `models.rs:118-141`. Rango invertido nunca se muestra. **Fix:** validar `fin_en >= inicio_en` en create/update.
- **L40. La transición de estado se registra antes de confirmar el UPDATE y se ignoran sus errores** — servicios — `servicios.rs:133`. `let _ =` + `?` posterior → historial inconsistente. **Fix:** ejecutar en `conn.transaction` y propagar errores.
- **L41. `register_asistencia` confía en ip/dispositivo del cliente y marca `verificado=true`** — asamblea — `handlers.rs:417`. Sin chequear `asamblea.activa`. **Fix:** derivar ip del servidor, no fijar `verificado=true` sin validación, comprobar asamblea activa.
- **L42. Modelo de roles inconsistente: control de sesión vs publicar en LiveKit** — asamblea — `handlers.rs:711`. SuperAdmin controla pero no publica; Concejo publica pero no controla. **Fix:** unificar la definición de roles (incluir SuperAdmin/Concejo coherentemente).
- **L43. Generación de `numero_interno` susceptible a colisión y carrera** — pases_temporales — `repo.rs:164`. Saturación en 9999 + max+1 no atómico → choca con índice UNIQUE. **Fix:** secuencia/`INSERT ... ON CONFLICT` con reintento, o columna serial por conjunto.
- **L44. `stats_convivencia` silencia errores de BD con `unwrap_or(0)`** — comite_convivencia — `repo.rs:317-323`. **Fix:** propagar errores con `?`.
- **L45. El acta usa un nombre de conjunto hardcodeado** — comite_convivencia — `handlers.rs:369`. **Fix:** interpolar el nombre real del conjunto.
- **L46. La contraseña temporal del residente invitado nunca se entrega** — admin_usuarios — `admin_usuarios.rs:461`. La cuenta queda inaccesible. **Fix:** enviar invitación/magic-link o devolver la temp en la respuesta (con `must_change_password`).
- **L47. El campo `cerrada` del DTO no refleja el cierre por vencimiento de `cierra_at`** — encuestas — `encuestas.rs:149`. **Fix:** computar `cerrada || cierra_at < now()` en `build_dto`.

#### PII / exposición de datos
- **L48. El listado de clasificados expone el teléfono de perfil del vendedor** — clasificados — `repo.rs:24`. Selecciona `usuarios::telefono` (no el contacto del clasificado) a todo el conjunto. **Fix:** devolver solo el contacto del clasificado o respetar consentimiento.
- **L49. Semántica inconsistente de `propietario.telefono` entre crear y listar** — clasificados — `handlers.rs:77`. Create usa `local.telefono`; list usa `usuarios::telefono`. **Fix:** unificar la fuente del campo.
- **L50. `list_conversations` carga sin límite todos los mensajes del conjunto en memoria** — chat — `repo.rs:69-104`. **Fix:** agregar en SQL (`GROUP BY`) y/o `.limit(...)`.

#### Otros / higiene
- **L51. Comodines LIKE sin escapar en la búsqueda del directorio** — usuarios — `repo.rs:53`. `%`/`_` inyectables (sin SQLi; impacto bajo, capado a 100). **Fix:** escapar `%`/`_` con `ESCAPE`.
- **L52. El residente puede sobreescribir torre/apto y autogenerar una unidad sin aprobación** — usuarios — `handlers.rs:148`. Hasta una unidad no autorizada por usuario. **Fix:** requerir aprobación admin para crear unidad / marcarla como pendiente.
- **L53. Endpoints de autenticación sin rate limiting a nivel de aplicación** — auth_routes — `auth_routes.rs:63`. Delegado a Cloudflare. **Fix:** añadir rate-limiter (p.ej. `governor`) en login/change-password.
- **L54. Panic por envenenamiento de RwLock con `unwrap()` en estado de disponibilidad** — admin_stats — `admin_stats.rs:46`. Prácticamente inalcanzable. **Fix:** manejar `PoisonError` (recuperar el guard) en lugar de `unwrap()`.

---

## 3) Dudosos (uncertain) — verificación manual

Ninguno. Todos los hallazgos inventariados tienen `verdict` definitivo (`confirmed` o `refuted`).

---

## 4) Descartados (refuted)

- **multas — "Anular una multa ya pagada borra el registro del pago"** (`backend/api/src/domains/multas.rs:297-307`): La FK `pago_id REFERENCES pagos(id)` sin `ON DELETE` rechaza el `DELETE FROM pagos` con violación de FK, por lo que el pago no se destruye. Sub-defecto real distinto (no reportado): el `anular` con pago vinculado puede dar 500 por la violación de FK y, sin transacción, dejar la multa en ANULADA con su pago intacto — inconsistencia, no pérdida del registro de pago.

---

## 5) Observaciones de cobertura

- **Dominios sin hallazgos (issues vacío):** `comunicaciones` (cartelera/anuncios + directorio Habeas Data) y `analytics` (demografía agregada). En ambos, los handlers revisados aplican `guard::require` de rol y filtran por `conjunto_id`; no se identificaron fallos de aislamiento, atomicidad ni validación.
- **30 de 32 dominios presentan al menos un hallazgo confirmado.** Los patrones a priorizar transversalmente: (1) anteponer verificación de tenant/propiedad en todo handler que reciba un id de path (IDOR: H1–H3, L15, L18, L21); (2) envolver escrituras multi-statement en `conn.transaction` y/o usar UPDATEs condicionales con verificación de filas (M1, M6, M9, M21, M23, M24, L40); (3) eliminar SQL por `format!()` a favor de binds tipados (M7, M13, M19); (4) revisar todos los `publish` WS con `target_user_id: None` que transporten PII (M2, M22); (5) auditar handlers de mutación por la ausencia de `guard::require` (H5, M16, L6).