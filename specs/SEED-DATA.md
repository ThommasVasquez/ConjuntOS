# ConjuntOS — Datos de Demostración

> Seed completo para desarrollo y pruebas.
> Ultima actualizacion: 2026-06-10

---

## Conjuntos (Copropiedades)

| Conjunto | Plan | Ciudad | Direccion | Unidades | Subdominio |
|----------|------|--------|-----------|----------|------------|
| Conjunto Demo | BASICO | Bogota | Calle 100 # 10-20 | 10 | demo |
| Torres del Parque | PRO | Bogota | Carrera 5 # 26-41 | 120 | torresdelparque |
| Reserva de los Alamos | PREMIUM | Bogota | Calle 134 # 55-20 | 200 | reservaalamos |

---

## Usuarios — 21 cuentas (Contrasena de todos: `123456789`)

### Conjunto Demo (13 usuarios)

| Nombre | Email | Rol | Torre | Apto |
|--------|-------|-----|-------|------|
| Admin Demo | admin@demo.conjuntos.app | ADMINISTRADOR | — | — |
| Residente Demo | residente@demo.conjuntos.app | PROPIETARIO | A | 101 |
| Laura Gonzalez | laura@demo.conjuntos.app | CONCEJO | A | 102 |
| Carlos Martinez | carlos@demo.conjuntos.app | PROPIETARIO | A | 201 |
| Sofia Herrera | sofia@demo.conjuntos.app | PROPIETARIO | A | 202 |
| Ana Rojas | ana@demo.conjuntos.app | ARRENDATARIO | B | 301 |
| Andres Castillo | andres@demo.conjuntos.app | ARRENDATARIO | B | 302 |
| Valentina Reyes | valentina@demo.conjuntos.app | PROPIETARIO | B | 401 |
| Vigilante Demo | vigilante@demo.conjuntos.app | VIGILANTE | — | — |
| Vigilante Nocturno | nocturno@demo.conjuntos.app | VIGILANTE | — | — |
| Pedro Vargas | pedro@demo.conjuntos.app | SUPERVISOR_VIGILANCIA | — | — |
| Jorge Diaz | jorge@demo.conjuntos.app | ENCARGADO_PARQUEADERO | — | — |
| Super Admin | superadmin@demo.conjuntos.app | SUPER_ADMIN | — | — |

### Torres del Parque (5 usuarios)

| Nombre | Email | Rol | Torre | Apto |
|--------|-------|-----|-------|------|
| Admin Torres | admin@torres.conjuntos.app | ADMINISTRADOR | — | — |
| Diana Lopez | diana@torres.conjuntos.app | PROPIETARIO | Norte | 501 |
| Felipe Arango | felipe@torres.conjuntos.app | PROPIETARIO | Sur | 302 |
| Lucia Bermudez | lucia@torres.conjuntos.app | ARRENDATARIO | Norte | 108 |
| Vigilante Torres | vigilante@torres.conjuntos.app | VIGILANTE | — | — |

### Reserva de los Alamos (3 usuarios)

| Nombre | Email | Rol | Torre | Apto |
|--------|-------|-----|-------|------|
| Admin Alamos | admin@alamos.conjuntos.app | ADMINISTRADOR | — | — |
| Roberto Mendoza | roberto@alamos.conjuntos.app | PROPIETARIO | Cedro | 201 |
| Camila Ospina | camila@alamos.conjuntos.app | PROPIETARIO | Roble | 305 |

---

## Unidades (Conjunto Demo) — 10

| Numero | Torre | Piso | Tipo | Coeficiente |
|--------|-------|------|------|-------------|
| 101 | A | 1 | APARTAMENTO | 2.500000 |
| 102 | A | 1 | APARTAMENTO | 2.500000 |
| 201 | A | 2 | APARTAMENTO | 3.000000 |
| 202 | A | 2 | APARTAMENTO | 3.000000 |
| 301 | B | 3 | APARTAMENTO | 3.500000 |
| 302 | B | 3 | APARTAMENTO | 3.500000 |
| 401 | B | 4 | APARTAMENTO | 4.000000 |
| L-01 | — | 1 | LOCAL | 5.000000 |
| P-01 | — | -1 | PARQUEADERO | 1.000000 |
| P-02 | — | -1 | PARQUEADERO | 1.000000 |

---

## Anuncios — 13

### Conjunto Demo (10)

