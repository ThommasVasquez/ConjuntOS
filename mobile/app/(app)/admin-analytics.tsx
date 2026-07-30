/**
 * ADMIN ANALYTICS — CONJUNTOSAPP (mobile port)
 * Analytics & Demografía: datos agregados para venta de espacios publicitarios.
 *
 * Ported 1:1 from web `src/app/(app)/admin-analytics/page.tsx`:
 *  - GET /admin/analytics/demografia (una sola carga, sin realtime; el web hace
 *    `.catch(() => {})`, así que un fallo deja `data = null` → estado vacío).
 *  - Guard de roles ADMINISTRADOR / SUPER_ADMIN que NO redirige: el web
 *    renderiza la pantalla "Acceso restringido" en su lugar, y aquí igual.
 *  - 4 KPI cards (Unidades / Usuarios / Nuevos este mes / Activos 30d) con
 *    `toLocaleString("es-CO")` y el mismo color por icono (info, success, el
 *    one-off #a855f7 del web, warning).
 *  - Distribución por Rol: barra de progreso `bg-accent` sobre `bg-surface-2`
 *    con el porcentaje `((cantidad / totalUsuarios) * 100).toFixed(1)`.
 *  - Distribución por Torre: filas con separador `border-border/30` y sin
 *    separador en la última (`last:border-0`).
 *  - Nota para anunciantes con el mismo texto compuesto (propietarios /
 *    arrendatarios sólo si existen esos roles en la respuesta).
 *  - `<Skeleton className="w-8 h-8 rounded-full" />` (animate-pulse bg-text/10)
 *    → círculo pulsante con Reanimated, mismo tamaño y color.
 *
 * No hay gráficas en el web (sólo barras de progreso hechas con divs), así que
 * no se introduce react-native-svg: las barras son Views, igual que el web.
 */

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Activity, Building2, TrendingUp, UserPlus, Users } from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api/client';
import type { DemografiaDto } from '@/lib/api/types';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

const ALLOWED_ROLES = ['ADMINISTRADOR', 'SUPER_ADMIN'];

/** Mirrors web `formatRol`. */
function formatRol(rol: string): string {
  const map: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMINISTRADOR: 'Administrador',
    PROPIETARIO: 'Propietario',
    ARRENDATARIO: 'Arrendatario',
    HUESPED_TEMPORAL: 'Huésped Temporal',
    VIGILANTE: 'Vigilante',
    CONCEJO: 'Concejo',
  };
  return map[rol] || rol;
}

/**
 * Multiply a token's alpha — reproduces web's `/30` opacity modifier applied to
 * an already-translucent CSS-var token (`border-border/30`), which NativeWind
 * cannot resolve because `--color-border` has no `<alpha-value>` slot.
 */
