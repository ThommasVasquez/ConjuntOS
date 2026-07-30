/**
 * AUDITORÍA DE PARQUEADERO - CONJUNTOSAPP (mobile port)
 * Control maestro y trazabilidad del parqueadero. Ported 1:1 from web
 * `src/app/(app)/admin-parqueadero/page.tsx`.
 *
 * Endpoints (identical to web):
 *  - GET  /parqueadero/registros  -> RegistroDto[]        (bitácora global)
 *  - GET  /parqueadero/rondas     -> RondaConUsuario|null (última ronda de hoy)
 *  - GET  /parqueadero/mapa       -> CeldaMapaDto[]       (silencioso si 403)
 *  - POST /parqueadero/celdas     -> CeldaDto[]           (lote o individual)
 *
 * Role guard: VIGILANTE, SUPERVISOR_VIGILANCIA, ADMINISTRADOR, SUPER_ADMIN.
 * La sección "Celdas de Parqueadero" solo la ven ADMINISTRADOR / SUPER_ADMIN.
 *
 * Notas de port:
 *  - El web dibuja un `<svg>` AlertCircle a mano: replicado con react-native-svg.
 *  - El anillo de estatus usa `animate-pulse` de Tailwind cuando no hay ronda:
 *    replicado con react-native-reanimated (1↔0.5, 2s, ease-in-out).
 *  - El bloque `@keyframes pulse-subtle` del web es CSS muerta (la clase
 *    `.animate-pulse-subtle` nunca se aplica), así que no se porta.
 *  - El `gsap.context()` del web está vacío: no hay coreografía que portar.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  SlideInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import {
  ArrowRight,
  Car,
  CheckCircle,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Filter,
  LayoutGrid,
  MapPin,
  Plus,
  ScrollText,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react-native';

import ProfileHeader from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import type { CeldaDto, CeldaMapaDto, RegistroDto } from '@/lib/api/types';

/** La ronda devuelta por el backend incluye el usuario que la realizó. */
interface RondaConUsuario {
  fecha: string;
  usuario: { nombre: string };
}

const ALLOWED_ROLES = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];

/** Opciones del `<select>` "Tipo" del web. */
const TIPO_CELDA_OPTS: Array<{ v: string; l: string }> = [
  { v: 'RESIDENTE', l: 'Residente' },
  { v: 'VISITANTE', l: 'Visitante' },
  { v: 'DISCAPACITADO', l: 'Discapacitado' },
];

/** Opciones de "Categoría del espacio" del web. */
const CATEGORIA_OPTS: Array<{ v: string; label: string; icon: string }> = [
  { v: 'CARRO', label: 'Carro', icon: '🚗' },
  { v: 'MOTO', label: 'Moto', icon: '🏍️' },
  { v: 'BICI', label: 'Bici', icon: '🚲' },
];

/** `Hace X min` — mismo cálculo que el web (una sola vez por render). */
function minutosDesde(fecha: string): number {
  return Math.floor((new Date().getTime() - new Date(fecha).getTime()) / 60000);
}

