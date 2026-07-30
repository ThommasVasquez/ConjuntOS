/**
 * BITÁCORA DE PARQUEADERO - CONJUNTOSAPP (mobile port)
 * Registro inmutable de solicitudes sobre celdas + aprobación del administrador.
 *
 * Ported 1:1 from web `src/app/(app)/bitacora-parqueadero/page.tsx`:
 *  - Role guard: ADMINISTRADOR | SUPER_ADMIN (else toast + /inicio).
 *  - GET /parqueadero/solicitudes
 *  - POST /parqueadero/solicitudes/{id}/aprobar|rechazar
 *  - useWsSubscription('parqueadero') → silent reload
 *  - Filtros PENDIENTE (default) / TODOS, contador de pendientes
 *  - toLocaleDateString('es-CO') + toLocaleTimeString([], {hour,minute})
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Check,
  CheckCircle2,
  Clock,
  History,
  ScrollText,
  ShieldAlert,
  User,
  X,
  XCircle,
} from 'lucide-react-native';

import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { onSemantic, tokensFor } from '@/theme/tokens';

// Etiquetas legibles de acción/estado.
const ACCION_LABEL: Record<string, string> = {
  ASIGNAR: 'Asignar a residente',
  LIBERAR: 'Liberar celda',
  CAMBIAR_ESTADO: 'Cambiar estado',
  CREAR: 'Crear celda',
};

/**
 * Chip por estado. Web usa `var(--color-*)` para la tinta y un rgba suelto para
 * el fondo (rgba(250,204,21,.12) / (87,191,0,.12) / (239,68,68,.12) /
 * (0,157,242,.12)) — esos rgba son de la paleta muerta, así que aquí el fondo
 * es el MISMO token al 10% (`bg-warning/10`…), que es lo que el rgba pretendía.
 */
const ESTADO_STYLE: Record<string, { label: string; textClass: string; bgClass: string }> = {
  PENDIENTE: { label: 'Pendiente', textClass: 'text-warning', bgClass: 'bg-warning/10' },
  APROBADA: { label: 'Aprobada', textClass: 'text-success', bgClass: 'bg-success/10' },
  RECHAZADA: { label: 'Rechazada', textClass: 'text-danger', bgClass: 'bg-danger/10' },
  EJECUTADA: { label: 'Ejecutada', textClass: 'text-info', bgClass: 'bg-info/10' },
};

// Solicitud de la bitácora de parqueadero devuelta por el backend.
interface SolicitudParqueadero {
  id: string;
  estado: string;
  accion: string;
  detalle: string;
  celdaNumero: string;
  solicitanteNombre: string;
  solicitanteRol: string;
  creadoEn: string;
  aprobadorNombre?: string | null;
  resueltoEn?: string | null;
}

type Filtro = 'TODOS' | 'PENDIENTE';

/**
 * `w-8 h-8 rounded-full bg-text/10 animate-pulse` del estado de carga web.
 *
 * `animate-pulse` de Tailwind es `opacity: 1 → .5 → 1` en 2s con
 * cubic-bezier(.4,0,.6,1): el mínimo es 0.5 (no 0.35) y el ciclo completo dura
 * 2s, así que el timing de ida es 1000ms con repetición reversible. Mismo
 * criterio que admin-parqueadero.tsx y mapa-parqueadero.tsx.
 */
function PulseDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // El loop es infinito: hay que cancelarlo al desmontar (el `loading` pasa a
    // false y este componente se va) o queda animando un valor huérfano.
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View className="h-8 w-8 rounded-full bg-text/10" style={style} />;
}

