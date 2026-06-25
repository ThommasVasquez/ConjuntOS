// Single source of truth for role-driven e2e: every role, its bottom-nav tabs,
// and the full set of routes it can reach. Plain module (no tests registered).
//
// Coverage strategy: ONE tester account (admin@demo) logs in, then switches its
// *real* role server-side (POST /auth/switch-role) to exercise all 13 roles —
// the RoleSwitcher flow real users with `isTester` have. Requires the backend to
// whitelist the account in TESTER_EMAILS (see docker-compose.e2e.yml).

export const TESTER = { email: 'admin@demo.conjuntos.app', password: '123456789' } as const;

// Demo accounts that exist as standalone logins (TEST_CREDENTIALS.md).
export const DEMO_ACCOUNTS = {
  ADMINISTRADOR: { email: 'admin@demo.conjuntos.app', password: '123456789' },
  PROPIETARIO: { email: 'residente@demo.conjuntos.app', password: '123456789' },
  ARRENDATARIO: { email: 'arrendatario@demo.conjuntos.app', password: '123456789' },
  CONCEJO: { email: 'concejo@demo.conjuntos.app', password: '123456789' },
  VIGILANTE: { email: 'vigilante@demo.conjuntos.app', password: '123456789' },
  SUPERVISOR_VIGILANCIA: { email: 'supervisor@demo.conjuntos.app', password: '123456789' },
  ENCARGADO_PARQUEADERO: { email: 'parqueadero@demo.conjuntos.app', password: '123456789' },
  SUPER_ADMIN: { email: 'superadmin@demo.conjuntos.app', password: '123456789' },
} as const;

export type Rol =
  | 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'CONCEJO' | 'PROPIETARIO' | 'ARRENDATARIO'
  | 'VIGILANTE' | 'SUPERVISOR_VIGILANCIA' | 'ENCARGADO_PARQUEADERO' | 'HUESPED_TEMPORAL'
  | 'ADMINISTRADOR_PISCINA' | 'ADMINISTRADOR_GYM' | 'MANTENIMIENTO_LOCATIVO' | 'OPERARIO_LIMPIEZA';

export const ALL_ROLES: Rol[] = [
  'SUPER_ADMIN', 'ADMINISTRADOR', 'CONCEJO', 'PROPIETARIO', 'ARRENDATARIO',
  'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO', 'HUESPED_TEMPORAL',
  'ADMINISTRADOR_PISCINA', 'ADMINISTRADOR_GYM', 'MANTENIMIENTO_LOCATIVO', 'OPERARIO_LIMPIEZA',
];

