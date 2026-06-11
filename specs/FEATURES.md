# ConjuntOS — Registro de Funcionalidades

> Documento vivo. Actualizar cada vez que se agregue, modifique o retire una funcionalidad.
> Ultima actualizacion: 2026-06-10

Leyenda de estado:

| Icono | Significado |
|-------|-------------|
| LIVE | En produccion |
| BETA | Implementado, pendiente pruebas finales |
| DEV | En desarrollo |
| PLAN | Planificado, sin codigo |
| DROP | Retirado / reemplazado |

---

## 1. Autenticacion y Seguridad

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 1.1 | Inicio de sesion (email + contrasena) | LIVE | M3 | Argon2id, timing-equalized |
| 1.2 | Sesion via cookie HttpOnly (`ec_session`) | LIVE | M3 | JWT HS256, 30 dias |
| 1.3 | Token Bearer como respaldo (cross-site) | LIVE | M3 | localStorage `ec_token` |
| 1.4 | Cierre de sesion | LIVE | M3 | Limpia cookie + localStorage |
| 1.5 | Cambio de contrasena | LIVE | M3 | Requiere contrasena actual |
| 1.6 | Proteccion de rutas por rol (8 roles) | LIVE | M3 | Middleware + guards backend |
| 1.7 | Aislamiento multi-tenant por conjunto | LIVE | M3 | Ley 2: todo filtrado por conjunto_id |
| 1.8 | Flag `mustChangePassword` | LIVE | M3 | Forzar cambio tras migracion |
| 1.9 | Recuperacion de contrasena por email | PLAN | — | No implementado aun |
| 1.10 | Autenticacion de dos factores (2FA) | PLAN | — | No implementado aun |

---

## 2. Perfil de Usuario

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 2.1 | Ver perfil con datos de unidad | LIVE | M3 | torre, apto, coeficiente |
| 2.2 | Editar nombre, telefono, genero | LIVE | M3 | |
| 2.3 | Editar torre y apartamento | LIVE | M3 | Bootstrap de unidad automatico |
| 2.4 | Subir avatar | LIVE | M3 | Max 150 KB, base64 |
| 2.5 | Ver vehiculos propios | LIVE | M4 | Desde parqueadero |
| 2.6 | Ver mascotas propias | LIVE | M5a | Desde tramites aprobados |
| 2.7 | Ver deuda pendiente | LIVE | M4 | Desde pagos |
| 2.8 | Ver reservas futuras | LIVE | M4 | Desde reservas |
| 2.9 | Ver paquetes pendientes | LIVE | M4 | Desde paqueteria |

---

## 3. Notificaciones

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 3.1 | Listado de notificaciones (ultimas 20) | LIVE | M4 | Por conjunto y usuario |
| 3.2 | Marcar como leidas (por ID o todas) | LIVE | M4 | |
| 3.3 | Suscripcion a Web Push (VAPID) | LIVE | M4 | Upsert por endpoint |
| 3.4 | Desuscripcion de Web Push | LIVE | M4 | |
| 3.5 | Fan-out al publicar anuncio | LIVE | M5a | Notifica a todos los residentes activos |
| 3.6 | Notificacion al crear solicitud PQRS | LIVE | M5a | Notifica a administradores |
| 3.7 | Notificacion al crear tramite | LIVE | M5a | Notifica a administradores |
| 3.8 | Notificacion al resolver tramite | LIVE | M5a | Notifica al solicitante |
| 3.9 | Notificacion al recibir paquete | LIVE | M4 | Notifica al residente |
| 3.10 | Push real via web-push (produccion) | BETA | M5b | PushSender trait; LogOnly en dev |

---