/** `toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})` — igual al web. */
function formatHora(fecha: string): string {
  return new Date(fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// AlertCircle — el web lo dibuja con un <svg> inline propio (no lucide).
// ---------------------------------------------------------------------------

function AlertCircle({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1="12"
        y1="8"
        x2="12"
        y2="12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1="12"
        y1="16"
        x2="12.01"
        y2="16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Pulse — reproduce `animate-pulse` de Tailwind (opacity 1 ↔ .5, 2s, ease-in-out).
// ---------------------------------------------------------------------------

function Pulse({
  active,
  className,
  style,
  children,
}: {
  active: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (active) {
      opacity.value = withRepeat(
        withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(opacity);
      opacity.value = 1;
    }
    return () => cancelAnimation(opacity);
  }, [active, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View className={className} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Skeleton de carga — equivalente de <SkeletonRows /> (web ui/Skeleton.tsx).
// ---------------------------------------------------------------------------

function SkeletonBlock({ className }: { className: string }) {
  return <Pulse active className={`rounded-lg bg-text/10 ${className}`} />;
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View className="w-full flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <LiquidGlass key={i} className="rounded-3xl" radius={24}>
          <View className="flex-row items-center gap-3 p-5">
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" />
            <View className="min-w-0 flex-1 flex-col gap-2">
              <SkeletonBlock className="h-3 w-1/2" />
              <SkeletonBlock className="h-2.5 w-1/3" />
            </View>
            <SkeletonBlock className="h-4 w-16 shrink-0" />
          </View>
        </LiquidGlass>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function AdminParqueadero() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;

  const { theme } = useTheme();
  const t = tokensFor(theme);

  const [registros, setRegistros] = useState<RegistroDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [lastRound, setLastRound] = useState<RondaConUsuario | null>(null);

  // Gestión de celdas
  const [celdas, setCeldas] = useState<CeldaMapaDto[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modo, setModo] = useState<'lote' | 'individual'>('lote');
  const [prefijo, setPrefijo] = useState('P-');
  const [cantidad, setCantidad] = useState('10');
  const [numero, setNumero] = useState('');
  const [torre, setTorre] = useState('');
  const [tipoCelda, setTipoCelda] = useState('RESIDENTE');
  const [categoria, setCategoria] = useState('CARRO');

  const esAdmin = role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN';

  const loadCeldas = useCallback(async () => {
    try {
      const data = await api.get<CeldaMapaDto[]>('/parqueadero/mapa');
      setCeldas(data);
    } catch {
      /* sin permiso para mapa => ignora */
    }
  }, []);

  async function crearCeldas() {
    setCreating(true);
    try {
      const body: {
        tipo: string;
        categoria: string;
        torre?: string;
        prefijo?: string;
        cantidad?: number;
        numero?: string;
      } = { tipo: tipoCelda, categoria, torre: torre.trim() || undefined };
      if (modo === 'lote') {
        const n = parseInt(cantidad, 10);
        if (!n || n < 1) {
          toast.error('Indica una cantidad válida');
          setCreating(false);
          return;
        }
        body.prefijo = prefijo;
        body.cantidad = n;
      } else {
        if (!numero.trim()) {
          toast.error('Indica el número de la celda');
          setCreating(false);
          return;
        }
        body.numero = numero.trim();
      }
      const creadas = await api.post<CeldaDto[]>('/parqueadero/celdas', body);
      toast.success(
        `${creadas.length} celda${creadas.length === 1 ? '' : 's'} creada${creadas.length === 1 ? '' : 's'} con éxito.`,
      );
      setShowCreate(false);
      setNumero('');
      await loadCeldas();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron crear las celdas');
    } finally {
      setCreating(false);
    }
  }

  const disponibles = celdas.filter((c) => c.estado === 'DISPONIBLE').length;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as never);
      return;
    }
    if (!role || !ALLOWED_ROLES.includes(role)) {
      toast.error('No tienes permisos para acceder a esta sección.');
      router.replace('/(app)/inicio' as never);
      return;
    }

    let cancelled = false;
    async function loadData() {
      try {
        const [regData, rondData] = await Promise.all([
          api.get<RegistroDto[]>('/parqueadero/registros'),
          api.get<RondaConUsuario | null>('/parqueadero/rondas'),
        ]);
        if (cancelled) return;
        setRegistros(regData);
        setLastRound(rondData);
        await loadCeldas();
      } catch {
        if (!cancelled) toast.error('Error cargando auditoría');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, role, router, loadCeldas]);

  const q = searchTerm.toLowerCase();
  const filteredRegistros = registros.filter(
    (reg) =>
      reg.placa?.toLowerCase().includes(q) ||
      reg.celdaNumero?.toLowerCase().includes(q) ||
      reg.usuarioNombre?.toLowerCase().includes(q),
  );

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center px-6">
          <SkeletonRows />
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }} className="bg-primary">
      <Screen className="bg-primary">
        <View className="flex-col gap-6 px-6 pt-4">
          <ProfileHeader />

          {/* TITULAR */}
          <Animated.View entering={FadeInDown.duration(500)} className="mb-2 flex-col gap-2">
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-2xl border border-accent/40 bg-accent/20">
                <ShieldAlert size={24} color={t.accent} />
              </View>
              <View>
                <Text className="text-2xl font-bold tracking-tight text-text">
                  Auditoría de Parqueadero
                </Text>
                <Text className="text-xs font-medium uppercase tracking-widest text-text">
                  Control Maestro y Trazabilidad
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* STATUS CARD RONDAS */}
          <Animated.View entering={FadeInDown.delay(80).duration(500)}>
            <LiquidGlass className="rounded-3xl" radius={24}>
              <View className="flex-col items-center justify-between gap-6 p-6">
                <View className="w-full flex-row items-center gap-5">
                  <Pulse
                    active={!lastRound}
                    className="h-14 w-14 items-center justify-center rounded-full border-4 border-text/20 bg-text/10"
                  >
                    {lastRound ? (
                      <ClipboardCheck size={28} color={t.text} />
                    ) : (
                      <AlertCircle size={28} color={t.text} />
                    )}
                  </Pulse>
                  <View className="flex-1 flex-col">
                    <Text className="mb-1 text-lg font-bold text-text">Estatus de Vigilancia</Text>
                    <Text className="text-xs font-light leading-relaxed text-text">
                      {lastRound
                        ? `La última ronda de verificación fue realizada hoy a las ${formatHora(lastRound.fecha)} por ${lastRound.usuario.nombre}.`
                        : 'Aún no se han reportado rondas de verificación el día de hoy.'}
                    </Text>
                  </View>
                </View>
                {lastRound ? (
                  <View className="shrink-0 flex-row items-center gap-2 rounded-full border border-text/30 bg-text/20 px-4 py-2">
                    <CheckCircle size={14} color={t.text} />
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                      Cumplido
                    </Text>
                  </View>
                ) : null}
              </View>
            </LiquidGlass>
          </Animated.View>

          {/* GESTIÓN DE CELDAS */}
          {esAdmin ? (
            <Animated.View entering={FadeInDown.delay(140).duration(500)}>
              <LiquidGlass className="rounded-3xl" radius={24}>
                <View className="flex-col gap-4 p-6">
                  <View className="flex-row items-center justify-between gap-4">
                    <View className="flex-1 flex-row items-center gap-4">
                      <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-text/10">
                        <LayoutGrid size={22} color={t.info} />
                      </View>
                      <View className="flex-1 flex-col">
                        <Text className="text-lg font-bold text-text">Celdas de Parqueadero</Text>
                        <Text className="text-xs text-text">
                          {celdas.length === 0
                            ? 'Aún no hay celdas creadas. Crea las primeras para poder asignarlas.'
                            : `${celdas.length} celdas · ${disponibles} disponibles`}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setShowCreate(true)}
                      style={({ pressed }) => ({
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                        // web: shadow-lg shadow-success/30
                        shadowColor: t.success,
                        shadowOpacity: 0.3,
                        shadowRadius: 15,
                        shadowOffset: { width: 0, height: 10 },
                        elevation: 6,
                      })}
                      className="shrink-0 flex-row items-center gap-2 rounded-full bg-success px-4 py-3"
                    >
                      <Plus size={16} color={t.onAccent} />
                      <Text className="text-xs font-bold uppercase tracking-wide text-on-accent">
                        Crear celdas
                      </Text>
                    </Pressable>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/(app)/bitacora-parqueadero' as never)}
                    style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                    className="w-full flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-text/5 px-4 py-3"
                  >
                    <ScrollText size={15} color={t.info} />
                    <Text className="text-xs font-bold uppercase tracking-wide text-text">
                      Ver bitácora y aprobaciones
                    </Text>
                  </Pressable>
                </View>
              </LiquidGlass>
            </Animated.View>
          ) : null}

          {/* FILTERS — web es `flex-col sm:flex-row items-center`: a ancho de
              teléfono el input va arriba y el botón de filtro debajo, centrado. */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(500)}
            className="flex-col items-center gap-4"
          >
            <View className="relative w-full">
              <View
                pointerEvents="none"
                className="absolute bottom-0 left-5 top-0 z-10 justify-center"
              >
                <Search size={18} color={searchFocused ? t.accent : t.text} />
              </View>
              <TextInput
                placeholder="Buscar por placa, celda o funcionario..."
                placeholderTextColor={t.textMuted}
                value={searchTerm}
                onChangeText={setSearchTerm}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className={`w-full rounded-2xl border py-4 pl-14 pr-6 text-sm font-light text-text ${
                  searchFocused
                    ? 'border-accent/50 bg-primary-light/80'
                    : 'border-border bg-primary-light/50'
                }`}
              />
            </View>
            {/* Botón decorativo en el web (no tiene onClick). */}
            <View className="h-14 w-14 items-center justify-center rounded-2xl border border-border bg-primary-light/50">
              <Filter size={20} color={t.text} />
            </View>
          </Animated.View>

          {/* MASTER LOG */}
          <Animated.View entering={FadeInDown.delay(260).duration(500)} className="flex-col gap-4">
            <View className="flex-row items-center justify-between px-2">
              <Text className="font-display text-lg font-medium tracking-wide text-text">
                Bitácora Global
              </Text>
              <View className="flex-row items-center gap-2 rounded-full border border-border bg-text/5 px-3 py-1">
                <Clock size={12} color={t.text} />
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                  En Tiempo Real
                </Text>
              </View>
            </View>

            <View className="flex-col gap-3">
              {filteredRegistros.length === 0 ? (
                <LiquidGlass className="rounded-3xl border border-dashed border-border" radius={24}>
                  <View className="items-center p-12">
                    <Text className="text-center text-sm text-text">
                      No se encontraron registros que coincidan con la búsqueda.
                    </Text>
                  </View>
                </LiquidGlass>
              ) : null}

              {filteredRegistros.map((reg) => (
                <LiquidGlass key={reg.id} className="rounded-3xl" radius={24}>
                  <View className="p-5">
                    <View className="flex-col justify-between gap-4">
                      <View className="flex-row items-center gap-4">
                        <View className="h-12 w-12 items-center justify-center rounded-2xl border-2 border-text/20 bg-text/10">
                          <ArrowRight
                            size={22}
                            color={t.text}
                            style={{
                              transform: [
                                { rotate: reg.tipo === 'INGRESO' ? '45deg' : '-135deg' },
                              ],
                            }}
                          />
                        </View>
                        <View className="flex-1 flex-col">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-lg font-bold tracking-tight text-text">
                              Celda {reg.celdaNumero}
                            </Text>
                            <View className="flex-row items-center gap-1.5 rounded-md border border-border bg-text/5 px-2 py-0.5">
                              <MapPin size={10} color={t.text} />
                              <Text className="text-[9px] font-bold uppercase tracking-widest text-text">
                                {reg.celdaTipo}
                              </Text>
                            </View>
                          </View>
                          <View className="mt-1 flex-row items-center gap-3">
                            <View className="flex-row items-center gap-1.5">
                              <Car size={12} color={t.accent} />
                              <Text className="text-[11px] font-semibold tracking-tighter text-accent">
                                {reg.placa || 'PLACA NO REG.'}
                              </Text>
                            </View>
                            <View className="h-1 w-1 rounded-full bg-border" />
                            <Text className="text-[11px] font-medium text-text">
                              Hace {minutosDesde(reg.fecha)} min
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View className="flex-row items-center justify-between gap-6 border-t border-border pt-3">
                        <View className="flex-col">
                          <Text className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-text">
                            Operador
                          </Text>
                          <View className="flex-row items-center gap-2">
                            <View className="h-6 w-6 items-center justify-center rounded-full bg-accent">
                              <Text className="text-[8px] font-bold text-on-accent">
                                {reg.usuarioNombre ? reg.usuarioNombre[0] : ''}
                              </Text>
                            </View>
                            <Text className="text-xs font-bold text-text">{reg.usuarioNombre}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {reg.observacion ? (
                      <View className="mt-4 rounded-2xl border border-border bg-surface p-3">
                        <Text className="text-xs italic leading-relaxed text-text">
                          <Text className="mr-1 font-bold not-italic text-text">Observación:</Text>{' '}
                          {`"${reg.observacion}"`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </LiquidGlass>
              ))}
            </View>
          </Animated.View>

          {/* FOOTER */}
          <View className="items-center py-10" style={{ opacity: 0.1 }} pointerEvents="none">
            <Text className="text-[10px] font-bold uppercase tracking-[0.2em] text-text">
              ConjuntOS Audit Suite • Floor 0
            </Text>
          </View>
        </View>
      </Screen>

      {/* MODAL CREAR CELDAS */}
      <CrearCeldasModal
        open={showCreate}
        creating={creating}
        modo={modo}
        prefijo={prefijo}
        cantidad={cantidad}
        numero={numero}
        torre={torre}
        tipoCelda={tipoCelda}
        categoria={categoria}
        onModo={setModo}
        onPrefijo={setPrefijo}
        onCantidad={setCantidad}
        onNumero={setNumero}
        onTorre={setTorre}
        onTipoCelda={setTipoCelda}
        onCategoria={setCategoria}
        onClose={() => {
          if (!creating) setShowCreate(false);
        }}
        onSubmit={() => void crearCeldas()}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Modal: Crear celdas
// ---------------------------------------------------------------------------

interface CrearCeldasModalProps {
  open: boolean;
  creating: boolean;
  modo: 'lote' | 'individual';
  prefijo: string;
  cantidad: string;
  numero: string;
  torre: string;
  tipoCelda: string;
  categoria: string;
  onModo: (v: 'lote' | 'individual') => void;
  onPrefijo: (v: string) => void;
  onCantidad: (v: string) => void;
  onNumero: (v: string) => void;
  onTorre: (v: string) => void;
  onTipoCelda: (v: string) => void;
  onCategoria: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function CrearCeldasModal({
  open,
  creating,
  modo,
  prefijo,
  cantidad,
  numero,
  torre,
  tipoCelda,
  categoria,
  onModo,
  onPrefijo,
  onCantidad,
  onNumero,
  onTorre,
  onTipoCelda,
  onCategoria,
  onClose,
  onSubmit,
}: CrearCeldasModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const [tipoOpen, setTipoOpen] = useState(false);

  const tipoLabel = TIPO_CELDA_OPTS.find((o) => o.v === tipoCelda)?.l ?? tipoCelda;

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        {/* Backdrop — solo cierra si no se está creando (igual que el web).
            Web: `bg-black/70 backdrop-blur-sm`. */}
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/70"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        >
          <BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>

        {open ? (
          <Animated.View entering={SlideInDown.duration(400)} style={{ maxHeight: '92%' }}>
            {/* El ScrollView debe ser hijo directo del contenedor con altura
                definida (maxHeight): dentro de LiquidGlass no queda acotado y el
                botón "Crear celdas" se sale de pantalla en equipos pequeños. */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
            >
              <LiquidGlass className="rounded-[32px]" radius={32} style={{ padding: 24, gap: 20 }}>
                {/* HEADER */}
                <View className="flex-row items-center justify-between">
                  <Text className="text-xl font-bold text-text">Crear celdas</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar"
                    onPress={onClose}
                    className="h-9 w-9 items-center justify-center rounded-full border border-border bg-text/10"
                  >
                    <X size={18} color={t.text} />
                  </Pressable>
                </View>

                {/* Selector de modo */}
                <View className="flex-row gap-2 rounded-2xl border border-border bg-text/5 p-1">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onModo('lote')}
                    className={`flex-1 items-center rounded-xl py-2.5 ${
                      modo === 'lote' ? 'bg-info' : ''
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold uppercase tracking-wide ${
                        modo === 'lote' ? 'text-on-accent' : 'text-text'
                      }`}
                    >
                      En lote
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onModo('individual')}
                    className={`flex-1 items-center rounded-xl py-2.5 ${
                      modo === 'individual' ? 'bg-info' : ''
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold uppercase tracking-wide ${
                        modo === 'individual' ? 'text-on-accent' : 'text-text'
                      }`}
                    >
                      Individual
                    </Text>
                  </Pressable>
                </View>

                {modo === 'lote' ? (
                  <View className="flex-col gap-3">
                    <View className="flex-row gap-3">
                      <View className="flex-1 flex-col gap-1.5">
                        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                          Prefijo
                        </Text>
                        <TextInput
                          value={prefijo}
                          onChangeText={onPrefijo}
                          placeholder="P-"
                          placeholderTextColor={t.textMuted}
                          editable={!creating}
                          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text"
                        />
                      </View>
                      <View className="w-28 flex-col gap-1.5">
                        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                          Cantidad
                        </Text>
                        <TextInput
                          value={cantidad}
                          onChangeText={onCantidad}
                          keyboardType="number-pad"
                          editable={!creating}
                          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text"
                        />
                      </View>
                    </View>
                    <Text className="text-[11px] text-text">
                      Se crearán{' '}
                      <Text className="font-bold text-success">{`${prefijo}1`}</Text> …{' '}
                      <Text className="font-bold text-success">
                        {`${prefijo}${parseInt(cantidad, 10) || 0}`}
                      </Text>
                    </Text>
                  </View>
                ) : (
                  <View className="flex-col gap-1.5">
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                      Número de celda
                    </Text>
                    <TextInput
                      value={numero}
                      onChangeText={onNumero}
                      placeholder="Ej: A-101"
                      placeholderTextColor={t.textMuted}
                      editable={!creating}
                      className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text"
                    />
                  </View>
                )}

                {/* Categoría del espacio */}
                <View className="flex-col gap-1.5">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                    Categoría del espacio
                  </Text>
                  <View className="flex-row gap-2">
                    {CATEGORIA_OPTS.map((c) => {
                      const selected = categoria === c.v;
                      return (
                        <Pressable
                          key={c.v}
                          accessibilityRole="button"
                          onPress={() => onCategoria(c.v)}
                          className={`flex-1 flex-col items-center gap-1 rounded-xl border py-3 ${
                            selected
                              ? 'border-info bg-info/[0.15]'
                              : 'border-border bg-text/5'
                          }`}
                        >
                          <Text className="text-lg leading-none">{c.icon}</Text>
                          <Text
                            className={`text-xs font-bold ${
                              selected ? 'text-text' : 'text-text/70'
                            }`}
                          >
                            {c.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text className="text-[10px] text-text/60">
                    Las bahías de moto y bici son espacios distintos a los de carro.
                  </Text>
                </View>

                {/* Torre / Tipo */}
                <View className="flex-col gap-3">
                  <View className="flex-row gap-3">
                    <View className="flex-1 flex-col gap-1.5">
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                        Torre / Bloque (opcional)
                      </Text>
                      <TextInput
                        value={torre}
                        onChangeText={onTorre}
                        placeholder="Torre A"
                        placeholderTextColor={t.textMuted}
                        editable={!creating}
                        className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text"
                      />
                    </View>
                    <View className="w-40 flex-col gap-1.5">
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                        Tipo
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setTipoOpen((v) => !v)}
                        className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5"
                      >
                        <Text className="flex-1 text-sm text-text" numberOfLines={1}>
                          {tipoLabel}
                        </Text>
                        <ChevronDown size={16} color={t.text} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Lista de opciones del <select> Tipo */}
                  {tipoOpen ? (
                    <View className="overflow-hidden rounded-xl border border-border bg-surface-2">
                      {TIPO_CELDA_OPTS.map((opt) => {
                        const selected = opt.v === tipoCelda;
                        return (
                          <Pressable
                            key={opt.v}
                            accessibilityRole="button"
                            onPress={() => {
                              onTipoCelda(opt.v);
                              setTipoOpen(false);
                            }}
                            className={`flex-row items-center justify-between px-3 py-3 ${
                              selected ? 'bg-info/[0.15]' : ''
                            }`}
                          >
                            <Text className="text-sm text-text">{opt.l}</Text>
                            {selected ? <CheckCircle size={16} color={t.info} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>

                {/* SUBMIT */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: creating, busy: creating }}
                  disabled={creating}
                  onPress={onSubmit}
                  style={({ pressed }) => ({
                    opacity: creating ? 0.5 : 1,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                    // web: shadow-xl shadow-success/30
                    shadowColor: t.success,
                    shadowOpacity: 0.3,
                    shadowRadius: 25,
                    shadowOffset: { width: 0, height: 20 },
                    elevation: 8,
                  })}
                  className="w-full items-center rounded-full bg-success py-3.5"
                >
                  <Text className="text-sm font-bold tracking-wide text-on-accent">
                    {creating ? 'Creando...' : 'Crear celdas'}
                  </Text>
                </Pressable>
              </LiquidGlass>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
