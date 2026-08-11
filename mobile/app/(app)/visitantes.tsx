/**
 * VISITANTES - CONJUNTOSAPP (mobile port)
 * Gestión de ingresos, generación de pases digitales y control de acceso.
 *
 * Ported from web src/app/(app)/visitantes/page.tsx. Behavior preserved:
 *  - list = GET /comunicaciones -> data.visitas ?? []  (+ silent refetch on WS 'visita')
 *  - create = POST /visitas/preregistro -> { visita, token, qrPngBase64, expira }
 *  - approval = PUT /visitas/{id}/aprobar { aprobada } + refetch (PENDIENTE cards)
 *  - getVisitStatus client-side day bucketing (ACTIVO / PROGRAMADO / HISTORIAL)
 *  - QR modal subject = lastVisit; real QR PNG (expo-image data URI) when qrData
 *    is present, lucide QrCode placeholder otherwise (matching web).
 *  - Copiar (expo-clipboard) + WhatsApp (Linking) invite includes the access token.
 */

import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
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
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { Skeleton, PulseDot } from '@/components/visitas/Skeleton';
import { withAlpha } from '@/components/visitas/colorAlpha';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import type {
  ComunicacionesVigilanciaDto,
  PreregistroResponse,
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
  // Runtime token values for props that cannot take a class (lucide `color`,
  // shadowColor, translucent tints). Classes use the unprefixed tokens.
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [newVisitForm, setNewVisitForm] = useState<NewVisitForm>(EMPTY_FORM);

  const [visitors, setVisitors] = useState<VisitaDto[]>([]);
  const [lastVisit, setLastVisit] = useState<VisitaDto | null>(null);
  const [qrData, setQrData] = useState<{
    qrPngBase64: string;
    token: string;
    expira: string;
  } | null>(null);
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
      const res = await api.post<PreregistroResponse>('/visitas/preregistro', {
        nombre: newVisitForm.name.trim(),
        tipo: newVisitForm.tipo,
        vehiculoTipo:
          newVisitForm.vehiculoTipo !== 'NINGUNO'
            ? newVisitForm.vehiculoTipo
            : undefined,
        placa: newVisitForm.placa.trim() || undefined,
        observacion: newVisitForm.observacion.trim() || undefined,
      });
      setVisitors((prev) => [res.visita, ...prev]);
      setLastVisit(res.visita);
      setQrData({ qrPngBase64: res.qrPngBase64, token: res.token, expira: res.expira });
      setIsQRModalOpen(true);
      toast.success('Pase QR generado con éxito');
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
    if (qrData) lines.push(`• Código de acceso: ${qrData.token}`);
    lines.push(``, `Muestra el código QR (o este código) en portería para tu ingreso. 🛡️`);
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
    // qrData (single-use gate token + QR PNG) is only valid for the visit that
    // was just created via POST /visitas/preregistro. Clear it when opening the
    // modal for any other/historical visit, otherwise the modal and the
    // WhatsApp invite would attach the WRONG visit's live access token.
    setQrData(null);
    setLastVisit(visitor);
    setIsQRModalOpen(true);
  };

  const handleAprobarVisita = async (visitaId: string, aprobada: boolean) => {
    try {
      await api.put(`/visitas/${visitaId}/aprobar`, { aprobada });
      toast.success(aprobada ? 'Visita aprobada' : 'Visita rechazada');
      void refetchVisitors();
    } catch {
      toast.error('Error al procesar la visita');
    }
  };

  const activeVisitors = visitors.filter((v) => getVisitStatus(v) === 'ACTIVO');
  const scheduledVisitors = visitors.filter((v) => getVisitStatus(v) === 'PROGRAMADO');
  const pastVisitors = visitors.filter((v) => getVisitStatus(v) === 'HISTORIAL');
  const nonActiveVisitors = [...scheduledVisitors, ...pastVisitors];

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        {/* Web: `<Skeleton className="w-8 h-8 rounded-full" />` centered (page.tsx:202-204). */}
        <View className="flex-1 items-center justify-center">
          <Skeleton className="h-8 w-8 rounded-full" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-8 px-6 pt-4">
        <ProfileHeader />

        {error ? (
          <View className="rounded-2xl border border-text/20 bg-text/10 p-4">
            <Text className="text-center text-xs font-bold text-text">{error}</Text>
          </View>
        ) : null}

        {/* 2. SUMMARY CARDS */}
        <View className="flex-row gap-4">
          <GlassCard variant="card" className="flex-1 rounded-[28px] p-5">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-text/10">
              <User size={20} color={tokens.text} />
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

          <GlassCard variant="card" className="flex-1 rounded-[28px] p-5">
            {/* Web contrasts this teal tile against the neutral first card
                (`bg-accent/10 text-accent`, page.tsx:231-233). */}
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-accent/10">
              <Calendar size={20} color={tokens.accent} />
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
        <GlassCard variant="card" className="rounded-[32px] p-6">
          {/* Web: `absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-[60px]
              rounded-full` (page.tsx:243). RN has no blur filter for a plain
              View, so the 60px falloff is faked with concentric accent rings. */}
          <View pointerEvents="none" style={styles.glowWrap}>
            <View
              style={[styles.glow128, { backgroundColor: withAlpha(tokens.accent, 0.04) }]}
            />
            <View style={[styles.glow96, { backgroundColor: withAlpha(tokens.accent, 0.05) }]} />
            <View style={[styles.glow64, { backgroundColor: withAlpha(tokens.accent, 0.06) }]} />
          </View>

          <View className="flex flex-col gap-5">
            <View className="flex-row items-center gap-3">
              <View
                className="h-12 w-12 items-center justify-center rounded-[18px] bg-accent"
                // Web: `shadow-[0_8px_20px_rgba(0,0,0,0.3)]` (page.tsx:247) —
                // a hardcoded black drop shadow on both schemes.
                style={styles.accentTileShadow}
              >
                <UserPlus size={24} color={tokens.onAccent} />
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
                // Web: `placeholder:text-text` — full-contrast placeholder (page.tsx:260).
                placeholderTextColor={tokens.text}
                value={newVisitForm.name}
                onChangeText={(text) => setNewVisitForm({ ...newVisitForm, name: text })}
                className="w-full rounded-2xl border border-border bg-text/5 px-5 py-4 text-sm text-text"
              />

              <View className="flex-row gap-2">
                {(['PEATONAL', 'VEHICULAR'] as TipoVisita[]).map((tipo) => {
                  const selected = newVisitForm.tipo === tipo;
                  return (
                    <Pressable
                      key={tipo}
                      // Web sets ONLY `tipo` here (page.tsx:269), leaving
                      // vehiculoTipo at 'NINGUNO' (so page.tsx:127 always sends
                      // undefined) and keeping any typed placa. Matched verbatim.
                      onPress={() => setNewVisitForm({ ...newVisitForm, tipo })}
                      // Web adds `shadow-lg shadow-accent/20` to the selected
                      // pill (page.tsx:270).
                      style={
                        selected ? [styles.accentGlowSm, { shadowColor: tokens.accent }] : undefined
                      }
                      className={`flex-1 items-center rounded-2xl border py-3.5 ${
                        selected ? 'border-accent bg-accent' : 'border-border bg-text/5'
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
                  // Web: `placeholder:text-text` (page.tsx:281).
                  placeholderTextColor={tokens.text}
                  value={newVisitForm.placa}
                  autoCapitalize="characters"
                  onChangeText={(text) =>
                    setNewVisitForm({ ...newVisitForm, placa: text.toUpperCase() })
                  }
                  className="w-full rounded-2xl border border-border bg-text/5 px-5 py-3 text-sm text-text"
                />
              ) : null}

              <Pressable
                onPress={handleCreateInvitation}
                disabled={submitting}
                // Web: `shadow-xl shadow-accent/20` — a teal glow under the CTA
                // (page.tsx:290).
                style={({ pressed }) => [
                  styles.accentGlowLg,
                  { shadowColor: tokens.accent },
                  { opacity: submitting ? 0.6 : pressed ? 0.9 : 1 },
                ]}
                className="w-full flex-row items-center justify-center gap-3 rounded-[22px] bg-accent py-4"
              >
                {submitting ? (
                  // Web: `<Skeleton className="w-5 h-5 rounded-full" />` (page.tsx:292).
                  <Skeleton className="h-5 w-5 rounded-full" />
                ) : (
                  <>
                    <QrCode size={20} color={tokens.onAccent} />
                    {/* Web sets no size class here, so the label inherits the
                        16px body size (page.tsx:290-292) — RN Text defaults to
                        14, hence the explicit `text-base`. */}
                    <Text className="text-base font-bold text-on-accent">Programar Visita</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </GlassCard>

        {/* 4. ACTIVE TODAY */}
        <View className="flex flex-col gap-6">
          <View className="flex-row items-center justify-between px-1">
            {/* Web: `font-display` on both section headings (page.tsx:301,358). */}
            <Text className="font-display text-lg font-bold tracking-tight text-text">
              Visitas de Hoy
            </Text>
            {/* Web pill is text-tinted, not teal: `border border-text/20 bg-text/5`
                with an `animate-pulse` dot (page.tsx:302-304). */}
            <View className="flex-row items-center gap-1.5 rounded-full border border-text/20 bg-text/5 px-3 py-1.5">
              <PulseDot />
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
                <GlassCard key={visitor.id} variant="card" className="rounded-[28px] p-5">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 flex-row items-center gap-4">
                      <View className="h-14 w-14 items-center justify-center rounded-full border border-border bg-text/5">
                        <User size={28} color={tokens.text} />
                        <View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-text/10">
                          {/* Web hardcodes `text-white` here (page.tsx:317)
                              because that page was authored dark-only. The
                              badge plate is `bg-text/10` over a glass card,
                              which is near-WHITE in light mode, so white ink
                              disappears — follow the theme instead. */}
                          <CheckCircle2 size={12} color={tokens.text} />
                        </View>
                      </View>
                      <View className="flex-1">
                        <Text className="mb-1.5 text-base font-bold text-text">
                          {visitor.nombre}
                        </Text>
                        <View className="flex-row flex-wrap items-center gap-3">
                          {visitor.documento ? (
                            // Web: `text-[10px] text-text/50 font-mono` (page.tsx:323).
                            <Text className="font-mono text-[10px] text-text/50">
                              {visitor.documento}
                            </Text>
                          ) : null}
                          {/* Estado badges — web amber / emerald / red at 15% fill,
                              30% border (page.tsx:324-326) = warning / success /
                              danger tokens. */}
                          {visitor.estado === 'PENDIENTE' ? (
                            <View className="rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5">
                              <Text className="text-[9px] font-bold text-warning">PENDIENTE</Text>
                            </View>
                          ) : null}
                          {visitor.estado === 'APROBADA' ? (
                            <View className="rounded-full border border-success/30 bg-success/15 px-2 py-0.5">
                              <Text className="text-[9px] font-bold text-success">APROBADA</Text>
                            </View>
                          ) : null}
                          {visitor.estado === 'RECHAZADA' ? (
                            <View className="rounded-full border border-danger/30 bg-danger/15 px-2 py-0.5">
                              <Text className="text-[9px] font-bold text-danger">RECHAZADA</Text>
                            </View>
                          ) : null}
                          <View className="rounded border border-text/20 bg-text/10 px-2 py-0.5">
                            <Text className="text-[9px] font-bold uppercase tracking-wider text-text">
                              {visitor.tipo}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Clock size={12} color={tokens.text} />
                            <Text className="text-[10px] text-text">
                              Programada {formatTime(visitor.fecha)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    {visitor.estado === 'PENDIENTE' ? (
                      // Web: emerald / red 15% fill + 30% border (page.tsx:339-340).
                      <View className="shrink-0 flex-row gap-2">
                        <Pressable
                          onPress={() => void handleAprobarVisita(visitor.id, true)}
                          className="rounded-xl border border-success/30 bg-success/15 px-3 py-2"
                          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                        >
                          <Text className="text-[10px] font-bold text-success">✓ Aprobar</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void handleAprobarVisita(visitor.id, false)}
                          className="rounded-xl border border-danger/30 bg-danger/15 px-3 py-2"
                          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                        >
                          <Text className="text-[10px] font-bold text-danger">✗ Rechazar</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => openQRFor(visitor)}
                        className="h-10 w-10 items-center justify-center rounded-full border border-border bg-text/5"
                      >
                        <MoreHorizontal size={20} color={tokens.text} />
                      </Pressable>
                    )}
                  </View>
                </GlassCard>
              ))
            )}
          </View>
        </View>

        {/* 5. SCHEDULED & HISTORY */}
        <View className="flex flex-col gap-6">
          <View className="flex-row items-center justify-between px-1">
            <Text className="font-display text-lg font-bold tracking-tight text-text">
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
                  // Web dims these rows: `opacity-85` (page.tsx:368).
                  <GlassCard
                    key={visitor.id}
                    variant="card"
                    className="rounded-[24px] p-4 opacity-85"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 flex-row items-center gap-4">
                        {/* Web: scheduled = teal tile, history = neutral tile
                            (`bg-accent/10 text-accent` : `bg-text/5 text-text`,
                            page.tsx:370-372). */}
                        <View
                          className={`h-11 w-11 items-center justify-center rounded-2xl ${
                            status === 'PROGRAMADO' ? 'bg-accent/10' : 'bg-text/5'
                          }`}
                        >
                          {status === 'PROGRAMADO' ? (
                            <Calendar size={20} color={tokens.accent} />
                          ) : (
                            <Clock size={20} color={tokens.text} />
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
                          className="rounded-full border border-border bg-text/5 px-4 py-2"
                        >
                          <Text className="text-[10px] font-bold text-text">REENVIAR QR</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => openQRFor(visitor)}
                          className="h-9 w-9 items-center justify-center rounded-full bg-text/5"
                        >
                          <ArrowRight size={16} color={tokens.text} />
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
            {/* Web panel is an OPAQUE `bg-primary` card, not glass (page.tsx:406). */}
            <View
              className="overflow-hidden rounded-[40px] border border-border bg-primary"
              // Web: `shadow-[0_30px_100px_rgba(0,0,0,0.8)]` (page.tsx:406) —
              // hardcoded black in both schemes.
              style={styles.modalShadow}
            >
              <View className="flex flex-col items-center gap-6 p-8">
                <View className="mb-2 w-full flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <ShieldCheck size={18} color={tokens.text} />
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                      Acceso Seguro
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setIsQRModalOpen(false)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-text/5"
                  >
                    <Plus
                      size={20}
                      color={tokens.text}
                      style={{ transform: [{ rotate: '45deg' }] }}
                    />
                  </Pressable>
                </View>

                <View className="flex flex-col items-center gap-2">
                  {/* Web: `font-display` (page.tsx:419). */}
                  <Text className="font-display text-2xl font-bold tracking-tight text-text">
                    Invitacion Digital
                  </Text>
                  <Text className="px-4 text-center text-xs text-text">
                    Comparte este codigo con tu invitado para agilizar su ingreso.
                  </Text>
                </View>

                {/* Real QR PNG from preregistro; lucide placeholder otherwise.
                    The white plate and the #171717 placeholder ink are hardcoded
                    in web too (`bg-white`, `text-[#171717]`, page.tsx:423-433) —
                    a QR must stay black-on-white to scan. */}
                <View className="rounded-3xl bg-white p-6" style={styles.qrPlateGlow}>
                  <View className="h-48 w-48 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white">
                    {qrData ? (
                      <Image
                        source={{ uri: `data:image/png;base64,${qrData.qrPngBase64}` }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="contain"
                        accessibilityLabel="Código QR de acceso del visitante"
                      />
                    ) : (
                      <QrCode size={160} color="#171717" />
                    )}
                  </View>
                </View>

                <View className="w-full flex flex-col gap-4">
                  <View className="rounded-2xl border border-border bg-text/5 p-4">
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                      Invitado
                    </Text>
                    <Text className="text-lg font-bold text-text">
                      {lastVisit?.nombre || 'Invitado Especial'}
                    </Text>
                    {/* Web tints this row with the accent (page.tsx:443-444). */}
                    <View className="mt-1 flex-row items-center gap-2">
                      <CheckCircle2 size={14} color={tokens.accent} />
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-accent">
                        Pase de tipo {lastVisit?.tipo || 'PEATONAL'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={handleCopyInvitation}
                      disabled={!lastVisit}
                      style={({ pressed }) => ({ opacity: !lastVisit ? 0.5 : pressed ? 0.85 : 1 })}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-text/10 py-4"
                    >
                      <Download size={18} color={tokens.text} />
                      {/* Web: `font-bold text-text text-sm` (page.tsx:452). */}
                      <Text className="text-sm font-bold text-text">Copiar</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleShareWhatsApp}
                      disabled={!lastVisit}
                      style={({ pressed }) => ({
                        opacity: !lastVisit ? 0.5 : pressed ? 0.85 : 1,
                        // WhatsApp brand green + white ink, hardcoded in web too
                        // (`bg-[#25D366] text-white`, page.tsx:459).
                        backgroundColor: '#25D366',
                      })}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-4"
                    >
                      <Share2 size={18} color="#ffffff" />
                      {/* Web: `font-bold text-white text-sm` (page.tsx:459). */}
                      <Text className="text-sm font-bold text-white">WhatsApp</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Web: `absolute top-0 right-0 w-32 h-32 … blur-[60px] rounded-full` (page.tsx:243).
  glowWrap: { position: 'absolute', top: 0, right: 0, width: 128, height: 128 },
  glow128: { position: 'absolute', top: 0, right: 0, width: 128, height: 128, borderRadius: 64 },
  glow96: { position: 'absolute', top: 16, right: 16, width: 96, height: 96, borderRadius: 48 },
  glow64: { position: 'absolute', top: 32, right: 32, width: 64, height: 64, borderRadius: 32 },
  // Web: `shadow-[0_8px_20px_rgba(0,0,0,0.3)]` (page.tsx:247).
  accentTileShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  // Web tints these two shadows with the ACCENT, not black: `shadow-lg
  // shadow-accent/20` on the selected tipo pill (page.tsx:270) and `shadow-xl
  // shadow-accent/20` on the CTA (page.tsx:290). shadowColor is supplied at the
  // call site from tokensFor(theme) so it follows the scheme. iOS-only on
  // purpose: Android `elevation` shadows are always black, which would read as
  // grime under a teal button instead of a glow.
  accentGlowSm: { shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  accentGlowLg: { shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  // Web: `shadow-[0_0_40px_rgba(255,255,255,0.1)]` on the white QR plate
  // (page.tsx:423) — a hardcoded white halo in both schemes. iOS-only: Android
  // elevation shadows are always black, so no `elevation` here.
  qrPlateGlow: {
    shadowColor: '#ffffff',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  // Web: `shadow-[0_30px_100px_rgba(0,0,0,0.8)]` (page.tsx:406).
  modalShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.8,
    shadowRadius: 50,
    shadowOffset: { width: 0, height: 30 },
    elevation: 24,
  },
});