// Bottom-nav tabs each role sees (mirrors src/components/shell/BottomNav.tsx).
// Used to assert the menu renders the right links AND to click them.
export const NAV_TABS: Record<Rol, { name: string; path: string }[]> = {
  VIGILANTE: [
    { name: 'Panel', path: '/vigilancia' }, { name: 'Citofonía', path: '/citofonia' },
    { name: 'Visitas', path: '/control-visitas' }, { name: 'Paquetes', path: '/paqueteria' },
    { name: 'Perfil', path: '/perfil' },
  ],
  SUPERVISOR_VIGILANCIA: [
    { name: 'Panel', path: '/vigilancia' }, { name: 'Citofonía', path: '/citofonia' },
    { name: 'Visitas', path: '/control-visitas' }, { name: 'Paquetes', path: '/paqueteria' },
    { name: 'Perfil', path: '/perfil' },
  ],
  ENCARGADO_PARQUEADERO: [
    { name: 'Control', path: '/inicio' }, { name: 'Mapa', path: '/mapa-parqueadero' },
    { name: 'Perfil', path: '/perfil' },
  ],
  ADMINISTRADOR: [
    { name: 'Panel', path: '/inicio' }, { name: 'Mensajes', path: '/admin-mensajes' },
    { name: 'Novedades', path: '/admin-novedades' }, { name: 'Comité', path: '/comite-convivencia' },
    { name: 'Finanzas', path: '/admin-finanzas' }, { name: 'Perfil', path: '/perfil' },
  ],
  SUPER_ADMIN: [
    { name: 'Panel', path: '/inicio' }, { name: 'Mensajes', path: '/admin-mensajes' },
    { name: 'Novedades', path: '/admin-novedades' }, { name: 'Comité', path: '/comite-convivencia' },
    { name: 'Finanzas', path: '/admin-finanzas' }, { name: 'Perfil', path: '/perfil' },
  ],
  CONCEJO: [
    { name: 'Panel', path: '/inicio' }, { name: 'Mensajes', path: '/admin-mensajes' },
    { name: 'Novedades', path: '/admin-novedades' }, { name: 'Comité', path: '/comite-convivencia' },
    { name: 'Finanzas', path: '/admin-finanzas' }, { name: 'Perfil', path: '/perfil' },
  ],
  PROPIETARIO: [
    { name: 'Inicio', path: '/inicio' }, { name: 'Citofonía', path: '/citofonia' },
    { name: 'Inmobiliaria', path: '/inmobiliaria' }, { name: 'Pases', path: '/pases-temporales' },
    { name: 'Perfil', path: '/perfil' },
  ],
  ARRENDATARIO: [
    { name: 'Inicio', path: '/inicio' }, { name: 'Citofonía', path: '/citofonia' },
    { name: 'Inmobiliaria', path: '/inmobiliaria' }, { name: 'Perfil', path: '/perfil' },
  ],
  HUESPED_TEMPORAL: [
    { name: 'Estancia', path: '/mi-estancia' }, { name: 'Citofonía', path: '/citofonia' },
    { name: 'Chat', path: '/chat' }, { name: 'Perfil', path: '/perfil' },
  ],
  ADMINISTRADOR_PISCINA: [{ name: 'Inicio', path: '/inicio' }, { name: 'Perfil', path: '/perfil' }],
  ADMINISTRADOR_GYM: [{ name: 'Inicio', path: '/inicio' }, { name: 'Perfil', path: '/perfil' }],
  MANTENIMIENTO_LOCATIVO: [{ name: 'Inicio', path: '/inicio' }, { name: 'Perfil', path: '/perfil' }],
  OPERARIO_LIMPIEZA: [{ name: 'Inicio', path: '/inicio' }, { name: 'Perfil', path: '/perfil' }],
};

// Every (app) route, with the roles expected to reach it without bouncing to /login
// or an access wall. Resident-facing routes are open to resident-like roles; admin
// routes to admin-like roles; etc. The journey spec visits each role's allowed set.
const RESIDENT_ROLES: Rol[] = ['PROPIETARIO', 'ARRENDATARIO', 'CONCEJO', 'HUESPED_TEMPORAL'];
const ADMIN_ROLES: Rol[] = ['ADMINISTRADOR', 'SUPER_ADMIN', 'CONCEJO'];
const STAFF_VIG: Rol[] = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA'];
const PARKING: Rol[] = ['ENCARGADO_PARQUEADERO'];

