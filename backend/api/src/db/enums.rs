//! Domain enums stored as TEXT + CHECK constraints (specs/constitution.md Law 6).
//! Variants serialize to the legacy UPPER_SNAKE Spanish strings so values are
//! byte-compatible with migrated data and existing frontend payloads.

/// Defines a domain enum with serde + Diesel `Text` round-tripping.
/// The string values MUST match the CHECK constraints in backend/migrations/.
macro_rules! text_enum {
    ($(#[$meta:meta])* $name:ident { $($variant:ident => $value:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, Hash,
            serde::Serialize, serde::Deserialize,
            diesel::expression::AsExpression, diesel::deserialize::FromSqlRow,
            utoipa::ToSchema,
        )]
        #[diesel(sql_type = diesel::sql_types::Text)]
        pub enum $name {
            $(
                #[serde(rename = $value)]
                $variant,
            )+
        }

        impl $name {
            pub fn as_str(&self) -> &'static str {
                match self {
                    $(Self::$variant => $value,)+
                }
            }
        }

        impl std::str::FromStr for $name {
            type Err = String;
            fn from_str(s: &str) -> Result<Self, Self::Err> {
                match s {
                    $($value => Ok(Self::$variant),)+
                    other => Err(format!(
                        concat!("invalid ", stringify!($name), " value: {}"), other
                    )),
                }
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }

        impl diesel::serialize::ToSql<diesel::sql_types::Text, diesel::pg::Pg> for $name {
            fn to_sql<'b>(
                &'b self,
                out: &mut diesel::serialize::Output<'b, '_, diesel::pg::Pg>,
            ) -> diesel::serialize::Result {
                <str as diesel::serialize::ToSql<diesel::sql_types::Text, diesel::pg::Pg>>::to_sql(
                    self.as_str(),
                    out,
                )
            }
        }

        impl diesel::deserialize::FromSql<diesel::sql_types::Text, diesel::pg::Pg> for $name {
            fn from_sql(
                bytes: <diesel::pg::Pg as diesel::backend::Backend>::RawValue<'_>,
            ) -> diesel::deserialize::Result<Self> {
                let s = <String as diesel::deserialize::FromSql<
                    diesel::sql_types::Text,
                    diesel::pg::Pg,
                >>::from_sql(bytes)?;
                s.parse::<$name>().map_err(Into::into)
            }
        }
    };
}

text_enum!(Plan {
    Basico => "BASICO",
    Pro => "PRO",
    Premium => "PREMIUM",
});

text_enum!(Rol {
    Arrendatario => "ARRENDATARIO",
    Propietario => "PROPIETARIO",
    Administrador => "ADMINISTRADOR",
    Concejo => "CONCEJO",
    Vigilante => "VIGILANTE",
    SupervisorVigilancia => "SUPERVISOR_VIGILANCIA",
    EncargadoParqueadero => "ENCARGADO_PARQUEADERO",
    SuperAdmin => "SUPER_ADMIN",
});

text_enum!(TipoUnidad {
    Apartamento => "APARTAMENTO",
    Casa => "CASA",
    Local => "LOCAL",
    Parqueadero => "PARQUEADERO",
});

text_enum!(EstadoReserva {
    Pendiente => "PENDIENTE",
    Confirmada => "CONFIRMADA",
    Cancelada => "CANCELADA",
    Completada => "COMPLETADA",
});

text_enum!(TipoAnuncio {
    General => "GENERAL",
    Urgente => "URGENTE",
    Mantenimiento => "MANTENIMIENTO",
    Evento => "EVENTO",
});

text_enum!(CatDoc {
    Convivencia => "CONVIVENCIA",
    Mascotas => "MASCOTAS",
    Parqueadero => "PARQUEADERO",
    Reglamento => "REGLAMENTO",
    Otro => "OTRO",
});

text_enum!(TipoJunta {
    Ordinaria => "ORDINARIA",
    Extraordinaria => "EXTRAORDINARIA",
});

text_enum!(TipoTramite {
    Mascota => "MASCOTA",
    Vehiculo => "VEHICULO",
    Arrendamiento => "ARRENDAMIENTO",
    Mudanza => "MUDANZA",
    Otro => "OTRO",
});

text_enum!(EstadoTramite {
    Pendiente => "PENDIENTE",
    Aprobado => "APROBADO",
    Rechazado => "RECHAZADO",
});

text_enum!(EstadoPago {
    Pendiente => "PENDIENTE",
    Pagado => "PAGADO",
    Vencido => "VENCIDO",
    EnDisputa => "EN_DISPUTA",
});

text_enum!(MetodoPago {
    Pse => "PSE",
    Tarjeta => "TARJETA",
    Nequi => "NEQUI",
    Daviplata => "DAVIPLATA",
    Efectivo => "EFECTIVO",
});

text_enum!(CatGasto {
    Mantenimiento => "MANTENIMIENTO",
    Nomina => "NOMINA",
    Servicios => "SERVICIOS",
    Administracion => "ADMINISTRACION",
    Obra => "OBRA",
    Otro => "OTRO",
});

