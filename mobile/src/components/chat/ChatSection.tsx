/**
 * ChatSection — RN port of web `src/components/chat/ChatSection.tsx`.
 *
 * Reusable exactly like the web component: `{ compact?, huespedId? }`. Compact
 * mode caps the thread at `max-h-48`, tightens the gap to `space-y-2`, hides the
 * whole attachment bar and shrinks the composer to `p-2 rounded-2xl`
 * (web lines 357-359, 367-369, 424-425, 473-475), so an embedded chat (e.g.
 * mi-estancia) can drop it in without the full-screen dock.
 *
 * Feature parity:
 * - GET /chat + optional huespedId filter, POST /chat {mensaje, huespedId?}.
 * - Parser '[imagen]nombre|url' / '[archivo]nombre|url' / '[audio]' with an
 *   http(s)-only URL allowlist.
 * - Adjuntos: galería/cámara (expo-image-picker) → POST /uploads/imagen,
 *   documentos (expo-document-picker) → POST /uploads/archivo.
 * - Notas de voz: expo-audio Recording → POST /chat {mensaje:'[audio]',
 *   audioBase64} + inline player for audioUrl.
 * - Refresh: 5s poll like web, PLUS the WS domain 'chat' (message/read).
 *
 * MOBILE-ONLY (documented drift, both additive):
 * - `useWsSubscription('chat', …)` — web polls only (web line 92-97); the
 *   backend already broadcasts the domain, so the poll is the fallback here.
 * - `FadeInDown` entrance per bubble — no web counterpart, native affordance.
 *
 * NOTE(audio container): the backend (backend/api/src/domains/chat/handlers.rs)
 * base64-decodes `audioBase64` without container validation and stores it as
 * `chat-voice/<conjunto>/<uuid>.webm` with content-type `audio/webm` no matter
 * what was recorded. expo-audio cannot produce webm on iOS, so we record the
 * cross-platform HIGH_QUALITY preset (AAC/.m4a) — accepted by the backend
 * as-is. Web-recorded notes (real webm/opus) may not play on iOS (AVPlayer has
 * no webm demuxer); that is a pre-existing backend labeling limitation, not
 * solvable client-side.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
  Send,
  X,
} from 'lucide-react-native';

import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { safeHttpUrl } from '@/lib/safe-url';
import type { ChatMensajeDto } from '@/lib/api/types';
import { toast } from '@/components/ui/toast';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import { AudioMessage, RecordingDot, Skeleton, withAlpha } from '@/components/chat/parts';

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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatSectionProps {
  /** Embedded variant — web `compact` (max-h-48, no attachment bar). */
  compact?: boolean;
  /** Host → guest thread filter, web `huespedId`. */
  huespedId?: string;
  /**
   * RN-only: dock clearance under the composer while the keyboard is closed.
   * Web gets it from the page wrapper's `pb-40` (src/app/(app)/chat/page.tsx:13).
   */
  dockPadding?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatSection({ compact = false, huespedId, dockPadding = 0 }: ChatSectionProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const colors = tokensFor(theme);
  const { width: windowWidth } = useWindowDimensions();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  /** Measured thread width — the embedded (`compact`) variant is narrower than
   *  the window, so image bubbles cannot be sized off `useWindowDimensions`. */
  const [threadWidth, setThreadWidth] = useState(0);

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

  // ── Fetch + refresh (5s poll like web + WS message/read) ───────────
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Web images are `max-w-full max-h-64` inside a `max-w-[80%]` bubble: fluid
  // width, capped at 256px tall. RN needs the resolved width, so derive it from
  // the window (thread padding 16×2, bubble padding 16×2).
  const imageWidth = Math.max(160, (windowWidth - 32) * 0.8 - 32);

  // ── Render message content (audio / image / file / text) ───────────
  const renderMessageContent = (msg: ChatMsg, isOwn: boolean) => {
    // Own bubbles are a filled `bg-accent`, so their ink is `on-accent`.
    const inkClass = isOwn ? 'text-on-accent' : 'text-text';
    const ink = isOwn ? colors.onAccent : colors.text;

    // Audio message with a stored URL → inline player.
    if (msg.audioUrl) {
      const audioUrl = msg.audioUrl;
      return (
        <AudioMessage
          isOwn={isOwn}
          isPlaying={playingId === msg.id}
          onToggle={() => togglePlayAudio(msg.id, audioUrl)}
        />
      );
    }

    const parsed = parseMessage(msg.mensaje);

    if (parsed.type === 'audio_placeholder') {
      return <Text className={`text-xs italic opacity-60 ${inkClass}`}>🎤 Mensaje de voz</Text>;
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
              style={{ width: imageWidth, aspectRatio: 4 / 3, maxHeight: 256, borderRadius: 12 }}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
          {parsed.fileName ? (
            <Text className={`mt-1 text-[10px] opacity-60 ${inkClass}`}>{parsed.fileName}</Text>
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
          <Paperclip size={14} color={ink} />
          <Text className={`text-sm underline ${inkClass}`}>
            {parsed.fileName || 'Archivo adjunto'}
          </Text>
        </Pressable>
      );
    }

    return <Text className={`text-sm leading-relaxed ${inkClass}`}>{parsed.text}</Text>;
  };

  const sendDisabled = sending || !input.trim() || uploading;

  return (
    <View className={compact ? 'flex-col' : 'min-h-0 flex-1'}>
      {/* Messages area */}
      <ScrollView
        ref={scrollRef}
        className={compact ? '' : 'flex-1'}
        style={compact ? { maxHeight: 192 } : undefined}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: compact ? 8 : 16,
          gap: compact ? 8 : 12,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={64}
        onContentSizeChange={handleContentSizeChange}
      >
        {loading || !user ? (
          <View className="flex-1 items-center justify-center py-8">
            <Skeleton className="h-5 w-5 rounded-full" />
          </View>
        ) : messages.length === 0 ? (
          <Text className="mt-8 text-center text-sm text-text-muted">
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
            const inkClass = isOwn ? 'text-on-accent' : 'text-text';
            return (
              <Animated.View
                key={msg.id}
                entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(350)}
                className={`flex-row ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <View
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isOwn ? 'rounded-tr-sm bg-accent' : 'rounded-tl-sm bg-surface-2'
                  }`}
                >
                  {renderMessageContent(msg, isOwn)}
                  {/* Web: `text-[10px] mt-1 opacity-60 text-right` with the guest
                      name in a `mr-2` span (web lines 396-399). */}
                  <View className="mt-1 flex-row items-center justify-end gap-2">
                    {msg.huespedNombre ? (
                      <Text className={`text-[10px] opacity-60 ${inkClass}`}>
                        {msg.huespedNombre}
                      </Text>
                    ) : null}
                    <Text className={`text-[10px] opacity-60 ${inkClass}`}>
                      {formatTime(msg.createdAt)}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* Bottom dock: recording bar OR attachment bar + input */}
      <View style={{ paddingBottom: keyboardOpen ? 8 : dockPadding }}>
        {recording ? (
          <Animated.View
            entering={FadeInDown.duration(250)}
            className="mx-3 mb-1 flex-row items-center gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-2.5"
          >
            <RecordingDot />
            <Text className="flex-1 text-sm text-text">
              Grabando… {formatDuration(recordingTime)}
            </Text>
            <Pressable
              onPress={cancelRecording}
              accessibilityRole="button"
              accessibilityLabel="Cancelar grabación"
              className="p-1"
            >
              {({ pressed }) => (
                <X size={18} color={pressed ? colors.text : withAlpha(colors.text, 0.6)} />
              )}
            </Pressable>
            <Pressable
              onPress={stopRecording}
              accessibilityRole="button"
              accessibilityLabel="Enviar nota de voz"
              className="rounded-full bg-accent p-2"
            >
              <Send size={16} color={colors.onAccent} />
            </Pressable>
          </Animated.View>
        ) : (
          <>
            {/* Attachment bar — solo en modo completo */}
            {compact ? null : (
              <View className="flex-row items-center justify-center gap-4 px-4 py-2">
                <Pressable
                  onPress={pickFromGallery}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel="Galería de fotos"
                  className="p-2"
                  style={{ opacity: uploading ? 0.3 : 1 }}
                >
                  {({ pressed }) =>
                    uploading ? (
                      <Skeleton className="h-6 w-6 rounded-full" />
                    ) : (
                      <ImageIcon
                        size={22}
                        color={pressed ? colors.accent : withAlpha(colors.text, 0.5)}
                      />
                    )
                  }
                </Pressable>
                <Pressable
                  onPress={takePhoto}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel="Tomar foto"
                  className="p-2"
                  style={{ opacity: uploading ? 0.3 : 1 }}
                >
                  {({ pressed }) => (
                    <Camera
                      size={22}
                      color={pressed ? colors.accent : withAlpha(colors.text, 0.5)}
                    />
                  )}
                </Pressable>
                <Pressable
                  onPress={pickDocument}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel="Adjuntar archivo"
                  className="p-2"
                  style={{ opacity: uploading ? 0.3 : 1 }}
                >
                  {({ pressed }) => (
                    <Paperclip
                      size={22}
                      color={pressed ? colors.accent : withAlpha(colors.text, 0.5)}
                    />
                  )}
                </Pressable>
                <Pressable
                  onPress={startRecording}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel="Grabar mensaje de voz"
                  className="p-2"
                  style={{ opacity: uploading ? 0.3 : 1 }}
                >
                  {({ pressed }) => (
                    <Mic size={22} color={pressed ? colors.accent : withAlpha(colors.text, 0.5)} />
                  )}
                </Pressable>
              </View>
            )}

            {/* Input area */}
            <View
              className={
                compact
                  ? 'mx-3 mb-2 rounded-2xl border border-border bg-surface-2 p-2'
                  : 'mx-3 mb-2 rounded-3xl border border-border bg-surface-2 p-3'
              }
            >
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={handleSend}
                  returnKeyType="send"
                  placeholder="Escribe un mensaje..."
                  placeholderTextColor={withAlpha(colors.text, 0.4)}
                  editable={!uploading}
                  className="flex-1 rounded-full border border-border bg-primary px-4 py-2.5 text-sm text-text"
                  style={{ opacity: uploading ? 0.5 : 1 }}
                />
                <Pressable
                  onPress={handleSend}
                  disabled={sendDisabled}
                  accessibilityRole="button"
                  accessibilityLabel="Enviar mensaje"
                  className="rounded-full bg-accent p-2.5"
                  style={({ pressed }) => ({
                    opacity: sendDisabled ? 0.5 : pressed ? 0.9 : 1,
                  })}
                >
                  {sending ? (
                    <Skeleton className="h-5 w-5 rounded-full" />
                  ) : (
                    <Send size={18} color={colors.onAccent} />
                  )}
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export default ChatSection;