function fadeToken(color: string, factor: number): string {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return color;
  const parts = m[1].split(',').map((p) => p.trim());
  if (parts.length < 3) return color;
  const alpha = parts.length > 3 ? Number(parts[3]) : 1;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha * factor})`;
}

/**
 * `<Skeleton />` from web `src/components/ui/Skeleton.tsx`:
 * `animate-pulse rounded-lg bg-text/10` + the caller's size classes. Tailwind's
 * animate-pulse is opacity 1 → .5 → 1 over 2s; reproduced with Reanimated.
 */
function PulseDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // The infinite repeat keeps running on the UI thread after unmount unless it
    // is explicitly cancelled (the dot unmounts as soon as the fetch resolves).
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View className="h-8 w-8 rounded-full bg-text/10" style={style} />;
}

export default function AdminAnalytics() {
  const user = useAuth((s) => s.user);
  const { theme } = useTheme();
  const t = tokensFor(theme);

  const [data, setData] = useState<DemografiaDto | null>(null);
  const [loading, setLoading] = useState(true);

  const role = user?.rol;
  const allowed = !!user && !!role && ALLOWED_ROLES.includes(role);

  // Web: `useEffect(..., [user])` with the role gate as an early return — so a
  // role change (switch-role) refetches. Keyed on `user`, not on the derived
  // boolean, or ADMINISTRADOR → SUPER_ADMIN would keep the stale payload.
  useEffect(() => {
    if (!user || (user.rol !== 'ADMINISTRADOR' && user.rol !== 'SUPER_ADMIN')) return;
    let cancelled = false;
    api
      .get<DemografiaDto>('/admin/analytics/demografia')
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Web: `if (!user || rol not in [...]) return <p>Acceso restringido</p>` — no
  // redirect, same screen for both branches.
  if (!allowed) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-text">Acceso restringido</Text>
        </View>
      </Screen>
    );
  }

  const kpis: { icon: ReactElement; label: string; value: string }[] = data
    ? [
        {
          icon: <Building2 size={20} color={t.info} />,
          label: 'Unidades',
          value: data.totalUnidades.toLocaleString('es-CO'),
        },
        {
          icon: <Users size={20} color={t.success} />,
          label: 'Usuarios',
          value: data.totalUsuarios.toLocaleString('es-CO'),
        },
        {
          // One-off literal in the web source for this exact icon (#a855f7).
          icon: <UserPlus size={20} color="#a855f7" />,
          label: 'Nuevos este mes',
          value: data.nuevosEsteMes.toLocaleString('es-CO'),
        },
        {
          icon: <Activity size={20} color={t.warning} />,
          label: 'Activos 30d',
          value: data.activos30d.toLocaleString('es-CO'),
        },
      ]
    : [];

  const propietarios = data?.porRol.find((r) => r.rol === 'PROPIETARIO');
  const arrendatarios = data?.porRol.find((r) => r.rol === 'ARRENDATARIO');

  return (
    <Screen className="bg-primary">
      <View className="px-4">
        <ProfileHeader />
      </View>

      <View className="gap-6 px-4 py-6">
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <Text className="font-display text-2xl font-bold text-text">
            Analytics & Demografía
          </Text>
          <Text className="mt-1 text-sm text-text/60">
            Datos agregados para venta de espacios publicitarios
          </Text>
        </Animated.View>

        {loading ? (
          <View className="items-center justify-center py-20">
            <PulseDot />
          </View>
        ) : !data ? (
          <View className="items-center py-20">
            <Text className="text-center text-sm text-text/60">
              No se pudieron cargar los datos
            </Text>
          </View>
        ) : (
          <>
            {/* KPI Cards — web grid-cols-2 gap-3 */}
            <Animated.View entering={FadeInDown.delay(60).duration(500)} className="gap-3">
              <View className="flex-row gap-3">
                {kpis.slice(0, 2).map((kpi) => (
                  <KpiCard key={kpi.label} icon={kpi.icon} label={kpi.label} value={kpi.value} />
                ))}
              </View>
              <View className="flex-row gap-3">
                {kpis.slice(2, 4).map((kpi) => (
                  <KpiCard key={kpi.label} icon={kpi.icon} label={kpi.label} value={kpi.value} />
                ))}
              </View>
            </Animated.View>

            {/* Por Rol */}
            <Animated.View entering={FadeInDown.delay(120).duration(500)}>
              <LiquidGlass
                variant="card"
                radius={28}
                className="rounded-[28px] border border-border"
                style={{ padding: 20 }}
              >
                <View className="mb-4 flex-row items-center gap-2">
                  <TrendingUp size={16} color={t.accent} />
                  <Text className="text-sm font-bold uppercase tracking-wider text-text">
                    Distribución por Rol
                  </Text>
                </View>
                <View className="gap-3">
                  {data.porRol.map((item) => {
                    const pct =
                      data.totalUsuarios > 0
                        ? ((item.cantidad / data.totalUsuarios) * 100).toFixed(1)
                        : '0';
                    return (
                      <View key={item.rol}>
                        <View className="mb-1 flex-row justify-between">
                          {/* `flex-1`: web spans shrink; an RN <Text> in a row
                              does not, so an unmapped (raw enum) rol would
                              overflow instead of wrapping. */}
                          <Text className="flex-1 text-sm font-medium text-text">
                            {formatRol(item.rol)}
                          </Text>
                          <Text className="text-sm text-text/60">
                            {item.cantidad} ({pct}%)
                          </Text>
                        </View>
                        <View className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                          <View
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${Number(pct)}%` }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </LiquidGlass>
            </Animated.View>

            {/* Por Torre */}
            <Animated.View entering={FadeInDown.delay(180).duration(500)}>
              <LiquidGlass
                variant="card"
                radius={28}
                className="rounded-[28px] border border-border"
                style={{ padding: 20 }}
              >
                <View className="mb-4 flex-row items-center gap-2">
                  <Building2 size={16} color={t.accent} />
                  <Text className="text-sm font-bold uppercase tracking-wider text-text">
                    Distribución por Torre
                  </Text>
                </View>
                <View className="gap-2">
                  {data.porTorre.map((item, i) => {
                    const pct =
                      data.totalUsuarios > 0
                        ? ((item.cantidad / data.totalUsuarios) * 100).toFixed(1)
                        : '0';
                    // `last:border-0` — the final row has no separator.
                    const isLast = i === data.porTorre.length - 1;
                    return (
                      <View
                        key={item.torre}
                        className="flex-row items-center justify-between py-1.5"
                        // web: `border-b border-border/30 last:border-0`
                        style={
                          isLast
                            ? undefined
                            : { borderBottomWidth: 1, borderBottomColor: fadeToken(t.border, 0.3) }
                        }
                      >
                        <Text className="flex-1 text-sm text-text">{item.torre}</Text>
                        <Text className="text-sm text-text/60">
                          {item.cantidad} usuarios ({pct}%)
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </LiquidGlass>
            </Animated.View>

            {/* Nota para anunciantes */}
            <Animated.View
              entering={FadeInDown.delay(240).duration(500)}
              className="rounded-[20px] border border-accent/20 bg-accent/10 p-4"
            >
              <Text className="text-xs leading-relaxed text-text/80">
                <Text className="font-bold text-accent">Dato para anunciantes: </Text>
                {`${data.totalUsuarios} residentes activos en ${data.porTorre.length} torres.`}
                {propietarios ? ` ${propietarios.cantidad} propietarios` : ''}
                {arrendatarios ? `, ${arrendatarios.cantidad} arrendatarios` : ''}
                {`. ${data.activos30d} activos en los últimos 30 días.`}
              </Text>
            </Animated.View>
          </>
        )}
      </View>
    </Screen>
  );
}

/** Mirrors web `KpiCard`. */
function KpiCard({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: string;
}) {
  return (
    <LiquidGlass
      variant="card"
      radius={24}
      className="flex-1 rounded-[24px] border border-border"
      style={{ padding: 16, gap: 8 }}
    >
      <View className="flex-row items-center gap-2">
        {icon}
        {/* `flex-1`: the web `<span>` is a shrinkable flex item, so "NUEVOS ESTE
            MES" wraps inside the card. An RN <Text> in a row does NOT shrink by
            default and would overflow (and get clipped) on narrow screens. */}
        <Text className="flex-1 text-[10px] font-bold uppercase tracking-wider text-text/60">
          {label}
        </Text>
      </View>
      <Text className="font-display text-2xl font-bold text-text">{value}</Text>
    </LiquidGlass>
  );
}
