/**
 * Admin Mensajes — CONJUNTOSAPP (mobile port)
 * Bandeja de entrada administrativa: conversaciones por residente, chat
 * inmersivo, dossier del residente ("Inteligencia Residencial") y
 * disponibilidad del administrador (llamadas / mensajes).
 *
 * Ported from web src/app/(app)/admin-mensajes/page.tsx (1:1 copy, strings,
 * order and treatment). Notable platform mappings:
 * - MediaRecorder + getUserMedia  → expo-audio `useAudioRecorder` (m4a) +
 *   expo-file-system base64 → POST /admin/chat/{id} { audioBase64 }.
 * - Web Speech API (transcripción en vivo) → NO tiene equivalente en RN. La
 *   grabación se envía sin transcripción y la ruta de texto se mantiene
 *   intacta (ver `transcription`, siempre vacío en móvil).
 * - <audio> → expo-audio `createAudioPlayer`.
 * - tel: → expo-linking `Linking.openURL`.
 * - gsap slide-up del modal → Reanimated SlideInDown.
 *
 * Bug fix vs web: los mensajes leen `createdAt` (el backend serializa
 * `createdAt`; la web lee `creadoEn`, que llega undefined → "Invalid Date").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  SlideInDown,
  SlideInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { File } from 'expo-file-system';
import {
  AudioPlayer,
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import {
  ArrowRight,
  Building2,
  Car,
  CheckCheck,
  ChevronLeft,
  Dog,
  Info,
  MessageCircle,
  Mic,
  Music,
  Pause,
  Phone,
  Play,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react-native';

import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { safeHttpUrl } from '@/lib/safe-url';
import type {
  AdminChatRequest,
  ChatConversacionDto,
  ChatMensajeDto,
  MascotaResumenDto,
  ResidenteProfileDto,
  VehiculoResumenDto,
} from '@/lib/api/types';
import { Screen } from '@/components/ui/Screen';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { useCall } from '@/providers/CallProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { onSemantic, tokensFor } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const ALLOWED_ROLES = ['ADMINISTRADOR', 'SUPER_ADMIN'];

/**
 * TODO(types-consolidate): the web page reads `profile.rol` ("Estado Jurídico")
 * and `vehicle.modelo`, neither of which the backend `ResidenteProfileDto` /
 * `VehiculoResumenDto` serialize today. Kept optional so the layout matches the
 * web character for character (both render empty until the backend adds them).
 */
interface AdminResidenteProfile extends ResidenteProfileDto {
  rol?: string;
}

interface AdminVehiculo extends VehiculoResumenDto {
  modelo?: string | null;
}

interface AdminResidentInfo {
  profile: AdminResidenteProfile | null;
  vehicles: AdminVehiculo[];
  pets: MascotaResumenDto[];
}

interface AdminChatThread {
  mensajes: ChatMensajeDto[];
  residentInfo: AdminResidentInfo;
}

