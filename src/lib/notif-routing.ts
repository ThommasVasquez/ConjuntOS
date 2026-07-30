'use client';

/**
 * Mapea una notificación a la ruta destino según su tipo, palabras clave del
 * título y el rol del usuario. Un gestor (admin/concejo) va a la vista de
 * gestión; un residente a su vista de consulta.
 *
 * Centralizado aquí para que el panel del header (ProfileHeader) y el banner
 * del dashboard (inicio) naveguen de forma idéntica.
 */
export function getNotifTarget(
  notif: { tipo?: string; titulo?: string; huespedId?: string | null } | null | undefined,
  rol?: string,
): string {
  const esGestor = ["ADMINISTRADOR", "CONCEJO", "SUPER_ADMIN"].includes(rol || "");
  // HUESPED_TEMPORAL nunca debe aterrizar en superficies de residente
  // (pagos/pqrs/parqueadero/paquetería): su hogar es /mi-estancia.
  const esHuesped = rol === "HUESPED_TEMPORAL";
  const t = `${notif?.tipo || ""} ${notif?.titulo || ""}`.toLowerCase();

  // Paquete en portería → vista de paquetería (staff); el huésped no tiene
  // acceso a /vigilancia/paquetes, así que va a su estancia.
  if (notif?.tipo === "PAQUETE" || t.includes("paquete") || t.includes("portería") || t.includes("porteria")) {
    return esHuesped ? "/mi-estancia" : "/paqueteria";
  }
  // Trámites / solicitudes de vehículo, mascota, etc.
  if (t.includes("trámite") || t.includes("tramite") || t.includes("solicitud aprobada") || notif?.tipo === "APROBACION") {
    return esGestor ? "/admin-novedades" : "/perfil";
  }
  // PQRS
  if (t.includes("pqrs")) {
    if (esHuesped) return "/mi-estancia";
    return esGestor ? "/admin-novedades" : "/pqrs";
  }
  // Anuncios / circulares / cartelera
  if (t.includes("anuncio") || t.includes("circular") || t.includes("cartelera") || t.includes("comunicado")) {
    return "/cartelera";
  }
  // Pagos / cuotas / recibos. Un huésped temporal comparte unidad_id con su
  // anfitrión: NUNCA debe ser dirigido a /pagos (datos financieros del apto).
  if (t.includes("pago") || t.includes("cuota") || t.includes("recibo") || t.includes("factura") || t.includes("deuda")) {
    if (esHuesped) return "/mi-estancia";
    return esGestor ? "/admin-finanzas" : "/pagos";
  }
  // Reservas de áreas comunes
  if (t.includes("reserva")) {
    return "/reservas";
  }
  // Parqueadero / celda (evaluado ANTES que "visita", porque la notificación de
  // parqueadero de VISITANTE contiene la palabra "visitante" y caería en la
  // regla de visitas). El residente va a /parqueadero, donde está la bandeja de
  // "Aprobaciones pendientes" para aprobar/rechazar la asignación o el cargo.
  if (t.includes("celda") || t.includes("parqueadero") || t.includes("estacionamiento")) {
    if (esHuesped) return "/mi-estancia";
    return esGestor ? "/admin-parqueadero" : "/parqueadero";
  }
  // Visitas / control de acceso
  if (t.includes("visita") || t.includes("visitante")) {
    return esGestor ? "/control-visitas" : "/visitantes";
  }
  // Mensajes / chat → hilo de conversación. Un gestor atiende desde su bandeja
  // (/admin-mensajes); un residente/huésped abre la pantalla de chat, con el
  // hilo del huésped preseleccionado cuando la notificación lo trae.
  if (t.includes("mensaje") || t.includes("chat")) {
    if (esGestor) return "/admin-mensajes";
    return notif?.huespedId
      ? `/chat?huespedId=${encodeURIComponent(notif.huespedId)}`
      : "/chat";
  }
  // Por defecto: rechazos y sistema → al perfil (donde el residente ve el estado)
  return "/perfil";
}