## 4. Cartelera — Anuncios y Comunicaciones

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 4.1 | Ver anuncios (fijados primero, luego recientes) | LIVE | M5a | Limite 50 |
| 4.2 | Crear anuncio (admin/concejo) | LIVE | M5a | Tipos: General, Urgente, Mantenimiento, Evento |
| 4.3 | Fijar anuncio al tope | LIVE | M5a | Campo `fijado` |
| 4.4 | Eliminar anuncio | LIVE | M5a | Solo admin/concejo, scoped al conjunto |
| 4.5 | Imagen y archivos adjuntos | LIVE | M5a | URL de imagen, array de archivos |
| 4.6 | Fecha de expiracion | LIVE | M5a | Campo `expiresEn` opcional |
| 4.7 | Contador de vistas | LIVE | M5a | Campo `vistas` |
| 4.8 | Directorio de residentes (Habeas Data) | LIVE | M5a | Solo nombre, torre, apto, telefono |
| 4.9 | Filtro por categoria en frontend | LIVE | M9 | Todos, Administracion, Seguridad, Evento, etc. |

---

## 5. Vigilancia — Control de Visitas

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 5.1 | Registrar visita (porteria) | LIVE | M4 | Nombre, tipo, placa, observacion |
| 5.2 | Ver visitas del dia (porteria) | LIVE | M4 | Con info del residente |
| 5.3 | Programar visita anticipada (residente) | LIVE | M5b | POST /visitas |
| 5.4 | Tipos de visita: peatonal / vehicular | LIVE | M4 | Con placa para vehicular |
| 5.5 | Flag de parqueadero para visitante | LIVE | M4 | |
| 5.6 | Estadisticas de vigilancia | LIVE | M4 | Visitas hoy, paquetes pendientes, residentes |

---

## 6. Vigilancia — Paqueteria

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 6.1 | Registrar llegada de paquete (porteria) | LIVE | M4 | Descripcion + remitente |
| 6.2 | Marcar como entregado | LIVE | M4 | En misma transaccion |
| 6.3 | Ver paquetes pendientes (porteria) | LIVE | M4 | |
| 6.4 | Ver mis paquetes (residente) | LIVE | M4 | GET /paquetes/mios |
| 6.5 | Notificacion automatica al residente | LIVE | M4 | Al registrar paquete |

---

## 7. Parqueadero

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 7.1 | Ver mis vehiculos y celdas | LIVE | M4 | GET /parqueadero/mio |
| 7.2 | Registrar vehiculo (carro/moto) | LIVE | M4 | Placa unica, 409 en duplicado |
| 7.3 | Mapa visual del parqueadero | LIVE | M4 | Con ocupantes |
| 7.4 | Actualizar estado de celda | LIVE | M4 | Disponible/Ocupado/Reservado + audit |
| 7.5 | Registro de ingresos/salidas/verificaciones | LIVE | M4 | Vigilante ve solo los suyos |
| 7.6 | Rondas de inspeccion con hallazgos | LIVE | M4 | JSON de hallazgos |
| 7.7 | Estadisticas de ocupacion | LIVE | M4 | Total, ocupadas, libres, % |
| 7.8 | Tipos de celda: residente, visitante, discapacitado | LIVE | M4 | |

---

## 8. Reservas de Areas Comunes

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 8.1 | Ver areas comunes disponibles | LIVE | M4 | Con horarios y capacidad |
| 8.2 | Consultar slots disponibles por fecha | LIVE | M4 | GET con query param fecha |
| 8.3 | Crear reserva | LIVE | M4 | Deteccion de conflicto: 409 |
| 8.4 | Estados: pendiente, confirmada, cancelada, completada | LIVE | M4 | CONFIRMADA por deposito |
| 8.5 | Soporte para deposito requerido | LIVE | M4 | Campo deposito_monto |
| 8.6 | Dias disponibles configurables | LIVE | M4 | Por area comun |
| 8.7 | Sin datos demo auto-generados | LIVE | M4 | Ley 4: solo --seed-demo |

---

## 9. Pagos y Finanzas

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 9.1 | Ver cuotas de administracion (ultimas 24) | LIVE | M4 | Por unidad |
| 9.2 | Ver recibos de servicios publicos (ultimos 12) | LIVE | M4 | Empresa, periodo, URL |
| 9.3 | Simular pago con metodo | LIVE | M4 | PSE, Tarjeta, Nequi, Daviplata, Efectivo |
| 9.4 | Estados: pendiente, pagado, vencido, en disputa | LIVE | M4 | |
| 9.5 | Calculo de deuda total pendiente | LIVE | M9 | Calculado en frontend desde pagos |
| 9.6 | Integracion con pasarela de pago real | PLAN | — | Actualmente simulado |