interface StatusConfigResponse {
  success: boolean;
  activoLlamadas: boolean;
  activoMensajes: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` (web). */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** `m:ss` recording clock, same maths as the web bar. */
function formatRecording(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/**
 * Tailwind `animate-pulse` (2s cubic-bezier(0.4,0,0.6,1) infinite, opacity
 * 1 → 0.5 → 1). Web uses it on the unread dot, the header status dot, the
 * empty-thread circle, the recording dot and the audio progress bar.
 */
function Pulse({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View className={className} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminMensajes() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const role = user?.rol;
  const router = useRouter();
  const { startCall, callState } = useCall();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const semanticInk = onSemantic(theme);

  const scrollRef = useRef<ScrollView>(null);

  const [conversations, setConversations] = useState<ChatConversacionDto[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMensajeDto[]>([]);
  const [residentInfo, setResidentInfo] = useState<AdminResidentInfo | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');

  // Admin Availability States
  const [activoLlamadas, setActivoLlamadas] = useState(true);
  const [activoMensajes, setActivoMensajes] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Voice Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  // Live transcription has no drop-in on RN (see file header): stays empty, and
  // the text-input path below is untouched.
  const [transcription, setTranscription] = useState('');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeConv = conversations.find((c) => c.usuarioId === selectedUserId);

  // ── Availability config ──────────────────────────────────────────────
  const fetchStatusConfig = useCallback(async () => {
    try {
      const data = await api.get<StatusConfigResponse>('/admin/status-config');
      if (data.success) {
        setActivoLlamadas(data.activoLlamadas);
        setActivoMensajes(data.activoMensajes);
      }
    } catch (err) {
      console.error('Error al cargar configuración de disponibilidad:', err);
    }
  }, []);

  const toggleLlamadas = useCallback(async () => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    const newValue = !activoLlamadas;
    setActivoLlamadas(newValue);
    try {
      const data = await api.post<{ success: boolean }>('/admin/status-config', {
        activoLlamadas: newValue,
      });
      if (data.success) {
        toast.success(`Llamadas ${newValue ? 'activadas' : 'desactivadas'} para el administrador`);
      } else {
        toast.error('Error al actualizar disponibilidad');
        setActivoLlamadas(!newValue);
      }
    } catch {
      toast.error('Error de red');
      setActivoLlamadas(!newValue);
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [activoLlamadas, isUpdatingStatus]);

  const toggleMensajes = useCallback(async () => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    const newValue = !activoMensajes;
    setActivoMensajes(newValue);
    try {
      const data = await api.post<{ success: boolean }>('/admin/status-config', {
        activoMensajes: newValue,
      });
      if (data.success) {
        toast.success(
          `Mensajes y chat ${newValue ? 'activados' : 'desactivados'} para el administrador`,
        );
      } else {
        toast.error('Error al actualizar disponibilidad');
        setActivoMensajes(!newValue);
      }
    } catch {
      toast.error('Error de red');
      setActivoMensajes(!newValue);
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [activoMensajes, isUpdatingStatus]);

  // ── Call resident via citofonía ──────────────────────────────────────
  const handleCallResident = useCallback(() => {
    const t = activeConv?.residente?.torre;
    const a = activeConv?.residente?.apto;
    const name = activeConv?.residente?.nombre || 'Residente';
    if (!t || !a || !user?.conjuntoId) {
      toast.error('No se puede determinar la unidad del residente');
      return;
    }
    if (callState !== 'IDLE') {
      toast.info('Ya hay una llamada en curso');
      return;
    }
    const peerId = `${user.conjuntoId}-APTO-${t}-${a}`;
    startCall(peerId, name);
    toast.success(`Llamando a ${name} (${t}-${a})…`);
  }, [activeConv, callState, startCall, user?.conjuntoId]);

  // ── Data ─────────────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    try {
      const data = await api.get<ChatConversacionDto[]>('/admin/chat');
      setConversations(data);
    } catch {
      toast.error('Error al sincronizar');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchChatHistory = useCallback(async (userId: string) => {
    try {
      const data = await api.get<AdminChatThread>(`/admin/chat/${userId}`);
      setMessages(data.mensajes);
      setResidentInfo(data.residentInfo);
    } catch {
      toast.error('Error de sincronización');
    }
  }, []);

  // Real-time WebSocket subscription for chat messages
  useWsSubscription('chat', (event) => {
    void fetchConversations();
    if (event.action === 'message' && selectedUserId) {
      void fetchChatHistory(selectedUserId);
    }
  });

  // ── Send ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (audioData?: { url: string; text: string }) => {
      if (!selectedUserId) return;
      if (!audioData && (!newMessage.trim() || sending)) return;
      setSending(true);

      const temp: ChatMensajeDto = {
        id: `temp_${Date.now()}`,
        mensaje: audioData ? 'Mensaje de voz' : newMessage,
        audioUrl: audioData?.url || null,
        transcripcion: audioData?.text || null,
        esDeAdmin: true,
        createdAt: new Date().toISOString(),
        leido: false,
      };
      setMessages((prev) => [...prev, temp]);
      if (!audioData) setNewMessage('');

      try {
        const body: AdminChatRequest = {
          mensaje: temp.mensaje,
          audioUrl: temp.audioUrl ?? undefined,
          transcripcion: temp.transcripcion ?? undefined,
        };
        await api.post(`/admin/chat/${selectedUserId}`, body);
        void fetchChatHistory(selectedUserId);
      } catch {
        // Roll back the optimistic message and restore the draft so the admin can retry.
        setMessages((prev) => prev.filter((m) => m.id !== temp.id));
        if (!audioData) setNewMessage(temp.mensaje);
        toast.error('Fallo de red');
      } finally {
        setSending(false);
      }
    },
    [fetchChatHistory, newMessage, selectedUserId, sending],
  );

  const handleUploadAndSend = useCallback(
    async (uri: string) => {
      if (!selectedUserId) return;
      setSending(true);

      try {
        // Read the recorded file as base64 (web used FileReader on the Blob).
        const base64 = await new File(uri).base64();

        // Optimistic UI
        const temp: ChatMensajeDto = {
          id: `temp_${Date.now()}`,
          mensaje: '[audio]',
          audioUrl: uri,
          transcripcion: transcription || null,
          esDeAdmin: true,
          createdAt: new Date().toISOString(),
          leido: false,
        };
        setMessages((prev) => [...prev, temp]);

        const body: AdminChatRequest = {
          mensaje: transcription.trim() || undefined,
          audioBase64: base64,
          transcripcion: transcription.trim() || undefined,
        };
        await api.post(`/admin/chat/${selectedUserId}`, body);

        toast.success('Nota de voz enviada');
        setTranscription('');
        setRecordedUri(null);
        void fetchChatHistory(selectedUserId);
      } catch {
        toast.error('Error al enviar nota de voz');
      } finally {
        setSending(false);
      }
    },
    [fetchChatHistory, selectedUserId, transcription],
  );

  // ── Voice Recording Logic (expo-audio) ───────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        toast.error('Error al acceder al micrófono');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();

      setIsRecording(true);
      setRecordingTime(0);
      setTranscription('');
      timerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    } catch {
      toast.error('Error al acceder al micrófono');
    }
  }, [recorder]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    if (!recorder.isRecording) return;
    try {
      await recorder.stop();
    } catch {
      return;
    } finally {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    const uri = recorder.uri;
    if (!uri) return;
    setRecordedUri(uri);
    await handleUploadAndSend(uri);
  }, [handleUploadAndSend, recorder]);

  // ── Guards + initial load + 15s poll ─────────────────────────────────
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

    void fetchConversations();
    void fetchStatusConfig();
    const interval = setInterval(() => {
      void fetchConversations();
    }, 15000);
    return () => clearInterval(interval);
  }, [user, authLoading, role, router, fetchConversations, fetchStatusConfig]);

  // ── Selected thread: load + 10s poll ─────────────────────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (selectedUserId) {
      setShowInfoPanel(false);
      void fetchChatHistory(selectedUserId);
      interval = setInterval(() => {
        void fetchChatHistory(selectedUserId);
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [selectedUserId, fetchChatHistory]);

  // Web: chatEndRef.scrollIntoView({ behavior: 'smooth' }) on every change.
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Stop timers / recording when leaving the screen.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorder.isRecording) recorder.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredConversations = conversations
    .filter(
      (c) =>
        c.residente?.nombre?.toLowerCase().includes(search.toLowerCase()) ||
        c.residente?.apto?.includes(search),
    )
    .sort((a, b) => new Date(b.ultimoTimestamp).getTime() - new Date(a.ultimoTimestamp).getTime());

  // Web renders 12 waveform bars with random heights + a bounce animation. The
  // heights are recomputed on every clock tick so the bar stays alive.
  const waveBars = useMemo(
    () => Array.from({ length: 12 }, () => Math.random() * 20 + 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordingTime],
  );

  const sendDisabled = (!newMessage.trim() && !recordedUri) || sending;

  return (
    <View className="flex-1 bg-primary">
      {/* MAIN VIEW: CONVERSATION LIST */}
      <Screen className="bg-primary">
        <View className="px-6 pt-4">
          {/* Web renders the AppShell header above the page (page reserves pt-24). */}
          <Animated.View entering={FadeInDown.duration(500)} className="mb-6">
            <ProfileHeader />
          </Animated.View>

          <View className="mb-8 flex-row items-end justify-between">
            <View className="flex-col gap-1">
              <Text
                className="font-black uppercase italic text-text"
                style={{ fontSize: 10, letterSpacing: 3 }}
              >
                Administración
              </Text>
              <Text
                className="font-black uppercase italic leading-none text-text"
                style={{ fontSize: 36, letterSpacing: -0.5 }}
              >
                Mensajes
              </Text>
            </View>
            <View
              className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface2"
              style={{
                // .shadow-glow → 0 0 20px rgba(45,212,191,0.15)
                shadowColor: tokens.accent,
                shadowOpacity: 0.15,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 0 },
                elevation: 6,
              }}
            >
              <MessageCircle size={20} color={tokens.text} />
            </View>
          </View>

          {/* Availability Settings Card */}
          <View className="mb-8 flex-col gap-4 rounded-[28px] border border-border bg-surface2 p-5">
            <View className="flex-row items-center gap-2">
              <Building2 size={16} color={tokens.success} />
              <Text
                className="font-black uppercase text-text"
                style={{ fontSize: 9, letterSpacing: 1.5, opacity: 0.8 }}
              >
                Mi Disponibilidad
              </Text>
            </View>

            <View className="flex-row items-center justify-between border-b border-border py-1">
              <View className="flex-col gap-0.5">
                <Text className="text-xs font-black uppercase italic text-text">
                  Llamadas de Citofonía
                </Text>
                <Text
                  className="font-medium text-text"
                  style={{ fontSize: 9, opacity: 0.6 }}
                >
                  Permitir recibir llamadas directas
                </Text>
              </View>
              <AvailabilityToggle
                value={activoLlamadas}
                disabled={isUpdatingStatus}
                onToggle={toggleLlamadas}
                accessibilityLabel="Llamadas de Citofonía"
                onColor={tokens.success}
                offColor={tokens.border}
                knobColor={semanticInk}
              />
            </View>

            <View className="flex-row items-center justify-between py-1">
              <View className="flex-col gap-0.5">
                <Text className="text-xs font-black uppercase italic text-text">
                  Chat y Mensajes
                </Text>
                <Text
                  className="font-medium text-text"
                  style={{ fontSize: 9, opacity: 0.6 }}
                >
                  Permitir chat con residentes
                </Text>
              </View>
              <AvailabilityToggle
                value={activoMensajes}
                disabled={isUpdatingStatus}
                onToggle={toggleMensajes}
                accessibilityLabel="Chat y Mensajes"
                onColor={tokens.success}
                offColor={tokens.border}
                knobColor={semanticInk}
              />
            </View>
          </View>

          {/* SEARCH */}
          <View className="mb-8 justify-center">
            <View
              className="absolute z-10"
              style={{ left: 20 }}
              pointerEvents="none"
            >
              <Search size={16} color={tokens.textMuted} />
            </View>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar unidad o nombre..."
              placeholderTextColor={tokens.text}
              className="w-full rounded-[28px] border border-border bg-surface2 text-sm text-text"
              style={{ paddingLeft: 56, paddingRight: 24, paddingVertical: 16 }}
            />
          </View>

          {/* LIST */}
          <View className="gap-3">
            {loading ? (
              <View className="items-center gap-4 py-20" style={{ opacity: 0.4 }}>
                <ActivityIndicator size="small" color={tokens.text} />
                <Text
                  className="font-black uppercase text-text"
                  style={{ fontSize: 10, letterSpacing: 1.5 }}
                >
                  Cargando Inbox...
                </Text>
              </View>
            ) : filteredConversations.length === 0 ? (
              <View className="items-center gap-6 py-20" style={{ opacity: 0.4 }}>
                <View className="h-20 w-20 items-center justify-center rounded-[32px] border border-border bg-surface2">
                  <X size={32} color={tokens.text} />
                </View>
                <Text
                  className="font-black uppercase text-text"
                  style={{ fontSize: 10, letterSpacing: 1.5 }}
                >
                  Bandeja de entrada vacía
                </Text>
              </View>
            ) : (
              filteredConversations.map((c, i) => {
                const selected = selectedUserId === c.usuarioId;
                const avatar = safeHttpUrl(c.residente?.avatar ?? undefined);
                return (
                  <Animated.View
                    key={c.usuarioId}
                    entering={FadeInDown.delay(Math.min(i, 10) * 40).duration(400)}
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSelectedUserId(c.usuarioId)}
                      style={({ pressed }) => ({
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                        backgroundColor: selected ? tokens.accent : tokens.surface2,
                      })}
                      className="w-full flex-row items-center gap-4 rounded-[32px] border border-border p-5"
                    >
                      <View className="h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface">
                        {avatar ? (
                          <Image
                            source={{ uri: avatar }}
                            alt={c.residente?.nombre || 'Avatar del residente'}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                            transition={200}
                          />
                        ) : (
                          <User size={24} color={tokens.text} />
                        )}
                        {c.noLeidos > 0 ? (
                          <Pulse
                            className="absolute rounded-full bg-text/10"
                            style={{
                              top: 4,
                              right: 4,
                              width: 12,
                              height: 12,
                              borderWidth: 2,
                              borderColor: tokens.primary,
                            }}
                          />
                        ) : null}
                      </View>

                      <View className="min-w-0 flex-1">
                        <View className="mb-1.5 flex-row items-center justify-between">
                          <Text
                            numberOfLines={1}
                            className="font-black uppercase italic"
                            style={{
                              fontSize: 13,
                              maxWidth: 140,
                              color: selected ? tokens.onAccent : tokens.text,
                            }}
                          >
                            {c.residente?.nombre || 'Residente'}
                          </Text>
                          <Text
                            className="font-bold"
                            style={{
                              fontSize: 9,
                              opacity: 0.7,
                              color: selected ? tokens.onAccent : tokens.text,
                            }}
                          >
                            {formatTime(c.ultimoTimestamp)}
                          </Text>
                        </View>
                        <View className="flex-row items-center justify-between gap-2">
                          <Text
                            numberOfLines={1}
                            className="flex-1 leading-none"
                            style={{
                              fontSize: 11,
                              color: selected ? tokens.onAccent : tokens.text,
                              opacity: c.noLeidos > 0 ? 1 : 0.8,
                              fontWeight: c.noLeidos > 0 ? '700' : '400',
                            }}
                          >
                            {c.ultimoMensaje}
                          </Text>
                          {c.residente?.torre && c.residente?.apto ? (
                            <View className="rounded-lg bg-text/10 px-2 py-0.5">
                              <Text
                                className="font-black text-text"
                                style={{ fontSize: 9, letterSpacing: -0.5 }}
                              >
                                T{c.residente.torre}-{c.residente.apto}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })
            )}
          </View>
        </View>
      </Screen>

      {/* IMMERSIVE CHAT MODAL */}
      <Modal
        visible={!!selectedUserId}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setSelectedUserId(null)}
      >
        <Animated.View entering={FadeIn.duration(300)} className="flex-1 justify-end">
          <View style={StyleSheet.absoluteFill} className="bg-primary" />
          {selectedUserId ? (
            <Animated.View
              entering={SlideInDown.duration(500)}
              className="flex-1 overflow-hidden border-t border-border bg-primary"
            >
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1, paddingTop: insets.top }}
              >
                {/* MODAL HEADER */}
                <View
                  className="flex-row items-center justify-between border-b border-border p-6"
                  style={{ backgroundColor: tokens.surface }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Inteligencia Residencial"
                    onPress={() => setShowInfoPanel((v) => !v)}
                    className="flex-1 flex-row items-center gap-4"
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Volver"
                      onPress={() => setSelectedUserId(null)}
                      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
                      className="h-10 w-10 items-center justify-center rounded-2xl bg-surface"
                    >
                      <ChevronLeft size={22} color={tokens.text} />
                    </Pressable>

                    <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-border bg-text/10">
                      {safeHttpUrl(activeConv?.residente?.avatar ?? undefined) ? (
                        <Image
                          source={{ uri: safeHttpUrl(activeConv?.residente?.avatar ?? undefined) }}
                          alt={activeConv?.residente?.nombre || 'Avatar del residente'}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <User size={24} color={tokens.text} />
                      )}
                      <View
                        className="absolute rounded-full bg-text/10"
                        style={{
                          bottom: -2,
                          right: -2,
                          width: 16,
                          height: 16,
                          borderWidth: 3,
                          borderColor: tokens.primary,
                          // shadow-[0_0_10px_rgba(45,212,191,0.5)] → accent glow
                          shadowColor: tokens.accent,
                          shadowOpacity: 0.5,
                          shadowRadius: 10,
                          shadowOffset: { width: 0, height: 0 },
                          elevation: 4,
                        }}
                      />
                    </View>

                    <View className="min-w-0 flex-1 flex-col">
                      <View className="flex-row items-center gap-2">
                        <Text
                          numberOfLines={1}
                          className="text-sm font-black uppercase italic leading-none text-text"
                        >
                          {activeConv?.residente?.nombre || 'Residente'}
                        </Text>
                        <Info size={12} color={tokens.text} />
                      </View>
                      <View className="mt-2 flex-row items-center gap-2">
                        {/* w-1.5 h-1.5 bg-text/10 animate-pulse outline-2 outline-text/20.
                            CSS outlines sit OUTSIDE the box (6px dot + 2px ring
                            = 10px); RN borders are inset, so the box grows. */}
                        <Pulse
                          className="rounded-full border-2 border-text/20 bg-text/10"
                          style={{ width: 10, height: 10 }}
                        />
                        <Text
                          className="font-black uppercase text-text"
                          style={{ fontSize: 9, letterSpacing: 1 }}
                        >
                          {activeConv?.residente?.torre && activeConv?.residente?.apto
                            ? `Apto ${activeConv.residente.torre}-${activeConv.residente.apto} • `
                            : ''}
                          En Línea
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  <View className="flex-row items-center gap-2">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Llamar por citofonía"
                      onPress={handleCallResident}
                      disabled={callState !== 'IDLE'}
                      style={({ pressed }) => ({
                        opacity: callState !== 'IDLE' ? 0.3 : 1,
                        transform: [{ scale: pressed && callState === 'IDLE' ? 0.9 : 1 }],
                      })}
                      // web: bg-success/15 border-success/30 text-success
                      className="h-10 w-10 items-center justify-center rounded-2xl border border-success/30 bg-success/15"
                    >
                      <Phone size={18} color={tokens.success} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Cerrar"
                      onPress={() => setSelectedUserId(null)}
                      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
                      className="h-10 w-10 items-center justify-center rounded-2xl border border-border bg-surface"
                    >
                      <X size={20} color={tokens.textMuted} />
                    </Pressable>
                  </View>
                </View>

                {/* BODY REGION (chat + input, overlaid by the intel panel) */}
                <View className="flex-1">
                  {/* Chat-body wash: web `bg-linear-to-b from-transparent
                      via-transparent to-surface-2/40`. Sits behind the scroll
                      view and the input dock (both later siblings). */}
                  <LinearGradient
                    colors={['transparent', 'transparent', tokens.surface2]}
                    locations={[0, 0.5, 1]}
                    style={[StyleSheet.absoluteFill, { opacity: 0.4 }]}
                    pointerEvents="none"
                  />
                  {/* CHAT BODY */}
                  <ScrollView
                    ref={scrollRef}
                    className="flex-1"
                    contentContainerStyle={{
                      paddingHorizontal: 24,
                      paddingTop: 32,
                      paddingBottom: 24,
                      gap: 20,
                      flexGrow: 1,
                    }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {messages.length === 0 ? (
                      <View
                        className="flex-1 items-center justify-center gap-8"
                        style={{ opacity: 0.65 }}
                      >
                        <Pulse className="h-24 w-24 items-center justify-center rounded-full border border-border bg-surface2">
                          <MessageCircle size={48} color={tokens.text} />
                        </Pulse>
                        <Text
                          className="text-center font-black uppercase leading-relaxed text-text"
                          style={{ fontSize: 11, letterSpacing: 3.3, maxWidth: 240 }}
                        >
                          Inicia un canal de comunicación seguro con el residente
                        </Text>
                      </View>
                    ) : (
                      messages.map((m, idx) => (
                        <Animated.View
                          key={`${m.id}-${idx}`}
                          entering={FadeInDown.duration(400)}
                          className={`flex-row ${m.esDeAdmin ? 'justify-end' : 'justify-start'}`}
                        >
                          <View
                            className={`px-5 py-4 ${
                              m.esDeAdmin
                                ? 'rounded-[28px] rounded-tr-none'
                                : 'rounded-[28px] rounded-tl-none border border-border bg-surface2'
                            }`}
                            style={
                              m.esDeAdmin
                                ? { maxWidth: '82%', backgroundColor: tokens.accent }
                                : { maxWidth: '82%' }
                            }
                          >
                            {m.audioUrl ? (
                              <AudioMessage
                                url={m.audioUrl}
                                transcription={m.transcripcion}
                                // web: the Music glyph inherits the bubble ink,
                                // every other element is explicitly `text-text`.
                                bubbleInk={m.esDeAdmin ? tokens.onAccent : tokens.text}
                                textColor={tokens.text}
                                trackColor={tokens.surface2}
                                borderColor={tokens.border}
                              />
                            ) : (
                              <Text
                                className="leading-relaxed"
                                style={{
                                  fontSize: 14,
                                  color: m.esDeAdmin ? tokens.onAccent : tokens.text,
                                  fontWeight: m.esDeAdmin ? '500' : '400',
                                }}
                              >
                                {m.mensaje}
                              </Text>
                            )}

                            <View
                              className={`mt-2.5 flex-row items-center gap-1.5 ${
                                m.esDeAdmin ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              <Text
                                className="font-bold uppercase"
                                style={{
                                  fontSize: 8,
                                  letterSpacing: 1.5,
                                  color: m.esDeAdmin ? tokens.onAccent : tokens.text,
                                }}
                              >
                                {formatTime(m.createdAt)}
                              </Text>
                              {m.esDeAdmin ? (
                                <CheckCheck size={11} color={tokens.onAccent} />
                              ) : null}
                            </View>
                          </View>
                        </Animated.View>
                      ))
                    )}
                    <View style={{ height: 40 }} />
                  </ScrollView>

                  {/* CHAT INPUT AREA */}
                  <View
                    className="border-t border-border px-6 pb-11 pt-6"
                    style={{ backgroundColor: tokens.surface }}
                  >
                    <View className="flex-row items-center gap-4">
                      {isRecording ? (
                        <Animated.View
                          entering={FadeInDown.duration(300)}
                          className="h-16 flex-1 flex-row items-center gap-4 rounded-[32px] border border-text/20 bg-text/10 px-8"
                        >
                          <Pulse
                            className="rounded-full bg-text/10"
                            style={{ width: 12, height: 12 }}
                          />
                          <Text className="text-sm font-black text-text">
                            {formatRecording(recordingTime)}
                          </Text>
                          <View className="flex-1 flex-row items-center gap-1.5 overflow-hidden">
                            {waveBars.map((h, i) => (
                              <View
                                key={i}
                                className="rounded-full bg-text/30"
                                style={{ width: 4, height: h }}
                              />
                            ))}
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Detener grabación"
                            onPress={() => {
                              void stopRecording();
                            }}
                            style={({ pressed }) => ({
                              transform: [{ scale: pressed ? 0.9 : 1 }],
                              backgroundColor: tokens.accent,
                            })}
                            className="h-10 w-10 items-center justify-center rounded-xl"
                          >
                            <X size={20} color={tokens.onAccent} />
                          </Pressable>
                        </Animated.View>
                      ) : (
                        <View className="min-h-[64px] flex-1 flex-row items-center rounded-[32px] border border-border bg-surface px-8">
                          <TextInput
                            value={newMessage}
                            onChangeText={setNewMessage}
                            onSubmitEditing={() => {
                              void sendMessage();
                            }}
                            returnKeyType="send"
                            placeholder="Emitir respuesta administrativa..."
                            placeholderTextColor={tokens.text}
                            className="flex-1 text-sm font-medium text-text"
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Grabar nota de voz"
                            onPress={() => {
                              void startRecording();
                            }}
                            className="h-10 w-10 items-center justify-center rounded-2xl border border-transparent bg-surface2"
                          >
                            <Mic size={20} color={tokens.text} />
                          </Pressable>
                        </View>
                      )}

                      {!isRecording ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Enviar"
                          accessibilityState={{ disabled: sendDisabled, busy: sending }}
                          onPress={() => {
                            void sendMessage();
                          }}
                          disabled={sendDisabled}
                          style={({ pressed }) => ({
                            width: 64,
                            height: 64,
                            borderRadius: 32,
                            borderWidth: 6,
                            borderColor: tokens.surface2,
                            backgroundColor: tokens.accent,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: sendDisabled ? 0.2 : 1,
                            transform: [{ scale: pressed && !sendDisabled ? 0.9 : 1 }],
                            shadowColor: tokens.accent,
                            shadowOpacity: 0.28,
                            shadowRadius: 25,
                            shadowOffset: { width: 0, height: 20 },
                            elevation: 10,
                          })}
                        >
                          {sending ? (
                            <ActivityIndicator size="small" color={tokens.onAccent} />
                          ) : (
                            <ArrowRight size={32} color={tokens.onAccent} />
                          )}
                        </Pressable>
                      ) : null}
                    </View>

                    <View
                      className="mt-6 flex-row items-center justify-center gap-3"
                      style={{ opacity: 0.7 }}
                    >
                      <ShieldCheck size={14} color={tokens.text} />
                      <Text
                        className="font-black uppercase italic text-text"
                        style={{ fontSize: 10, letterSpacing: 3 }}
                      >
                        Comunicación Segura • ConjuntOS Engine
                      </Text>
                    </View>
                  </View>

                  {/* RESIDENT INTEL OVERLAY */}
                  {showInfoPanel && residentInfo?.profile ? (
                    <Animated.View
                      entering={SlideInUp.duration(500)}
                      style={StyleSheet.absoluteFill}
                      className="border-t border-border bg-primary"
                    >
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ padding: 32, gap: 40 }}
                      >
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 gap-1 pr-4">
                            <View className="mb-2 flex-row items-center gap-2">
                              <ShieldCheck size={14} color={tokens.text} />
                              <Text
                                className="font-black uppercase italic text-text"
                                style={{ fontSize: 10, letterSpacing: 1.5 }}
                              >
                                Inteligencia Residencial
                              </Text>
                            </View>
                            <Text
                              className="font-black uppercase italic leading-tight text-text"
                              style={{ fontSize: 30 }}
                            >
                              {residentInfo.profile.nombre}
                            </Text>
                            <Text className="text-xs font-medium text-text">
                              {residentInfo.profile.email}
                            </Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Cerrar"
                            onPress={() => setShowInfoPanel(false)}
                            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
                            className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface"
                          >
                            <ChevronLeft
                              size={24}
                              color={tokens.text}
                              style={{ transform: [{ rotate: '90deg' }] }}
                            />
                          </Pressable>
                        </View>

                        {/* DOSSIER CARDS */}
                        <View className="flex-row flex-wrap gap-4">
                          <View
                            className="rounded-3xl border border-border bg-surface p-5"
                            style={{ flexBasis: '46%', flexGrow: 1 }}
                          >
                            <Building2 size={18} color={tokens.text} style={{ marginBottom: 12 }} />
                            <Text
                              className="font-black uppercase text-text"
                              style={{ fontSize: 9, letterSpacing: 1.5 }}
                            >
                              Identificación Unidad
                            </Text>
                            <Text className="mt-1 text-sm font-black uppercase italic text-text">
                              Torre {residentInfo.profile.torre} • Apto {residentInfo.profile.apto}
                            </Text>
                          </View>
                          <View
                            className="rounded-3xl border border-border bg-surface p-5"
                            style={{ flexBasis: '46%', flexGrow: 1 }}
                          >
                            <ShieldCheck
                              size={18}
                              color={tokens.text}
                              style={{ marginBottom: 12 }}
                            />
                            <Text
                              className="font-black uppercase text-text"
                              style={{ fontSize: 9, letterSpacing: 1.5 }}
                            >
                              Estado Jurídico
                            </Text>
                            <Text className="mt-1 text-sm font-black uppercase italic text-text">
                              {residentInfo.profile.rol}
                            </Text>
                          </View>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Contacto Directo"
                            onPress={() => {
                              const tel = residentInfo.profile?.telefono;
                              Linking.openURL(`tel:${tel ?? ''}`).catch(() => {
                                toast.error('No se pudo abrir el enlace');
                              });
                            }}
                            style={({ pressed }) => ({
                              width: '100%',
                              transform: [{ scale: pressed ? 0.95 : 1 }],
                            })}
                            className="flex-row items-center justify-between rounded-3xl border border-border bg-text/10 p-5"
                          >
                            <View className="flex-col gap-1">
                              <Text
                                className="mb-1 font-black uppercase leading-none text-text"
                                style={{ fontSize: 9, letterSpacing: 1.5 }}
                              >
                                Contacto Directo
                              </Text>
                              <Text
                                className="font-black italic leading-none text-text"
                                style={{ fontSize: 20 }}
                              >
                                {residentInfo.profile.telefono || 'CONSULTAR...'}
                              </Text>
                            </View>
                            <View
                              className="h-12 w-12 items-center justify-center rounded-2xl"
                              style={{ backgroundColor: tokens.accent }}
                            >
                              <Phone size={22} color={tokens.onAccent} fill={tokens.onAccent} />
                            </View>
                          </Pressable>
                        </View>

                        {/* ASSET LISTS — Vehículos */}
                        <View className="gap-4">
                          <View
                            className="flex-row items-center gap-3"
                            style={{ opacity: 0.7 }}
                          >
                            <Car size={20} color={tokens.text} />
                            <Text
                              className="font-black uppercase text-text"
                              style={{ fontSize: 11, letterSpacing: 2.2 }}
                            >
                              Vehículos ({residentInfo.vehicles.length})
                            </Text>
                          </View>
                          <View className="gap-3">
                            {residentInfo.vehicles.length === 0 ? (
                              <DashedEmpty label="Sin registros vehiculares" color={tokens.text} />
                            ) : (
                              residentInfo.vehicles.map((v, i) => (
                                <View
                                  key={i}
                                  className="flex-row items-center justify-between rounded-2xl border border-border bg-surface p-4"
                                >
                                  <View className="flex-row items-center gap-4">
                                    <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface2">
                                      <Text className="text-sm font-black uppercase italic text-text">
                                        {v.placa.slice(0, 2)}
                                      </Text>
                                    </View>
                                    <View>
                                      <Text
                                        className="text-base font-black text-text"
                                        style={{ letterSpacing: 2 }}
                                      >
                                        {v.placa}
                                      </Text>
                                      <Text
                                        className="font-bold uppercase text-text"
                                        style={{ fontSize: 10, letterSpacing: 1.5 }}
                                      >
                                        {v.marca} {v.modelo}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              ))
                            )}
                          </View>
                        </View>

                        {/* ASSET LISTS — Mascotas */}
                        <View className="gap-4 pb-20">
                          <View
                            className="flex-row items-center gap-3"
                            style={{ opacity: 0.7 }}
                          >
                            <Dog size={20} color={tokens.text} />
                            <Text
                              className="font-black uppercase text-text"
                              style={{ fontSize: 11, letterSpacing: 2.2 }}
                            >
                              Mascotas ({residentInfo.pets.length})
                            </Text>
                          </View>
                          <View className="gap-4">
                            {residentInfo.pets.length === 0 ? (
                              <DashedEmpty label="Sin mascotas registradas" color={tokens.text} />
                            ) : (
                              residentInfo.pets.map((p, i) => (
                                <View
                                  key={i}
                                  className="flex-row items-center gap-5 rounded-[32px] border border-border bg-surface p-5"
                                >
                                  <View className="h-14 w-14 items-center justify-center rounded-2xl border border-border bg-text/10">
                                    <Dog size={24} color={tokens.text} />
                                  </View>
                                  <View className="min-w-0 flex-1">
                                    <Text className="mb-1.5 text-lg font-black uppercase italic leading-none text-text">
                                      {p.nombre}
                                    </Text>
                                    <View className="flex-row">
                                      <View className="rounded-full bg-surface2 px-3 py-1">
                                        <Text
                                          className="font-black uppercase text-text"
                                          style={{ fontSize: 10, letterSpacing: 1.5 }}
                                        >
                                          {p.tipo} • {p.raza || 'Cruce'}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                </View>
                              ))
                            )}
                          </View>
                        </View>
                      </ScrollView>
                    </Animated.View>
                  ) : null}
                </View>
              </KeyboardAvoidingView>
            </Animated.View>
          ) : null}
        </Animated.View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Availability toggle — the web's 48x24 pill with a 16px knob.