| Titulo | Tipo | Fijado |
|--------|------|--------|
| Mantenimiento de ascensores | MANTENIMIENTO | Si |
| Asamblea General Ordinaria 2026 | EVENTO | Si |
| Actualizacion de datos de propietarios | GENERAL | Si |
| Nuevo horario de porteria | GENERAL | No |
| Alerta: hurto de bicicletas | URGENTE | No |
| Torneo de futbol interfamiliar | EVENTO | No |
| Fumigacion programada | MANTENIMIENTO | No |
| Noche de cine familiar | EVENTO | No |
| Corte de agua programado | URGENTE | No |
| Clases de zumba gratuitas | EVENTO | No |

### Torres del Parque (2)

| Titulo | Tipo | Fijado |
|--------|------|--------|
| Bienvenidos a Torres del Parque | GENERAL | Si |
| Remodelacion del lobby | MANTENIMIENTO | No |

### Reserva de los Alamos (1)

| Titulo | Tipo | Fijado |
|--------|------|--------|
| Festival de fin de ano | EVENTO | Si |

---

## Vehiculos — 10

| Placa | Marca | Modelo | Tipo | Propietario | Conjunto |
|-------|-------|--------|------|-------------|----------|
| ABC123 | Mazda | 3 | CARRO | Residente Demo | Demo |
| XYZ789 | Honda | CBR 250 | MOTO | Residente Demo | Demo |
| DEF456 | Toyota | Corolla | CARRO | Carlos Martinez | Demo |
| GHI321 | Renault | Sandero | CARRO | Ana Rojas | Demo |
| JKL456 | Chevrolet | Spark | CARRO | Sofia Herrera | Demo |
| MNO789 | Yamaha | FZ 250 | MOTO | Andres Castillo | Demo |
| PQR012 | Kia | Picanto | CARRO | Valentina Reyes | Demo |
| STU345 | Hyundai | Tucson | CARRO | Laura Gonzalez | Demo |
| VWX678 | Audi | A3 | CARRO | Diana Lopez | Torres |
| YZA901 | BMW | X1 | CARRO | Felipe Arango | Torres |

---

## Mascotas — 9

| Nombre | Tipo | Raza | Propietario | Conjunto |
|--------|------|------|-------------|----------|
| Rocky | PERRO | Golden Retriever | Residente Demo | Demo |
| Misu | GATO | Persa | Carlos Martinez | Demo |
| Kiwi | AVE | Canario | Ana Rojas | Demo |
| Max | PERRO | Bulldog Frances | Sofia Herrera | Demo |
| Luna | GATO | Siames | Sofia Herrera | Demo |
| Toby | PERRO | Poodle | Valentina Reyes | Demo |
| Simba | GATO | Maine Coon | Laura Gonzalez | Demo |
| Nala | PERRO | Golden Retriever | Diana Lopez | Torres |
| Coco | PERRO | Labrador | Felipe Arango | Torres |

---

## Celdas de Parqueadero — 9

| Numero | Torre | Tipo | Estado | Ocupante |
|--------|-------|------|--------|----------|
| A-01 | A | RESIDENTE | OCUPADO | Residente Demo |
| A-02 | A | RESIDENTE | OCUPADO | Carlos Martinez |
| A-03 | A | RESIDENTE | DISPONIBLE | — |
| A-04 | A | RESIDENTE | DISPONIBLE | — |
| B-01 | B | RESIDENTE | OCUPADO | Ana Rojas |
| B-02 | B | RESIDENTE | DISPONIBLE | — |
| V-01 | — | VISITANTE | DISPONIBLE | — |
| V-02 | — | VISITANTE | DISPONIBLE | — |
| D-01 | — | DISCAPACITADO | DISPONIBLE | — |

---

## Registros de Parqueadero — 5

| Celda | Tipo | Placa | Observacion |
|-------|------|-------|-------------|
| A-01 | INGRESO | ABC123 | — |
| A-01 | SALIDA | ABC123 | — |
| A-01 | INGRESO | ABC123 | Regreso del trabajo |
| A-02 | VERIFICACION | DEF456 | Revision de rutina |
| V-01 | INGRESO | JKL999 | Visitante tecnico Claro |

---

## Areas Comunes — 5

