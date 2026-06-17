/**
 * VISITANTES - CONJUNTOSAPP (mobile port)
 * Gestión de ingresos, generación de pases digitales y control de acceso.
 *
 * Ported from web src/app/(app)/visitantes/page.tsx. Behavior preserved:
 *  - list = GET /comunicaciones -> data.visitas ?? []  (+ silent refetch on WS 'visita')
 *  - create = POST /visitas { nombre, tipo, vehiculoTipo?(omit NINGUNO), placa?, observacion? }
 *  - getVisitStatus client-side day bucketing (ACTIVO / PROGRAMADO / HISTORIAL)
 *  - QR modal subject = lastVisit; Copiar (expo-clipboard) + WhatsApp (Linking)
 *  - QrCode lucide icon is a decorative placeholder (no real QR), matching web.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  MoreHorizontal,
  Plus,
  QrCode,
  Share2,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { GlassCard } from '@/components/ui/GlassCard';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import type {
  ComunicacionesVigilanciaDto,
  TipoVisita,
  TipoVehiculoVisita,
  VisitaDto,
} from '@/lib/api/types';

type VisitStatus = 'ACTIVO' | 'PROGRAMADO' | 'HISTORIAL';

/** Bucket a visit by its calendar day relative to today (ported verbatim). */
function getVisitStatus(visita: VisitaDto): VisitStatus {
  const now = new Date();
  const fecha = new Date(visita.fecha);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const visitDay = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

  if (visitDay > today) return 'PROGRAMADO';
  if (visitDay.getTime() === today.getTime()) return 'ACTIVO';
  return 'HISTORIAL';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatScheduledDate(dateStr: string): string {
  const fecha = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const visitDay = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

  if (visitDay.getTime() === today.getTime()) {
    return `Hoy, ${formatTime(dateStr)}`;
  }
  return (
    fecha.toLocaleDateString('es-CO', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }) + `, ${formatTime(dateStr)}`
  );
}

interface NewVisitForm {
  name: string;
  tipo: TipoVisita;
  vehiculoTipo: TipoVehiculoVisita;
  placa: string;
  observacion: string;
}

const EMPTY_FORM: NewVisitForm = {
  name: '',
  tipo: 'PEATONAL',
  vehiculoTipo: 'NINGUNO',
  placa: '',
  observacion: '',
};