---

## 10. PQRS — Solicitudes

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 10.1 | Radicar solicitud PQRS | LIVE | M5a | Con categoria y tipo |
| 10.2 | Categorias: plomeria, electricidad, carpinteria, pintura, cerrajeria, otro | LIVE | M5a | |
| 10.3 | Tipos: peticion, queja, reclamo, sugerencia, mantenimiento | LIVE | M5a | |
| 10.4 | Marcar como urgente | LIVE | M5a | |
| 10.5 | Adjuntar imagenes | LIVE | M5a | Array de URLs |
| 10.6 | Visibilidad por rol: residente ve las suyas, admin ve todas | LIVE | M5a | |
| 10.7 | Notificacion a administradores al crear | LIVE | M5a | En misma transaccion |
| 10.8 | Estados: abierta, asignada, en progreso, completada | LIVE | M5a | |
| 10.9 | Asignacion a proveedor | LIVE | M5a | Campo proveedorId |

---

## 11. Tramites Administrativos

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 11.1 | Crear tramite con tipo y payload JSON | LIVE | M5a | Mascota, Vehiculo, Arrendamiento, Mudanza, Otro |
| 11.2 | Adjuntar documentos (base64) | LIVE | M5a | Array en campo documentos |
| 11.3 | Aprobar/rechazar por administrador | LIVE | M5a | Con observaciones |
| 11.4 | Efecto: aprobar VEHICULO crea registro en parqueadero | LIVE | M5a | Transaccional, placa duplicada = 409 + rollback |
| 11.5 | Efecto: aprobar MASCOTA crea registro de mascota | LIVE | M5a | Transaccional |
| 11.6 | Re-resolver tramite ya resuelto: 409 | LIVE | M5a | |
| 11.7 | Payload invalido al aprobar: 422 | LIVE | M5a | |
| 11.8 | Notificacion al solicitante con resultado | LIVE | M5a | Aprobacion o rechazo |
| 11.9 | Visibilidad: residente ve los suyos, admin ve todos con datos del solicitante | LIVE | M5a | |

---

## 12. Clasificados — Mercadillo Vecinal

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 12.1 | Publicar producto/servicio | LIVE | M5a | Nombre, descripcion, precio |
| 12.2 | Categorias: restaurante, tienda, lavanderia, farmacia, otro | LIVE | M5a | |
| 12.3 | Contacto via telefono y WhatsApp | LIVE | M5a | |
| 12.4 | Imagen del producto | LIVE | M5a | URL |
| 12.5 | Ver clasificados activos con info del vendedor | LIVE | M5a | Nombre y telefono del propietario |
| 12.6 | Precio como NUMERIC (string en JSON) | LIVE | M5a | Ley 6 |

---

## 13. Inmobiliaria

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 13.1 | Publicar inmueble en venta o alquiler | LIVE | M5a | |
| 13.2 | Tipos de unidad: apartamento, casa, local, oficina, bodega, parqueadero | LIVE | M5a | |
| 13.3 | Detalles: habitaciones, banos, area m2 | LIVE | M5a | |
| 13.4 | Multiples imagenes | LIVE | M5a | JSON array |
| 13.5 | Caracteristicas/etiquetas | LIVE | M5a | JSON array |
| 13.6 | Filtros: tipo negocio, tipo unidad, habitaciones | LIVE | M5a | Query params |
| 13.7 | Estados: disponible, vendido, arrendado, retirado | LIVE | M5a | |
| 13.8 | Propietario ve los suyos en cualquier estado | LIVE | M5a | Otros solo ven disponibles |

---

