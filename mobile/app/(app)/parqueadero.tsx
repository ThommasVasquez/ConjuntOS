/**
 * PARQUEADERO - CONJUNTOSAPP (mobile port)
 * Hub de parqueadero del residente. Ported from web
 * src/app/(app)/parqueadero/page.tsx. Behavior preserved (money-touching —
 * UI copy mirrors web strings exactly):
 *  - GET /parqueadero/mio -> { vehiculos, celdas|misCeldas, disponibilidadVisitantes }
 *  - Vehicle registration: POST /vehiculos { placa, marca?, modelo?, color?, tipo }
 *    (same flat CreateVehiculoRequest body web sends; the vehicle is created
 *    immediately and arrives back through useWsSubscription('vehiculo'))
 *  - Tenant approval inbox: GET /parqueadero/solicitudes/mias +
 *    POST /parqueadero/solicitudes/{id}/inquilino/aprobar|rechazar
 *  - Live billing: GET /parqueadero/sesiones/mias with a 1s local ticker
 *    (segundosRestantesGratis / montoActual / tarifaHora / finGratis)
 *  - Charge approvals: GET /parqueadero/cargos/mios +
 *    POST /parqueadero/cargos/{id}/aprobar|rechazar
 *  - Visitor-slot reservations: GET /parqueadero/reservas/disponibilidad,
 *    POST /parqueadero/reservas, GET /parqueadero/reservas/mias,
 *    DELETE /parqueadero/reservas/{id}
 *  - useWsSubscription('vehiculo') + ('parqueadero') silent refetch
 *  - Reglamento modal + CTA to citofonia (VISITAS tab)
 *  - 'Historial de Accesos' modal (mocked rows, verbatim from web)
 */

import { useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import {
  AlertCircle,
  ArrowRight,
  Bike,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Info,
  MapPin,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react-native';

import ProfileHeader from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { GlassCard } from '@/components/ui/GlassCard';
import { toast } from '@/components/ui/toast';
import { HistorialAccesosModal } from '@/components/parqueadero/HistorialAccesosModal';
import { LlegadaPicker } from '@/components/parqueadero/LlegadaPicker';
import { AccentBlob, AccentWash, PingDot, PulseBlock } from '@/components/parqueadero/parts';
import { formatCOP, formatFechaCorta } from '@/components/parqueadero/format';
import { api } from '@/lib/api/client';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { onSemantic, tokensFor } from '@/theme/tokens';
import type {
  CargoParqueaderoDto,
  CeldaDto,
  DisponibilidadCupoDto,
  DisponibilidadVisitantesDto,
  ParqueaderoMioDto,
  ReservaParqueaderoDto,
  SesionCobroDto,
  SolicitudParqueaderoMiaDto,
  VehiculoDto,
} from '@/lib/api/types';

// Colors come exclusively from the design tokens: single unprefixed NativeWind
// classes (`text-accent`, `bg-success`, `border-warning/40`) for anything a
// class can express, and `tokensFor(scheme)` for icon/shadow props. The retired
// #009df2 / #57bf00 / #FACC15 / #EF4444 constants are gone — web paints this
// page with accent / success / warning / danger.

// Vehicle registration posts the same flat CreateVehiculoRequest body as web
// (page.tsx:196): the backend creates the vehicle right away and broadcasts the
// 'vehiculo' WS event this screen already listens to.
type TipoVehiculoRegistro = 'AUTOMOVIL' | 'MOTO' | 'BICICLETA';
/** Form labels → backend TipoVehiculo variants (CARRO/MOTO/BICI). */
const TIPO_VEHICULO_API: Record<TipoVehiculoRegistro, 'CARRO' | 'MOTO' | 'BICI'> = {
  AUTOMOVIL: 'CARRO',
  MOTO: 'MOTO',
  BICICLETA: 'BICI',
};

interface VehiculoForm {
  placa: string;
  marca: string;
  modelo: string;
  color: string;
  tipo: TipoVehiculoRegistro;
}

const EMPTY_VEHICULO_FORM: VehiculoForm = {
  placa: '',
  marca: '',
  modelo: '',
  color: '',
  tipo: 'AUTOMOVIL',
};

// No role gate: web renders /parqueadero for every authenticated role
// (src/lib/permissions.ts does not list it, and page.tsx:78 has no check). A
// HUESPED_TEMPORAL simply gets empty arrays from /parqueadero/mio, exactly as
// on web — so the previous mobile-only GuestGate was drift.
export default function ParqueaderoScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'light' ? 'light' : 'dark';
  const t = tokensFor(scheme);

  const [vehiculos, setVehiculos] = useState<VehiculoDto[]>([]);
  const [misCeldas, setMisCeldas] = useState<CeldaDto[]>([]);
  const [disponibilidad, setDisponibilidad] = useState<DisponibilidadVisitantesDto>({
    total: 0,
    libres: 0,
    ocupadas: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const refetchParking = async () => {
    try {
      const data = await api.get<ParqueaderoMioDto>('/parqueadero/mio');
      setVehiculos(data.vehiculos ?? []);
      setMisCeldas(data.celdas ?? data.misCeldas ?? []);
      setDisponibilidad(data.disponibilidadVisitantes ?? { total: 0, libres: 0, ocupadas: 0 });
    } catch {
      /* silencioso */
    }
  };

  // Bandeja del inquilino: asignaciones de parqueadero de visitante que ESTE
  // residente debe aprobar o rechazar (consentimiento expreso).
  const [solicitudesInquilino, setSolicitudesInquilino] = useState<SolicitudParqueaderoMiaDto[]>(
    [],
  );
  const [busyAprob, setBusyAprob] = useState<string | null>(null);
  // Sesiones de cobro activas del residente (conteo regresivo en vivo).
  const [sesionesCobro, setSesionesCobro] = useState<SesionCobroDto[]>([]);
  // Cargos al apto PENDIENTES de aprobación de ESTE residente (con el monto).
  const [cargosPendientes, setCargosPendientes] = useState<CargoParqueaderoDto[]>([]);

  const refetchSolicitudes = async () => {
    try {
      const data = await api.get<SolicitudParqueaderoMiaDto[]>('/parqueadero/solicitudes/mias');
      setSolicitudesInquilino(data ?? []);
    } catch {
      /* no aplica / sin permiso */
    }
  };

  const refetchSesiones = async () => {
    try {
      const data = await api.get<SesionCobroDto[]>('/parqueadero/sesiones/mias');
      setSesionesCobro(data ?? []);
    } catch {
      /* no aplica */
    }
  };

  const refetchCargos = async () => {
    try {
      const data = await api.get<CargoParqueaderoDto[]>('/parqueadero/cargos/mios');
      setCargosPendientes(data ?? []);
    } catch {
      /* no aplica */
    }
  };

  // Reservas de cupo de visitante hechas por este residente (con antelación).
  const [misReservas, setMisReservas] = useState<ReservaParqueaderoDto[]>([]);
  const [showReservaModal, setShowReservaModal] = useState(false);
  const [busyReserva, setBusyReserva] = useState<string | null>(null);

  const refetchReservas = async () => {
    try {
      const data = await api.get<ReservaParqueaderoDto[]>('/parqueadero/reservas/mias');
      setMisReservas(data ?? []);
    } catch {
      /* no aplica */
    }
  };

  const cancelarReserva = async (id: string) => {
    setBusyReserva(id);
    try {
      await api.delete(`/parqueadero/reservas/${id}`);
      toast.success('Reserva cancelada.');
      void refetchReservas();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : '') || 'No se pudo cancelar');
    } finally {
      setBusyReserva(null);
    }
  };

  const resolverCargo = async (id: string, accion: 'aprobar' | 'rechazar') => {
    setBusyAprob(id);
    try {
      await api.post(`/parqueadero/cargos/${id}/${accion}`, {});
      toast.success(
        accion === 'aprobar'
          ? 'Cargo aprobado. Se agregó a tus pagos pendientes.'
          : 'Cargo rechazado. Quedó registrado como disputa.',
      );
      void refetchCargos();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : '') || 'No se pudo procesar');
    } finally {
      setBusyAprob(null);
    }
  };

  const resolverSolicitud = async (id: string, accion: 'aprobar' | 'rechazar') => {
    setBusyAprob(id);
    try {
      await api.post(`/parqueadero/solicitudes/${id}/inquilino/${accion}`, {});
      toast.success(
        accion === 'aprobar' ? 'Parqueadero de visitante aprobado.' : 'Solicitud rechazada.',
      );
      void refetchSolicitudes();
      void refetchParking();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : '') || 'No se pudo procesar');
    } finally {
      setBusyAprob(null);
    }
  };

  // Real-time WebSocket subscriptions
  useWsSubscription('vehiculo', () => void refetchParking());
  useWsSubscription('parqueadero', () => {
    void refetchParking();
    void refetchSolicitudes();
    void refetchSesiones();
    void refetchCargos();
    void refetchReservas();
  });

  // Modal y Forms
  const [showVehiculoModal, setShowVehiculoModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vehiculoForm, setVehiculoForm] = useState<VehiculoForm>(EMPTY_VEHICULO_FORM);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [showReglamentoModal, setShowReglamentoModal] = useState(false);

  const submitVehiculo = async () => {
    if (!vehiculoForm.placa || !vehiculoForm.marca) {
      toast.error('Llena placa y marca al menos');
      return;
    }
    setIsSubmitting(true);
    try {
      // Flat CreateVehiculoRequest, byte-for-byte web's body (page.tsx:196).
      await api.post('/vehiculos', {
        placa: vehiculoForm.placa,
        marca: vehiculoForm.marca || undefined,
        modelo: vehiculoForm.modelo || undefined,
        color: vehiculoForm.color || undefined,
        tipo: TIPO_VEHICULO_API[vehiculoForm.tipo],
      });
      toast.success('Solicitud enviada. Pendiente de aprobación.');
      setShowVehiculoModal(false);
      setVehiculoForm(EMPTY_VEHICULO_FORM);
    } catch {
      toast.error('Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const data = await api.get<ParqueaderoMioDto>('/parqueadero/mio');
        if (cancelled) return;
        setVehiculos(data.vehiculos ?? []);
        setMisCeldas(data.celdas ?? data.misCeldas ?? []);
        setDisponibilidad(data.disponibilidadVisitantes ?? { total: 0, libres: 0, ocupadas: 0 });
      } catch (error) {
        console.error('Error fetching parking data', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchData();
    void refetchSolicitudes();
    void refetchSesiones();
    void refetchCargos();
    void refetchReservas();
    return () => {
      cancelled = true;
    };
    // Mount-only, igual que el useEffect de web (page.tsx:207-230).
  }, []);

  const reservasVigentes = misReservas.filter(
    (r) => r.estado === 'PENDIENTE' || r.estado === 'LLEGO',
  );

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-8 px-6 pt-4">
        <ProfileHeader />

        {/* BANDEJA: aprobaciones de parqueadero de visitante (inquilino) */}
        {solicitudesInquilino.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(500)} className="flex flex-col gap-3">
            <View className="flex-row items-center gap-2 px-1">
              <PingDot tone="warning" />
              <Text className="text-base font-bold tracking-tight text-text">
                Aprobaciones pendientes
              </Text>
            </View>
            <Text className="px-1 text-xs text-textMuted">
              Te solicitan asignarte un parqueadero de visitante. Tu aprobación es obligatoria.
            </Text>
            {solicitudesInquilino.map((s) => (
              <GlassCard key={s.id} className="rounded-[28px] border border-warning/40 p-5">
                <View className="flex flex-col gap-1">
                  <Text className="text-lg font-bold text-text">Celda {s.celdaNumero}</Text>
                  <Text className="text-xs text-textMuted">{s.detalle}</Text>
                  <Text className="mt-1 text-[11px] text-textMuted">
                    Solicitado por {s.solicitanteNombre}
                  </Text>
                </View>
                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    disabled={busyAprob === s.id}
                    onPress={() => void resolverSolicitud(s.id, 'rechazar')}
                    style={({ pressed }) => ({
                      opacity: busyAprob === s.id ? 0.5 : pressed ? 0.85 : 1,
                    })}
                    className="flex-1 items-center rounded-2xl border border-border bg-surface2 py-3"
                  >
                    <Text className="text-sm font-bold text-text">Rechazar</Text>
                  </Pressable>
                  <Pressable
                    disabled={busyAprob === s.id}
                    onPress={() => void resolverSolicitud(s.id, 'aprobar')}
                    style={({ pressed }) => ({
                      opacity: busyAprob === s.id ? 0.5 : pressed ? 0.85 : 1,
                      // web: shadow-xl shadow-success/20 (page.tsx:269)
                      shadowColor: t.success,
                      shadowOpacity: 0.2,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 8 },
                      elevation: 6,
                    })}
                    className="flex-1 items-center rounded-2xl bg-success py-3"
                  >
                    <Text className="text-sm font-bold" style={{ color: onSemantic(scheme) }}>
                      {busyAprob === s.id ? 'Procesando...' : 'Aprobar'}
                    </Text>
                  </Pressable>
                </View>
              </GlassCard>
            ))}
          </Animated.View>
        ) : null}

        {/* SESIONES DE COBRO ACTIVAS: conteo regresivo en vivo */}
        {sesionesCobro.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(500)} className="flex flex-col gap-3">
            <View className="flex-row items-center gap-2 px-1">
              <Clock size={16} color={t.success} />
              <Text className="text-base font-bold tracking-tight text-text">
                Parqueadero de visitante
              </Text>
            </View>
            {sesionesCobro.map((s) => (
              <CuentaRegresivaCard key={s.id} sesion={s} />
            ))}
          </Animated.View>
        ) : null}

        {/* BANDEJA: cargos al apto PENDIENTES de aprobación (informa el monto) */}
        {cargosPendientes.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(500)} className="flex flex-col gap-3">
            <View className="flex-row items-center gap-2 px-1">
              <PingDot tone="danger" />
              <Text className="text-base font-bold tracking-tight text-text">
                Cobros por aprobar
              </Text>
            </View>
            <Text className="px-1 text-xs text-textMuted">
              Tu visita superó las 2h gratis. Aprueba para cargar el cobro a tu apartamento o
              recházalo.
            </Text>
            {cargosPendientes.map((c) => (
              <GlassCard key={c.id} className="rounded-[28px] border border-danger/40 p-5">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex flex-col gap-1">
                    <Text className="text-lg font-bold text-text">Celda {c.celdaNumero}</Text>
                    {c.placa ? (
                      <Text className="font-mono text-xs text-textMuted">Placa {c.placa}</Text>
                    ) : null}
                    <Text className="mt-1 text-[11px] text-textMuted">
                      {c.minutosCobrados} min cobrables ·{' '}
                      {c.cerradoEn ? formatFechaCorta(c.cerradoEn) : ''}
                    </Text>
                  </View>
                  <View className="shrink-0 flex-col items-end">
                    <Text className="text-[10px] font-bold uppercase tracking-wider text-textMuted">
                      Monto
                    </Text>
                    <Text className="text-2xl font-bold text-warning">
                      ${formatCOP(Number(c.montoFinal || c.montoActual || 0))}
                    </Text>
                  </View>
                </View>
                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    disabled={busyAprob === c.id}
                    onPress={() => void resolverCargo(c.id, 'rechazar')}
                    style={({ pressed }) => ({
                      opacity: busyAprob === c.id ? 0.5 : pressed ? 0.85 : 1,
                    })}
                    className="flex-1 items-center rounded-2xl border border-border bg-surface2 py-3"
                  >
                    <Text className="text-sm font-bold text-text">Rechazar</Text>
                  </Pressable>
                  <Pressable
                    disabled={busyAprob === c.id}
                    onPress={() => void resolverCargo(c.id, 'aprobar')}
                    style={({ pressed }) => ({
                      opacity: busyAprob === c.id ? 0.5 : pressed ? 0.85 : 1,
                      // web: shadow-xl shadow-success/20 (page.tsx:337)
                      shadowColor: t.success,
                      shadowOpacity: 0.2,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 8 },
                      elevation: 6,
                    })}
                    className="flex-1 items-center rounded-2xl bg-success py-3"
                  >
                    <Text className="text-sm font-bold" style={{ color: onSemantic(scheme) }}>
                      {busyAprob === c.id ? 'Procesando...' : 'Aprobar cobro'}
                    </Text>
                  </Pressable>
                </View>
              </GlassCard>
            ))}
          </Animated.View>
        ) : null}

        {/* STATUS OVERVIEW */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)} className="flex-row gap-4">
          <GlassCard className="flex-1 rounded-[32px] p-5">
            <View className="flex-row items-center justify-between">
              <View className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2">
                <Car size={18} color={t.text} />
              </View>
              <View className="rounded-full border border-border bg-surface2 px-2.5 py-1">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                  Mis Celdas
                </Text>
              </View>
            </View>
            <View className="mt-3">
              <Text className="text-2xl font-bold tracking-tight text-text">
                {misCeldas[0]?.numero || 'N/A'}
              </Text>
              <Text className="text-[10px] font-bold uppercase tracking-wider text-textMuted">
                Torre {misCeldas[0]?.torre || '1'}
              </Text>
            </View>
          </GlassCard>

          <GlassCard
            className="flex-1 rounded-[32px] border border-accent/40 p-5"
            onPress={() => setShowReservaModal(true)}
          >
            <View className="flex-row items-center justify-between">
              <View className="h-10 w-10 items-center justify-center rounded-full border border-accent/40 bg-accent/20">
                <MapPin size={18} color={t.accent} />
              </View>
              <View className="rounded-full border border-border px-2.5 py-1">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                  Visitantes
                </Text>
              </View>
            </View>
            <View className="mt-3">
              <Text className="text-2xl font-bold tracking-tight text-text">
                {disponibilidad.libres} / {disponibilidad.total}
              </Text>
              <Text className="text-[10px] font-bold uppercase tracking-wider text-textMuted">
                Disponibles ahora
              </Text>
            </View>
            <View className="mt-1 flex-row items-center gap-1.5">
              <Clock size={13} color={t.accent} />
              <Text className="text-[11px] font-bold text-accent">Reservar cupo →</Text>
            </View>
          </GlassCard>
        </Animated.View>

        {/* MIS RESERVAS DE CUPO DE VISITANTE */}
        {reservasVigentes.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(500)} className="flex flex-col gap-3">
            <View className="flex-row items-center justify-between px-1">
              <Text className="text-base font-bold tracking-tight text-text">
                Mis reservas de visitante
              </Text>
              <Pressable
                onPress={() => setShowReservaModal(true)}
                className="flex-row items-center gap-1"
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <Plus size={13} color={t.accent} strokeWidth={3} />
                <Text className="text-[11px] font-bold text-accent">Nueva</Text>
              </Pressable>
            </View>
            {reservasVigentes.map((r) => (
              <GlassCard key={r.id} className="rounded-[28px] border border-accent/30 p-5">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex flex-col gap-1">
                    <View className="flex-row items-center gap-2">
                      {r.categoria === 'MOTO' ? (
                        <Bike size={16} color={t.accent} />
                      ) : (
                        <Car size={16} color={t.accent} />
                      )}
                      <Text className="text-sm font-bold text-text">
                        {r.categoria === 'MOTO' ? 'Moto' : r.categoria === 'BICI' ? 'Bici' : 'Carro'}
                      </Text>
                      {r.estado === 'LLEGO' ? (
                        <View className="rounded-full bg-success/15 px-2 py-0.5">
                          <Text className="text-[9px] font-black uppercase tracking-wider text-success">
                            Llegó
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {r.visitanteNombre ? (
                      <Text className="text-xs text-textMuted">{r.visitanteNombre}</Text>
                    ) : null}
                    {r.placa ? (
                      <Text className="font-mono text-[11px] text-textMuted">Placa {r.placa}</Text>
                    ) : null}
                  </View>
                  <View className="shrink-0 flex-col items-end">
                    <Text className="text-[10px] font-bold uppercase tracking-wider text-textMuted">
                      Llegada
                    </Text>
                    <Text className="text-sm font-bold text-text">
                      {formatFechaCorta(r.llegadaEstimada)}
                    </Text>
                    <Text className="mt-0.5 text-[11px] text-textMuted">
                      {r.tiempoLibre ? 'Tiempo libre' : `~${r.duracionMinutos} min`}
                    </Text>
                  </View>
                </View>
                {r.estado === 'PENDIENTE' ? (
                  <Pressable
                    disabled={busyReserva === r.id}
                    onPress={() => void cancelarReserva(r.id)}
                    style={({ pressed }) => ({
                      opacity: busyReserva === r.id ? 0.5 : pressed ? 0.85 : 1,
                    })}
                    className="mt-3 w-full items-center rounded-2xl border border-border bg-surface2 py-2.5"
                  >
                    <Text className="text-xs font-bold text-text">
                      {busyReserva === r.id ? 'Cancelando...' : 'Cancelar reserva'}
                    </Text>
                  </Pressable>
                ) : null}
              </GlassCard>
            ))}
          </Animated.View>
        ) : null}

        {/* MY VEHICLES */}
        <Animated.View entering={FadeInDown.delay(160).duration(500)} className="flex flex-col gap-5">
          <View className="flex-row items-end justify-between px-1">
            <Text className="text-xl font-bold tracking-tight text-text">Mis Vehículos</Text>
            <Pressable
              onPress={() => setShowVehiculoModal(true)}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2"
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
              <Plus size={20} color={t.accent} strokeWidth={3} />
            </Pressable>
          </View>

          {isLoading ? (
            /* web: los placeholders viven en el MISMO carril horizontal que las
               tarjetas (`flex gap-4 overflow-x-auto -mx-6 px-6 py-2`, page.tsx:446). */
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-6"
              contentContainerStyle={{ paddingHorizontal: 24, gap: 16, paddingVertical: 8 }}
            >
              {[1, 2].map((i) => (
                <PulseBlock
                  key={i}
                  className="h-[160px] w-[280px] rounded-[32px] border border-border"
                />
              ))}
            </ScrollView>
          ) : vehiculos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-6"
              contentContainerStyle={{ paddingHorizontal: 24, gap: 16, paddingVertical: 8 }}
            >
              {vehiculos.map((v) => (
                <GlassCard key={v.id} className="w-[280px] rounded-[40px] p-6">
                  {/* web: absolute -right-4 -top-4 w-32 h-32 bg-accent/10 blur-2xl (page.tsx:454) */}
                  <AccentBlob />
                  <View className="mb-6 flex-row items-start justify-between">
                    <View className="rounded-2xl border border-border bg-surface2 p-3">
                      {v.tipo === 'CARRO' ? (
                        <Car size={24} color={t.text} />
                      ) : (
                        <Bike size={24} color={t.text} />
                      )}
                    </View>
                    <View className="flex-col items-end">
                      <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-textMuted">
                        Placa
                      </Text>
                      <Text className="text-xl font-bold tracking-widest text-text">
                        {v.placa}
                      </Text>
                    </View>
                  </View>
                  <View className="flex flex-col gap-1">
                    <Text className="text-lg font-bold tracking-tight text-text">{v.marca}</Text>
                    <Text className="text-xs text-textMuted">
                      {v.modelo} • {v.color}
                    </Text>
                  </View>
                </GlassCard>
              ))}
            </ScrollView>
          ) : (
            <GlassCard
              className="w-full rounded-[32px] p-10"
              style={{ borderWidth: 1, borderColor: t.border, borderStyle: 'dashed' }}
            >
              <View className="items-center justify-center">
                <Car size={40} color={t.text} />
                <Text className="mt-4 text-center text-sm font-medium text-text">
                  No tienes vehículos registrados.
                </Text>
                <Pressable
                  onPress={() => setShowVehiculoModal(true)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                >
                  <Text className="mt-4 text-xs font-bold uppercase tracking-widest text-accent">
                    Registrar ahora
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          )}
        </Animated.View>

        {/* QUICK ACTIONS */}
        <Animated.View entering={FadeInDown.delay(240).duration(500)} className="flex flex-col gap-4">
          <Text className="px-1 text-lg font-bold tracking-tight text-text">Acciones Rápidas</Text>

          <View className="flex flex-col gap-3">
            <GlassCard className="rounded-3xl p-4" onPress={() => setShowVehiculoModal(true)}>
              <View className="flex-row items-center gap-4">
                <View className="rounded-2xl border border-border bg-surface2 p-3">
                  <ShieldCheck size={20} color={t.text} />
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 text-sm font-bold leading-none text-text">
                    Registrar Nuevo Vehículo
                  </Text>
                  <Text className="text-[11px] text-textMuted">Notificar a portería</Text>
                </View>
                <ChevronRight size={16} color={t.text} />
              </View>
            </GlassCard>

            <GlassCard className="rounded-3xl p-4" onPress={() => setShowHistorialModal(true)}>
              <View className="flex-row items-center gap-4">
                <View className="rounded-2xl border border-border bg-surface2 p-3">
                  <Clock size={20} color={t.text} />
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 text-sm font-bold leading-none text-text">
                    Historial de Accesos
                  </Text>
                  <Text className="text-[11px] text-textMuted">
                    Ver registros de entrada y salida
                  </Text>
                </View>
                <ChevronRight size={16} color={t.text} />
              </View>
            </GlassCard>

            <GlassCard className="rounded-3xl p-4" onPress={() => setShowReglamentoModal(true)}>
              <View className="flex-row items-center gap-4">
                <View className="rounded-2xl border border-border bg-surface2 p-3">
                  <FileText size={20} color={t.text} />
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 text-sm font-bold leading-none text-text">
                    Reglamento Completo
                  </Text>
                  <Text className="text-[11px] text-textMuted">Normas y sanciones de parqueo</Text>
                </View>
                <ChevronRight size={16} color={t.text} />
              </View>
            </GlassCard>
          </View>
        </Animated.View>

        {/* RULES & INFO */}
        <Animated.View entering={FadeInDown.delay(320).duration(500)}>
          <GlassCard className="rounded-[40px] p-8">
            {/* web: bg-linear-to-br from-accent/5 to-transparent wash (page.tsx:525) */}
            <AccentWash accent={t.accent} />
            <View className="mb-6 flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-accent/20">
                <Info size={18} color={t.accent} />
              </View>
              <View>
                <Text className="text-lg font-bold tracking-tight text-text">Reglamento</Text>
                <Text className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
                  Normas de Convivencia
                </Text>
              </View>
            </View>

            <View className="mb-8 flex flex-col gap-4">
              {[
                'Velocidad máxima de 10 km/h en sótanos.',
                'Uso obligatorio de luces encendidas.',
                'Multas por mal parqueo después del 3er aviso.',
                'Parqueadero de visitantes limitado a 12h.',
              ].map((rule, i) => (
                <View key={i} className="flex-row items-start gap-4">
                  <View className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent/40" />
                  <Text className="flex-1 text-sm leading-relaxed text-text">{rule}</Text>
                </View>
              ))}
            </View>

            <Pressable
              onPress={() => router.push('/citofonia?tab=VISITAS' as never)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.9 : 1,
                // web: shadow-[0_10px_25px_rgba(0,0,0,0.3)] (page.tsx:553)
                shadowColor: '#000000',
                shadowOpacity: 0.3,
                shadowRadius: 12.5,
                shadowOffset: { width: 0, height: 10 },
                elevation: 8,
              })}
              className="w-full flex-row items-center justify-center gap-3 rounded-2xl bg-accent py-4"
            >
              <Text className="text-sm font-bold text-onAccent">Pedir Parqueo para Visita</Text>
              <ArrowRight size={18} color={t.onAccent} />
            </Pressable>
          </GlassCard>
        </Animated.View>
      </View>

      {/* MODAL HISTORIAL DE ACCESOS */}
      <HistorialAccesosModal
        open={showHistorialModal}
        onClose={() => setShowHistorialModal(false)}
      />

      {/* MODAL REGLAMENTO COMPLETO */}
      <ReglamentoModal open={showReglamentoModal} onClose={() => setShowReglamentoModal(false)} />

      {/* MODAL NUEVO VEHICULO */}
      <VehiculoModal
        open={showVehiculoModal}
        isSubmitting={isSubmitting}
        form={vehiculoForm}
        onChange={setVehiculoForm}
        onClose={() => setShowVehiculoModal(false)}
        onSubmit={() => void submitVehiculo()}
      />

      {/* MODAL: RESERVAR CUPO DE VISITANTE */}
      {showReservaModal ? (
        <ReservaCupoModal
          onClose={() => setShowReservaModal(false)}
          onCreated={() => {
            setShowReservaModal(false);
            void refetchReservas();
          }}
        />
      ) : null}
    </Screen>
  );
}