| Nombre | Capacidad | Deposito | Horario | Dias | Slot |
|--------|-----------|----------|---------|------|------|
| Salon Comunal | 80 | $150,000 | 08:00–22:00 | Todos | 2h |
| BBQ Zone | 20 | $80,000 | 10:00–21:00 | Sab, Dom | 3h |
| Cancha Multideportiva | 12 | — | 06:00–20:00 | Todos | 1h |
| Piscina | 30 | — | 09:00–18:00 | Mar, Jue, Sab, Dom | 2h |
| Gimnasio | 15 | — | 05:00–22:00 | Lun–Sab | 1h |

---

## Reservas — 9

| Area | Usuario | Estado | Notas |
|------|---------|--------|-------|
| Salon Comunal | Residente Demo | CONFIRMADA | Reunion familiar |
| BBQ Zone | Carlos Martinez | PENDIENTE | Asado cumpleanos |
| Cancha | Ana Rojas | CONFIRMADA | — |
| Piscina | Sofia Herrera | CONFIRMADA | Nado con los ninos |
| Gimnasio | Laura Gonzalez | CONFIRMADA | Rutina de pesas |
| Cancha | Carlos Martinez | PENDIENTE | Partido con amigos |
| Salon Comunal | Valentina Reyes | PENDIENTE | Baby shower |
| Gimnasio | Residente Demo | CONFIRMADA | Cardio nocturno |
| Piscina | Ana Rojas | CANCELADA | No puedo asistir |

---

## Pagos — 17

### Residente Demo (7)

| Concepto | Monto | Estado | Metodo |
|----------|-------|--------|--------|
| Administracion Enero 2026 | $450,000 | PAGADO | PSE |
| Administracion Febrero 2026 | $450,000 | PAGADO | NEQUI |
| Administracion Marzo 2026 | $450,000 | PAGADO | TARJETA |
| Administracion Abril 2026 | $450,000 | PAGADO | PSE |
| Administracion Mayo 2026 | $450,000 | PAGADO | EFECTIVO |
| Administracion Junio 2026 | $480,000 | PENDIENTE | — |
| Cuota Extraordinaria Ascensores | $120,000 | PENDIENTE | — |

### Carlos Martinez (2)

| Concepto | Monto | Estado |
|----------|-------|--------|
| Administracion Junio 2026 | $520,000 | PENDIENTE |
| Administracion Mayo 2026 | $520,000 | VENCIDO |

### Ana Rojas (3)

| Concepto | Monto | Estado | Metodo |
|----------|-------|--------|--------|
| Administracion Abril 2026 | $380,000 | PAGADO | PSE |
| Administracion Mayo 2026 | $380,000 | PAGADO | NEQUI |
| Administracion Junio 2026 | $380,000 | PENDIENTE | — |

### Sofia Herrera (2)

| Concepto | Monto | Estado |
|----------|-------|--------|
| Administracion Mayo 2026 | $520,000 | PAGADO |
| Administracion Junio 2026 | $520,000 | PENDIENTE |

### Valentina Reyes (2)

| Concepto | Monto | Estado |
|----------|-------|--------|
| Administracion Junio 2026 | $580,000 | PENDIENTE |
| Cuota Extraordinaria Ascensores | $120,000 | PENDIENTE |

### Laura Gonzalez (1)

| Concepto | Monto | Estado | Metodo |
|----------|-------|--------|--------|
| Administracion Junio 2026 | $450,000 | PAGADO | DAVIPLATA |

---

## Recibos de Servicios Publicos — 8

| Unidad | Servicio | Empresa | Periodo | Monto | Pagado |
|--------|----------|---------|---------|-------|--------|
| 101 | Energia | Enel Codensa | Mayo 2026 | $185,000 | No |
| 101 | Agua | Acueducto de Bogota | May-Jun 2026 | $95,000 | No |
| 101 | Gas | Vanti Gas Natural | May-Jun 2026 | $42,000 | Si |
| 201 | Energia | Enel Codensa | Mayo 2026 | $210,000 | No |
| 201 | Agua | Acueducto de Bogota | May-Jun 2026 | $78,000 | Si |
| 301 | Energia | Enel Codensa | Mayo 2026 | $145,000 | No |
| 301 | Internet | Claro | Junio 2026 | $89,000 | Si |
| 401 | Energia | Enel Codensa | Mayo 2026 | $320,000 | No |

---

## Visitas — 12

