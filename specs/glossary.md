# Glossary — Spanish domain terms

The domain language is Colombian residential property management (Ley 675 de 2001,
propiedad horizontal). Code identifiers keep the Spanish terms.

| Term | Meaning | Code names |
|---|---|---|
| Conjunto | Residential complex (the tenant) | `conjuntos`, `conjunto_id` |
| Unidad | Unit (apartment/house/local/parking) with ownership coefficient | `unidades`, `coeficiente` |
| Coeficiente | Ownership coefficient — weights assembly votes and quorum | `NUMERIC(9,6)` |
| Propietario / Arrendatario | Owner / Renter (resident roles) | `Rol::Propietario`, `Rol::Arrendatario` |
| Administrador | Complex administrator | `Rol::Administrador` |
| Concejo | Council member (junta directiva) | `Rol::Concejo` |
| Vigilante / Supervisor de vigilancia | Guard / guard supervisor | `Rol::Vigilante`, `Rol::SupervisorVigilancia` |
| Encargado de parqueadero | Parking manager | `Rol::EncargadoParqueadero` |
| Citofonía | Intercom calling (PeerJS + web push) | `citofonia` |
| Visita | Visitor check-in at the gate (peatonal/vehicular) | `visitas` |
| Paquete | Package received at the gate (portería) | `paquetes` |
| Portería | Front gate / reception | — |
| Parqueadero | Parking cell | `parqueaderos` |
| Ronda | Guard inspection round of the parking lot | `rondas_parqueadero` |
| Reserva | Amenity reservation (common area) | `reservas`, `areas_comunes` |
| Área común | Common area (pool, gym, salón social) | `areas_comunes` |
| Pago | Administration fee payment | `pagos` |
| Recibo público | Utility bill (water, gas, power) | `recibos_publicos` |
| Anuncio | Announcement / news post | `anuncios` |
| PQRS | Petición/Queja/Reclamo/Sugerencia — formal service request | `solicitudes_servicio`, `TipoPQR` |
| Trámite | Administrative request (register vehicle/pet, moving) | `tramites` |
| Mudanza | Moving in/out | `TipoTramite::Mudanza` |
| Clasificado | Resident classified ad / micro-service | `locales` (legacy table name) |
| Inmueble | Real-estate listing (sale/rent) | `inmuebles` |
| Asamblea | Owners' assembly (annual or extraordinary meeting) | `asambleas` |
| Orden del día | Assembly agenda | `orden_dia` jsonb |
| Quórum | Attendance threshold by coefficient sum | — |
| Poder | Power of attorney for assembly voting | `asamblea_poderes` |
| Votación / Voto | A ballot / a cast vote (weighted by coefficient) | `asamblea_votaciones`, `asamblea_votos` |
| Acta | Official meeting minutes | `acta` |
| Turno | Speaking turn in the assembly queue | `asamblea_turnos` |
| Habeas Data | Colombian data-protection regime (limits directory fields) | — |
