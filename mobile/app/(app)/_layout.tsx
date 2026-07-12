import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, usePathname, useRouter } from 'expo-router';
// SDK 56: `import { Tabs } from 'expo-router'` is deprecated; use the js-tabs entry.
import { Tabs } from 'expo-router/js-tabs';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  DollarSign,
  Home,
  Map,
  MessageCircle,
  Package,
  Phone,
  Ticket,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react-native';

import { useAuth } from '@/hooks/useAuth';
import { LiquidGlass } from '@/components/ui/LiquidGlass';

type TabDef = { name: string; route: string; icon: LucideIcon };

// Mirrors web src/components/shell/BottomNav.tsx role -> tabs mapping.
// Last synced with web: 2026-07-11.
// `route` values are (app)-group route names (file basenames), not web paths.
// Web's VIGILANTE "Panel" points at /vigilancia and ADMIN's "Comité" at
// /comite-convivencia; mobile has no screens for those routes yet, so the
// vigilante panel maps to `inicio` and Comité is omitted until the screen exists.
function tabsForRole(role: string | undefined): TabDef[] {
  if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') {
    return [
      { name: 'Panel', route: 'inicio', icon: Home },
      { name: 'Citofonía', route: 'citofonia', icon: Phone },
      { name: 'Visitas', route: 'control-visitas', icon: Users },
      { name: 'Paquetes', route: 'paqueteria', icon: Package },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  }
  if (role === 'ENCARGADO_PARQUEADERO') {
    return [
      { name: 'Control', route: 'inicio', icon: Home },
      { name: 'Mapa', route: 'mapa-parqueadero', icon: Map },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  }
  if (role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN' || role === 'CONCEJO') {
    return [
      { name: 'Panel', route: 'inicio', icon: Home },
      { name: 'Mensajes', route: 'admin-mensajes', icon: MessageCircle },
      { name: 'Novedades', route: 'admin-novedades', icon: Building2 },
      { name: 'Finanzas', route: 'admin-finanzas', icon: DollarSign },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  }
  if (role === 'PROPIETARIO') {
    return [
      { name: 'Inicio', route: 'inicio', icon: Home },
      { name: 'Citofonía', route: 'citofonia', icon: Phone },
      { name: 'Inmobiliaria', route: 'inmobiliaria', icon: Building2 },
      { name: 'Pases', route: 'pases-temporales', icon: Ticket },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  }
  if (role === 'ARRENDATARIO') {
    // Tenants don't get the Inmobiliaria (real-estate marketplace) tab — that
    // is for owners listing/finding properties.
    return [
      { name: 'Inicio', route: 'inicio', icon: Home },
      { name: 'Citofonía', route: 'citofonia', icon: Phone },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  }
  if (role === 'HUESPED_TEMPORAL') {
    return [
      { name: 'Estancia', route: 'mi-estancia', icon: Home },
      { name: 'Citofonía', route: 'citofonia', icon: Phone },
      { name: 'Chat', route: 'chat', icon: MessageCircle },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  }
  if (
    role === 'ADMINISTRADOR_PISCINA' ||
    role === 'ADMINISTRADOR_GYM' ||
    role === 'MANTENIMIENTO_LOCATIVO' ||
    role === 'OPERARIO_LIMPIEZA'
  ) {
    return [
      { name: 'Inicio', route: 'inicio', icon: Home },
      { name: 'Perfil', route: 'perfil', icon: User },
    ];
  }
  // RESIDENTES por defecto
  return [
    { name: 'Inicio', route: 'inicio', icon: Home },
    { name: 'Citofonía', route: 'citofonia', icon: Phone },
    { name: 'Inmobiliaria', route: 'inmobiliaria', icon: Building2 },
    { name: 'Perfil', route: 'perfil', icon: User },
  ];
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
] as const;

/**
 * Floating glass pill tab bar. Reproduces the web .liquid-glass bottom nav:
 * a rounded translucent pill, inactive icon-only circles, and an expanded
 * active pill showing the label. Icon colors match web (#009df2 idle, white
 * active). Driven entirely off the role tab set so it stays in sync with the
 * registered <Tabs.Screen> options.
 */
function FloatingTabBar({ tabs }: { tabs: TabDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.max(insets.bottom, 16) + 8,
        alignItems: 'center',
        zIndex: 80,
      }}
    >
      <LiquidGlass
        intensity={40}
        radius={35}
        className="w-[92%] max-w-[400px] rounded-[35px] p-2.5"
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
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
              style={{
                height: 52,
                borderRadius: 26,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: isActive ? 16 : 0,
                width: isActive ? 120 : 52,
                marginHorizontal: isActive ? 0 : 4,
                gap: 8,
                // Active pill mirrors web `.nav-active-glass`: translucent green
                // fill + green border (globals.css), not a solid accent.
                backgroundColor: isActive
                  ? 'rgba(87,191,0,0.10)'
                  : 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: isActive
                  ? 'rgba(87,191,0,0.45)'
                  : 'rgba(255,255,255,0.12)',
              }}
            >
              <Icon
                size={20}
                color={isActive ? '#ffffff' : '#009df2'}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {isActive ? (
                <Text
                  numberOfLines={1}
                  style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}
                >
                  {tab.name}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </LiquidGlass>
    </View>
  );
}

export default function AppLayout() {
  const user = useAuth((s) => s.user);
  const tabs = useMemo(() => tabsForRole(user?.rol), [user?.rol]);
  const { colorScheme } = useColorScheme();

  // Auth gate: redirect to /login if there is no session.
  if (!user) {
    return <Redirect href="/login" />;
  }

  const visibleRoutes = new Set(tabs.map((t) => t.route));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Web paints the page background via `body { background: var(--color-
        // primary) }`; native scenes default to white, so paint the theme
        // background here once for every screen.
        sceneStyle: {
          backgroundColor: colorScheme === 'light' ? '#FFFFFF' : '#000000',
        },
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
  );
}