## 14. Chat Residente-Administracion

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 14.1 | Residente envia mensaje de texto | LIVE | M5b | POST /chat |
| 14.2 | Residente envia nota de voz (audio base64) | LIVE | M5b | Upload a Storage |
| 14.3 | Campo de transcripcion | LIVE | M5b | Opcional |
| 14.4 | Admin ve lista de conversaciones | LIVE | M5b | Con conteo de no leidos |
| 14.5 | Admin ve hilo completo de un residente | LIVE | M5b | Ultimos 100 mensajes |
| 14.6 | Enriquecimiento: perfil + vehiculos + mascotas del residente | LIVE | M5b | En vista del admin |
| 14.7 | Marcado automatico como leido al abrir | LIVE | M5b | Side effect del GET |
| 14.8 | Admin responde en el hilo | LIVE | M5b | POST /admin/chat/{id} |
| 14.9 | Chat en tiempo real (WebSocket/SSE) | PLAN | — | Actualmente por polling |

---

## 15. Citofonia — Videollamadas WebRTC

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 15.1 | Llamada audio/video via PeerJS/WebRTC | LIVE | M5b | Peer-to-peer |
| 15.2 | Push para llamada entrante | LIVE | M5b | Via PushSender |
| 15.3 | Resolucion de destino: usuario directo | LIVE | M5b | `user-{uuid}` |
| 15.4 | Resolucion de destino: todos los vigilantes | LIVE | M5b | `{conjuntoId}-VIGILANTE` |
| 15.5 | Resolucion de destino: todos los administradores | LIVE | M5b | `{conjuntoId}-ADMINISTRADOR` |
| 15.6 | Resolucion de destino: apartamento especifico | LIVE | M5b | `{conjuntoId}-APTO-{torre}-{num}` |
| 15.7 | Teclado numerico de marcacion | LIVE | M9 | Frontend |
| 15.8 | Estados de llamada: sonando, conectado, fallback | LIVE | M9 | Frontend |
| 15.9 | Opciones de respuesta rapida | LIVE | M9 | Frontend |

---

## 16. Asamblea General de Copropietarios

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 16.1 | Sesion en vivo con bloqueo optimista (CAS) | LIVE | M6 | version + 409 en conflicto |
| 16.2 | Emparejamiento de dispositivos con PIN | LIVE | M6 | Hash Argon2 |
| 16.3 | Crear votacion con opciones personalizadas | LIVE | M6 | Admin |
| 16.4 | Abrir/cerrar votacion | LIVE | M6 | Admin |
| 16.5 | Votar con coeficiente ponderado | LIVE | M6 | Coef. propio + poderes delegados |
| 16.6 | Firma digital de voto (SHA-256) | LIVE | M6 | hash_firma para trazabilidad legal |
| 16.7 | Registro de asistencia (presencial/virtual/poder) | LIVE | M6 | |
| 16.8 | Calculo de quorum (BigDecimal) | LIVE | M6 | Coef. presentes / coef. total |
| 16.9 | Envio de opiniones (autenticacion obligatoria) | LIVE | M6 | Legacy permitia anonimos |
| 16.10 | Turnos de palabra (pendiente/hablando/terminado) | LIVE | M6 | Maquina de estados |
| 16.11 | Poderes / delegacion de voto | LIVE | M6 | Con documento y verificacion |
| 16.12 | Subtitulos en vivo | LIVE | M7 | Registro durante la sesion |
| 16.13 | Orden del dia con items y estado | LIVE | M6 | JSONB |

---

## 17. Inteligencia Artificial (Gemini)

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 17.1 | Copiloto de asamblea | LIVE | M7 | Respuestas contextuales, solo admin |
| 17.2 | Traduccion de texto | LIVE | M7 | Atajo para espanol; cualquier usuario |
| 17.3 | Analisis de consenso | LIVE | M7 | Sintesis de opiniones, solo admin |
| 17.4 | Generacion automatica de acta | LIVE | M7 | Desde puntos + decisiones, solo admin |
| 17.5 | Busqueda semantica | LIVE | M7 | Lenguaje natural, cualquier usuario |
| 17.6 | Respuesta 503 sin API key | LIVE | M7 | Ley 4: sin datos falsos |
| 17.7 | Resumen automatico de reuniones | PLAN | — | |
| 17.8 | Clasificacion automatica de PQRS | PLAN | — | |

