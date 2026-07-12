/**
 * Chat - CONJUNTOSAPP (mobile port)
 * Hilo de conversación residente ↔ administración y anfitrión ↔ huésped.
 *
 * Ported from web src/components/chat/ChatSection.tsx (full, non-compact mode)
 * + src/app/(app)/chat/page.tsx. Feature parity:
 * - GET /chat + filtro opcional por huespedId (route param) y POST /chat
 *   {mensaje, huespedId?}.
 * - Parser de contenido '[imagen]nombre|url' / '[archivo]nombre|url' /
 *   '[audio]' con sanitización http(s)-only de URLs.
 * - Adjuntos: galería/cámara (expo-image-picker) → POST /uploads/imagen,
 *   documentos (expo-document-picker) → POST /uploads/archivo.
 * - Notas de voz: expo-av Recording → POST /chat {mensaje:'[audio]',
 *   audioBase64} y reproductor inline para audioUrl.
 * - Refresh: WS domain 'chat' (message/read) + poll de 5s como la web.
 *
 * NOTE(audio container): the backend (backend/api/src/domains/chat/handlers.rs)
 * base64-decodes `audioBase64` without container validation and stores it as
 * `chat-voice/<conjunto>/<uuid>.webm` with content-type `audio/webm` no matter
 * what was recorded. expo-av cannot produce webm on iOS (and OPUS/WEBM is not
 * exposed by its Android encoder enum), so we record the cross-platform
 * HIGH_QUALITY preset (AAC/.m4a) — accepted by the backend as-is. Web-recorded
 * notes (real webm/opus) may not play on iOS (AVPlayer has no webm demuxer);
 * that is a pre-existing backend labeling limitation, not solvable client-side.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import {
  AudioPlayer,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  RecordingPresets,
} from 'expo-audio';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { Image } from 'expo-image';
import {
  Camera,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  X,
} from 'lucide-react-native';

import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { safeHttpUrl } from '@/lib/safe-url';
import type { ChatMensajeDto } from '@/lib/api/types';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

// TODO(types-consolidate): ChatMensajeDto in @/lib/api/types lacks huespedId /
// huespedNombre (both present in the backend ChatMensajeDto). Extend locally
// until the shared types are regenerated.
interface ChatMsg extends ChatMensajeDto {
  huespedId?: string | null;
  huespedNombre?: string | null;
}

// TODO(types-consolidate): /uploads responses are not in @/lib/api/types yet.
interface UploadImagenResponse {
  url: string;
}
interface UploadArchivoResponse {
  url: string;
}

// ---------------------------------------------------------------------------
// Helpers (mirror ChatSection.tsx)
// ---------------------------------------------------------------------------

// safeHttpUrl (http(s)-only allowlist for Linking.openURL / image sources)
// now lives in @/lib/safe-url so pagos/inicio share the same discipline.

type ParsedMessage = {
  type: 'text' | 'image' | 'file' | 'audio_placeholder';
  text?: string;
  url?: string;
  fileName?: string;
};

/** Content parser: '[audio]', '[imagen]nombre|url', '[archivo]nombre|url'. */
function parseMessage(mensaje: string): ParsedMessage {
  if (mensaje === '[audio]') return { type: 'audio_placeholder' };
  const imgMatch = mensaje.match(/^\[imagen\](.+?)\|(.+)$/);
  if (imgMatch) return { type: 'image', fileName: imgMatch[1], url: imgMatch[2] };
  const fileMatch = mensaje.match(/^\[archivo\](.+?)\|(.+)$/);
  if (fileMatch) return { type: 'file', fileName: fileMatch[1], url: fileMatch[2] };
  return { type: 'text', text: mensaje };
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Liquid Glass accents (same constants as cartelera / tab bar).
const INFO = '#009df2';
const ICON_COLOR = '#FFFFFF';
const ICON_MUTED = 'rgba(255,255,255,0.5)';
// Recording bar red — matches web's #EF4444 usage in ChatSection.
const RECORD_RED = '#EF4444';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Chat() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Optional guest-thread filter: /chat?huespedId=... (host → guest thread).
  const params = useLocalSearchParams<{ huespedId?: string }>();
  const huespedId =
    typeof params.huespedId === 'string' && params.huespedId.length > 0
      ? params.huespedId
      : undefined;

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const isNearBottomRef = useRef(true);
  const justSentRef = useRef(false);

  // ── Voice recording state ──────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const discardRecordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Audio playback ─────────────────────────────────────────────────
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<AudioPlayer | null>(null);

  // ── Keyboard: drop the tab-bar clearance while the keyboard is open ─
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => {
      setKeyboardOpen(true);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Fetch + refresh (WS message/read + 5s poll, like web) ──────────
  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get<ChatMsg[]>('/chat');
      const filtered = huespedId
        ? data.filter((m) => !m.huespedId || m.huespedId === huespedId)
        : data;
      setMessages((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(filtered)) return prev;
        return filtered;
      });
    } catch {
      // silent, same as web
    } finally {
      setLoading(false);
    }
  }, [huespedId]);

  useEffect(() => {
    if (!user) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [user, fetchMessages]);

  useWsSubscription('chat', (event) => {
    if (event.action === 'message' || event.action === 'read') {
      fetchMessages();
    }
  });

  // ── Auto-scroll: after own sends always; otherwise only near bottom ─
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    isNearBottomRef.current = distFromBottom < 100;
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (justSentRef.current || isNearBottomRef.current) {
      justSentRef.current = false;
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, []);

  // ── Cleanup on unmount: stop timers, recording and playback ────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      discardRecordingRef.current = true;
      if (recorder.isRecording) recorder.stop().catch(() => {});
      soundRef.current?.pause();
      soundRef.current?.release();
      soundRef.current = null;
    };
  }, []);

  // ── Send text ───────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await api.post('/chat', {
        mensaje: input.trim(),
        ...(huespedId ? { huespedId } : {}),
      });
      setInput('');
      justSentRef.current = true;
      await fetchMessages();
    } catch {
      toast.error('Error al enviar mensaje');
    } finally {
      setSending(false);
    }
  }, [input, sending, huespedId, fetchMessages]);

  // ── Attachments: upload → send prefixed message ─────────────────────
  const sendImageAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      if (!asset.base64) {
        toast.error('Error al subir archivo');
        return;
      }
      setUploading(true);
      try {
        const mimeType = asset.mimeType || 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${asset.base64}`;
        const res = await api.post<UploadImagenResponse>('/uploads/imagen', {
          data: dataUrl,
          carpeta: 'chat',
        });
        const name = asset.fileName || `foto-${Date.now()}.jpg`;
        await api.post('/chat', {
          mensaje: `[imagen]${name}|${res.url}`,
          ...(huespedId ? { huespedId } : {}),
        });
        justSentRef.current = true;
        await fetchMessages();
        toast.success('Imagen enviada');
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Error al subir archivo');
      } finally {
        setUploading(false);
      }
    },
    [huespedId, fetchMessages],
  );

  const pickFromGallery = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Permiso de galería denegado');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    if (res.canceled || !res.assets?.[0]) return;
    await sendImageAsset(res.assets[0]);
  }, [sendImageAsset]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.error('Permiso de cámara denegado');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    if (res.canceled || !res.assets?.[0]) return;
    await sendImageAsset(res.assets[0]);
  }, [sendImageAsset]);

  const pickDocument = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const mimeType = asset.mimeType || 'application/octet-stream';
      const base64 = asset.base64 ?? (await new File(asset.uri).base64());
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const res2 = await api.post<UploadArchivoResponse>('/uploads/archivo', {
        data: dataUrl,
        nombre: asset.name,
      });
      await api.post('/chat', {
        mensaje: `[archivo]${asset.name}|${res2.url}`,
        ...(huespedId ? { huespedId } : {}),
      });
      justSentRef.current = true;
      await fetchMessages();
      toast.success('Archivo enviado');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al subir archivo');
    } finally {
      setUploading(false);
    }
  }, [huespedId, fetchMessages]);

  // ── Voice recording (expo-audio) ───────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        toast.error('No se pudo acceder al micrófono');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      discardRecordingRef.current = false;
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      toast.error('No se pudo acceder al micrófono');
    }
  }, [recorder]);

  const finishRecording = useCallback(async (): Promise<string | null> => {
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!recorder.isRecording) return null;
    try {
      await recorder.stop();
    } catch {
      return null;
    } finally {
      setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => {});
    }
    return recorder.uri;
  }, [recorder]);

  const stopRecording = useCallback(async () => {
    const uri = await finishRecording();
    if (!uri || discardRecordingRef.current) return;
    setUploading(true);
    try {
      const audioBase64 = await new File(uri).base64();
      await api.post('/chat', {
        mensaje: '[audio]',
        audioBase64,
        ...(huespedId ? { huespedId } : {}),
      });
      justSentRef.current = true;
      await fetchMessages();
      toast.success('Nota de voz enviada');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar audio');
    } finally {
      setUploading(false);
    }
  }, [finishRecording, huespedId, fetchMessages]);

  const cancelRecording = useCallback(() => {
    discardRecordingRef.current = true;
    void finishRecording();
  }, [finishRecording]);

  // ── Audio playback (expo-audio) ────────────────────────────────────────
  const stopPlayback = useCallback(async () => {
    const player = soundRef.current;
    soundRef.current = null;
    setPlayingId(null);
    if (player) {
      player.pause();
      player.release();
    }
  }, []);

  const togglePlayAudio = useCallback(
    async (msgId: string, url: string) => {
      if (playingId === msgId) {
        await stopPlayback();
        return;
      }
      await stopPlayback();
      try {
        const player = createAudioPlayer(url);
        player.play();
        const sub = player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            player.release();
            if (soundRef.current === player) soundRef.current = null;
            setPlayingId((prev) => (prev === msgId ? null : prev));
            sub?.remove();
          }
        });
        soundRef.current = player;
        setPlayingId(msgId);
      } catch {
        setPlayingId(null);
      }
    },
    [playingId, stopPlayback],
  );

  const openUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      toast.error('No se pudo abrir el enlace');
    });
  }, []);

  const isGuest = user?.rol === 'HUESPED_TEMPORAL';
  const isOwner = user?.rol === 'PROPIETARIO';

  // ── Render message content (audio / image / file / text) ───────────
  const renderMessageContent = (msg: ChatMsg, isOwn: boolean) => {
    // Audio message with a stored URL → inline player.
    if (msg.audioUrl) {
      const audioUrl = msg.audioUrl;
      const isPlaying = playingId === msg.id;
      return (
        <View className="min-w-[140px] flex-row items-center gap-2">
          <Pressable
            onPress={() => togglePlayAudio(msg.id, audioUrl)}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isPlaying ? (
              <Pause size={14} color={ICON_COLOR} />
            ) : (
              <Play size={14} color={ICON_COLOR} style={{ marginLeft: 2 }} />
            )}
          </Pressable>
          <View
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.2)',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: '60%',
                height: '100%',
                borderRadius: 3,
                backgroundColor: '#FFFFFF',
                opacity: isPlaying ? 1 : 0.7,
              }}
            />
          </View>
          <Text className="text-[10px] opacity-60">🎤</Text>
        </View>
      );
    }

    const parsed = parseMessage(msg.mensaje);

    if (parsed.type === 'audio_placeholder') {
      return (
        <Text className={`text-xs italic opacity-60 ${isOwn ? 'text-white' : 'text-text'}`}>
          🎤 Mensaje de voz
        </Text>
      );
    }

    const safeUrl = safeHttpUrl(parsed.url);

    if (parsed.type === 'image' && safeUrl) {
      return (
        <View>
          <Pressable
            onPress={() => openUrl(safeUrl)}
            accessibilityRole="imagebutton"
            accessibilityLabel={parsed.fileName || 'Imagen'}
          >
            <Image
              source={{ uri: safeUrl }}
              style={{ width: 220, height: 180, borderRadius: 16 }}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
          {parsed.fileName ? (
            <Text className={`mt-1 text-[10px] opacity-60 ${isOwn ? 'text-white' : 'text-text'}`}>
              {parsed.fileName}
            </Text>
          ) : null}
        </View>
      );
    }

    if (parsed.type === 'file' && safeUrl) {
      return (
        <Pressable
          onPress={() => openUrl(safeUrl)}
          accessibilityRole="link"
          className="flex-row items-center gap-2"
        >
          <Paperclip size={14} color={ICON_COLOR} />
          <Text className={`text-sm underline ${isOwn ? 'text-white' : 'text-text'}`}>
            {parsed.fileName || 'Archivo adjunto'}
          </Text>
        </Pressable>
      );
    }

    return (
      <Text className={`text-sm leading-relaxed ${isOwn ? 'font-medium text-white' : 'text-text'}`}>
        {parsed.text}
      </Text>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────
  // Custom full-height container (not <Screen>): the chat needs the input to
  // hug the keyboard, so the tab-bar clearance is dropped while typing —
  // mirrors the web page's dedicated absolute-inset layout.
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-primary"
      style={{ paddingTop: insets.top }}
    >
      <Animated.View
        entering={FadeInDown.duration(500)}
        className="border-b border-border px-6 pb-2 pt-4"
      >
        <ProfileHeader />
      </Animated.View>

      {/* Messages area */}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 12, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={64}
        onContentSizeChange={handleContentSizeChange}
      >
        {loading || !user ? (
          <View className="flex-1 items-center justify-center py-8">
            <ActivityIndicator size="small" color={INFO} />
          </View>
        ) : messages.length === 0 ? (
          <Text className="mt-8 text-center text-sm text-textMuted">
            No hay mensajes aún. Escribe uno para contactar a tu{' '}
            {isGuest ? 'anfitrión' : huespedId ? 'huésped' : 'administración'}.
          </Text>
        ) : (
          messages.map((msg, i) => {
            // Own-message alignment — replicated verbatim from web ChatSection.
            const isOwn = isGuest
              ? !!msg.huespedId
              : isOwner
                ? !msg.huespedId && !msg.esDeAdmin
                : msg.esDeAdmin;
            return (
              <Animated.View
                key={msg.id}
                entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(350)}
                className={`flex-row ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <View
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isOwn ? 'rounded-tr-sm' : 'rounded-tl-sm border border-border bg-surface2'
                  }`}
                  style={isOwn ? { backgroundColor: INFO } : undefined}
                >
                  {renderMessageContent(msg, isOwn)}
                  <Text
                    className={`mt-1 text-right text-[10px] opacity-60 ${
                      isOwn ? 'text-white' : 'text-text'
                    }`}
                  >
                    {msg.huespedNombre ? `${msg.huespedNombre}  ` : ''}
                    {formatTime(msg.createdAt)}
                  </Text>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* Bottom dock: recording bar OR attachment bar + input */}
      <View
        style={{
          paddingBottom: keyboardOpen ? 8 : Math.max(insets.bottom, 16) + 96,
        }}
      >
        {recording ? (
          <Animated.View
            entering={FadeInDown.duration(250)}
            className="mx-3 mb-1 flex-row items-center gap-3 rounded-2xl border px-4 py-2.5"
            style={{ borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.1)' }}
          >
            <View
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: RECORD_RED }}
            />
            <Text className="flex-1 text-sm text-text">
              Grabando… {formatDuration(recordingTime)}
            </Text>
            <Pressable
              onPress={cancelRecording}
              accessibilityRole="button"
              accessibilityLabel="Cancelar grabación"
              className="p-1"
            >
              <X size={18} color={ICON_MUTED} />
            </Pressable>
            <Pressable
              onPress={stopRecording}
              accessibilityRole="button"
              accessibilityLabel="Enviar nota de voz"
              style={{
                backgroundColor: INFO,
                borderRadius: 20,
                padding: 8,
              }}
            >
              <Send size={16} color={ICON_COLOR} />
            </Pressable>
          </Animated.View>
        ) : (
          <>
            {/* Attachment bar */}
            <View className="flex-row items-center justify-center gap-4 px-4 py-2">
              <Pressable
                onPress={pickFromGallery}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="Galería de fotos"
                className="p-2"
                style={{ opacity: uploading ? 0.3 : 1 }}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={ICON_MUTED} />
                ) : (
                  <ImageIcon size={22} color={ICON_MUTED} />
                )}
              </Pressable>
              <Pressable
                onPress={takePhoto}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="Tomar foto"
                className="p-2"
                style={{ opacity: uploading ? 0.3 : 1 }}
              >
                <Camera size={22} color={ICON_MUTED} />
              </Pressable>
              <Pressable
                onPress={pickDocument}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="Adjuntar archivo"
                className="p-2"
                style={{ opacity: uploading ? 0.3 : 1 }}
              >
                <Paperclip size={22} color={ICON_MUTED} />
              </Pressable>
              <Pressable
                onPress={startRecording}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="Grabar mensaje de voz"
                className="p-2"
                style={{ opacity: uploading ? 0.3 : 1 }}
              >
                <Mic size={22} color={ICON_MUTED} />
              </Pressable>
            </View>

            {/* Input area */}
            <View className="mx-3 rounded-3xl border border-border bg-surface2 p-3">
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={handleSend}
                  returnKeyType="send"
                  placeholder="Escribe un mensaje..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  editable={!uploading}
                  className="flex-1 rounded-full border border-border bg-primary px-4 py-2.5 text-sm text-text"
                  style={{ opacity: uploading ? 0.5 : 1 }}
                />
                <Pressable
                  onPress={handleSend}
                  disabled={sending || !input.trim() || uploading}
                  accessibilityRole="button"
                  accessibilityLabel="Enviar mensaje"
                  style={({ pressed }) => ({
                    backgroundColor: INFO,
                    borderRadius: 22,
                    padding: 11,
                    opacity: sending || !input.trim() || uploading ? 0.5 : pressed ? 0.9 : 1,
                  })}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color={ICON_COLOR} />
                  ) : (
                    <Send size={18} color={ICON_COLOR} />
                  )}
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
