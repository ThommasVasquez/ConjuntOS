// Single source of truth for who can open each gated route. Nav surfaces
// (BottomNav, inicio grid, SearchModal) filter their buttons through canAccess
// so a role never sees a button that would just fail with "No tienes permisos".
// Pages keep their own gate as defense-in-depth — this only hides dead buttons.
//
// ponytail: mirrors the `allowed` arrays already living in each page. If you
// change a page's gate, mirror it here. Routes not listed are open to everyone.

const GATED: Record<string, string[]> = {
  "/admin-analytics": ["ADMINISTRADOR", "SUPER_ADMIN"],
  "/admin-areas": ["ADMINISTRADOR", "SUPER_ADMIN"],
  "/admin-banners": ["ADMINISTRADOR", "SUPER_ADMIN", "CONCEJO"],
  "/admin-finanzas": ["ADMINISTRADOR", "SUPER_ADMIN", "CONCEJO"],
  "/admin-mensajes": ["ADMINISTRADOR", "SUPER_ADMIN"],
  "/admin-novedades": ["ADMINISTRADOR", "SUPER_ADMIN"],
  "/admin-parqueadero": ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/admin-pqrs": ["ADMINISTRADOR", "SUPER_ADMIN"],
  "/admin-residentes": ["ADMINISTRADOR", "SUPER_ADMIN"],
  "/comite-convivencia": ["ADMINISTRADOR", "SUPER_ADMIN", "CONCEJO"],
  "/control-visitas": ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/correspondencia": ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/directorio": ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/mapa-parqueadero": ["ENCARGADO_PARQUEADERO", "VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/novedades": ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/novedades-seguridad": ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/paqueteria": ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN", "HUESPED_TEMPORAL"],
  "/pases-temporales": ["PROPIETARIO", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/seguridad": ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/vigilancia": ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"],
  "/superadmin": ["SUPER_ADMIN"],
};

/** True if `role` may open `path`. Unlisted paths are public; missing role = no. */
export function canAccess(role: string | undefined | null, path: string): boolean {
  const allowed = GATED[path];
  if (!allowed) return true;
  return !!role && allowed.includes(role);
}