| Visitante | Tipo | Placa | Residente | Observacion |
|-----------|------|-------|-----------|-------------|
| Maria Sanchez | PEATONAL | — | Residente Demo | Familiar |
| Mensajero Rappi | PEATONAL | — | Residente Demo | Delivery comida |
| Tutor de matematicas | PEATONAL | — | Residente Demo | Clases particulares hijo |
| Tecnico Claro | VEHICULAR | JKL999 | Carlos Martinez | Revision de internet |
| Ingeniero Gas Natural | PEATONAL | — | Carlos Martinez | Revision periodica gas |
| Plomero | PEATONAL | — | Ana Rojas | Visita programada |
| Uber Eats | PEATONAL | — | Ana Rojas | Delivery almuerzo |
| Familia Rodriguez | VEHICULAR | AAA111 | Sofia Herrera | Visita familiar almuerzo |
| Empresa de mudanza | VEHICULAR | BBB222 | Valentina Reyes | Mudanza parcial |
| Notario | PEATONAL | — | Laura Gonzalez | Firma de documentos |
| Nanny | PEATONAL | — | Diana Lopez (Torres) | Cuidado de ninos |
| Tecnico Samsung | VEHICULAR | CCC333 | Felipe Arango (Torres) | Reparacion nevera |

---

## Paquetes — 11

| Descripcion | Remitente | Estado | Residente |
|-------------|-----------|--------|-----------|
| Caja grande Amazon | Amazon Colombia | EN_PORTERIA | Residente Demo |
| Sobre manila | Notaria 15 | ENTREGADO | Residente Demo |
| Paquete MercadoLibre | MercadoEnvios | EN_PORTERIA | Carlos Martinez |
| Caja grande Homecenter | Deprisa | ENTREGADO | Carlos Martinez |
| Caja Falabella | Servientrega | EN_PORTERIA | Ana Rojas |
| Pedido Adidas | Coordinadora | EN_PORTERIA | Ana Rojas |
| Caja Zara (ropa) | DHL Express | EN_PORTERIA | Sofia Herrera |
| Sobre documento notarial | Servientrega | EN_PORTERIA | Laura Gonzalez |
| Paquete Shein | InterRapidisimo | EN_PORTERIA | Andres Castillo |
| Libro Amazon | Amazon Logistica | ENTREGADO | Valentina Reyes |
| Caja Apple Store | FedEx | EN_PORTERIA | Diana Lopez (Torres) |

---

## Solicitudes PQRS — 12

| Categoria | Tipo | Urgente | Estado | Usuario |
|-----------|------|---------|--------|---------|
| PLOMERIA | MANTENIMIENTO | Si | ABIERTA | Residente Demo |
| CERRAJERIA | PETICION | No | ABIERTA | Residente Demo |
| ELECTRICIDAD | QUEJA | No | ABIERTA | Carlos Martinez |
| OTRO | SUGERENCIA | No | ABIERTA | Ana Rojas |
| ELECTRICIDAD | RECLAMO | No | ABIERTA | Sofia Herrera |
| PLOMERIA | MANTENIMIENTO | No | ABIERTA | Andres Castillo |
| CARPINTERIA | PETICION | No | ASIGNADA | Valentina Reyes |
| OTRO | QUEJA | Si | EN_PROGRESO | Laura Gonzalez |
| PINTURA | MANTENIMIENTO | No | COMPLETADA | Carlos Martinez |
| CERRAJERIA | PETICION | No | ABIERTA | Ana Rojas |
| ELECTRICIDAD | SUGERENCIA | No | ABIERTA | Diana Lopez (Torres) |
| PLOMERIA | RECLAMO | Si | ABIERTA | Felipe Arango (Torres) |

---

## Tramites — 11

| Tipo | Estado | Payload | Solicitante |
|------|--------|---------|-------------|
| VEHICULO | APROBADO | Toyota Corolla DEF456 | Carlos Martinez |
| MASCOTA | PENDIENTE | Luna, Labrador | Ana Rojas |
| MUDANZA | RECHAZADO | TransMudanzas SAS | Residente Demo |
| VEHICULO | PENDIENTE | BMW MNO555 Moto | Residente Demo |
| MASCOTA | APROBADO | Max, Bulldog Frances | Sofia Herrera |
| VEHICULO | APROBADO | Chevrolet JKL456 | Sofia Herrera |
| VEHICULO | PENDIENTE | Suzuki QWE999 Moto | Andres Castillo |
| ARRENDAMIENTO | APROBADO | Juan Perez, 12 meses | Valentina Reyes |
| MUDANZA | APROBADO | Acarreos Colombia | Laura Gonzalez |
| MASCOTA | PENDIENTE | Firulais, Criollo | Carlos Martinez |
| MASCOTA | APROBADO | Nala, Golden Retriever | Diana Lopez (Torres) |

