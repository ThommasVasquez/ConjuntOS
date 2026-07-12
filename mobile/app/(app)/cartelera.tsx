/**
 * CARTELERA - CONJUNTOSAPP (mobile port)
 * Tablón de anuncios oficiales de la administración.
 *
 * Ported from web src/app/(app)/cartelera/page.tsx:
 *  - GET /anuncios → Notice view-model (tipo→priority: URGENTE=ALTA,
 *    MANTENIMIENTO=MEDIA, resto BAJA), realtime refetch via WS 'anuncio'.
 *  - Category tabs, pinned (fijado) notices float to the top with a badge.
 *  - Full-screen detail sheet with native Share (RN Share.share).
 *  - Embedded resident→admin chat: GET /chat on open, POST /chat {mensaje}
 *    with optimistic append + rollback on error.
 *  - The web's hardcoded 'Circular_Informativa.pdf' download is intentionally
 *    NOT ported (fake download).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import {
  ArrowRight,
  Building2,
  Calendar,
  Clock,
  FileText,
  Megaphone,
  MessageCircle,
  Pin,
  Share2,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import type { AnuncioDto, ChatMensajeDto } from '@/lib/api/types';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';

// Accent tints (pure b/w theme + the two allowed accents).
const ICON_COLOR = '#FFFFFF';
const INFO = '#009df2';
const SUCCESS = '#57bf00';

const CATEGORIES = [
  'TODOS',
  'ADMINISTRACION',
  'LICITACION',
  'SEGURIDAD',
  'EVENTO',
  'MANTENIMIENTO',
] as const;

// ---------------------------------------------------------------------------
// View-model — mirrors the web page's `Notice` mapping of AnuncioDto.
// ---------------------------------------------------------------------------

interface Notice {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
  date: string;
  author: string;
  image?: string;
  fijado?: boolean;
}

function mapAnuncio(a: AnuncioDto): Notice {
  return {
    id: a.id,
    title: a.titulo,
    content: a.contenido,
    category: a.tipo,
    priority: a.tipo === 'URGENTE' ? 'ALTA' : a.tipo === 'MANTENIMIENTO' ? 'MEDIA' : 'BAJA',
    date: new Date(a.publicadoEn).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    author: 'Administración',
    image: a.imagenUrl || undefined,
    fijado: a.fijado,
  };
}

function getNoticeIcon(cat: string, size = 18, color: string = INFO): ReactElement {
  switch (cat) {
    case 'URGENTE':
      return <ShieldAlert size={size} color={color} />;
    case 'MANTENIMIENTO':
      return <Wrench size={size} color={color} />;
    case 'EVENTO':
      return <Calendar size={size} color={color} />;
    case 'LICITACION':
      return <FileText size={size} color={color} />;
    case 'ADMINISTRACION':
      return <Building2 size={size} color={color} />;
    default:
      return <Megaphone size={size} color={color} />;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Cartelera() {
  const { user } = useAuth();
  const userId = user?.id;

  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoadingNotices, setIsLoadingNotices] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  // The web hardcodes the admin as online; kept as a constant here.
  const isAdminOnline = true;

  const refetchAnuncios = useCallback(async () => {
    try {
      const anunciosData = await api.get<AnuncioDto[]>('/anuncios');
      setNotices((anunciosData ?? []).map(mapAnuncio));
    } catch {
      // Silent, like the web's `.catch(() => {})` on realtime refresh.
    }
  }, []);

  // Real-time WebSocket subscription for anuncios.
  useWsSubscription('anuncio', refetchAnuncios);

  // Initial fetch, guarded by an authenticated user (mirrors `if (user)`).
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const anunciosData = await api.get<AnuncioDto[]>('/anuncios');
        if (active) setNotices((anunciosData ?? []).map(mapAnuncio));
      } catch (error) {
        console.error('Error initializing Cartelera:', error);
        if (active) setNotices([]);
      } finally {
        if (active) setIsLoadingNotices(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userId]);

  const filteredNotices = (
    selectedCategory === 'TODOS'
      ? notices
      : notices.filter((n) => n.category === selectedCategory)
  )
    // Pinned (fijado) notices float to the top of the feed.
    .slice()
    .sort((a, b) => Number(b.fijado ?? false) - Number(a.fijado ?? false));

  return (
    <Screen scroll={false} className="bg-primary">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 24 }}
      >
        <Animated.View entering={FadeInDown.duration(500)}>
          <ProfileHeader />
        </Animated.View>

        {/* FILTER TABS */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -24 }}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
          >
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  className={`rounded-2xl border px-5 py-2.5 ${
                    active ? 'border-accent bg-accent' : 'border-border bg-surface2'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      active ? 'text-on-accent' : 'text-text'
                    }`}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* NOTICES FEED */}
        <View className="gap-6">
          {isLoadingNotices ? (
            <View className="items-center justify-center gap-4 py-20">
              <ActivityIndicator size="large" color={INFO} />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                Sincronizando Cartelera...
              </Text>
            </View>
          ) : filteredNotices.length === 0 ? (
            <LiquidGlass
              radius={32}
              className="items-center justify-center gap-4 rounded-[32px] border border-border p-10"
            >
              <Megaphone size={32} color={ICON_COLOR} />
              <Text className="text-sm font-bold text-text">No hay avisos publicados</Text>
            </LiquidGlass>
          ) : (
            filteredNotices.map((notice, i) => (
              <Animated.View key={notice.id} entering={FadeInDown.delay(i * 60).duration(450)}>
                <Pressable
                  onPress={() => setSelectedNotice(notice)}
                  style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
                >
                  <LiquidGlass
                    radius={32}
                    className="overflow-hidden rounded-[32px] border border-border"
                  >
                    {notice.image ? (
                      <View className="h-40 w-full overflow-hidden">
                        <Image
                          source={{ uri: notice.image }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          transition={300}
                        />
                      </View>
                    ) : null}
                    <View className="gap-4 p-6">
                      <View className="flex-row items-start justify-between">
                        <View className="flex-row items-center gap-2">
                          <View className="rounded-lg border border-border bg-surface2 px-2.5 py-1">
                            <Text className="text-[9px] font-black uppercase tracking-widest text-text">
                              Prioridad {notice.priority}
                            </Text>
                          </View>
                          {notice.fijado ? (
                            <View
                              className="flex-row items-center gap-1 rounded-lg border px-2.5 py-1"
                              style={{
                                borderColor: 'rgba(0, 157, 242, 0.3)',
                                backgroundColor: 'rgba(0, 157, 242, 0.15)',
                              }}
                            >
                              <Pin size={10} color={INFO} />
                              <Text
                                className="text-[9px] font-black uppercase tracking-widest"
                                style={{ color: INFO }}
                              >
                                Fijado
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-[10px] font-bold text-text">{notice.date}</Text>
                      </View>

                      <View className="gap-2">
                        <View className="flex-row items-center gap-2">
                          {getNoticeIcon(notice.category)}
                          <Text
                            className="text-[10px] font-bold uppercase tracking-widest"
                            style={{ color: INFO, opacity: 0.8 }}
                          >
                            {notice.category}
                          </Text>
                        </View>
                        <Text className="text-lg font-bold leading-snug text-text">
                          {notice.title}
                        </Text>
                        <Text numberOfLines={2} className="text-xs leading-relaxed text-text">
                          {notice.content}
                        </Text>
                      </View>

                      <View className="flex-row items-center justify-between border-t border-border pt-4">
                        <View className="flex-row items-center gap-2">
                          <Megaphone size={12} color={ICON_COLOR} />
                          <Text className="text-[10px] text-text">{notice.author}</Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Text
                            className="text-[10px] font-bold uppercase"
                            style={{ color: INFO }}
                          >
                            Leer más
                          </Text>
                          <ArrowRight size={14} color={INFO} />
                        </View>
                      </View>
                    </View>
                  </LiquidGlass>
                </Pressable>
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>

      {/* FLOATING ACTION BUTTON: CHAT WITH ADMIN */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', right: 24, bottom: 148 }}
      >
        <Pressable
          onPress={() => setIsChatOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Chat Administrativo"
          style={({ pressed }) => ({
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: INFO,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: INFO,
            shadowOpacity: 0.4,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <MessageCircle size={28} color="#FFFFFF" />
          {/* Status Indicator Dot */}
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: 4,
              borderColor: '#000000',
              backgroundColor: isAdminOnline ? SUCCESS : 'rgba(255,255,255,0.3)',
            }}
          />
        </Pressable>
      </View>

      <NoticeDetailModal notice={selectedNotice} onClose={() => setSelectedNotice(null)} />

      <AdminChatModal
        open={isChatOpen}
        isAdminOnline={isAdminOnline}
        onClose={() => setIsChatOpen(false)}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Detail modal — full-screen slide-up sheet mirroring the web overlay.
// The web's hardcoded "Circular_Informativa.pdf" download is skipped.
// ---------------------------------------------------------------------------

interface NoticeDetailModalProps {
  notice: Notice | null;
  onClose: () => void;
}

function NoticeDetailModal({ notice, onClose }: NoticeDetailModalProps) {
  const insets = useSafeAreaInsets();

  const handleShare = useCallback(() => {
    if (!notice) return;
    Share.share({
      title: notice.title,
      message: `${notice.title}\n\n${notice.content}`,
    }).catch(() => {
      toast.error('No se pudo compartir el aviso');
    });
  }, [notice]);

  return (
    <Modal
      visible={notice !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Animated.View entering={FadeIn.duration(250)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pressable
            onPress={onClose}
            className="flex-1 bg-black/90"
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
        </Animated.View>

        {notice ? (
          <Animated.View
            entering={SlideInDown.duration(400)}
            className="overflow-hidden rounded-t-[40px] border-t border-border bg-primary"
            style={{ maxHeight: '85%' }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
              {notice.image ? (
                <View className="h-56 w-full">
                  <Image
                    source={{ uri: notice.image }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={300}
                  />
                  <Pressable
                    onPress={onClose}
                    className="absolute right-6 top-6 h-10 w-10 items-center justify-center rounded-full border border-border bg-black/40"
                  >
                    <X size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : null}

              <View className="gap-6 p-8">
                {!notice.image ? (
                  <View className="flex-row justify-end">
                    <Pressable
                      onPress={onClose}
                      className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2"
                    >
                      <X size={20} color={ICON_COLOR} />
                    </Pressable>
                  </View>
                ) : null}

                <View className="gap-3">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="h-10 w-10 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: INFO }}
                    >
                      {getNoticeIcon(notice.category, 18, '#FFFFFF')}
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: INFO }}
                      >
                        {notice.category}
                      </Text>
                      <Text className="mt-1 text-2xl font-bold leading-tight tracking-tight text-text">
                        {notice.title}
                      </Text>
                    </View>
                  </View>
                  <View className="mt-2 flex-row items-center gap-4">
                    <View className="flex-row items-center gap-1.5">
                      <Clock size={12} color={ICON_COLOR} />
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                        {notice.date}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <Megaphone size={12} color={ICON_COLOR} />
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                        {notice.author}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text className="text-base leading-relaxed text-text">{notice.content}</Text>

                <Pressable
                  onPress={handleShare}
                  style={({ pressed }) => ({
                    backgroundColor: INFO,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                  className="w-full flex-row items-center justify-center gap-2 rounded-2xl py-4"
                >
                  <Share2 size={18} color="#FFFFFF" />
                  <Text className="text-base font-bold text-white">Compartir</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Administrative chat — resident → admin thread.
// GET /chat on open; POST /chat {mensaje} with optimistic append + rollback.
// ---------------------------------------------------------------------------

interface AdminChatModalProps {
  open: boolean;
  isAdminOnline: boolean;
  onClose: () => void;
}

function AdminChatModal({ open, isAdminOnline, onClose }: AdminChatModalProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [chatMessages, setChatMessages] = useState<ChatMensajeDto[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const fetchChat = useCallback(async () => {
    try {
      const data = await api.get<ChatMensajeDto[]>('/chat');
      setChatMessages(data);
    } catch (err) {
      console.error('Error fetching chat:', err);
    }
  }, []);

  // Fetch history each time the sheet opens (mirrors the web effect).
  useEffect(() => {
    if (open) {
      fetchChat();
    }
  }, [open, fetchChat]);

  // Live refresh while the thread is open (admin replies arrive via WS).
  useWsSubscription('chat', () => {
    if (open) fetchChat();
  });

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || isSending) return;
    setIsSending(true);

    // Optimistic update — the temp message is rolled back if the POST fails.
    const tempMsg: ChatMensajeDto = {
      id: `temp-${Date.now()}`,
      mensaje: newMessage,
      audioUrl: null,
      transcripcion: null,
      esDeAdmin: false,
      leido: true,
      createdAt: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, tempMsg]);
    setNewMessage('');

    try {
      await api.post('/chat', { mensaje: tempMsg.mensaje });
    } catch {
      // Roll back the optimistic message and restore the draft instead of
      // leaving a message the server never received stuck in the thread.
      setChatMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setNewMessage(tempMsg.mensaje);
      toast.error('Error de conexión');
    } finally {
      setIsSending(false);
    }
  }, [newMessage, isSending]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Animated.View entering={FadeIn.duration(250)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pressable
            onPress={onClose}
            className="flex-1 bg-black/60"
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
        </Animated.View>

        {open ? (
          <Animated.View
            entering={SlideInDown.duration(450)}
            className="overflow-hidden rounded-t-[40px] border-t border-border bg-primary"
            style={{ height: '90%' }}
          >
            {/* Chat Header */}
            <View className="flex-row items-center justify-between border-b border-border bg-surface p-6">
              <View className="flex-row items-center gap-4">
                <View className="h-12 w-12 items-center justify-center rounded-full border border-border bg-surface2">
                  <Building2 size={24} color={ICON_COLOR} />
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      borderWidth: 2,
                      borderColor: '#000000',
                      backgroundColor: isAdminOnline ? SUCCESS : 'rgba(255,255,255,0.3)',
                    }}
                  />
                </View>
                <View>
                  <Text className="text-sm font-bold tracking-tight text-text">
                    Atención al Copropietario
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    {isAdminOnline ? (
                      <View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: SUCCESS,
                        }}
                      />
                    ) : null}
                    <Text className="text-[10px] font-medium uppercase tracking-widest text-text">
                      {isAdminOnline ? 'Disponible' : 'Ausente'}
                    </Text>
                  </View>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                className="h-10 w-10 items-center justify-center rounded-full bg-surface2"
              >
                <X size={20} color={ICON_COLOR} />
              </Pressable>
            </View>

            {/* Chat Body (Messages) */}
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              contentContainerStyle={{ padding: 24, gap: 16, flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {chatMessages.length === 0 ? (
                <View className="flex-1 items-center justify-center gap-4">
                  <MessageCircle size={48} color="rgba(255,255,255,0.5)" />
                  <Text className="max-w-[200px] text-center text-[10px] font-bold uppercase leading-relaxed tracking-[2px] text-text">
                    Envía un mensaje para iniciar una conversación directa con la administración
                  </Text>
                </View>
              ) : (
                chatMessages.map((m) => (
                  <View
                    key={m.id}
                    className={`flex-row ${m.esDeAdmin ? 'justify-start' : 'justify-end'}`}
                  >
                    <View
                      className={`max-w-[85%] rounded-3xl p-4 ${
                        m.esDeAdmin
                          ? 'rounded-tl-none border border-border bg-surface2'
                          : 'rounded-tr-none'
                      }`}
                      style={m.esDeAdmin ? undefined : { backgroundColor: INFO }}
                    >
                      <Text
                        className={`text-sm leading-relaxed ${
                          m.esDeAdmin ? 'text-text' : 'font-medium text-white'
                        }`}
                      >
                        {m.mensaje}
                      </Text>
                      <Text
                        className={`mt-2 text-[8px] opacity-40 ${
                          m.esDeAdmin ? 'text-left text-text' : 'text-right text-white'
                        }`}
                      >
                        {formatTime(m.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Chat Input */}
            <View
              className="border-t border-border bg-surface p-6"
              style={{ paddingBottom: insets.bottom + 16 }}
            >
              <View className="flex-row items-center gap-3">
                <View className="min-h-[56px] flex-1 flex-row items-center rounded-[28px] border border-border bg-primary px-6">
                  <TextInput
                    value={newMessage}
                    onChangeText={setNewMessage}
                    onSubmitEditing={sendMessage}
                    returnKeyType="send"
                    placeholder="Describe tu solicitud o duda..."
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    className="flex-1 text-sm text-text"
                  />
                </View>
                <Pressable
                  onPress={sendMessage}
                  disabled={!newMessage.trim() || isSending}
                  style={({ pressed }) => ({
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: INFO,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: !newMessage.trim() || isSending ? 0.5 : 1,
                    transform: [{ scale: pressed ? 0.9 : 1 }],
                  })}
                >
                  {isSending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <ArrowRight size={24} color="#FFFFFF" />
                  )}
                </Pressable>
              </View>
              <View className="mt-4 flex-row items-center justify-center gap-2">
                <ShieldAlert size={10} color={ICON_COLOR} />
                <Text className="text-[9px] font-bold uppercase tracking-widest text-text">
                  Conexión Segura & Encriptada
                </Text>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