/// Tarjeta de sesión de parqueadero de visitante con conteo regresivo en vivo.
/// Tras las 2h gratis muestra el cobro acumulado prorrateado por minuto.
function CuentaRegresivaCard({ sesion }: { sesion: SesionCobroDto }) {
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');
  // Reloj local: arranca desde los segundos que envió el backend y descuenta.
  const [segGratis, setSegGratis] = useState<number>(sesion.segundosRestantesGratis ?? 0);
  const [montoVivo, setMontoVivo] = useState<number>(Number(sesion.montoActual ?? 0));

  useEffect(() => {
    setSegGratis(sesion.segundosRestantesGratis ?? 0);
    setMontoVivo(Number(sesion.montoActual ?? 0));
  }, [sesion.segundosRestantesGratis, sesion.montoActual]);

  useEffect(() => {
    const tarifaMin = Number(sesion.tarifaHora ?? 3000) / 60;
    const finGratis = new Date(sesion.finGratis).getTime();
    const id = setInterval(() => {
      const ahora = Date.now();
      const restante = Math.max(0, Math.floor((finGratis - ahora) / 1000));
      setSegGratis(restante);
      if (restante === 0) {
        const minCobrables = Math.max(0, Math.floor((ahora - finGratis) / 60000));
        setMontoVivo(Math.round(minCobrables * tarifaMin));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sesion.finGratis, sesion.tarifaHora]);

  const enCobro = segGratis === 0;
  const hh = Math.floor(segGratis / 3600);
  const mm = Math.floor((segGratis % 3600) / 60);
  const ss = segGratis % 60;
  const fmt = (n: number) => String(n).padStart(2, '0');
  const avisoPronto = !enCobro && segGratis <= 20 * 60;

  // web: border-warning/50 (en cobro) · border-warning/40 (aviso) · border-success/40
  const borderClass = enCobro
    ? 'border border-warning/50'
    : avisoPronto
      ? 'border border-warning/40'
      : 'border border-success/40';

  return (
    <GlassCard className={`rounded-[28px] p-5 ${borderClass}`}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center gap-2">
          <Clock size={16} color={enCobro ? t.warning : t.success} />
          <Text className="text-sm font-bold text-text">Celda {sesion.celdaNumero}</Text>
          {sesion.placa ? (
            <View className="rounded-full border border-border bg-surface2 px-2 py-0.5">
              <Text className="text-[10px] text-textMuted">{sesion.placa}</Text>
            </View>
          ) : null}
        </View>
        <View
          className={
            enCobro ? 'rounded-full bg-warning/15 px-2 py-1' : 'rounded-full bg-success/15 px-2 py-1'
          }
        >
          <Text
            className={
              enCobro
                ? 'text-[9px] font-black uppercase tracking-wider text-warning'
                : 'text-[9px] font-black uppercase tracking-wider text-success'
            }
          >
            {enCobro ? 'En cobro' : 'Gratis'}
          </Text>
        </View>
      </View>

      {!enCobro ? (
        <View className="items-center gap-1 py-2">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
            Tiempo gratis restante
          </Text>
          <Text
            className={avisoPronto ? 'text-4xl font-bold text-warning' : 'text-4xl font-bold text-text'}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {hh > 0 ? `${fmt(hh)}:` : ''}
            {fmt(mm)}:{fmt(ss)}
          </Text>
          {avisoPronto ? (
            <Text className="text-center text-[11px] font-bold text-warning">
              ⚠️ Pronto inicia el cobro de ${formatCOP(Number(sesion.tarifaHora))}/hora
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="items-center gap-1 py-2">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
            Cobro acumulado
          </Text>
          <Text
            className="text-4xl font-bold text-warning"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            ${formatCOP(montoVivo)}
          </Text>
          <Text className="text-center text-[11px] text-textMuted">
            Se cobra ${formatCOP(Number(sesion.tarifaHora))}/hora por minuto, hasta que el vehículo
            salga.
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

// ── Modal: Reglamento Completo ───────────────────────────────────────────────

function ReglamentoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  return (
    <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {/* web: bg-black/90 backdrop-blur-2xl (page.tsx:613) */}
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/90"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(450)}
            className="max-h-[92%] overflow-hidden rounded-t-[48px] border border-border bg-primary"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <View className="flex-row items-center justify-between p-8 pb-4">
              <View className="flex-1 flex-col">
                <Text className="text-2xl font-bold tracking-tight text-text">
                  Reglamento Oficial
                </Text>
                <Text className="mt-1 text-[11px] font-black uppercase tracking-[0.2em] text-textMuted">
                  Normas de Parqueo y Movilidad v2.1
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                className="h-12 w-12 items-center justify-center rounded-full bg-surface2"
              >
                <X size={20} color={t.text} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 32, paddingBottom: 24, gap: 24 }}
            >
              <View className="gap-4 border-b border-border pb-4">
                {/* web: cada h4 lleva un punto `w-1.5 h-1.5 rounded-full bg-text/10`
                    antes del título (page.tsx:629, :638, :657, :669). */}
                <View className="flex-row items-center gap-2">
                  <View className="h-1.5 w-1.5 rounded-full bg-text/10" />
                  <Text className="text-sm font-black uppercase tracking-[0.15em] text-text">
                    I. Disposiciones Generales
                  </Text>
                </View>
                <Text className="text-sm leading-relaxed text-text">
                  El uso de las zonas de parqueo está restringido exclusivamente a los vehículos
                  registrados y vinculados a las unidades residenciales. Queda prohibido el
                  estacionamiento de vehículos no autorizados en celdas privadas.
                </Text>
              </View>

              <View className="gap-4 border-b border-border pb-4">
                <View className="flex-row items-center gap-2">
                  <View className="h-1.5 w-1.5 rounded-full bg-text/10" />
                  <Text className="text-sm font-black uppercase tracking-[0.15em] text-text">
                    II. Velocidad y Seguridad
                  </Text>
                </View>
                <View className="gap-3">
                  {[
                    'Velocidad máxima de 10 km/h en todos los sótanos y áreas comunes.',
                    'Uso obligatorio de luces bajas en todo momento dentro del parqueadero.',
                    "Respetar las señales de 'Pare' y los sentidos de circulación vial.",
                    'Los menores de edad no podrán conducir vehículos dentro del conjunto.',
                  ].map((item, i) => (
                    <View key={i} className="flex-row gap-3">
                      <Text className="shrink-0 font-bold text-text">•</Text>
                      <Text className="flex-1 text-sm text-text">{item}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className="gap-4 border-b border-border pb-4">
                <View className="flex-row items-center gap-2">
                  <View className="h-1.5 w-1.5 rounded-full bg-text/10" />
                  <Text className="text-sm font-black uppercase tracking-[0.15em] text-text">
                    III. Parqueo de Visitantes
                  </Text>
                </View>
                <Text className="text-sm leading-relaxed text-text">
                  Los visitantes tienen derecho a un maximum de 12 horas continuas de parqueo
                  gratuito. A partir de la hora 13, se aplicará el cobro de la tarifa vigente
                  establecida por la asamblea.
                </Text>
                <View className="rounded-2xl border border-border bg-surface2 p-3">
                  <Text className="text-[11px] font-bold italic text-text">
                    * El mal uso de las celdas de visitantes (parqueo recurrente) será causal de
                    sanción administrativa.
                  </Text>
                </View>
              </View>

              <View className="gap-4">
                <View className="flex-row items-center gap-2">
                  <View className="h-1.5 w-1.5 rounded-full bg-text/10" />
                  <Text className="text-sm font-black uppercase tracking-[0.15em] text-text">
                    IV. Sanciones Económicas
                  </Text>
                </View>
                <Text className="text-sm leading-relaxed text-text">
                  El incumplimiento de las normas anteriores generará sanciones que van desde el
                  20% hasta el 100% de la cuota de administración ordinaria, según la gravedad de
                  la falta.
                </Text>
              </View>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                className="mt-2 w-full items-center rounded-[28px] border border-border bg-surface2 py-5"
              >
                <Text className="font-bold text-text">He leído y acepto el reglamento</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ── Modal: Añadir Vehículo ───────────────────────────────────────────────────

const TIPO_VEHICULO_OPTS: Array<{ v: TipoVehiculoRegistro; l: string }> = [
  { v: 'AUTOMOVIL', l: 'Automóvil' },
  { v: 'MOTO', l: 'Motocicleta' },
  { v: 'BICICLETA', l: 'Bicicleta / Patineta' },
];

interface VehiculoModalProps {
  open: boolean;
  isSubmitting: boolean;
  form: VehiculoForm;
  onChange: (next: VehiculoForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function VehiculoModal({ open, isSubmitting, form, onChange, onClose, onSubmit }: VehiculoModalProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'light' ? 'light' : 'dark';
  const t = tokensFor(scheme);

  return (
    <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/60"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(400)}
            className="overflow-hidden rounded-t-[32px] border-t border-border bg-primary"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24, gap: 16 }}
            >
              <View className="flex-row items-center justify-between border-b border-border pb-4">
                <View>
                  <Text className="text-xl font-semibold tracking-wide text-text">
                    Añadir Vehículo
                  </Text>
                  <Text className="mt-1 text-xs text-textMuted">
                    Registrar para acceso vehicular
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  className="h-8 w-8 items-center justify-center rounded-full bg-surface2"
                >
                  <X size={16} color={t.text} />
                </Pressable>
              </View>

              <TextInput
                placeholder="Placa (ej. XYZ-123)"
                placeholderTextColor={t.textMuted}
                autoCapitalize="characters"
                value={form.placa}
                onChangeText={(v) => onChange({ ...form, placa: v.toUpperCase() })}
                editable={!isSubmitting}
                className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3.5 text-text"
              />
              <View className="flex-row gap-4">
                <TextInput
                  placeholder="Marca (BMW)"
                  placeholderTextColor={t.textMuted}
                  value={form.marca}
                  onChangeText={(v) => onChange({ ...form, marca: v })}
                  editable={!isSubmitting}
                  className="flex-1 rounded-2xl border border-border bg-surface2 px-4 py-3.5 text-text"
                />
                <TextInput
                  placeholder="Gris Claro"
                  placeholderTextColor={t.textMuted}
                  value={form.color}
                  onChangeText={(v) => onChange({ ...form, color: v })}
                  editable={!isSubmitting}
                  className="flex-1 rounded-2xl border border-border bg-surface2 px-4 py-3.5 text-text"
                />
              </View>

              {/* Tipo (web <select>: Automóvil / Motocicleta / Bicicleta / Patineta) */}
              <View className="flex-row flex-wrap gap-2">
                {TIPO_VEHICULO_OPTS.map((opt) => {
                  const selected = form.tipo === opt.v;
                  return (
                    <Pressable
                      key={opt.v}
                      onPress={() => onChange({ ...form, tipo: opt.v })}
                      className={
                        selected
                          ? 'rounded-2xl border border-accent bg-accent/15 px-4 py-3'
                          : 'rounded-2xl border border-border bg-surface2 px-4 py-3'
                      }
                    >
                      <Text
                        className={
                          selected ? 'text-xs font-bold text-accent' : 'text-xs font-bold text-text'
                        }
                      >
                        {opt.l}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                disabled={isSubmitting}
                onPress={onSubmit}
                style={({ pressed }) => ({
                  opacity: isSubmitting ? 0.5 : pressed ? 0.9 : 1,
                  // web: shadow-xl shadow-success/30 (page.tsx:716)
                  shadowColor: t.success,
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 6,
                })}
                className="mt-2 w-full flex-row items-center justify-center gap-3 rounded-2xl bg-success py-4"
              >
                {isSubmitting ? (
                  <ActivityIndicator color={onSemantic(scheme)} />
                ) : (
                  <ShieldCheck size={20} color={onSemantic(scheme)} />
                )}
                <Text className="font-bold" style={{ color: onSemantic(scheme) }}>
                  {isSubmitting ? 'Enviando...' : 'Pedir Aprobación'}
                </Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ── Modal: Reservar cupo de visitante ────────────────────────────────────────

/// Modal para reservar un cupo de visitante con antelación. Muestra la
/// disponibilidad EN VIVO (por tipo de vehículo + franja) antes de confirmar.
/// El residente reserva un cupo; el vigilante asigna la celda física al llegar.
function ReservaCupoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  // Por defecto: dentro de 1 hora, redondeado (segundos en 0) — igual que web.
  const [llegadaMs, setLlegadaMs] = useState<number | null>(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.getTime();
  });

  const [categoria, setCategoria] = useState<'CARRO' | 'MOTO'>('CARRO');
  // Duración: '30','60','120','240' min, o 'libre' (tiempo libre).
  const [duracion, setDuracion] = useState<string>('120');
  const [visitanteNombre, setVisitanteNombre] = useState('');
  const [placa, setPlaca] = useState('');
  const [disp, setDisp] = useState<DisponibilidadCupoDto | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const duracionMin = duracion === 'libre' ? undefined : Number(duracion);

  // Verifica disponibilidad cada vez que cambian tipo/llegada/duración.
  useEffect(() => {
    let cancel = false;
    const run = async () => {
      // web page.tsx:835 — sin hora de llegada no se consulta disponibilidad.
      if (llegadaMs == null) return;
      setChecking(true);
      try {
        const iso = new Date(llegadaMs).toISOString();
        let qs = `categoria=${categoria}&llegada=${encodeURIComponent(iso)}`;
        if (duracionMin) qs += `&duracionMinutos=${duracionMin}`;
        const data = await api.get<DisponibilidadCupoDto>(
          `/parqueadero/reservas/disponibilidad?${qs}`,
        );
        if (!cancel) setDisp(data);
      } catch {
        if (!cancel) setDisp(null);
      } finally {
        if (!cancel) setChecking(false);
      }
    };
    const timer = setTimeout(() => void run(), 350);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [categoria, llegadaMs, duracionMin]);

  const crear = async () => {
    if (llegadaMs == null) {
      toast.error('Elige la hora de llegada');
      return;
    }
    setSubmitting(true);
    try {
      const iso = new Date(llegadaMs).toISOString();
      await api.post('/parqueadero/reservas', {
        categoria,
        llegadaEstimada: iso,
        duracionMinutos: duracionMin ?? null,
        visitanteNombre: visitanteNombre.trim() || null,
        placa: placa.trim() ? placa.trim().toUpperCase() : null,
      });
      toast.success('Cupo de visitante reservado.');
      onCreated();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : '') || 'No se pudo reservar');
    } finally {
      setSubmitting(false);
    }
  };

  const hayCupo = disp?.hayCupo === true;
  const sinCupo = !!disp && disp.hayCupo === false;

  // web page.tsx:961 — bg-success/10 border-success/40 · bg-danger/10
  // border-danger/40 · bg-text/5 border-border mientras consulta.
  const dispBoxClass = checking
    ? 'border-border bg-surface2'
    : hayCupo
      ? 'border-success/40 bg-success/10'
      : sinCupo
        ? 'border-danger/40 bg-danger/10'
        : 'border-border bg-surface2';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/70"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />
        <Animated.View
          entering={SlideInDown.duration(400)}
          className="max-h-[92%] overflow-hidden rounded-t-[32px] border-t border-border bg-primary"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 24 }}
          >
            <View className="mb-5 flex-row items-center justify-between border-b border-border pb-4">
              <View className="flex-1">
                <Text className="text-xl font-bold tracking-wide text-text">
                  Reservar cupo de visitante
                </Text>
                <Text className="mt-1 text-xs text-textMuted">
                  Aparta un espacio con antelación para tu visita
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-full bg-surface2"
              >
                <X size={16} color={t.text} />
              </Pressable>
            </View>

            {/* Tipo de vehículo */}
            <Text className="px-1 text-[11px] font-bold uppercase tracking-wider text-textMuted">
              Tipo de vehículo
            </Text>
            <View className="mb-4 mt-2 flex-row gap-3">
              {(['CARRO', 'MOTO'] as const).map((tipo) => {
                const selected = categoria === tipo;
                return (
                  <Pressable
                    key={tipo}
                    onPress={() => setCategoria(tipo)}
                    className={
                      selected
                        ? 'flex-1 items-center gap-2 rounded-2xl border border-accent bg-accent/15 py-4'
                        : 'flex-1 items-center gap-2 rounded-2xl border border-border bg-surface2 py-4'
                    }
                  >
                    {tipo === 'CARRO' ? (
                      <Car size={22} color={selected ? t.accent : t.text} />
                    ) : (
                      <Bike size={22} color={selected ? t.accent : t.text} />
                    )}
                    <Text
                      className={
                        selected ? 'text-xs font-bold text-accent' : 'text-xs font-bold text-text'
                      }
                    >
                      {tipo === 'CARRO' ? 'Carro' : 'Moto'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Hora de llegada — día + hora, equivalente al datetime-local web */}
            <Text className="px-1 text-[11px] font-bold uppercase tracking-wider text-textMuted">
              Hora tentativa de llegada
            </Text>
            <View className="mb-4 mt-2">
              <LlegadaPicker valueMs={llegadaMs} onChange={setLlegadaMs} />
            </View>

            {/* Duración */}
            <Text className="px-1 text-[11px] font-bold uppercase tracking-wider text-textMuted">
              Tiempo estimado de estancia
            </Text>
            <View className="mb-4 mt-2 flex-row flex-wrap gap-2">
              {[
                { v: '30', l: '30 min' },
                { v: '60', l: '1 hora' },
                { v: '120', l: '2 horas' },
                { v: '240', l: '4 horas' },
                { v: 'libre', l: 'Tiempo libre' },
              ].map((opt) => {
                const selected = duracion === opt.v;
                return (
                  <Pressable
                    key={opt.v}
                    onPress={() => setDuracion(opt.v)}
                    className={
                      selected
                        ? 'items-center rounded-xl border border-accent bg-accent/15 px-4 py-2.5'
                        : 'items-center rounded-xl border border-border bg-surface2 px-4 py-2.5'
                    }
                    style={{ minWidth: '30%' }}
                  >
                    <Text
                      className={
                        selected ? 'text-xs font-bold text-accent' : 'text-xs font-bold text-text'
                      }
                    >
                      {opt.l}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Datos opcionales de la visita */}
            <View className="mb-4 flex-row gap-3">
              <View className="flex-1">
                <Text className="px-1 text-[11px] font-bold uppercase tracking-wider text-textMuted">
                  Visitante (opcional)
                </Text>
                <TextInput
                  value={visitanteNombre}
                  onChangeText={setVisitanteNombre}
                  placeholder="Nombre"
                  placeholderTextColor={t.textMuted}
                  className="mt-2 w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                />
              </View>
              <View className="flex-1">
                <Text className="px-1 text-[11px] font-bold uppercase tracking-wider text-textMuted">
                  Placa (opcional)
                </Text>
                <TextInput
                  value={placa}
                  onChangeText={(v) => setPlaca(v.toUpperCase())}
                  placeholder="ABC123"
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="characters"
                  className="mt-2 w-full rounded-2xl border border-border bg-surface2 px-4 py-3 font-mono text-sm text-text"
                />
              </View>
            </View>

            {/* Disponibilidad en vivo */}
            <View className={`mb-4 flex-row items-center gap-3 rounded-2xl border p-4 ${dispBoxClass}`}>
              {checking ? (
                <>
                  <Clock size={18} color={t.textMuted} />
                  <Text className="flex-1 text-sm text-textMuted">
                    Consultando disponibilidad...
                  </Text>
                </>
              ) : hayCupo && disp ? (
                <>
                  <CheckCircle2 size={18} color={t.success} />
                  <Text className="flex-1 text-sm text-text">
                    <Text className="font-bold text-success">{disp.libres}</Text>{' '}
                    {disp.libres === 1 ? 'cupo libre' : 'cupos libres'} de{' '}
                    {disp.categoria === 'MOTO' ? 'moto' : 'carro'} en esa franja
                  </Text>
                </>
              ) : sinCupo && disp ? (
                <>
                  <AlertCircle size={18} color={t.danger} />
                  <Text className="flex-1 text-sm text-text">
                    Sin cupos de {disp.categoria === 'MOTO' ? 'moto' : 'carro'} en esa franja.
                    Prueba otra hora.
                  </Text>
                </>
              ) : (
                <Text className="flex-1 text-sm text-textMuted">
                  Elige tipo, hora y duración para ver cupos.
                </Text>
              )}
            </View>

            <Pressable
              disabled={submitting || !hayCupo}
              onPress={() => void crear()}
              style={({ pressed }) => ({
                opacity: submitting || !hayCupo ? 0.4 : pressed ? 0.9 : 1,
                // web: shadow-xl shadow-accent/20 (page.tsx:987)
                shadowColor: t.accent,
                shadowOpacity: 0.2,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 8 },
                elevation: 6,
              })}
              className="w-full items-center rounded-2xl bg-accent py-4"
            >
              {submitting ? (
                <ActivityIndicator color={t.onAccent} />
              ) : (
                <Text className="text-sm font-bold text-onAccent">Reservar cupo</Text>
              )}
            </Pressable>
            <Text className="mt-3 text-center text-[11px] leading-relaxed text-textMuted">
              Reservas un cupo, no una celda específica. El vigilante asignará el espacio cuando tu
              visita llegue.
            </Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
