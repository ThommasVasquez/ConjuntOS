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
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';
import {
  Bike,
  Car,
  Clock,
  Info,
  Loader2,
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

import { api } from '@/lib/api/client';
import type {
  CreateVisitaResidenteRequest,
  DirectorioUsuarioDto,
  TipoVehiculoVisita,
} from '@/lib/api/types';
import { useCall } from '@/providers/CallProvider';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import ProfileHeader from '@/components/shell/ProfileHeader';
import { tokensFor } from '@/theme/tokens';

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

export default function Citofonia() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  const [activeTab, setActiveTab] = useState<Tab>('CITOFONIA');
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
      toast.error('Por favor ingresa el nombre del invitado');
      return;
    }
    setSavingVisita(true);
    try {
      const isVehicular = visitaVehiculo !== 'NINGUNO';
      const placa = visitaPlaca.trim().toUpperCase();
      const body: CreateVisitaResidenteRequest = {
        nombre,
        tipo: isVehicular ? 'VEHICULAR' : 'PEATONAL',
        ...(isVehicular ? { vehiculoTipo: visitaVehiculo } : {}),
        ...(isVehicular && placa ? { placa } : {}),
      };
      await api.post('/visitas', body);
      toast.success('Visita agendada correctamente');
      setIsAddingVisita(false);
      setVisitaNombre('');
      setVisitaVehiculo('NINGUNO');
      setVisitaPlaca('');
      fetchData();
    } catch {
      toast.error('No se pudo agendar la visita');
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
        <LiquidGlass variant="card" radius={32} className="w-full p-5">
          <View className="flex-row items-center justify-between px-2">
            <Text className="font-display text-xl font-bold tracking-tight text-text">
              Centro de Control
            </Text>
            <View className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface2 px-2.5 py-1">
              <View className="h-1.5 w-1.5 rounded-full bg-text" />
              <Text className="text-[10px] font-black uppercase tracking-widest text-text">
                En Línea
              </Text>
            </View>
          </View>

          {/* TAB SELECTOR */}
          <View className="mt-4 flex-row rounded-2xl border border-border bg-surface p-1">
            {(
              [
                { id: 'CITOFONIA', icon: Phone, label: 'Portería' },
                { id: 'VISITAS', icon: Users, label: 'Visitas' },
                { id: 'RECEPCION', icon: Package, label: 'Recibir' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  className={`flex-1 items-center gap-1 rounded-xl py-2.5 ${
                    active ? 'border border-border bg-surface2' : ''
                  }`}
                >
                  <Icon size={16} color={t.text} strokeWidth={active ? 2.5 : 1.5} />
                  <Text className="text-[9px] font-bold uppercase tracking-wider text-text">
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </LiquidGlass>

        {/* CONTENT AREA */}
        {activeTab === 'CITOFONIA' && (
          <View className="gap-6">
            {/* SEARCH RESIDENTS */}
            <LiquidGlass variant="card" radius={28} className="p-4">
              <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
                <Search size={18} color={t.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Buscar residente por nombre…"
                  placeholderTextColor={t.textMuted}
                  className="flex-1 text-sm text-text"
                />
                {searchLoading && <Loader2 size={16} color={t.textMuted} />}
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
                        className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3"
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
                        <View className="h-9 w-9 items-center justify-center rounded-full bg-surface2">
                          <Phone size={16} color={t.accent} />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              )}

              {searchQuery.trim().length >= 1 && !searchLoading && searchResults.length === 0 && (
                <Text className="mt-3 text-center text-xs text-textMuted">Sin resultados</Text>
              )}
            </LiquidGlass>

            {/* QUICK CONTACTS */}
            <View className="flex-row gap-4">
              <Pressable
                onPress={() => {
                  setDialNum('P');
                  handleCall('P');
                }}
                className="flex-1 items-center gap-3 rounded-[28px] border border-border bg-primary-light p-6"
              >
                <ShieldCheck size={28} color={t.accent} />
                <Text className="text-xs font-bold text-text">Portería Principal</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDialNum('A');
                  handleCall('A');
                }}
                className="flex-1 items-center gap-3 rounded-[28px] border border-border bg-primary-light p-6"
              >
                <Users size={28} color={t.text} />
                <Text className="text-xs font-bold text-text">Administración</Text>
              </Pressable>
            </View>

            {/* NUMERIC DIALER */}
            <LiquidGlass variant="card" radius={40} className="items-center gap-8 p-8">
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

              <View className="w-full max-w-[240px] flex-row flex-wrap justify-between gap-y-6">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '#'].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => handleDial(n)}
                    style={{ width: '30%' }}
                    className="h-14 items-center justify-center rounded-full border border-border bg-surface"
                  >
                    <Text className="text-xl font-bold text-text">{n}</Text>
                  </Pressable>
                ))}
              </View>

              <View className="w-full flex-row gap-6 px-4">
                <Pressable
                  onPress={() => setDialNum('')}
                  className="flex-1 items-center justify-center rounded-2xl border border-border bg-surface py-4"
                >
                  <Text className="text-xs font-bold text-text">Limpiar</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleCall()}
                  style={{ flex: 2 }}
                  className="flex-row items-center justify-center gap-3 rounded-2xl bg-surface2 py-4"
                >
                  {inCall ? (
                    <PhoneOff size={18} color={t.text} />
                  ) : (
                    <Phone size={18} color={t.text} />
                  )}
                  <Text className="font-black text-text">{inCall ? 'COLGAR' : 'LLAMAR'}</Text>
                </Pressable>
              </View>
            </LiquidGlass>
          </View>
        )}

        {activeTab === 'VISITAS' && (
          <View className="gap-6">
            {/* PARKING STATUS */}
            <View className="flex-row gap-3">
              <LiquidGlass variant="card" radius={24} className="flex-1 p-4">
                <Text className="mb-1 text-[9px] font-black uppercase tracking-widest text-text">
                  Cupos Carros
                </Text>
                <View className="flex-row items-center gap-2">
                  <Car size={16} color={t.accent} />
                  <Text className="font-display text-lg font-bold text-text">
                    {parking.carros} Disponibles
                  </Text>
                </View>
              </LiquidGlass>
              <LiquidGlass variant="card" radius={24} className="flex-1 p-4">
                <Text className="mb-1 text-[9px] font-black uppercase tracking-widest text-text">
                  Cupos Motos
                </Text>
                <View className="flex-row items-center gap-2">
                  <Bike size={16} color={t.text} />
                  <Text className="font-display text-lg font-bold text-text">
                    {parking.motos} Disponibles
                  </Text>
                </View>
              </LiquidGlass>
            </View>

            {/* ACTION BUTTON */}
            <Pressable
              onPress={() => setIsAddingVisita(true)}
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
                <View className="items-center rounded-3xl border border-dashed border-border bg-surface py-12">
                  <Users size={40} strokeWidth={1} color={t.text} />
                  <Text className="mt-2 text-[10px] font-bold text-text">
                    No has programado visitas aún
                  </Text>
                </View>
              ) : (
                visitas.map((v) => (
                  <LiquidGlass key={v.id} variant="card" radius={24} className="p-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-4">
                        <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface">
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
                      <View className="rounded-lg border border-border bg-surface px-2 py-1">
                        <Text className="text-[8px] font-black uppercase text-text">
                          PROGRAMADA
                        </Text>
                      </View>
                    </View>
                  </LiquidGlass>
                ))
              )}
            </View>
          </View>
        )}

        {activeTab === 'RECEPCION' && (
          <View className="gap-6">
            {/* ALERT IF PACKAGES */}
            {paquetes.length > 0 && (
              <View className="gap-2 rounded-3xl border border-border bg-surface2 p-6">
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
                  <LiquidGlass key={p.id} variant="card" radius={32} className="gap-4 p-5">
                    <View className="flex-row items-start justify-between">
                      <View>
                        <Text className="text-base font-bold text-text">{p.descripcion}</Text>
                        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                          De: {p.remitente}
                        </Text>
                      </View>
                      <View className="rounded-xl border border-border bg-surface2 p-2">
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
                  </LiquidGlass>
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
              <View className="mb-6 h-32 w-32 items-center justify-center">
                <View
                  className={`h-24 w-24 items-center justify-center rounded-full border border-border ${
                    callState === 'RINGING' || callState === 'OUTGOING'
                      ? 'bg-surface2'
                      : 'bg-accent'
                  }`}
                >
                  <Phone
                    size={36}
                    color={
                      callState === 'RINGING' || callState === 'OUTGOING' ? t.text : t.onAccent
                    }
                  />
                </View>
              </View>

              {/* Equalizer bars when connected */}
              {(callState === 'CONNECTED' || callState === 'FALLBACK') && (
                <View className="h-10 flex-row items-end justify-center gap-1.5">
                  {[40, 90, 60, 100, 50, 80].map((h, i) => (
                    <View
                      key={i}
                      style={{ height: `${h}%` }}
                      className="w-1 rounded-full bg-accent"
                    />
                  ))}
                </View>
              )}
            </View>

            {/* Dialogue box */}
            {(callState === 'CONNECTED' || callState === 'FALLBACK') && (
              <View className="my-2 w-full max-w-sm rounded-3xl border border-border bg-surface p-6">
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
                        className="w-full flex-row items-center justify-between rounded-2xl border border-border bg-surface px-5 py-3.5"
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

            {/* Action buttons */}
            <View className="mb-8 w-full max-w-xs flex-row justify-center gap-6">
              {callState === 'RINGING' ? (
                <>
                  <Pressable
                    onPress={rejectCall}
                    className="h-16 w-16 items-center justify-center rounded-full border border-border bg-surface2"
                  >
                    <PhoneOff size={28} color={t.text} />
                  </Pressable>
                  <Pressable
                    onPress={answerCall}
                    className="h-16 w-16 items-center justify-center rounded-full bg-surface2"
                  >
                    <Phone size={28} color={t.text} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={endCall}
                  className="h-16 w-16 items-center justify-center rounded-full bg-surface2"
                >
                  <PhoneOff size={28} color={t.text} />
                </Pressable>
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
                <View className="mx-auto h-1.5 w-12 rounded-full bg-surface2" />
                <View className="flex-row items-center justify-between">
                  <Text className="font-display text-2xl font-bold text-text">
                    Programar Visita
                  </Text>
                  <Pressable
                    onPress={closeVisitaModal}
                    className="h-10 w-10 items-center justify-center rounded-full bg-surface"
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
                      className="rounded-2xl border border-border bg-surface px-5 py-4 text-text"
                    />
                  </View>

                  <View className="flex-row gap-4">
                    <View className="flex-1 gap-2">
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
                              className={`flex-1 items-center rounded-2xl border px-2 py-3 ${
                                active ? 'border-border bg-surface2' : 'border-border bg-surface'
                              }`}
                            >
                              <Text
                                className={`text-[11px] font-bold text-text ${
                                  active ? '' : 'opacity-60'
                                }`}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>

                  {visitaVehiculo !== 'NINGUNO' && (
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
                        className="rounded-2xl border border-border bg-surface px-5 py-4 text-text"
                      />
                    </View>
                  )}

                  <View className="flex-row items-center gap-4 rounded-2xl border border-border bg-surface2 p-4">
                    <Info size={20} color={t.accent} />
                    <Text className="flex-1 text-[10px] font-medium leading-relaxed text-text">
                      Al activar el parqueadero, se reservará un cupo automáticamente por 2 horas
                      desde la llegada.
                    </Text>
                  </View>

                  <Pressable
                    onPress={submitVisita}
                    disabled={savingVisita}
                    style={{ opacity: savingVisita ? 0.6 : 1 }}
                    className="mt-4 items-center justify-center rounded-2xl bg-accent py-5"
                  >
                    {savingVisita ? (
                      <ActivityIndicator color={t.onAccent} />
                    ) : (
                      <Text className="text-base font-black text-on-accent">PROGRAMAR AHORA</Text>
                    )}
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