export default function VisitantesScreen() {
  const user = useAuth((s) => s.user);

  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [newVisitForm, setNewVisitForm] = useState<NewVisitForm>(EMPTY_FORM);

  const [visitors, setVisitors] = useState<VisitaDto[]>([]);
  const [lastVisit, setLastVisit] = useState<VisitaDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetchVisitors = async () => {
    try {
      const data = await api.get<ComunicacionesVigilanciaDto>('/comunicaciones');
      setVisitors(data.visitas || []);
    } catch (e) {
      console.error('Error fetching visitors:', e);
    }
  };

  // Real-time: silent refetch + re-group on every visita event.
  useWsSubscription('visita', () => {
    void refetchVisitors();
  });

  // Fetch visitors on mount.
  useEffect(() => {
    let cancelled = false;
    const fetchVisitors = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.get<ComunicacionesVigilanciaDto>('/comunicaciones');
        if (!cancelled) setVisitors(data.visitas || []);
      } catch (e) {
        console.error('Error fetching visitors:', e);
        if (!cancelled) setError('No se pudieron cargar las visitas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchVisitors();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateInvitation = async () => {
    if (!newVisitForm.name) {
      toast.error('Por favor ingresa el nombre del invitado');
      return;
    }
    setSubmitting(true);
    try {
      const newVisit = await api.post<VisitaDto>('/visitas', {
        nombre: newVisitForm.name.trim(),
        tipo: newVisitForm.tipo,
        vehiculoTipo:
          newVisitForm.vehiculoTipo !== 'NINGUNO'
            ? newVisitForm.vehiculoTipo
            : undefined,
        placa: newVisitForm.placa.trim() || undefined,
        observacion: newVisitForm.observacion.trim() || undefined,
      });
      setVisitors((prev) => [newVisit, ...prev]);
      setLastVisit(newVisit);
      setIsQRModalOpen(true);
      toast.success('Visita programada con exito');
      setNewVisitForm(EMPTY_FORM);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Error al crear la invitacion');
    } finally {
      setSubmitting(false);
    }
  };

  // Build the invitation text from the selected visit (ported verbatim).
  const buildInvitationText = (visita: VisitaDto): string => {
    const anfitrion = user?.nombre || 'Tu anfitrión';
    const unidad = [user?.torre && `Torre ${user.torre}`, user?.apto && `Apto ${user.apto}`]
      .filter(Boolean)
      .join(', ');
    const fecha = new Date(visita.fecha).toLocaleString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
    const lines = [
      `🎟️ *Invitación Digital*`,
      ``,
      `Hola ${visita.nombre}, ${anfitrion}${unidad ? ` (${unidad})` : ''} te ha enviado un pase de acceso.`,
      ``,
      `• Invitado: ${visita.nombre}`,
      `• Tipo de pase: ${visita.tipo}`,
      `• Fecha: ${fecha}`,
    ];
    if (visita.placa) lines.push(`• Placa: ${visita.placa}`);
    lines.push(``, `Presenta este mensaje en portería para agilizar tu ingreso. 🛡️`);
    return lines.join('\n');
  };

  const handleShareWhatsApp = async () => {
    if (!lastVisit) return;
    const text = buildInvitationText(lastVisit);
    const encoded = encodeURIComponent(text);
    // Mirror web behavior: wa.me with no destination number opens WhatsApp's
    // contact picker to forward the invitation (and prefills the text).
    const webUrl = `https://wa.me/?text=${encoded}`;
    try {
      await Linking.openURL(webUrl);
    } catch {
      toast.error('No se pudo abrir WhatsApp');
    }
  };

  const handleCopyInvitation = async () => {
    if (!lastVisit) return;
    try {
      await Clipboard.setStringAsync(buildInvitationText(lastVisit));
      toast.success('Invitación copiada al portapapeles');
    } catch {
      toast.error('No se pudo copiar la invitación');
    }
  };

  const openQRFor = (visitor: VisitaDto) => {
    setLastVisit(visitor);
    setIsQRModalOpen(true);
  };

  const activeVisitors = visitors.filter((v) => getVisitStatus(v) === 'ACTIVO');
  const scheduledVisitors = visitors.filter((v) => getVisitStatus(v) === 'PROGRAMADO');
  const pastVisitors = visitors.filter((v) => getVisitStatus(v) === 'HISTORIAL');
  const nonActiveVisitors = [...scheduledVisitors, ...pastVisitors];

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-8 px-6 pt-4">
        <ProfileHeader />

        {error ? (
          <View className="rounded-2xl border border-border bg-surface2 p-4">
            <Text className="text-center text-xs font-bold text-text">{error}</Text>
          </View>
        ) : null}

        {/* 2. SUMMARY CARDS */}
        <View className="flex-row gap-4">
          <GlassCard className="flex-1 rounded-[28px] p-5">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-surface2">
              <User size={20} color="#FFFFFF" />
            </View>
            <View className="mt-3">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                Hoy
              </Text>
              <Text className="text-2xl font-bold tracking-tight text-text">
                {String(activeVisitors.length).padStart(2, '0')}
              </Text>
            </View>
          </GlassCard>

          <GlassCard className="flex-1 rounded-[28px] p-5">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-surface2">
              <Calendar size={20} color="#FFFFFF" />
            </View>
            <View className="mt-3">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                Agendadas
              </Text>
              <Text className="text-2xl font-bold tracking-tight text-text">
                {String(scheduledVisitors.length).padStart(2, '0')}
              </Text>
            </View>
          </GlassCard>
        </View>

        {/* 3. NEW VISIT ACTION */}
        <GlassCard className="rounded-[32px] p-6">
          <View className="flex flex-col gap-5">
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-accent">
                <UserPlus size={24} color="#000000" />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold leading-tight text-text">
                  Nueva Invitacion
                </Text>
                <Text className="text-xs text-text">
                  Programa una visita y genera un pase digital.
                </Text>
              </View>
            </View>

            <View className="flex flex-col gap-4">
              <TextInput
                placeholder="Nombre del Invitado"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={newVisitForm.name}
                onChangeText={(text) => setNewVisitForm({ ...newVisitForm, name: text })}
                className="w-full rounded-2xl border border-border bg-surface2 px-5 py-4 text-sm text-text"
              />

              <View className="flex-row gap-2">
                {(['PEATONAL', 'VEHICULAR'] as TipoVisita[]).map((tipo) => {
                  const selected = newVisitForm.tipo === tipo;
                  return (
                    <Pressable
                      key={tipo}
                      onPress={() =>
                        setNewVisitForm({
                          ...newVisitForm,
                          tipo,
                          // Keep vehiculoTipo consistent with the pass type.
                          vehiculoTipo: tipo === 'VEHICULAR' ? 'CARRO' : 'NINGUNO',
                          placa: tipo === 'VEHICULAR' ? newVisitForm.placa : '',
                        })
                      }
                      className={`flex-1 items-center rounded-2xl border py-3.5 ${
                        selected ? 'border-accent bg-accent' : 'border-border bg-surface2'
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold uppercase tracking-widest ${
                          selected ? 'text-on-accent' : 'text-text'
                        }`}
                      >
                        {tipo}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {newVisitForm.tipo === 'VEHICULAR' ? (
                <TextInput
                  placeholder="Placa del vehiculo (ej. ABC123)"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={newVisitForm.placa}
                  autoCapitalize="characters"
                  onChangeText={(text) =>
                    setNewVisitForm({ ...newVisitForm, placa: text.toUpperCase() })
                  }
                  className="w-full rounded-2xl border border-border bg-surface2 px-5 py-3 text-sm text-text"
                />
              ) : null}

              <Pressable
                onPress={handleCreateInvitation}
                disabled={submitting}
                style={({ pressed }) => ({ opacity: submitting ? 0.6 : pressed ? 0.9 : 1 })}
                className="w-full flex-row items-center justify-center gap-3 rounded-[22px] bg-accent py-4"
              >
                {submitting ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <>
                    <QrCode size={20} color="#000000" />
                    <Text className="font-bold text-on-accent">Programar Visita</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </GlassCard>

        {/* 4. ACTIVE TODAY */}
        <View className="flex flex-col gap-6">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-lg font-bold tracking-tight text-text">Visitas de Hoy</Text>
            <View className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface2 px-3 py-1.5">
              <View className="h-1.5 w-1.5 rounded-full bg-surface2" />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                Tiempo Real
              </Text>
            </View>
          </View>

          <View className="flex flex-col gap-4">
            {activeVisitors.length === 0 ? (
              <Text className="py-6 text-center text-xs italic text-text">
                No hay visitas activas hoy.
              </Text>
            ) : (
              activeVisitors.map((visitor) => (
                <GlassCard key={visitor.id} className="rounded-[28px] p-5">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 flex-row items-center gap-4">
                      <View className="h-14 w-14 items-center justify-center rounded-full border border-border bg-surface2">
                        <User size={28} color="#FFFFFF" />
                        <View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-surface2">
                          <CheckCircle2 size={12} color="#FFFFFF" />
                        </View>
                      </View>
                      <View className="flex-1">
                        <Text className="mb-1.5 text-base font-bold text-text">
                          {visitor.nombre}
                        </Text>
                        <View className="flex-row items-center gap-3">
                          <View className="rounded border border-border bg-surface2 px-2 py-0.5">
                            <Text className="text-[9px] font-bold uppercase tracking-wider text-text">
                              {visitor.tipo}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Clock size={12} color="#FFFFFF" />
                            <Text className="text-[10px] text-text">
                              Programada {formatTime(visitor.fecha)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => openQRFor(visitor)}
                      className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2"
                    >
                      <MoreHorizontal size={20} color="#FFFFFF" />
                    </Pressable>
                  </View>
                </GlassCard>
              ))
            )}
          </View>
        </View>

        {/* 5. SCHEDULED & HISTORY */}
        <View className="flex flex-col gap-6">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-lg font-bold tracking-tight text-text">
              Programadas & Historial
            </Text>
            {/* "Ver Todo" is a dead button in web (no handler) — kept visual-only. */}
            <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
              Ver Todo
            </Text>
          </View>

          <View className="flex flex-col gap-3">
            {nonActiveVisitors.length === 0 ? (
              <Text className="py-4 text-center text-xs italic text-text">
                No hay visitas programadas ni historial.
              </Text>
            ) : (
              nonActiveVisitors.map((visitor) => {
                const status = getVisitStatus(visitor);
                return (
                  <GlassCard key={visitor.id} className="rounded-[24px] p-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 flex-row items-center gap-4">
                        <View
                          className={`h-11 w-11 items-center justify-center rounded-2xl ${
                            status === 'PROGRAMADO' ? 'bg-surface2' : 'bg-surface2'
                          }`}
                        >
                          {status === 'PROGRAMADO' ? (
                            <Calendar size={20} color="#FFFFFF" />
                          ) : (
                            <Clock size={20} color="#FFFFFF" />
                          )}
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold leading-tight text-text">
                            {visitor.nombre}
                          </Text>
                          <Text className="mt-0.5 text-[10px] text-text">
                            {status === 'PROGRAMADO'
                              ? `Llega ${formatScheduledDate(visitor.fecha)}`
                              : `Visita ${formatScheduledDate(visitor.fecha)}`}
                          </Text>
                        </View>
                      </View>
                      {status === 'PROGRAMADO' ? (
                        <Pressable
                          onPress={() => openQRFor(visitor)}
                          className="rounded-full border border-border bg-surface2 px-4 py-2"
                        >
                          <Text className="text-[10px] font-bold text-text">REENVIAR QR</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => openQRFor(visitor)}
                          className="h-9 w-9 items-center justify-center rounded-full bg-surface2"
                        >
                          <ArrowRight size={16} color="#FFFFFF" />
                        </Pressable>
                      )}
                    </View>
                  </GlassCard>
                );
              })
            )}
          </View>
        </View>
      </View>

      {/* MODAL: QR INVITATION */}
      <Modal
        visible={isQRModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsQRModalOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          onPress={() => setIsQRModalOpen(false)}
          className="flex-1 items-center justify-center bg-black/80 p-6"
        >
          {/* Inner pressable stops backdrop taps from closing the modal. */}
          <Pressable onPress={() => {}} className="w-full max-w-sm">
            <LiquidGlass radius={40} variant="card" className="rounded-[40px]">
              <View className="flex flex-col items-center gap-6 p-8">
                <View className="mb-2 w-full flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <ShieldCheck size={18} color="#FFFFFF" />
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                      Acceso Seguro
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setIsQRModalOpen(false)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-surface2"
                  >
                    <Plus size={20} color="#FFFFFF" style={{ transform: [{ rotate: '45deg' }] }} />
                  </Pressable>
                </View>

                <View className="flex flex-col items-center gap-2">
                  <Text className="text-2xl font-bold tracking-tight text-text">
                    Invitacion Digital
                  </Text>
                  <Text className="px-4 text-center text-xs text-text">
                    Comparte este codigo con tu invitado para agilizar su ingreso.
                  </Text>
                </View>

                {/* Decorative QR placeholder (matches web's static lucide icon). */}
                <View className="rounded-3xl bg-white p-6">
                  <View className="h-48 w-48 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white">
                    <QrCode size={160} color="#171717" />
                  </View>
                </View>

                <View className="w-full flex flex-col gap-4">
                  <View className="rounded-2xl border border-border bg-surface2 p-4">
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                      Invitado
                    </Text>
                    <Text className="text-lg font-bold text-text">
                      {lastVisit?.nombre || 'Invitado Especial'}
                    </Text>
                    <View className="mt-1 flex-row items-center gap-2">
                      <CheckCircle2 size={14} color="#FFFFFF" />
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-text">
                        Pase de tipo {lastVisit?.tipo || 'PEATONAL'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={handleCopyInvitation}
                      disabled={!lastVisit}
                      style={({ pressed }) => ({ opacity: !lastVisit ? 0.5 : pressed ? 0.85 : 1 })}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-surface2 py-4"
                    >
                      <Download size={18} color="#FFFFFF" />
                      <Text className="font-bold text-text">Copiar</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleShareWhatsApp}
                      disabled={!lastVisit}
                      style={({ pressed }) => ({
                        opacity: !lastVisit ? 0.5 : pressed ? 0.85 : 1,
                        backgroundColor: '#25D366',
                      })}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-4"
                    >
                      <Share2 size={18} color="#FFFFFF" />
                      <Text className="font-bold text-white">WhatsApp</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </LiquidGlass>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
