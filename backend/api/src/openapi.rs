use axum::response::Html;
use axum::Json;
use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "EN-CONJUNTO API",
        description = "Rust backend for the EN-CONJUNTO residential-complex platform. \
                       Contract per specs/constitution.md Law 5.",
        version = "0.1.0"
    ),
    paths(
        crate::routes::healthz,
        crate::domains::auth_routes::login,
        crate::domains::auth_routes::me,
        crate::domains::auth_routes::logout,
        crate::domains::auth_routes::change_password,
        crate::domains::auth_routes::switch_role,
        crate::domains::auth_routes::ws_ticket,
        crate::domains::usuarios::handlers::get_profile,
        crate::domains::usuarios::handlers::update_profile,
        crate::domains::conjuntos::handlers::list_conjuntos,
        crate::domains::conjuntos::handlers::create_conjunto,
        crate::domains::conjuntos::handlers::update_conjunto,
        crate::domains::notificaciones::handlers::list_notificaciones,
        crate::domains::notificaciones::handlers::mark_leidas,
        crate::domains::notificaciones::handlers::subscribe_push,
        crate::domains::notificaciones::handlers::unsubscribe_push,
        crate::domains::vigilancia::handlers::listar_visitas_hoy,
        crate::domains::vigilancia::handlers::crear_visita_vigilancia,
        crate::domains::vigilancia::handlers::crear_visita_residente,
        crate::domains::vigilancia::handlers::listar_paquetes,
        crate::domains::vigilancia::handlers::crear_paquete,
        crate::domains::vigilancia::handlers::entregar_paquete,
        crate::domains::vigilancia::handlers::vigilancia_stats,
        crate::domains::vigilancia::handlers::paquetes_mios,
        crate::domains::vigilancia::handlers::comunicaciones,
        crate::domains::parqueadero::handlers::parqueadero_mio,
        crate::domains::parqueadero::handlers::crear_vehiculo,
        crate::domains::parqueadero::handlers::mapa,
        crate::domains::parqueadero::handlers::crear_celdas,
        crate::domains::parqueadero::handlers::actualizar_celda,
        crate::domains::parqueadero::handlers::asignar_celda,
        crate::domains::parqueadero::handlers::liberar_celda,
        crate::domains::parqueadero::handlers::registros,
        crate::domains::parqueadero::handlers::ronda_de_hoy,
        crate::domains::parqueadero::handlers::crear_ronda,
        crate::domains::parqueadero::handlers::parqueadero_stats,
        crate::domains::parqueadero::handlers::listar_solicitudes,
        crate::domains::parqueadero::handlers::mis_solicitudes_inquilino,
        crate::domains::parqueadero::handlers::inquilino_aprobar,
        crate::domains::parqueadero::handlers::inquilino_rechazar,
        crate::domains::parqueadero::handlers::mis_sesiones,
        crate::domains::parqueadero::handlers::sesion_de_celda,
        crate::domains::parqueadero::handlers::cerrar_sesion,
        crate::domains::parqueadero::handlers::mis_cargos_pendientes,
        crate::domains::parqueadero::handlers::cargo_aprobar,
        crate::domains::parqueadero::handlers::cargo_rechazar,
        crate::domains::parqueadero::handlers::reservas_disponibilidad,
        crate::domains::parqueadero::handlers::crear_reserva,
        crate::domains::parqueadero::handlers::mis_reservas,
        crate::domains::parqueadero::handlers::reservas_proximas,
        crate::domains::parqueadero::handlers::cancelar_reserva,
        crate::domains::parqueadero::handlers::reserva_marcar_llegada,
        crate::domains::parqueadero::handlers::aprobar_solicitud,
        crate::domains::parqueadero::handlers::rechazar_solicitud,
        crate::domains::parqueadero::handlers::editar_solicitud,
        crate::domains::parqueadero::handlers::borrar_solicitud,
        crate::domains::reservas::handlers::listar_areas,
        crate::domains::reservas::handlers::slots,
        crate::domains::reservas::handlers::listar_reservas,
        crate::domains::reservas::handlers::crear_reserva,
        crate::domains::pagos::handlers::listar_pagos,
        crate::domains::pagos::handlers::pagar,
        crate::domains::comunicaciones::handlers::listar_anuncios,
        crate::domains::comunicaciones::handlers::crear_anuncio,
        crate::domains::comunicaciones::handlers::actualizar_anuncio,
        crate::domains::comunicaciones::handlers::eliminar_anuncio,
        crate::domains::comunicaciones::handlers::directorio,
        crate::domains::uploads::handlers::subir_imagen,
        crate::domains::solicitudes::handlers::listar_solicitudes,
        crate::domains::solicitudes::handlers::crear_solicitud,
        crate::domains::tramites::handlers::listar_tramites,
        crate::domains::tramites::handlers::crear_tramite,
        crate::domains::tramites::handlers::resolver_tramite,
        crate::domains::clasificados::handlers::listar_clasificados,
        crate::domains::clasificados::handlers::crear_clasificado,
        crate::domains::inmuebles::handlers::listar_inmuebles,
        crate::domains::inmuebles::handlers::crear_inmueble,
        crate::domains::admin_stats::admin_stats,
    ),
    tags(
        (name = "ops", description = "Health and operational endpoints"),
        (name = "auth", description = "Session management (JWT via ec_session cookie or Bearer)"),
        (name = "usuarios", description = "Profile and account"),
        (name = "superadmin", description = "Cross-tenant administration"),
        (name = "notificaciones", description = "In-app notifications and web-push subscriptions"),
        (name = "vigilancia", description = "Gate operations: visits, packages, stats"),
        (name = "parqueadero", description = "Parking: vehicles, cell map, audit log, rounds"),
        (name = "reservas", description = "Common areas and amenity reservations"),
        (name = "pagos", description = "Administration fees and utility bills"),
        (name = "comunicaciones", description = "Announcements board and resident directory"),
        (name = "solicitudes", description = "PQRS service requests"),
        (name = "tramites", description = "Administrative trámites (pets, vehicles, moves) with approval flow"),
        (name = "clasificados", description = "Resident classifieds marketplace"),
        (name = "inmuebles", description = "Real-estate listings inside the conjunto"),
        (name = "admin", description = "Tenant administration dashboards")
    )
)]
pub struct ApiDoc;

pub async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}

/// Swagger UI loaded from CDN so the build needs no bundled assets.
pub async fn docs_html() -> Html<&'static str> {
    Html(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>EN-CONJUNTO API docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#swagger-ui' });
    };
  </script>
</body>
</html>"#,
    )
}