text_enum!(CatLocal {
    Restaurante => "RESTAURANTE",
    Tienda => "TIENDA",
    Lavanderia => "LAVANDERIA",
    Farmacia => "FARMACIA",
    Otro => "OTRO",
});

text_enum!(EstadoPedido {
    Recibido => "RECIBIDO",
    EnPreparacion => "EN_PREPARACION",
    EnCamino => "EN_CAMINO",
    Entregado => "ENTREGADO",
});

text_enum!(CatServicio {
    Plomeria => "PLOMERIA",
    Electricidad => "ELECTRICIDAD",
    Carpinteria => "CARPINTERIA",
    Pintura => "PINTURA",
    Cerrajeria => "CERRAJERIA",
    Otro => "OTRO",
});

text_enum!(EstadoSolicitud {
    Abierta => "ABIERTA",
    Asignada => "ASIGNADA",
    EnProgreso => "EN_PROGRESO",
    Completada => "COMPLETADA",
});

text_enum!(TipoPqr {
    Peticion => "PETICION",
    Queja => "QUEJA",
    Reclamo => "RECLAMO",
    Sugerencia => "SUGERENCIA",
    Mantenimiento => "MANTENIMIENTO",
});

text_enum!(TipoNegocio {
    Venta => "VENTA",
    Alquiler => "ALQUILER",
});

text_enum!(EstadoInmueble {
    Disponible => "DISPONIBLE",
    Vendido => "VENDIDO",
    Alquilado => "ALQUILADO",
    Oculto => "OCULTO",
});

text_enum!(TipoVisita {
    Peatonal => "PEATONAL",
    Vehicular => "VEHICULAR",
});

text_enum!(EstadoPaquete {
    EnPorteria => "EN_PORTERIA",
    Entregado => "ENTREGADO",
});

text_enum!(TipoVehiculo {
    Carro => "CARRO",
    Moto => "MOTO",
    Bici => "BICI",
});

text_enum!(TipoMascota {
    Perro => "PERRO",
    Gato => "GATO",
    Ave => "AVE",
    Otro => "OTRO",
});

text_enum!(TipoVehiculoVisita {
    Carro => "CARRO",
    Moto => "MOTO",
    Ninguno => "NINGUNO",
});

text_enum!(EstadoParqueadero {
    Disponible => "DISPONIBLE",
    Ocupado => "OCUPADO",
    Reservado => "RESERVADO",
});

text_enum!(TipoCeldaParqueadero {
    Residente => "RESIDENTE",
    Visitante => "VISITANTE",
    Discapacitado => "DISCAPACITADO",
});

text_enum!(TipoRegistroParqueadero {
    Ingreso => "INGRESO",
    Salida => "SALIDA",
    Verificacion => "VERIFICACION",
});

// Categoría física de la celda: una bahía de carro no sirve para moto/bici.
text_enum!(CategoriaParqueadero {
    Carro => "CARRO",
    Moto => "MOTO",
    Bici => "BICI",
});

// Tipo de movimiento solicitado/registrado en el log de parqueadero.
text_enum!(AccionParqueadero {
    Asignar => "ASIGNAR",
    Liberar => "LIBERAR",
    CambiarEstado => "CAMBIAR_ESTADO",
    Crear => "CREAR",
});

// Estado del flujo de aprobación de un movimiento de celda.
text_enum!(EstadoSolicitudParqueadero {
    Pendiente => "PENDIENTE",
    Aprobada => "APROBADA",
    Rechazada => "RECHAZADA",
    Ejecutada => "EJECUTADA",
});

text_enum!(EstadoTurno {
    Pendiente => "PENDIENTE",
    Hablando => "HABLANDO",
    Completado => "COMPLETADO",
});

text_enum!(EstadoPairing {
    Pendiente => "PENDIENTE",
    Vinculado => "VINCULADO",
    Expirado => "EXPIRADO",
});

text_enum!(TipoAsistencia {
    Presencial => "PRESENCIAL",
    Virtual => "VIRTUAL",
});

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rol_round_trips_legacy_strings() {
        for raw in [
            "ARRENDATARIO",
            "PROPIETARIO",
            "ADMINISTRADOR",
            "CONCEJO",
            "VIGILANTE",
            "SUPERVISOR_VIGILANCIA",
            "ENCARGADO_PARQUEADERO",
            "SUPER_ADMIN",
        ] {
            let rol: Rol = raw.parse().unwrap();
            assert_eq!(rol.as_str(), raw);
        }
        assert!("ADMIN".parse::<Rol>().is_err());
    }

    #[test]
    fn serde_uses_legacy_values() {
        assert_eq!(
            serde_json::to_string(&Rol::SupervisorVigilancia).unwrap(),
            "\"SUPERVISOR_VIGILANCIA\""
        );
        let parsed: EstadoPago = serde_json::from_str("\"EN_DISPUTA\"").unwrap();
        assert_eq!(parsed, EstadoPago::EnDisputa);
    }
}
