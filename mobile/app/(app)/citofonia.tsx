import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'nativewind';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Bike,
  Car,
  Clock,
  Info,
  MapPin,
  Package,
  Phone,
  PhoneOff,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react-native';

import { api, ApiError } from '@/lib/api/client';
import type {
  CreateVisitaResidenteRequest,
  DirectorioUsuarioDto,
  TipoVehiculoVisita,
} from '@/lib/api/types';
import { useAuth } from '@/hooks/useAuth';
import { useCall } from '@/providers/CallProvider';
import { Screen } from '@/components/ui/Screen';
import { toast } from '@/components/ui/toast';
import ProfileHeader from '@/components/shell/ProfileHeader';
import { Bouncing, CallAvatar, Equalizer } from '@/components/citofonia/CallVisuals';
import { glassFor, onSemantic, tokensFor } from '@/theme/tokens';

type Tab = 'CITOFONIA' | 'VISITAS' | 'RECEPCION';

// Local runtime shapes, mirroring what the web `/comunicaciones` response feeds
// the screen (a flat subset of the backend DTOs).
interface IVisita {
  id: string;
  nombre: string;
  tipo: string;
  vehiculoTipo?: string | null;
  placa?: string | null;
  fecha: string;
}

interface IPaquete {
  id: string;
  descripcion: string;
  remitente: string;
  fechaLlegada: string;
}

interface ComunicacionesResponse {
  visitas: IVisita[];
  paquetes: IPaquete[];
  parqueadero?: { carrosDisponibles: number; motosDisponibles: number };
}

// Web select option values: 'NINGUNO' (Peatonal) | 'CARRO' | 'MOTO'.
type VehiculoOpt = TipoVehiculoVisita;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * `bg-success animate-pulse shadow-[0_0_6px_…]` (web page.tsx:375). The web
 * glow literal is itself a stale hex from the retired palette, so it is ported
 * as a `success`-token glow.
 */
function PulsingDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.35, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.9,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        },
        style,
      ]}
    />
  );
}