export const ROUTES: { route: string; roles: Rol[]; label: string }[] = [
  { route: '/inicio', roles: ALL_ROLES, label: 'Dashboard' },
  { route: '/perfil', roles: ALL_ROLES, label: 'Perfil' },
  { route: '/citofonia', roles: [...RESIDENT_ROLES, ...STAFF_VIG, 'ADMINISTRADOR', 'SUPER_ADMIN'], label: 'Citofonía' },
  { route: '/chat', roles: [...RESIDENT_ROLES, ...ADMIN_ROLES, ...STAFF_VIG], label: 'Chat' },
  // resident-facing
  { route: '/cartelera', roles: RESIDENT_ROLES, label: 'Cartelera' },
  { route: '/novedades', roles: RESIDENT_ROLES, label: 'Novedades' },
  { route: '/encuestas', roles: RESIDENT_ROLES, label: 'Encuestas' },
  { route: '/clasificados', roles: RESIDENT_ROLES, label: 'Clasificados' },
  { route: '/pagos', roles: ['PROPIETARIO', 'ARRENDATARIO', 'CONCEJO'], label: 'Pagos / Cartera' },
  { route: '/pqrs', roles: RESIDENT_ROLES, label: 'PQRS' },
  { route: '/reservas', roles: RESIDENT_ROLES, label: 'Reservas' },
  { route: '/directorio', roles: [...RESIDENT_ROLES, ...ADMIN_ROLES], label: 'Directorio' },
  { route: '/mi-estancia', roles: ['HUESPED_TEMPORAL', 'PROPIETARIO', 'ARRENDATARIO'], label: 'Mi estancia' },
  { route: '/pases-temporales', roles: ['PROPIETARIO', 'ARRENDATARIO'], label: 'Pases temporales' },
  { route: '/inmobiliaria', roles: ['PROPIETARIO', 'ARRENDATARIO'], label: 'Inmobiliaria' },
  { route: '/comite-convivencia', roles: [...RESIDENT_ROLES, ...ADMIN_ROLES], label: 'Comité convivencia' },
  { route: '/asistente', roles: [...RESIDENT_ROLES, ...ADMIN_ROLES], label: 'Asistente IA' },
  { route: '/parqueadero', roles: ['PROPIETARIO', 'ARRENDATARIO'], label: 'Parqueadero (residente)' },
  { route: '/visitantes', roles: ['PROPIETARIO', 'ARRENDATARIO'], label: 'Visitantes' },
  { route: '/asamblea', roles: [...RESIDENT_ROLES, ...ADMIN_ROLES], label: 'Asamblea' },
  // vigilancia
  { route: '/vigilancia', roles: STAFF_VIG, label: 'Vigilancia' },
  { route: '/control-visitas', roles: STAFF_VIG, label: 'Control visitas' },
  { route: '/correspondencia', roles: STAFF_VIG, label: 'Correspondencia' },
  { route: '/paqueteria', roles: STAFF_VIG, label: 'Paquetería' },
  { route: '/novedades-seguridad', roles: STAFF_VIG, label: 'Novedades seguridad' },
  { route: '/seguridad', roles: STAFF_VIG, label: 'Seguridad' },
  // parqueadero
  { route: '/mapa-parqueadero', roles: PARKING, label: 'Mapa parqueadero' },
  { route: '/bitacora-parqueadero', roles: PARKING, label: 'Bitácora parqueadero' },
  // admin
  { route: '/admin-analytics', roles: ADMIN_ROLES, label: 'Admin analytics' },
  { route: '/admin-areas', roles: ADMIN_ROLES, label: 'Admin áreas' },
  { route: '/admin-banners', roles: ADMIN_ROLES, label: 'Admin banners' },
  { route: '/admin-finanzas', roles: ADMIN_ROLES, label: 'Admin finanzas' },
  { route: '/admin-mensajes', roles: ADMIN_ROLES, label: 'Admin mensajes' },
  { route: '/admin-novedades', roles: ADMIN_ROLES, label: 'Admin novedades' },
  { route: '/admin-parqueadero', roles: ADMIN_ROLES, label: 'Admin parqueadero' },
  { route: '/admin-pqrs', roles: ADMIN_ROLES, label: 'Admin PQRS' },
  { route: '/admin-residentes', roles: ADMIN_ROLES, label: 'Admin residentes' },
  // superadmin
  { route: '/superadmin', roles: ['SUPER_ADMIN'], label: 'Superadmin' },
];

export function routesForRole(role: Rol): { route: string; label: string }[] {
  return ROUTES.filter((r) => r.roles.includes(role)).map((r) => ({ route: r.route, label: r.label }));
}