export default function BitacoraParqueadero() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const successInk = onSemantic(theme);

  const [log, setLog] = useState<SolicitudParqueadero[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('PENDIENTE');

  const esAdmin = role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN';

  const loadLog = useCallback(async () => {
    try {
      const data = await api.get<SolicitudParqueadero[]>('/parqueadero/solicitudes');
      setLog(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar la bitácora');
    } finally {
      setLoading(false);
    }
  }, []);

  useWsSubscription('parqueadero', () => {
    void loadLog();
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as never);
      return;
    }
    if (!esAdmin) {
      toast.error('Solo el administrador puede ver la bitácora de parqueadero.');
      router.replace('/(app)/inicio' as never);
      return;
    }
    void loadLog();
    // esAdmin se deriva de role (ya en deps).
  }, [user, authLoading, role, router, loadLog, esAdmin]);

  const resolver = useCallback(
    async (id: string, accion: 'aprobar' | 'rechazar') => {
      setBusy(id);
      try {
        await api.post(`/parqueadero/solicitudes/${id}/${accion}`, {});
        toast.success(
          accion === 'aprobar' ? 'Solicitud aprobada y aplicada.' : 'Solicitud rechazada.',
        );
        void loadLog();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo procesar');
      } finally {
        setBusy(null);
      }
    },
    [loadLog],
  );

  const visibles = log.filter((s) => (filtro === 'TODOS' ? true : s.estado === 'PENDIENTE'));
  const pendientes = log.filter((s) => s.estado === 'PENDIENTE').length;

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <PulseDot />
        </View>
      </Screen>
    );
  }

  const filtros: Array<{ v: Filtro; label: string }> = [
    { v: 'PENDIENTE', label: `Pendientes${pendientes ? ` (${pendientes})` : ''}` },
    { v: 'TODOS', label: 'Historial completo' },
  ];

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-6 px-6 pt-4">
        <ProfileHeader />

        {/* Encabezado */}
        <View className="mb-1 flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl border border-accent/40 bg-accent/15">
            <ScrollText size={24} color={t.accent} />
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-bold tracking-tight text-text">
              Bitácora de Parqueadero
            </Text>
            <Text className="text-xs font-medium uppercase tracking-widest text-text">
              Registro inmutable · solo administración
            </Text>
          </View>
        </View>

        {/* Aviso de inmutabilidad */}
        <LiquidGlass
          radius={16}
          className="rounded-2xl"
          style={{
            padding: 16,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
            borderWidth: 1,
            borderColor: t.border,
            // Sin esto el borde del contenido sale con esquinas cuadradas y la
            // capa de recorte redondeada de LiquidGlass se las come.
            borderRadius: 16,
          }}
        >
          <View className="mt-0.5 shrink-0">
            <ShieldAlert size={18} color={t.warning} />
          </View>
          <Text className="flex-1 text-xs leading-relaxed text-text/80">
            Toda solicitud sobre celdas <Text className="font-bold">asignadas a residentes</Text>{' '}
            requiere tu aprobación. Este registro guarda{' '}
            <Text className="font-bold">quién</Text> lo pidió,{' '}
            <Text className="font-bold">cuándo</Text> y quién lo aprobó. No puede modificarse ni
            borrarse (solo el superusuario puede hacerlo).
          </Text>
        </LiquidGlass>

        {/* Filtros. `flex-wrap` es obligatorio en móvil: los dos pills
            ("PENDIENTES (n)" + "HISTORIAL COMPLETO" en 12px bold uppercase con
            tracking-widest) suman ~365pt y no caben en los 342pt útiles de un
            iPhone estándar, así que sin wrap el segundo se sale de pantalla. */}
        <View className="flex-row flex-wrap items-center gap-2">
          {filtros.map((f) => {
            const active = filtro === f.v;
            return (
              <Pressable
                key={f.v}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFiltro(f.v)}
                style={({ pressed }) => ({
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  // `shadow-lg shadow-accent/20` del pill activo.
                  ...(active
                    ? {
                        shadowColor: t.accent,
                        shadowOpacity: 0.2,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 6,
                      }
                    : null),
                })}
                className={`rounded-xl border px-4 py-2 ${
                  active ? 'border-accent bg-accent' : 'border-border bg-text/5'
                }`}
              >
                <Text
                  className={`text-xs font-bold uppercase tracking-widest ${
                    active ? 'text-on-accent' : 'text-text'
                  }`}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Lista */}
        <View className="flex flex-col gap-3">
          {visibles.length === 0 ? (
            <LiquidGlass
              radius={24}
              className="rounded-3xl"
              style={{
                padding: 40,
                alignItems: 'center',
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: t.border,
                borderRadius: 24,
              }}
            >
              <View className="mb-2" style={{ opacity: 0.3 }}>
                <History size={32} color={t.text} />
              </View>
              <Text className="text-center text-sm text-text/70">
                {filtro === 'PENDIENTE'
                  ? 'No hay solicitudes pendientes.'
                  : 'La bitácora está vacía.'}
              </Text>
            </LiquidGlass>
          ) : null}

          {visibles.map((s) => {
            const est = ESTADO_STYLE[s.estado] ?? ESTADO_STYLE.EJECUTADA;
            const fecha = new Date(s.creadoEn);
            const isBusy = busy === s.id;
            return (
              <LiquidGlass
                key={s.id}
                radius={24}
                className="rounded-3xl"
                style={{
                  padding: 20,
                  flexDirection: 'column',
                  gap: 16,
                  borderWidth: 1,
                  borderColor: t.border,
                  borderRadius: 24,
                }}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex flex-col gap-1">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="text-base font-bold text-text">Celda {s.celdaNumero}</Text>
                      <View className={`rounded-full px-2 py-0.5 ${est.bgClass}`}>
                        <Text
                          className={`text-[10px] font-black uppercase tracking-wider ${est.textClass}`}
                        >
                          {est.label}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xs text-text/70">
                      {ACCION_LABEL[s.accion] ?? s.accion}
                    </Text>
                  </View>
                </View>

                <View style={{ borderLeftWidth: 2, borderLeftColor: t.border, paddingLeft: 12 }}>
                  <Text className="text-sm leading-relaxed text-text/90">{s.detalle}</Text>
                </View>

                {/* Trazabilidad */}
                <View className="flex flex-col gap-1.5">
                  <View className="flex-row items-center gap-2">
                    <User size={12} color={t.accent} />
                    <Text className="flex-1 text-[11px] text-text/70">
                      <Text className="font-bold text-text">{s.solicitanteNombre}</Text>
                      {` (${s.solicitanteRol})`}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Clock size={12} color={t.accent} />
                    <Text className="flex-1 text-[11px] text-text/70">
                      {fecha.toLocaleDateString('es-CO')} ·{' '}
                      {fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {s.aprobadorNombre ? (
                    <View className="flex-row items-center gap-2">
                      {s.estado === 'APROBADA' ? (
                        <CheckCircle2 size={12} color={t.success} />
                      ) : (
                        <XCircle size={12} color={t.danger} />
                      )}
                      <Text className="flex-1 text-[11px] text-text/70">
                        {s.estado === 'APROBADA' ? 'Aprobado' : 'Rechazado'} por{' '}
                        <Text className="font-bold text-text">{s.aprobadorNombre}</Text>
                        {s.resueltoEn
                          ? ` · ${new Date(s.resueltoEn).toLocaleDateString('es-CO')}`
                          : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Acciones (solo pendientes) */}
                {s.estado === 'PENDIENTE' ? (
                  <View className="flex-row gap-3 pt-1">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isBusy, busy: isBusy }}
                      disabled={isBusy}
                      onPress={() => void resolver(s.id, 'rechazar')}
                      style={({ pressed }) => ({
                        opacity: isBusy ? 0.5 : 1,
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                      })}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-text/5 py-3"
                    >
                      <X size={16} color={t.text} />
                      <Text className="text-sm font-bold text-text">Rechazar</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isBusy, busy: isBusy }}
                      disabled={isBusy}
                      onPress={() => void resolver(s.id, 'aprobar')}
                      style={({ pressed }) => ({
                        opacity: isBusy ? 0.5 : 1,
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                        // `shadow-xl shadow-success/20` del botón de aprobar.
                        shadowColor: t.success,
                        shadowOpacity: 0.2,
                        shadowRadius: 16,
                        shadowOffset: { width: 0, height: 8 },
                        elevation: 8,
                      })}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-success py-3"
                    >
                      <Check size={16} color={successInk} />
                      <Text className="text-sm font-bold" style={{ color: successInk }}>
                        {isBusy ? 'Procesando...' : 'Aprobar'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </LiquidGlass>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