export default function Citofonia() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'light' ? 'light' : 'dark';
  const t = tokensFor(scheme);
  const g = glassFor(scheme);
  // Web builds every citofonía container as an OPAQUE elevated surface
  // (`bg-primary-light shadow-sm`, page.tsx:364,414,465,506,604,645), not glass.
  const cardShadow = {
    shadowColor: g.shadowColor,
    shadowOpacity: scheme === 'light' ? 0.06 : 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  } as const;
  // Web `shadow-2xl` on the round call-overlay buttons (page.tsx:338,344,353).
  const callButtonShadow = {
    shadowColor: g.shadowColor,
    shadowOpacity: scheme === 'light' ? 0.18 : 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  } as const;
  const { user } = useAuth();
  // Huéspedes temporales solo ven la pestaña de citófono (sin directorio ni
  // marcador) y su marcación rápida apunta a Estacionamientos, igual que web.
  const isGuest = user?.rol === 'HUESPED_TEMPORAL';

  // Honra deep links tipo '/citofonia?tab=VISITAS' (p.ej. el CTA "Pedir
  // Parqueo para Visita" de /parqueadero). Solo valores válidos, y nunca para
  // huéspedes (que solo ven la pestaña de citófono).
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const requestedTab: Tab | null =
    !isGuest && (tabParam === 'VISITAS' || tabParam === 'RECEPCION') ? tabParam : null;
  const [activeTab, setActiveTab] = useState<Tab>(requestedTab ?? 'CITOFONIA');
  useEffect(() => {
    // Tab screens stay mounted: sync when the param changes after first mount.
    if (requestedTab) setActiveTab(requestedTab);
  }, [requestedTab]);
  const [isLoading, setIsLoading] = useState(true);
  const prevCallStateRef = useRef<string>('IDLE');

  const {
    callState,
    callerName,
    callTime,
    lastSpeechResponse,
    dialNum,
    setDialNum,
    startCall,
    endCall,
    answerCall,
    rejectCall,
    handleOptionClick,
    getCallOptions,
  } = useCall();

  const [visitas, setVisitas] = useState<IVisita[]>([]);
  const [paquetes, setPaquetes] = useState<IPaquete[]>([]);
  const [parking, setParking] = useState({ carros: 0, motos: 0 });
  const [isAddingVisita, setIsAddingVisita] = useState(false);

  // Add-Visita form state.
  const [visitaNombre, setVisitaNombre] = useState('');
  const [visitaVehiculo, setVisitaVehiculo] = useState<VehiculoOpt>('NINGUNO');
  const [visitaPlaca, setVisitaPlaca] = useState('');
  const [savingVisita, setSavingVisita] = useState(false);

  // Resident search (call by name).
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DirectorioUsuarioDto[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Return to the previous screen ONLY when a call that actually connected
  // ends. A failed/unanswered OUTGOING call goes OUTGOING -> IDLE without ever
  // hitting CONNECTED: in that case we stay on the dialer so the user can retry.
  useEffect(() => {
    const wasConnected =
      prevCallStateRef.current === 'CONNECTED' || prevCallStateRef.current === 'FALLBACK';
    if (wasConnected && callState === 'IDLE') {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(app)/inicio' as never);
      }
    }
    prevCallStateRef.current = callState;
  }, [callState, router]);

  async function fetchData() {
    setIsLoading(true);
    try {
      const json = await api.get<ComunicacionesResponse>('/comunicaciones');
      setVisitas(json.visitas ?? []);
      setPaquetes(json.paquetes ?? []);
      setParking({
        carros: json.parqueadero?.carrosDisponibles ?? 0,
        motos: json.parqueadero?.motosDisponibles ?? 0,
      });
    } catch (err) {
      console.error('Error fetching communications:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Search residents by name (or number) with a 300ms debounce, q length >= 1.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<DirectorioUsuarioDto[]>(
          `/usuarios/directorio?q=${encodeURIComponent(q)}`,
        );
        setSearchResults(res ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const callDirectorioUser = (u: DirectorioUsuarioDto) => {
    if (callState !== 'IDLE') return;
    setDialNum(u.numeroInterno);
    startCall(`user-${u.id}`, u.nombre);
  };

  const handleDial = (num: string) => {
    if (dialNum.length < 8) setDialNum(dialNum + num);
  };

  const handleCall = (targetNum?: string) => {
    const num = targetNum !== undefined ? targetNum : dialNum;
    if (callState === 'IDLE') {
      startCall(num || 'P');
    } else {
      endCall();
    }
  };

  const closeVisitaModal = () => {
    if (savingVisita) return;
    setIsAddingVisita(false);
  };

  // Wire the real POST /api/v1/visitas (the web screen stubs this with a toast).
  const submitVisita = async () => {
    const nombre = visitaNombre.trim();
    if (!nombre) {
      toast.error('Por favor, escribe el nombre del invitado.');
      return;
    }
    setSavingVisita(true);
    try {
      const isVehicular = visitaVehiculo !== 'NINGUNO';
      const placa = visitaPlaca.trim().toUpperCase();
      // Same six keys web always sends (page.tsx:100-107): `vehiculoTipo` goes
      // out even as the literal 'NINGUNO', `placa` is an explicit null when
      // blank or pedestrian, `tieneParqueadero` mirrors the vehicular flag and
      // `observacion` is always null — so server-side defaulting is identical.
      const body: Omit<CreateVisitaResidenteRequest, 'placa' | 'observacion'> & {
        placa: string | null;
        observacion: null;
      } = {
        nombre,
        tipo: isVehicular ? 'VEHICULAR' : 'PEATONAL',
        vehiculoTipo: visitaVehiculo,
        placa: isVehicular ? placa || null : null,
        tieneParqueadero: isVehicular,
        observacion: null,
      };
      await api.post('/visitas', body);
      toast.success('Visita agendada correctamente');
      setIsAddingVisita(false);
      setVisitaNombre('');
      setVisitaVehiculo('NINGUNO');
      setVisitaPlaca('');
      fetchData();
    } catch (e) {
      // Web surfaces the backend message (e.g. a 409 "cupo agotado") and only
      // falls back to the fixed copy.
      toast.error(e instanceof ApiError ? e.detail : 'Error al programar la visita');
    } finally {
      setSavingVisita(false);
    }
  };

  const inCall = callState !== 'IDLE';

  return (
    <Screen className="bg-primary">
      <View className="flex-1 gap-6 px-6 pt-4">
        <ProfileHeader />

        {/* COMPACT DASHBOARD HEADER */}
        <View
          className="w-full rounded-[32px] border border-border bg-primary-light p-5"
          style={cardShadow}
        >
          <View className="flex-row items-center justify-between px-2">
            <Text className="font-display text-xl font-bold tracking-tight text-text">
              Centro de Control
            </Text>
            <View className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              activeTab === 'CITOFONIA'
                ? 'bg-success/10 border-success/30'
                : 'bg-text/10 border-text/20'
            }`}>
              {activeTab === 'CITOFONIA' ? (
                <PulsingDot color={t.success} />
              ) : (
                <View className="h-1.5 w-1.5 rounded-full bg-text/30" />
              )}
              <Text className={`text-[10px] font-black uppercase tracking-widest ${
                activeTab === 'CITOFONIA' ? 'text-success' : 'text-text'
              }`}>
                En Línea
              </Text>
            </View>
          </View>

          {/* TAB SELECTOR */}
          <View className="mt-4 flex-row rounded-2xl border border-border bg-text/5 p-1">
            {(
              isGuest
                ? ([{ id: 'CITOFONIA', icon: Phone, label: 'Portería' }] as const)
                : ([
                    { id: 'CITOFONIA', icon: Phone, label: 'Portería' },
                    { id: 'VISITAS', icon: Users, label: 'Visitas' },
                    { id: 'RECEPCION', icon: Package, label: 'Recibir' },
                  ] as const)
            ).map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  // web: active = `bg-info text-on-accent shadow-md`,
                  // inactive = `text-text/60` (page.tsx:399).
                  style={
                    active
                      ? {
                          shadowColor: g.shadowColor,
                          shadowOpacity: scheme === 'light' ? 0.12 : 0.4,
                          shadowRadius: 6,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: 3,
                        }
                      : { opacity: 0.6 }
                  }
                  className={`flex-1 items-center gap-1 rounded-xl py-2.5 ${
                    active ? 'bg-info' : ''
                  }`}
                >
                  <Icon
                    size={16}
                    color={active ? t.onAccent : t.text}
                    strokeWidth={active ? 2.5 : 1.5}
                  />
                  <Text
                    className={`text-[9px] font-bold uppercase tracking-wider ${
                      active ? 'text-on-accent' : 'text-text'
                    }`}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* CONTENT AREA */}
        {activeTab === 'CITOFONIA' && (
          <View className="gap-6">
            {/* SEARCH RESIDENTS — oculto para huéspedes */}
            {!isGuest && (
            <View
              className="rounded-[28px] border border-border bg-primary-light p-4"
              style={cardShadow}
            >
              <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-text/5 px-4 py-3">
                <Search size={18} color={t.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Buscar residente por nombre…"
                  placeholderTextColor={t.textMuted}
                  className="flex-1 text-sm text-text"
                />
                {searchLoading && <ActivityIndicator size="small" color={t.textMuted} />}
                {searchQuery.length > 0 && !searchLoading && (
                  <Pressable onPress={() => setSearchQuery('')}>
                    <X size={16} color={t.textMuted} />
                  </Pressable>
                )}
              </View>

              {searchResults.length > 0 && (
                <ScrollView className="mt-3 max-h-72" keyboardShouldPersistTaps="handled">
                  <View className="gap-2">
                    {searchResults.map((u) => (
                      <Pressable
                        key={u.id}
                        onPress={() => callDirectorioUser(u)}
                        disabled={callState !== 'IDLE'}
                        style={{ opacity: callState !== 'IDLE' ? 0.5 : 1 }}
                        className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-text/5 p-3"
                      >
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-bold text-text" numberOfLines={1}>
                            {u.nombre}
                          </Text>
                          <Text className="text-[11px] text-textMuted">
                            {u.apto ? `${u.torre ? `${u.torre}-` : ''}${u.apto} · ` : ''}N°{' '}
                            {u.numeroInterno}
                          </Text>
                        </View>
                        {/* web: success at 10% fill + success ink (page.tsx:445-450). */}
                        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10">
                          <Phone size={16} color={t.success} />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              )}

              {searchQuery.trim().length >= 1 && !searchLoading && searchResults.length === 0 && (
                <Text className="mt-3 text-center text-xs text-textMuted">Sin resultados</Text>
              )}
            </View>
            )}

            {/* QUICK CONTACTS — 48px info-tinted chip + 24px info icon (page.tsx:467-472) */}
            <View className="flex-row gap-4">
              <Pressable
                onPress={() => {
                  setDialNum('P');
                  handleCall('P');
                }}
                style={cardShadow}
                className="flex-1 items-center gap-3 rounded-[28px] border border-border bg-primary-light p-5"
              >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-info/10">
                  <ShieldCheck size={24} color={t.info} />
                </View>
                <Text className="text-center text-xs font-bold leading-tight text-text">
                  Portería Principal
                </Text>
              </Pressable>
              {isGuest ? (
                <Pressable
                  onPress={() => {
                    setDialNum('E');
                    handleCall('E');
                  }}
                  style={cardShadow}
                  className="flex-1 items-center gap-3 rounded-[28px] border border-border bg-primary-light p-5"
                >
                  <View className="h-12 w-12 items-center justify-center rounded-2xl bg-info/10">
                    <Car size={24} color={t.info} />
                  </View>
                  <Text className="text-center text-xs font-bold leading-tight text-text">
                    Estacionamientos
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    setDialNum('A');
                    handleCall('A');
                  }}
                  style={cardShadow}
                  className="flex-1 items-center gap-3 rounded-[28px] border border-border bg-primary-light p-5"
                >
                  <View className="h-12 w-12 items-center justify-center rounded-2xl bg-info/10">
                    <Users size={24} color={t.info} />
                  </View>
                  <Text className="text-center text-xs font-bold leading-tight text-text">
                    Administración
                  </Text>
                </Pressable>
              )}
            </View>

            {/* NUMERIC DIALER — oculto para huéspedes */}
            {!isGuest && (
            <View
              className="items-center gap-8 overflow-hidden rounded-[40px] border border-border bg-primary-light p-8"
              style={cardShadow}
            >
              {/* Decorative accent top-edge glow (page.tsx:507). */}
              <LinearGradient
                colors={['transparent', t.accent, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                pointerEvents="none"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, opacity: 0.3 }}
              />

              <View className="w-full items-center gap-2">
                <View className="h-12 items-center justify-center">
                  <Text className="font-display text-4xl font-bold tracking-[8px] text-text">
                    {dialNum || 'MARCAR'}
                  </Text>
                </View>
                {inCall && (
                  <Text className="text-xs font-black text-accent">
                    {formatTime(callTime)} • EN LÍNEA
                  </Text>
                )}
              </View>

              {/* web: `grid grid-cols-3 gap-6 w-full max-w-[240px]` with
                  `w-14 h-14 rounded-full` keys (page.tsx:518-523) — the keys must
                  stay 56px CIRCLES, so the width is fixed, not a % of the row. */}
              <View className="w-full max-w-[240px] flex-row flex-wrap justify-center gap-6">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '#'].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => handleDial(n)}
                    className="h-14 w-14 items-center justify-center rounded-full border border-border bg-text/5"
                  >
                    <Text className="text-xl font-bold text-text">{n}</Text>
                  </Pressable>
                ))}
              </View>

              <View className="w-full flex-row gap-6 px-4">
                <Pressable
                  onPress={() => setDialNum('')}
                  className="flex-1 items-center justify-center rounded-2xl border border-border bg-text/5 py-4"
                >
                  <Text className="text-xs font-bold text-text">Limpiar</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleCall()}
                  // web: `bg-danger shadow-danger/20` in call, else
                  // `bg-success shadow-success/20` (page.tsx:539-543).
                  style={{
                    flex: 2,
                    shadowColor: inCall ? t.danger : t.success,
                    shadowOpacity: 0.2,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 6,
                  }}
                  className={`flex-row items-center justify-center gap-3 rounded-2xl py-4 ${
                    inCall ? 'bg-danger' : 'bg-success'
                  }`}
                >
                  {inCall ? (
                    <PhoneOff size={18} color={onSemantic(scheme)} />
                  ) : (
                    <Phone size={18} color={onSemantic(scheme)} />
                  )}
                  <Text className="font-black" style={{ color: onSemantic(scheme) }}>
                    {inCall ? 'COLGAR' : 'LLAMAR'}
                  </Text>
                </Pressable>
              </View>
            </View>
            )}
          </View>
        )}

        {activeTab === 'VISITAS' && (
          <View className="gap-6">
            {/* PARKING STATUS */}
            <View className="flex-row gap-3">
              <View
                className="min-w-0 flex-1 rounded-[24px] border border-border bg-primary-light p-4"
                style={cardShadow}
              >
                <Text className="mb-2 text-[9px] font-bold uppercase tracking-wider text-text/55">
                  Cupos Carros
                </Text>
                <View className="min-w-0 flex-row items-center gap-2">
                  <View className="h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-info/10">
                    <Car size={16} color={t.info} />
                  </View>
                  <Text className="font-display text-base font-bold text-text" numberOfLines={1}>
                    {parking.carros} Disponibles
                  </Text>
                </View>
              </View>
              <View
                className="min-w-0 flex-1 rounded-[24px] border border-border bg-primary-light p-4"
                style={cardShadow}
              >
                <Text className="mb-2 text-[9px] font-bold uppercase tracking-wider text-text/55">
                  Cupos Motos
                </Text>
                <View className="min-w-0 flex-row items-center gap-2">
                  <View className="h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-info/10">
                    <Bike size={16} color={t.info} />
                  </View>
                  <Text className="font-display text-base font-bold text-text" numberOfLines={1}>
                    {parking.motos} Disponibles
                  </Text>
                </View>
              </View>
            </View>

            {/* ACTION BUTTON */}
            <Pressable
              onPress={() => setIsAddingVisita(true)}
              style={{
                shadowColor: t.accent,
                shadowOpacity: 0.2,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 8 },
                elevation: 6,
              }}
              className="w-full flex-row items-center justify-center gap-2 rounded-[22px] bg-accent py-4"
            >
              <Plus size={18} color={t.onAccent} />
              <Text className="text-sm font-black text-on-accent">AGENDAR NUEVA VISITA</Text>
            </Pressable>

            {/* LIST */}
            <View className="gap-4">
              <Text className="px-2 text-[10px] font-black uppercase tracking-widest text-text">
                Visitas Recientes
              </Text>
              {isLoading ? (
                <View className="items-center py-12">
                  <ActivityIndicator color={t.accent} />
                </View>
              ) : visitas.length === 0 ? (
                <View className="items-center rounded-3xl border border-dashed border-border bg-text/5 py-12">
                  <Users size={40} strokeWidth={1} color={t.text} />
                  <Text className="mt-2 text-[10px] font-bold text-text">
                    No has programado visitas aún
                  </Text>
                </View>
              ) : (
                visitas.map((v) => (
                  <View
                    key={v.id}
                    className="rounded-3xl border border-border bg-primary-light p-4"
                    style={cardShadow}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-4">
                        <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-text/5">
                          {v.tipo === 'VEHICULAR' ? (
                            <Car size={20} color={t.text} />
                          ) : (
                            <Users size={20} color={t.text} />
                          )}
                        </View>
                        <View>
                          <Text className="text-sm font-bold text-text">{v.nombre}</Text>
                          <Text className="text-[10px] text-text">
                            {v.placa ? `Placa: ${v.placa}` : 'Personal'} •{' '}
                            {new Date(v.fecha).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </Text>
                        </View>
                      </View>
                      <View className="rounded-lg border border-border bg-text/5 px-2 py-1">
                        <Text className="text-[8px] font-black uppercase text-text">
                          PROGRAMADA
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {activeTab === 'RECEPCION' && (
          <View className="gap-6">
            {/* ALERT IF PACKAGES */}
            {paquetes.length > 0 && (
              <View className="gap-2 overflow-hidden rounded-3xl border border-border p-6">
                {/* web: `bg-linear-to-r from-accent/20 to-secondary/20` + a blurred
                    accent/20 blob top-right (page.tsx:624-625). */}
                <LinearGradient
                  colors={[`${t.accent}33`, `${t.info}33`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  pointerEvents="none"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <View
                  pointerEvents="none"
                  className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-accent/20"
                />
                <View className="flex-row items-center gap-3">
                  <View className="rounded-xl bg-accent p-2">
                    <Package size={20} color={t.onAccent} />
                  </View>
                  <Text className="font-bold text-text">¡Paquete en Portería!</Text>
                </View>
                <Text className="text-xs leading-relaxed text-text">
                  Tienes {paquetes.length} entrega(s) pendiente(s) por retirar en la recepción
                  principal.
                </Text>
              </View>
            )}

            <View className="gap-4">
              <Text className="px-2 text-[10px] font-black uppercase tracking-widest text-text">
                Historial de Entregas
              </Text>
              {isLoading ? (
                <View className="items-center py-12">
                  <ActivityIndicator color={t.accent} />
                </View>
              ) : paquetes.length === 0 ? (
                <View className="items-center py-20">
                  <Package size={60} strokeWidth={1} color={t.text} />
                  <Text className="mt-4 text-sm font-bold text-text">Sin paquetes pendientes</Text>
                  <Text className="mt-1 text-[10px] uppercase tracking-widest text-text">
                    Todo está entregado
                  </Text>
                </View>
              ) : (
                paquetes.map((p) => (
                  <View
                    key={p.id}
                    className="gap-4 rounded-[32px] border border-border bg-primary-light p-5"
                    style={cardShadow}
                  >
                    <View className="flex-row items-start justify-between">
                      <View>
                        <Text className="text-base font-bold text-text">{p.descripcion}</Text>
                        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                          De: {p.remitente}
                        </Text>
                      </View>
                      <View className="rounded-xl border border-accent/20 bg-accent/10 p-2">
                        <Package size={18} color={t.accent} />
                      </View>
                    </View>
                    <View className="flex-row items-center gap-6 border-t border-border pt-2">
                      <View className="flex-row items-center gap-1.5">
                        <Clock size={12} color={t.text} />
                        <Text className="text-[9px] font-bold text-text">
                          Llegó:{' '}
                          {new Date(p.fechaLlegada).toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <MapPin size={12} color={t.text} />
                        <Text className="text-[9px] font-bold text-text">Portería 1</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </View>

      {/* ── FULL-SCREEN CALL OVERLAY ── */}
      {inCall && (
        <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
          <View className="flex-1 items-center justify-between bg-primary px-8 pb-8 pt-16">
            {/* Header */}
            <View className="mt-12 w-full items-center gap-2">
              <Text className="text-[10px] font-black uppercase tracking-widest text-accent">
                {callState === 'RINGING'
                  ? 'LLAMADA ENTRANTE...'
                  : callState === 'OUTGOING'
                    ? 'LLAMANDO...'
                    : 'CONEXIÓN SEGURA'}
              </Text>
              <Text className="mt-2 text-center font-display text-3xl font-black text-text">
                {callerName}
              </Text>
              <Text className="mt-1 text-xs font-bold text-text">
                {callState === 'RINGING'
                  ? 'Recibiendo llamada entrante...'
                  : callState === 'OUTGOING'
                    ? 'Marcando canal digital...'
                    : `${formatTime(callTime)} • EN LÍNEA`}
              </Text>
            </View>

            {/* Pulse circle */}
            <View className="my-4 items-center justify-center">
              <CallAvatar ringing={callState === 'RINGING' || callState === 'OUTGOING'} />

              {/* Equalizer bars when connected */}
              {(callState === 'CONNECTED' || callState === 'FALLBACK') && <Equalizer />}
            </View>

            {/* Dialogue box */}
            {(callState === 'CONNECTED' || callState === 'FALLBACK') && (
              <View className="my-2 w-full max-w-sm rounded-3xl border border-border bg-text/5 p-6">
                <Text className="mb-2 text-center text-[10px] font-black uppercase tracking-widest text-accent">
                  RESPUESTA RECIBIDA
                </Text>
                <Text className="text-center text-xs font-medium italic leading-relaxed text-text">
                  &quot;
                  {lastSpeechResponse ||
                    (callState === 'CONNECTED'
                      ? 'Habla por el micrófono...'
                      : 'Escuchando...')}
                  &quot;
                </Text>
              </View>
            )}

            {/* Interactive speech options (FALLBACK) */}
            {callState === 'FALLBACK' && (
              <View className="my-2 w-full max-w-md gap-3 px-4">
                <Text className="mb-1 text-center text-[9px] font-black uppercase tracking-widest text-text">
                  OPCIONES DE DIÁLOGO
                </Text>
                <ScrollView className="max-h-[160px]" keyboardShouldPersistTaps="handled">
                  <View className="gap-2.5">
                    {getCallOptions().map((opt, idx) => (
                      <Pressable
                        key={idx}
                        onPress={() => handleOptionClick(opt.label, opt.reply)}
                        className="w-full flex-row items-center justify-between rounded-2xl border border-border bg-text/5 px-5 py-3.5"
                      >
                        <Text className="flex-1 text-xs font-bold text-text">
                          &quot;{opt.label}&quot;
                        </Text>
                        <Text className="ml-2 text-[9px] font-black uppercase tracking-wider text-accent">
                          Hablar
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Action buttons — danger/success tinted, bouncing like web
                (page.tsx:333-359). */}
            <View className="mb-8 w-full max-w-xs flex-row justify-center gap-6">
              {callState === 'RINGING' ? (
                <>
                  <Pressable
                    onPress={rejectCall}
                    style={callButtonShadow}
                    className="h-16 w-16 items-center justify-center rounded-full border border-danger/40 bg-danger/20"
                  >
                    <PhoneOff size={28} color={t.danger} />
                  </Pressable>
                  <Bouncing durationMs={2000}>
                    <Pressable
                      onPress={answerCall}
                      style={callButtonShadow}
                      className="h-16 w-16 items-center justify-center rounded-full border border-success/40 bg-success/20"
                    >
                      <Phone size={28} color={t.success} />
                    </Pressable>
                  </Bouncing>
                </>
              ) : (
                <Bouncing durationMs={3000}>
                  <Pressable
                    onPress={endCall}
                    style={callButtonShadow}
                    className="h-16 w-16 items-center justify-center rounded-full border border-danger/40 bg-danger/20"
                  >
                    <PhoneOff size={28} color={t.danger} />
                  </Pressable>
                </Bouncing>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* ── ADD-VISITA MODAL ── */}
      <Modal
        visible={isAddingVisita}
        transparent
        animationType="slide"
        onRequestClose={closeVisitaModal}
      >
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-primary/95" onPress={closeVisitaModal} />
          <View className="max-h-[90%] rounded-t-[48px] border-t border-border bg-primary-light px-8 pt-8">
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}
            >
              <View className="gap-8">
                <View className="mx-auto h-1.5 w-12 rounded-full bg-text/20" />
                <View className="flex-row items-center justify-between">
                  <Text className="font-display text-2xl font-bold text-text">
                    Programar Visita
                  </Text>
                  <Pressable
                    onPress={closeVisitaModal}
                    className="h-10 w-10 items-center justify-center rounded-full bg-text/5"
                  >
                    <X size={20} color={t.text} />
                  </Pressable>
                </View>

                <View className="gap-6">
                  <View className="gap-2">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-text">
                      Nombre del Invitado
                    </Text>
                    <TextInput
                      value={visitaNombre}
                      onChangeText={setVisitaNombre}
                      placeholder="Ej: Diana Prince"
                      placeholderTextColor={t.textMuted}
                      className="rounded-2xl border border-border bg-text/5 px-5 py-4 text-text"
                    />
                  </View>

                  {/* Web pairs a native <select> with an ALWAYS-VISIBLE Placa
                      input (page.tsx:689-702). RN has no <select>, so the tipo
                      stays a 3-button segmented control — full width so the
                      labels fit — and Placa is kept mounted below instead of
                      popping in and out. */}
                  <View className="gap-2">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-text">
                      Tipo de Vehículo
                    </Text>
                    <View className="flex-row gap-2">
                      {(
                        [
                          { value: 'NINGUNO', label: 'Peatonal' },
                          { value: 'CARRO', label: 'Carro' },
                          { value: 'MOTO', label: 'Moto' },
                        ] as const
                      ).map((opt) => {
                        const active = visitaVehiculo === opt.value;
                        return (
                          <Pressable
                            key={opt.value}
                            onPress={() => setVisitaVehiculo(opt.value)}
                            style={active ? undefined : { opacity: 0.6 }}
                            className={`flex-1 items-center rounded-2xl border px-2 py-3 ${
                              active ? 'border-accent bg-accent/10' : 'border-border bg-text/5'
                            }`}
                          >
                            <Text className="text-[11px] font-bold text-text">{opt.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="gap-2">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-text">
                      Placa (Si aplica)
                    </Text>
                    <TextInput
                      value={visitaPlaca}
                      onChangeText={(txt) => setVisitaPlaca(txt.toUpperCase())}
                      autoCapitalize="characters"
                      placeholder="ABC-123"
                      placeholderTextColor={t.textMuted}
                      className="rounded-2xl border border-border bg-text/5 px-5 py-4 text-text"
                    />
                  </View>

                  <View className="flex-row items-center gap-4 rounded-2xl border border-accent/20 bg-accent/10 p-4">
                    <Info size={20} color={t.accent} />
                    <Text className="flex-1 text-[10px] font-medium leading-relaxed text-text">
                      Al activar el parqueadero, se reservará un cupo automáticamente por 2 horas
                      desde la llegada.
                    </Text>
                  </View>

                  <Pressable
                    onPress={submitVisita}
                    disabled={savingVisita}
                    style={{
                      opacity: savingVisita ? 0.6 : 1,
                      shadowColor: t.accent,
                      shadowOpacity: 0.2,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 8 },
                      elevation: 6,
                    }}
                    className="mt-4 flex-row items-center justify-center gap-3 rounded-2xl bg-accent py-5"
                  >
                    {savingVisita && <ActivityIndicator size="small" color={t.onAccent} />}
                    <Text className="text-base font-black text-on-accent">
                      {savingVisita ? 'PROGRAMANDO...' : 'PROGRAMAR AHORA'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