---

## Clasificados — 9

| Nombre | Categoria | Precio | Propietario | Conjunto |
|--------|-----------|--------|-------------|----------|
| Empanadas de la 101 | RESTAURANTE | $3,500 | Residente Demo | Demo |
| Lavanderia Express | LAVANDERIA | $25,000 | Carlos Martinez | Demo |
| Clases de Yoga | OTRO | $80,000 | Ana Rojas | Demo |
| Tutorias de Matematicas | OTRO | $45,000 | Pedro Vargas | Demo |
| Postres Artesanales Valen | RESTAURANTE | $15,000 | Valentina Reyes | Demo |
| Cuidado de Mascotas | OTRO | $30,000 | Sofia Herrera | Demo |
| Reparaciones del Hogar | OTRO | — | Andres Castillo | Demo |
| Mini Tienda Torre B | TIENDA | — | Andres Castillo | Demo |
| Cafe del Parque | RESTAURANTE | $8,500 | Felipe Arango | Torres |

---

## Inmuebles — 7

| Titulo | Negocio | Tipo | Precio | Hab | Area | Conjunto |
|--------|---------|------|--------|-----|------|----------|
| Apartamento 3 alcobas con vista | VENTA | APARTAMENTO | $420,000,000 | 3 | 85 m2 | Demo |
| Estudio amoblado en arriendo | ALQUILER | APARTAMENTO | $1,200,000 | 1 | 38 m2 | Demo |
| Parqueadero cubierto disponible | ALQUILER | PARQUEADERO | $85,000 | 0 | 12.5 m2 | Demo |
| Apartamento duplex remodelado | VENTA | APARTAMENTO | $550,000,000 | 4 | 120 m2 | Demo |
| Local comercial planta baja | ALQUILER | LOCAL | $2,500,000 | 0 | 45 m2 | Demo |
| Apartamento 2 habitaciones | ALQUILER | APARTAMENTO | $1,500,000 | 2 | 62 m2 | Demo |
| Penthouse con terraza privada | VENTA | APARTAMENTO | $980,000,000 | 3 | 180 m2 | Torres |

---

## Chat — 14 mensajes

| De | A (hilo) | Mensaje | Leido |
|----|----------|---------|-------|
| Residente Demo | Admin | Problema con la tuberia del bano | Si |
| Admin | Residente Demo | Ya enviamos al plomero | Si |
| Residente Demo | Admin | Gracias por la rapida respuesta | Si |
| Residente Demo | Admin | Ruido extrano en la tuberia de la ducha | No |
| Carlos Martinez | Admin | Necesito copia del acta de asamblea | No |
| Ana Rojas | Admin | Cuando se arregla la luz del piso 3? | No |
| Sofia Herrera | Admin | Presupuesto remodelacion porteria? | No |
| Sofia Herrera | Admin | Reserva del salon para proxima semana | No |
| Laura Gonzalez | Admin | Necesito informe financiero 1er semestre | No |
| Admin | Laura Gonzalez | Te lo envio por correo hoy | Si |
| Laura Gonzalez | Admin | Revisar contratos proveedores pre-asamblea | No |
| Andres Castillo | Admin | Fuga del vecino afecta mi techo, urgente | No |
| Diana Lopez | Admin Torres | Propongo comite de medio ambiente | No |
| Admin Torres | Diana Lopez | Lo agendamos para proxima reunion | Si |

---

## Notificaciones — 20

