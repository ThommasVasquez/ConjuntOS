use anyhow::Result;
use tokio_postgres::Client;

/// Legacy (PascalCase, quoted) → target (snake_case) table name pairs.
const TABLE_PAIRS: &[(&str, &str)] = &[
    (r#""Conjunto""#, "conjuntos"),
    (r#""Unidad""#, "unidades"),
    (r#""Usuario""#, "usuarios"),
    (r#""Notificacion""#, "notificaciones"),
    (r#""Visita""#, "visitas"),
    (r#""Paquete""#, "paquetes"),
    (r#""Vehiculo""#, "vehiculos"),
    (r#""Mascota""#, "mascotas"),
    (r#""Parqueadero""#, "parqueaderos"),
    (r#""RegistroParqueadero""#, "registros_parqueadero"),
    (r#""RondaParqueadero""#, "rondas_parqueadero"),
    (r#""Tramite""#, "tramites"),
    (r#""AreaComun""#, "areas_comunes"),
    (r#""Reserva""#, "reservas"),
    (r#""Anuncio""#, "anuncios"),
    (r#""Documento""#, "documentos"),
    (r#""Junta""#, "juntas"),
    (r#""Pago""#, "pagos"),
    (r#""Gasto""#, "gastos"),
    (r#""Local""#, "locales"),
    (r#""Producto""#, "productos"),
    (r#""Pedido""#, "pedidos"),
    (r#""SolicitudServicio""#, "solicitudes_servicio"),
    (r#""ReciboPublico""#, "recibos_publicos"),
    (r#""AdSpace""#, "ad_spaces"),
    (r#""Inmueble""#, "inmuebles"),
    (r#""ChatAdmin""#, "chat_admin"),
    (r#""Asamblea""#, "asambleas"),
    (r#""AsambleaTurno""#, "asamblea_turnos"),
    (r#""AsambleaOpinion""#, "asamblea_opiniones"),
    (r#""AsambleaPairing""#, "asamblea_pairings"),
    (r#""AsambleaAsistencia""#, "asamblea_asistencias"),
    (r#""AsambleaPoder""#, "asamblea_poderes"),
    (r#""AsambleaVotacion""#, "asamblea_votaciones"),
    (r#""AsambleaVoto""#, "asamblea_votos"),
];

/// Compare row counts between legacy and target databases.
/// Returns a list of `(target_table, legacy_count, target_count)` for mismatches.
pub async fn verify(legacy: &Client, target: &Client) -> Result<Vec<(String, i64, i64)>> {
    let mut mismatches = Vec::new();
    for &(leg, tgt) in TABLE_PAIRS {
        let lc: i64 = legacy
            .query_one(&format!("SELECT COUNT(*) FROM {leg}"), &[])
            .await?
            .get(0);
        let tc: i64 = target
            .query_one(&format!("SELECT COUNT(*) FROM {tgt}"), &[])
            .await?
            .get(0);
        if lc != tc {
            mismatches.push((tgt.to_string(), lc, tc));
        }
    }
    Ok(mismatches)
}