---

## 18. Administracion General

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 18.1 | Dashboard: recaudo del mes | LIVE | M4 | String decimal |
| 18.2 | Dashboard: reservas pendientes | LIVE | M4 | Entero |
| 18.3 | Gestion de tramites: aprobar/rechazar | LIVE | M5a | Con observaciones |
| 18.4 | Publicacion de anuncios y circulares | LIVE | M5a | Desde admin-novedades |
| 18.5 | Vista de finanzas | LIVE | M9 | admin-finanzas |
| 18.6 | Reportes exportables (PDF/Excel) | PLAN | — | |
| 18.7 | Configuracion del conjunto | PLAN | — | Desde panel admin |

---

## 19. Super Administrador

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 19.1 | Crear copropiedad | LIVE | M3 | Nombre, NIT, direccion, subdominio |
| 19.2 | Editar copropiedad | LIVE | M3 | Todos los campos |
| 19.3 | Listar copropiedades | LIVE | M3 | |
| 19.4 | Datos legales: representante, notaria, escritura, matricula | LIVE | M3 | |
| 19.5 | Configuracion visual: logo, color primario | LIVE | M3 | |
| 19.6 | Planes: basico, pro, premium | LIVE | M3 | |
| 19.7 | Activar/desactivar conjunto | LIVE | M3 | |
| 19.8 | Gestion de usuarios por conjunto | PLAN | — | |
| 19.9 | Metricas cross-tenant | PLAN | — | |

---

## 20. Migracion de Datos (CLI)

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 20.1 | Migracion de 35 tablas PascalCase a snake_case | LIVE | M8 | ON CONFLICT DO NOTHING |
| 20.2 | Mapeo deterministico CUID a UUIDv5 | LIVE | M8 | Namespace fijo |
| 20.3 | Re-hash de contrasenas (Argon2id) | LIVE | M8 | Vacias/invalidas -> mustChangePassword |
| 20.4 | Reparacion de columnas JSON | LIVE | M8 | Null + reporte en fallo |
| 20.5 | Extraccion notifPush a push_subscriptions | LIVE | M8 | |
| 20.6 | Ejecucion por fases (--phase) | LIVE | M8 | Re-ejecutable |
| 20.7 | Modo dry-run | LIVE | M8 | |
| 20.8 | Verificacion de conteos (--verify) | LIVE | M8 | |
| 20.9 | Reporte CSV (--report) | LIVE | M8 | Filas con errores |
| 20.10 | Siembra de datos demo (--seed-demo) | LIVE | M8 | |

---

## 21. Tiempo Real — WebSockets

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 21.1 | Hub de broadcast por tenant (conjunto) | LIVE | WS | tokio::sync::broadcast, per-conjunto channels |
| 21.2 | Conexion WS con autenticacion JWT | LIVE | WS | GET /api/v1/ws?token=jwt |
| 21.3 | Reconexion automatica (3s) | LIVE | WS | WebSocketProvider frontend |
| 21.4 | Eventos de anuncios (created/deleted) | LIVE | WS | Cartelera se actualiza en tiempo real |
| 21.5 | Eventos de chat (message/read) | LIVE | WS | Chat admin-residente en tiempo real |
| 21.6 | Eventos de solicitudes PQRS (created) | LIVE | WS | Admin ve nuevas solicitudes al instante |
| 21.7 | Eventos de tramites (created/resolved) | LIVE | WS | Admin ve pendientes, residente ve resolucion |
| 21.8 | Eventos de clasificados (created) | LIVE | WS | Nuevos productos aparecen sin recargar |
| 21.9 | Eventos de inmuebles (created) | LIVE | WS | Nuevos listados aparecen sin recargar |
| 21.10 | Eventos de visitas (created) | LIVE | WS | Porteria ve nuevas visitas al instante |
| 21.11 | Eventos de paquetes (created/delivered) | LIVE | WS | Porteria + residente sincronizados |
| 21.12 | Eventos de parqueadero (celda/ronda/vehiculo) | LIVE | WS | Mapa se actualiza en tiempo real |
| 21.13 | Eventos de reservas (created) | LIVE | WS | Slots se actualizan en tiempo real |
| 21.14 | Eventos de pagos (updated) | LIVE | WS | Dashboard refleja pagos al instante |
| 21.15 | Eventos de asamblea (10 tipos) | LIVE | WS | Sesion, votaciones, turnos, opiniones, asistencia, poderes, acta, subtitulos |
| 21.16 | Filtrado por usuario destino | LIVE | WS | target_user_id para eventos privados (chat) |
| 21.17 | Notificaciones en tiempo real (bell) | LIVE | WS | ProfileHeader actualiza conteo sin recargar |