// ---------------------------------------------------------------------------

interface AvailabilityToggleProps {
  value: boolean;
  disabled: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  onColor: string;
  offColor: string;
  knobColor: string;
}

function AvailabilityToggle({
  value,
  disabled,
  onToggle,
  accessibilityLabel,
  onColor,
  offColor,
  knobColor,
}: AvailabilityToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      onPress={onToggle}
      disabled={disabled}
      style={{
        width: 48,
        height: 24,
        borderRadius: 12,
        padding: 4,
        justifyContent: 'center',
        backgroundColor: value ? onColor : offColor,
        // bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)] on the web.
        shadowColor: onColor,
        shadowOpacity: value ? 0.3 : 0,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
        elevation: value ? 4 : 0,
      }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: knobColor,
          transform: [{ translateX: value ? 24 : 0 }],
        }}
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Dashed empty state (web `DashedEmpty`).
// ---------------------------------------------------------------------------

function DashedEmpty({ label, color }: { label: string; color: string }) {
  return (
    <View
      className="items-center justify-center gap-4 rounded-[32px] border border-dashed border-border bg-surface p-8"
      style={{ borderStyle: 'dashed' }}
    >
      <Text
        className="font-black uppercase italic"
        style={{ fontSize: 10, letterSpacing: 2, color }}
      >
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Voice-note bubble (web `AudioMessage`): play/pause, progress bar, and a
// collapsible transcription.
// ---------------------------------------------------------------------------

interface AudioMessageProps {
  url: string;
  transcription?: string | null;
  /** Explicit `text-text` ink (play/pause, "Ver transcripción", transcripción). */
  textColor: string;
  /** currentColor of the bubble — only the Music glyph inherits it on web. */
  bubbleInk: string;
  trackColor: string;
  borderColor: string;
}

function AudioMessage({
  url,
  transcription,
  textColor,
  bubbleInk,
  trackColor,
  borderColor,
}: AudioMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    return () => {
      playerRef.current?.pause();
      playerRef.current?.release();
      playerRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(() => {
    const existing = playerRef.current;
    if (existing) {
      if (isPlaying) existing.pause();
      else existing.play();
      setIsPlaying(!isPlaying);
      return;
    }
    try {
      const player = createAudioPlayer(url);
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          sub?.remove();
        }
      });
      player.play();
      playerRef.current = player;
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [isPlaying, url]);

  return (
    <View className="flex-col gap-3" style={{ minWidth: 200 }}>
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
          onPress={togglePlay}
          className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2"
        >
          {isPlaying ? (
            <Pause size={18} color={textColor} />
          ) : (
            <Play size={18} color={textColor} style={{ marginLeft: 2 }} />
          )}
        </Pressable>
        <View
          className="h-1.5 flex-1 overflow-hidden rounded-full"
          style={{ backgroundColor: trackColor }}
        >
          {/* web: `w-full animate-pulse` while playing, `w-0` otherwise */}
          {isPlaying ? (
            <Pulse className="h-full rounded-full bg-text/10" style={{ width: '100%' }} />
          ) : null}
        </View>
        <Music size={14} color={bubbleInk} style={{ opacity: 0.4 }} />
      </View>

      {transcription ? (
        <View className="mt-1 border-t pt-2" style={{ borderTopColor: borderColor }}>
          {!showTranscription ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowTranscription(true)}
            >
              <Text
                className="font-black uppercase"
                style={{ fontSize: 9, letterSpacing: 1.5, color: textColor }}
              >
                Ver transcripción
              </Text>
            </Pressable>
          ) : (
            <Text
              className="italic leading-relaxed"
              style={{ fontSize: 11, opacity: 0.85, color: textColor }}
            >
              {'"'}
              {transcription}
              {'"'}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