| Destinatario | Tipo | Titulo | Leida |
|-------------|------|--------|-------|
| Residente Demo | INFO | Nuevo anuncio: Mantenimiento de ascensores | No |
| Residente Demo | INFO | Nuevo anuncio: Asamblea General | No |
| Residente Demo | SISTEMA | Paquete en porteria | No |
| Residente Demo | APROBACION | Tu solicitud ha sido rechazada | Si |
| Residente Demo | INFO | Nuevo anuncio: Fumigacion programada | No |
| Residente Demo | INFO | Nuevo anuncio: Noche de cine familiar | No |
| Residente Demo | SISTEMA | Reserva confirmada | Si |
| Admin Demo | INFO | Nueva solicitud PQRS (plomeria) | No |
| Admin Demo | INFO | Nuevo tramite: MASCOTA (Ana Rojas) | No |
| Admin Demo | INFO | Nuevo tramite: VEHICULO (Residente Demo) | No |
| Admin Demo | INFO | Nuevo tramite: VEHICULO (Andres Castillo) | No |
| Admin Demo | INFO | Nuevo tramite: MASCOTA (Carlos Martinez) | No |
| Admin Demo | INFO | PQRS urgente (Laura Gonzalez) | No |
| Carlos Martinez | INFO | Cuota vencida | No |
| Carlos Martinez | INFO | Solicitud electricidad recibida | Si |
| Ana Rojas | SISTEMA | Paquete en porteria (Adidas) | No |
| Ana Rojas | INFO | Reserva cancelada | Si |
| Sofia Herrera | APROBACION | Tramite mascota aprobado | Si |
| Valentina Reyes | APROBACION | Tramite arrendamiento aprobado | Si |
| Diana Lopez | INFO | Nuevo anuncio: Remodelacion del lobby | No |

---

## Documentos — 9

| Nombre | Categoria | Conjunto |
|--------|-----------|----------|
| Reglamento Interno 2026 | REGLAMENTO | Demo |
| Manual de Convivencia | CONVIVENCIA | Demo |
| Reglamento de Mascotas | MASCOTAS | Demo |
| Manual de Parqueaderos | PARQUEADERO | Demo |
| Acta Asamblea Extraordinaria 2025 | OTRO | Demo |
| Presupuesto 2026 Aprobado | OTRO | Demo |
| Poliza de Seguros Vigente | OTRO | Demo |
| Reglamento Interno Torres | REGLAMENTO | Torres |
| Manual de Convivencia Torres | CONVIVENCIA | Torres |

---

## Gastos del Conjunto — 7

| Categoria | Descripcion | Monto | Proveedor |
|-----------|-------------|-------|-----------|
| NOMINA | Nomina vigilancia Mayo 2026 | $4,800,000 | Seguridad Andina SAS |
| MANTENIMIENTO | Mantenimiento ascensores trimestral | $2,200,000 | Schindler Colombia |
| SERVICIOS | Servicios publicos zonas comunes | $1,850,000 | Varios |
| ADMINISTRACION | Honorarios administracion Mayo | $3,500,000 | Administradora XYZ |
| MANTENIMIENTO | Fumigacion zonas comunes | $450,000 | Fumigaciones del Valle |
| OBRA | Pintura fachada torre B | $3,200,000 | Pinturas Express |
| OTRO | Decoracion navidad anticipada | $800,000 | Decoraciones Colombia |

---

## Rondas de Parqueadero — 5

| Vigilante | Hallazgos | Completada |
|-----------|-----------|------------|
| Vigilante Demo | Aceite derramado A-03, luz fundida pasillo B | Si |
| Vigilante Demo | Sin novedades | Si |
| Vigilante Demo | Vehiculo con alarma A-02 | Si |
| Vigilante Nocturno | Puerta acceso vehicular no cierra, foco fundido V-01 | Si |
| Vigilante Demo | (ronda en curso) | No |

---

## Asamblea Activa — 1

| Titulo | Orden del Dia |
|--------|---------------|
| Asamblea General Ordinaria 2026 | 1. Verificacion de quorum |
| | 2. Informe financiero 2025 |
| | 3. Presupuesto 2027 |
| | 4. Eleccion de Consejo |
| | 5. Proposiciones y varios |

---

## Totales

| Tabla | Filas |
|-------|-------|
| Conjuntos | 3 |
| Unidades | 10 |
| Usuarios | 21 |
| Anuncios | 13 |
| Vehiculos | 10 |
| Mascotas | 9 |
| Celdas parqueadero | 9 |
| Registros parqueadero | 5 |
| Areas comunes | 5 |
| Reservas | 9 |
| Pagos | 17 |
| Recibos publicos | 8 |
| Visitas | 12 |
| Paquetes | 11 |
| Solicitudes PQRS | 12 |
| Tramites | 11 |
| Clasificados | 9 |
| Inmuebles | 7 |
| Chat mensajes | 14 |
| Notificaciones | 20 |
| Documentos | 9 |
| Gastos | 7 |
| Rondas parqueadero | 5 |
| Asamblea activa | 1 |
| **Total** | **227** |
