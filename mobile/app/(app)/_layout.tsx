import { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, usePathname, useRouter } from 'expo-router';
// SDK 56: `import { Tabs } from 'expo-router'` is deprecated; use the js-tabs entry.
import { Tabs } from 'expo-router/js-tabs';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import {
  Building2,
  DollarSign,
  Home,
  Map,
  MessageCircle,
  Package,
  Phone,
  Scale,
  Ticket,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react-native';

import {
  BackChromeProvider,
} from '@/components/shell/BackChrome';
import { useAuth } from '@/hooks/useAuth';
import { useHasInternet } from '@/hooks/useHasInternet';
import { canAccess } from '@/lib/permissions';
import { navActiveFor, tokensFor, type ColorSchemeName } from '@/theme/tokens';

type TabDef = { name: string; route: string; icon: LucideIcon };

// Mirrors web src/components/shell/BottomNav.tsx role -> tabs mapping.
// Last synced with web: 2026-07-30.
// `route` values are (app)-group route names (file basenames), not web paths.
function tabsForRole(role: string | undefined): TabDef[] {
  let tabs: TabDef[];
  if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') {
    tabs = [
      // Web points the vigilante "Panel" at /vigilancia (the SOS console), not
      // at the shared home dashboard.
      { name: 'Panel', route: 'vigilancia', icon: Home },
      { name: 'Citofonía', route: 'citofonia', icon: Phone },
      { name: 'Visitas', route: 'control-visitas', icon: Users },
      { name: 'Paquetes', route: 'paqueteria', icon: Package },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  }
  else if (role === 'ENCARGADO_PARQUEADERO') {
    tabs = [
      { name: 'Control', route: 'inicio', icon: Home },
      { name: 'Mapa', route: 'mapa-parqueadero', icon: Map },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  } else if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN' || role === 'CONCEJO') {
    tabs = [
      { name: 'Panel', route: 'inicio', icon: Home },
      { name: 'Mensajes', route: 'admin-mensajes', icon: MessageCircle },
      { name: 'Novedades', route: 'admin-novedades', icon: Building2 },
      // Web places Comité between Novedades and Finanzas (BottomNav.tsx:37).
      { name: 'Comité', route: 'comite-convivencia', icon: Scale },
      { name: 'Finanzas', route: 'admin-finanzas', icon: DollarSign },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  } else if (role === 'PROPIETARIO') {
    tabs = [
      { name: 'Inicio', route: 'inicio', icon: Home },
      { name: 'Citofonía', route: 'citofonia', icon: Phone },
      { name: 'Inmobiliaria', route: 'inmobiliaria', icon: Building2 },
      { name: 'Pases', route: 'pases-temporales', icon: Ticket },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  } else if (role === 'ARRENDATARIO') {
    // Tenants don't get the Inmobiliaria (real-estate marketplace) tab — that
    // is for owners listing/finding properties.
    tabs = [
      { name: 'Inicio', route: 'inicio', icon: Home },
      { name: 'Citofonía', route: 'citofonia', icon: Phone },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  } else if (role === 'HUESPED_TEMPORAL') {
    tabs = [
      { name: 'Estancia', route: 'mi-estancia', icon: Home },
      { name: 'Citofonía', route: 'citofonia', icon: Phone },
      { name: 'Chat', route: 'chat', icon: MessageCircle },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  } else if (
    role === 'ADMINISTRADOR_PISCINA' ||
    role === 'ADMINISTRADOR_GYM' ||
    role === 'MANTENIMIENTO_LOCATIVO' ||
    role === 'OPERARIO_LIMPIEZA'
  ) {
    tabs = [
      { name: 'Inicio', route: 'inicio', icon: Home },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  } else {
    // RESIDENTES por defecto
    tabs = [
      { name: 'Inicio', route: 'inicio', icon: Home },
      { name: 'Citofonía', route: 'citofonia', icon: Phone },
      { name: 'Inmobiliaria', route: 'inmobiliaria', icon: Building2 },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  }

  // Drop any tab this role can't actually open, so no button leads to a
  // "No tienes permisos" redirect (e.g. CONCEJO's admin-only Mensajes and
  // Novedades). Same filter, same shared permission map as web
  // (BottomNav.tsx:81 → src/lib/permissions.ts).
  return tabs.filter((tab) => canAccess(role, `/${tab.route}`));
}

// Every route file that lives in the (app) group. Routes not present in the
// active role's tab set are still registered (so they remain navigable) but
// hidden from the bar via href:null.
const ALL_APP_ROUTES = [
  'inicio',
  'pagos',
  'reservas',
  'citofonia',
  'visitantes',
  'pqrs',
  'paqueteria',
  'perfil',
  'asamblea',
  'asistente',
  'cartelera',
  'chat',
  'clasificados',
  'encuestas',
  'inmobiliaria',
  'mi-estancia',
  'pases-temporales',
  'control-visitas',
  'parqueadero',
  'mapa-parqueadero',
  // Reachable from the ENCARGADO_PARQUEADERO inicio panel; hidden from the
  // bar to match web (web has no Bitácora tab either).
  'bitacora-parqueadero',
  'admin-mensajes',
  'admin-novedades',
  'admin-finanzas',
  'admin-parqueadero',
  'superadmin',
  // Vigilancia / seguridad surfaces. `vigilancia` is the VIGILANTE role's
  // "Panel" tab; the rest are reachable from it and from the inicio grid.
  'vigilancia',
  'seguridad',
  'novedades',
  'novedades-seguridad',
  // Admin console. `comite-convivencia` is the ADMIN "Comité" tab.
  'comite-convivencia',
  'admin-residentes',
  'admin-areas',
  'admin-pqrs',
  'admin-asamblea',
  'admin-documentos',
  'admin-banners',
  'admin-analytics',
  // Resident + portería surfaces reachable from the inicio grid.
  'correspondencia',
  'directorio',
  'documentos',
] as const;

/**
 * Bottom navigation bar: an opaque, edge-to-edge bar anchored to the bottom,
 * with the active tab as a tinted pill carrying icon + label and inactive tabs
 * as bare icons. Colors follow web BottomNav.tsx exactly: the
 * pill is the teal `.nav-active-glass`, the idle icon is `text-info` (blue) and
 * the active icon + label are `text-success` (green). Driven entirely off the
 * role tab set so it stays in sync with the registered <Tabs.Screen> options.
 */
function FloatingTabBar({ tabs }: { tabs: TabDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme: ColorSchemeName = colorScheme === 'light' ? 'light' : 'dark';
  const nav = navActiveFor(scheme);
  const tokens = tokensFor(scheme);

  // The ADMIN role has 6 tabs (Panel/Mensajes/Novedades/Comité/Finanzas/Perfil).
  // RN does not shrink children with an explicit width, so the denser set gets
  // smaller pills and a smaller label instead of clipping the last tab.
  const dense = tabs.length >= 6;

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        // OPAQUE, edge-to-edge and anchored to the bottom. This used to be a
        // floating translucent glass pill (web's `.liquid-glass` `fixed
        // bottom-8` bar). On device that read as broken: expo-blur does not
        // resolve against the scene on every platform, so page content showed
        // straight THROUGH the bar and the tabs looked like disconnected
        // circles hovering over the text.
        backgroundColor: tokens.primaryLight,
        borderTopWidth: 1,
        borderTopColor: tokens.border,
        paddingTop: 10,
        paddingHorizontal: dense ? 6 : 12,
        // Sit above the home indicator without floating away from the edge.
        paddingBottom: Math.max(insets.bottom, 10),
        flexDirection: 'row',
        alignItems: 'center',
        // space-evenly keeps the gaps equal on BOTH ends too, so a 3-tab role
        // doesn't end up with the row visually drifting toward the middle.
        justifyContent: 'space-evenly',
        zIndex: 80,
        // Lift the bar off the content (web: shadow-[0_20px_50px_rgba(0,0,0,0.3)]).
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
        elevation: 12,
      }}
    >
      {tabs.map((tab) => {
        const isActive = pathname.includes(`/${tab.route}`);
        const Icon = tab.icon;
        return (
          <Pressable
            key={tab.route}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.name}
            onPress={() => router.navigate(`/(app)/${tab.route}` as never)}
            // PLAIN OBJECT — a `({pressed}) => …` style is silently dropped by
            // NativeWind's Pressable interop, which is what erased the active
            // pill (and the tabs' padding / 44pt touch target) and left the bar
            // as a row of bare glyphs.
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              height: 42,
              paddingHorizontal: isActive ? (dense ? 12 : 16) : 12,
              borderRadius: 999,
              // Active tab is a tinted pill carrying icon + label; inactive tabs
              // are icon-only. Fill/border are web's `.nav-active-glass` teal.
              backgroundColor: isActive ? nav.fill : 'transparent',
              borderWidth: 1,
              borderColor: isActive ? nav.border : 'transparent',
            }}
          >
            {/* Web BottomNav.tsx:103 — idle icon is `text-info` (blue), the
                active icon is `!text-success` (green). The teal is only the
                PILL (.nav-active-glass), never the glyph. */}
            <Icon
              size={dense ? 20 : 22}
              color={isActive ? tokens.success : tokens.info}
              strokeWidth={isActive ? 2.5 : 2}
            />
            {isActive ? (
              // BottomNav.tsx:109 — active label is `text-success`.
              <Text
                numberOfLines={1}
                style={{
                  color: tokens.success,
                  fontSize: dense ? 11 : 13,
                  fontWeight: '700',
                }}
              >
                {tab.name}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// Screens that already draw their own top-left back control; the shared one
// would double up there. perfil = overlay ChevronLeft (perfil.tsx:1192),
// clasificados = in-header ChevronLeft (clasificados.tsx:306).
const SELF_BACK = new Set(['perfil', 'clasificados']);

/**
 * Shown when we could not establish the session for a reason that is NOT the
 * server rejecting it — no network, or the API unreachable. Without this a
 * subway ride reads as "you were signed out" and dumps the user on /login.
 */
function OfflineScreen({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  const { colorScheme } = useColorScheme();
  const tokens = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  return (
    <View
      className="flex-1 items-center justify-center bg-primary px-8"
      style={{ gap: 12 }}
    >
      <Text
        className="text-center text-lg font-bold text-text"
        style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
      >
        {online ? 'No pudimos conectar' : 'Sin conexión a internet'}
      </Text>
      <Text className="text-center text-sm text-text" style={{ opacity: 0.6 }}>
        {online
          ? 'El servidor no responde en este momento.'
          : 'Revisa tu conexión para continuar.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{
          marginTop: 8,
          backgroundColor: tokens.accent,
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderRadius: 999,
        }}
      >
        <Text
          style={{
            color: tokens.onAccent,
            fontSize: 11,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Reintentar
        </Text>
      </Pressable>
    </View>
  );
}

export default function AppLayout() {
  const user = useAuth((s) => s.user);
  const authOffline = useAuth((s) => s.authOffline);
  const checkAuth = useAuth((s) => s.checkAuth);
  const tabs = useMemo(() => tabsForRole(user?.rol), [user?.rol]);
  const { colorScheme } = useColorScheme();
  const pathname = usePathname();
  const online = useHasInternet();
  const reduceMotion = useReducedMotion();

  // Once the network is back, retry on its own rather than making the user tap.
  useEffect(() => {
    if (online && !user && authOffline) {
      void checkAuth();
    }
  }, [online, user, authOffline, checkAuth]);

  // Connectivity problem — NOT a rejected session. Must be checked before the
  // /login redirect below, otherwise a dropped network logs the user out.
  if (!user && (authOffline || !online)) {
    return <OfflineScreen online={online} onRetry={() => void checkAuth()} />;
  }

  // Auth gate: redirect to /login, carrying the attempted path so login can
  // return the user there (login.tsx already reads `callbackUrl`; nothing was
  // writing it before, mirroring web's middleware `?callbackUrl=`).
  if (!user) {
    return <Redirect href={{ pathname: '/login', params: { callbackUrl: pathname } }} />;
  }

  const visibleRoutes = new Set(tabs.map((t) => t.route));

  // Show a back affordance on EVERY route except the role's home tab. Inside a
  // Tabs navigator there is no header and no swipe-back gesture, so without this
  // every screen is a dead end — tab screens included, since they are also
  // reached from the inicio grid (pagos → citofonía → …) and the user still
  // expects a way back. Rendering it here covers all of them without touching a
  // single screen. Home is excluded: there is nothing above it.
  const currentRoute = pathname.split('/').filter(Boolean).pop() ?? '';
  const homeRoute = tabs[0]?.route ?? 'inicio';
  const showBack =
    currentRoute.length > 0 && currentRoute !== homeRoute && !SELF_BACK.has(currentRoute);

  return (
    <BackChromeProvider showBack={showBack} homeRoute={homeRoute}>
      <View style={{ flex: 1 }}>
        {/* NOTE: <Tabs> is rendered inline, never inside a nested component
            defined in this render — that would remount the navigator on every
            render and wipe the navigation state. */}
        <Tabs
      screenOptions={{
        headerShown: false,
        // Web paints the page background via `body { background: var(--color-
        // primary) }`; native scenes default to white, so paint the theme
        // background here once for every screen.
        sceneStyle: {
          backgroundColor: tokensFor(
            colorScheme === 'light' ? 'light' : 'dark',
          ).primary,
        },
        // Web's route change is the view-transitions.css cross-fade; honour
        // prefers-reduced-motion the same way globals.css:209-222 does.
        animation: reduceMotion ? 'none' : 'fade',
      }}
      tabBar={() => <FloatingTabBar tabs={tabs} />}
    >
          {ALL_APP_ROUTES.map((route) => (
            <Tabs.Screen
              key={route}
              name={route}
              // Hide non-tab routes from the bar; keep them navigable.
              options={{ href: visibleRoutes.has(route) ? undefined : null }}
            />
          ))}
        </Tabs>
      </View>
    </BackChromeProvider>
  );
}
