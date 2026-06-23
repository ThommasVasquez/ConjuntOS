// Shared page/role inventory used by realistic-journeys (local) and
// prod-pages (real domain). Plain module — not a spec — so importing it does
// not register any tests.

export const CREDS = {
  residente:   { email: 'residente@demo.conjuntos.app',   password: '123456789' },
  admin:       { email: 'admin@demo.conjuntos.app',       password: '123456789' },
  vigilante:   { email: 'vigilante@demo.conjuntos.app',   password: '123456789' },
  parqueadero: { email: 'parqueadero@demo.conjuntos.app', password: '123456789' },
  superadmin:  { email: 'superadmin@demo.conjuntos.app',  password: '123456789' },
} as const;
export type Role = keyof typeof CREDS;

export const PAGES: { route: string; role: Role; label: string }[] = [
  // resident
  { route: '/inicio', role: 'residente', label: 'Dashboard' },
  { route: '/cartelera', role: 'residente', label: 'Cartelera' },
  { route: '/encuestas', role: 'residente', label: 'Encuestas' },
  { route: '/clasificados', role: 'residente', label: 'Clasificados' },
  { route: '/perfil', role: 'residente', label: 'Perfil' },
  { route: '/pagos', role: 'residente', label: 'Pagos / Cartera' },
  { route: '/pqrs', role: 'residente', label: 'PQRS' },
  { route: '/reservas', role: 'residente', label: 'Reservas' },
  { route: '/chat', role: 'residente', label: 'Chat' },
  { route: '/directorio', role: 'residente', label: 'Directorio' },
  { route: '/citofonia', role: 'residente', label: 'Citofonía' },
  { route: '/mi-estancia', role: 'residente', label: 'Mi estancia' },
  { route: '/novedades', role: 'residente', label: 'Novedades' },
  { route: '/pases-temporales', role: 'residente', label: 'Pases temporales' },
  { route: '/inmobiliaria', role: 'residente', label: 'Inmobiliaria' },
  { route: '/comite-convivencia', role: 'residente', label: 'Comité convivencia' },
  { route: '/asistente', role: 'residente', label: 'Asistente IA' },
  { route: '/parqueadero', role: 'residente', label: 'Parqueadero (residente)' },
  { route: '/visitantes', role: 'residente', label: 'Visitantes' },
  // vigilancia
  { route: '/vigilancia', role: 'vigilante', label: 'Vigilancia' },
  { route: '/control-visitas', role: 'vigilante', label: 'Control visitas' },
  { route: '/correspondencia', role: 'vigilante', label: 'Correspondencia' },
  { route: '/paqueteria', role: 'vigilante', label: 'Paquetería' },
  { route: '/novedades-seguridad', role: 'vigilante', label: 'Novedades seguridad' },
  { route: '/seguridad', role: 'vigilante', label: 'Seguridad' },
  // parqueadero
  { route: '/mapa-parqueadero', role: 'parqueadero', label: 'Mapa parqueadero' },
  { route: '/bitacora-parqueadero', role: 'parqueadero', label: 'Bitácora parqueadero' },
  // admin
  { route: '/admin-analytics', role: 'admin', label: 'Admin analytics' },
  { route: '/admin-areas', role: 'admin', label: 'Admin áreas' },
  { route: '/admin-banners', role: 'admin', label: 'Admin banners' },
  { route: '/admin-finanzas', role: 'admin', label: 'Admin finanzas' },
  { route: '/admin-mensajes', role: 'admin', label: 'Admin mensajes' },
  { route: '/admin-novedades', role: 'admin', label: 'Admin novedades' },
  { route: '/admin-parqueadero', role: 'admin', label: 'Admin parqueadero' },
  { route: '/admin-pqrs', role: 'admin', label: 'Admin PQRS' },
  { route: '/admin-residentes', role: 'admin', label: 'Admin residentes' },
  // superadmin
  { route: '/superadmin', role: 'superadmin', label: 'Superadmin' },
  // misc authed
  { route: '/asamblea', role: 'residente', label: 'Asamblea' },
];