---

## 22. Infraestructura y Calidad

| # | Funcionalidad | Estado | Milestone | Notas |
|---|---------------|--------|-----------|-------|
| 22.1 | API REST con errores RFC 7807 | LIVE | M1 | application/problem+json |
| 22.2 | OpenAPI 3 en /api/v1/openapi.json | LIVE | M1 | utoipa |
| 22.3 | Swagger UI en /docs | LIVE | M1 | CDN |
| 22.4 | Health check en /healthz | LIVE | M1 | Con ping a DB |
| 22.5 | Dockerfile multi-stage (rustls, sin libpq) | LIVE | M1 | |
| 22.6 | CI: fmt + clippy + test + postgres service | LIVE | M1 | GitHub Actions |
| 22.7 | 65 tests backend (unit + integracion) | LIVE | M5b | Contra Postgres real |
| 22.8 | 37 tests E2E Playwright | LIVE | M9 | Chromium headless |
| 22.9 | CORS configurable con credenciales | LIVE | M1 | |
| 22.10 | Body limit 2 MiB | LIVE | M1 | |
| 22.11 | Migraciones embebidas al iniciar | LIVE | M2 | RUN_MIGRATIONS=true |
| 22.12 | Proxy Next.js a backend en desarrollo | LIVE | M9 | rewrites en next.config.ts |

---

## Roles y Permisos

| Rol | Acceso |
|-----|--------|
| ARRENDATARIO | Perfil, notificaciones, anuncios (lectura), reservas, pagos, PQRS, tramites (propios), clasificados, inmuebles, chat (residente), citofonia, asamblea (participante), parqueadero (propio), visitas (propias), paquetes (propios) |
| PROPIETARIO | Igual que Arrendatario |
| ADMINISTRADOR | Todo lo anterior + anuncios (escritura/borrado), directorio, vigilancia (staff), parqueadero (gestion), chat (admin), stats, tramites (resolver), asamblea (admin: sesion, votaciones, turnos, poderes), IA (copiloto, consenso, acta) |
| CONCEJO | Similar a Administrador para la mayoria. No resuelve tramites |
| VIGILANTE | Perfil, notificaciones, directorio, vigilancia (staff), parqueadero (registros + rondas), citofonia |
| SUPERVISOR_VIGILANCIA | Igual que Vigilante + parqueadero (gestion completa) |
| ENCARGADO_PARQUEADERO | Perfil, notificaciones, parqueadero (gestion completa: mapa, celdas, stats, rondas) |
| SUPER_ADMIN | Todo + CRUD de conjuntos (cross-tenant) |

---

## Como agregar una funcionalidad nueva

1. Agregar una fila en la seccion correspondiente de este documento con estado `DEV`
2. Escribir el spec en `specs/0XX-dominio/spec.md`
3. Implementar en el backend (`backend/api/src/domains/`)
4. Agregar tests de integracion (`backend/api/tests/`)
5. Conectar en el frontend (`src/app/(app)/`)
6. Agregar test E2E (`e2e/`)
7. Actualizar `specs/015-frontend-cutover/parity.md`
8. Cambiar estado a `LIVE` en este documento
9. Actualizar `specs/PROGRESS.md` si aplica
