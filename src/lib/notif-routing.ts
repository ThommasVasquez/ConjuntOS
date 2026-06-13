/**
 * Mapea una notificación a la ruta destino según su tipo, palabras clave del
 * título y el rol del usuario. Un gestor (admin/concejo) va a la vista de
 * gestión; un residente a su vista de consulta.
 *
 * Centralizado aquí para que el panel del header (ProfileHeader) y el banner
 * del dashboard (inicio) naveguen de forma idéntica.
 */
export function getNotifTarget(
  notif: { tipo?: string; titulo?: string } | null | undefined,
  rol?: string,
): string {
  const esGestor = ["ADMINISTRADOR", "CONCEJO", "SUPER_ADMIN"].includes(rol || "");
  const t = `${notif?.tipo || ""} ${notif?.titulo || ""}`.toLowerCase();

  // Paquete en portería → vista de paquetería
  if (notif?.tipo === "PAQUETE" || t.includes("paquete") || t.includes("portería") || t.includes("porteria")) {
    return "/paqueteria";
  }
  // Trámites / solicitudes de vehículo, mascota, etc.
  if (t.includes("trámite") || t.includes("tramite") || t.includes("solicitud aprobada") || notif?.tipo === "APROBACION") {
    return esGestor ? "/admin-novedades" : "/perfil";
  }
  // PQRS
  if (t.includes("pqrs")) {
    return esGestor ? "/admin-novedades" : "/pqrs";
  }
  // Anuncios / circulares / cartelera
  if (t.includes("anuncio") || t.includes("circular") || t.includes("cartelera") || t.includes("comunicado")) {
    return "/cartelera";
  }
  // Pagos / cuotas / recibos
  if (t.includes("pago") || t.includes("cuota") || t.includes("recibo") || t.includes("factura") || t.includes("deuda")) {
    return esGestor ? "/admin-finanzas" : "/pagos";
  }
  // Reservas de áreas comunes
  if (t.includes("reserva")) {
    return "/reservas";
  }
  // Visitas / control de acceso
  if (t.includes("visita") || t.includes("visitante")) {
    return esGestor ? "/control-visitas" : "/visitantes";
  }
  // Parqueadero / celda
  if (t.includes("celda") || t.includes("parqueadero") || t.includes("estacionamiento")) {
    return esGestor ? "/admin-parqueadero" : "/perfil";
  }
  // Mensajes / chat
  if (t.includes("mensaje") || t.includes("chat")) {
    return esGestor ? "/admin-mensajes" : "/cartelera";
  }
  // Por defecto: rechazos y sistema → al perfil (donde el residente ve el estado)
  return "/perfil";
}
