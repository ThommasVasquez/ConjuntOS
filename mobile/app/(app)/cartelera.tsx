/**
 * CARTELERA - CONJUNTOSAPP (mobile port)
 * Tablón de anuncios oficiales de la administración.
 *
 * Ported from web src/app/(app)/cartelera/page.tsx:
 *  - GET /anuncios → Notice view-model (tipo→priority: URGENTE=ALTA,
 *    MANTENIMIENTO=MEDIA, resto BAJA), realtime refetch via WS 'anuncio'.
 *  - Category tabs over the real TipoAnuncio values (page.tsx:185).
 *  - Full-screen detail sheet with the 'Documentos Adjuntos' list and native
 *    Share (RN Share.share) + clipboard fallback.
 *  - Embedded resident→admin chat: GET /chat on open, POST /chat {mensaje}
 *    with optimistic append + rollback on error.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowRight,
  Building2,
  Calendar,
  Clock,
  Download,
  FileText,
  Info,
  Megaphone,
  MessageCircle,
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
import { safeHttpUrl } from '@/lib/safe-url';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

/**
 * Web hardcodes the detail overlay as `bg-primary dark:bg-[#000000]`
 * (page.tsx:240) and the chat sheet as `bg-primary dark:bg-[#0B0B0B]`
 * (page.tsx:340) — the only two raw hexes on the page, kept verbatim.
 */
const DETAIL_SHEET_DARK_BG = '#000000';
const CHAT_SHEET_DARK_BG = '#0B0B0B';

/** Shared link for the Compartir action — the RN stand-in for web's
 *  `window.location.href` (page.tsx:298). */
const CARTELERA_LINK = 'https://app.conjuntos.app/cartelera';

// Mirrors web's tab list verbatim (page.tsx:185); these are the real
// TipoAnuncio values, so every tab can actually match an `a.tipo`.
const CATEGORIES = ['TODOS', 'GENERAL', 'URGENTE', 'MANTENIMIENTO', 'EVENTO'] as const;

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
  archivosUrl?: string[];
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
    archivosUrl: a.archivosUrl || [],
  };
}

/** Mirrors web's `getNoticeIcon` (page.tsx:161-168) exactly: only URGENTE,
 *  MANTENIMIENTO and EVENTO are special-cased; everything else is a Megaphone. */
function getNoticeIcon(cat: string, color: string, size = 18): ReactElement {
  switch (cat) {
    case 'URGENTE':
      return <ShieldAlert size={size} color={color} />;
    case 'MANTENIMIENTO':
      return <Wrench size={size} color={color} />;
    case 'EVENTO':
      return <Calendar size={size} color={color} />;
    default:
      return <Megaphone size={size} color={color} />;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Web's shared `<Skeleton>` (src/components/ui/Skeleton.tsx:10) —
 * `animate-pulse rounded-lg bg-text/10`. The page uses it for the feed's
 * loading placeholder (page.tsx:196) and inside the chat send button while a
 * message is in flight (page.tsx:413); web never renders a tinted spinner in
 * either spot, so an ActivityIndicator would be off-palette drift.
 */
function SkeletonBlock({ className = '' }: { className?: string }) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
    // Infinite loop (-1) — stop it on unmount rather than leaving it running
    // against a freed shared value.
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View className={`rounded-lg bg-text/10 ${className}`} style={style} />;
}

/**
 * `animate-ping` (web page.tsx:326): the ring scales to 2× while fading out,
 * on a 1s infinite loop. Web's ring is `bg-text/10` under `opacity-40`, i.e.
 * an effective alpha of 0.04 — reproduced here as the solid text token with an
 * animated 0.04 → 0 opacity.
 */
function PingRing({ color }: { color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(progress);
    };
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value }],
    opacity: 0.04 * (1 - progress.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: 999, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

/** `animate-pulse` (web page.tsx:354): opacity oscillates 1 → 0.5 → 1 over 2s. */
function PulseDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.5, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1,
      false,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  // `bg-text/10` — the fill is the text token at 10%, so the pulse rides on
  // top of that base alpha rather than replacing it.
  const animatedStyle = useAnimatedStyle(() => ({ opacity: 0.1 * opacity.value }));

  return (
    <Animated.View
      style={[
        { width: 4, height: 4, borderRadius: 2, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

export default function Cartelera() {
  const { user } = useAuth();
  const userId = user?.id;
  const { theme } = useTheme();
  const t = tokensFor(theme);

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
  }, [user, userId]);

  // No sorting — web keeps the server order and never surfaces `fijado`
  // (page.tsx:159).
  const filteredNotices =
    selectedCategory === 'TODOS'
      ? notices
      : notices.filter((n) => n.category === selectedCategory);

  return (
    <Screen scroll={false} className="bg-primary">
      <ScrollView
        showsVerticalScrollIndicator={false}
        // Web root: `p-6 pt-16 pb-32 … gap-8` (page.tsx:180). `gap-8` is 32,
        // not 24; the top inset is supplied by <Screen>.
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 32 }}
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
                  // `shadow-lg` on the active tab (page.tsx:186) — Tailwind's
                  // default shadow color is black at 10%.
                  style={
                    active
                      ? {
                          shadowColor: '#000000',
                          shadowOpacity: 0.1,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 4 },
                          elevation: 4,
                        }
                      : undefined
                  }
                >
                  <Text
                    // Active tab is a filled `bg-accent` surface, so its ink is
                    // the on-accent token. (Web writes `text-primary` here,
                    // which only *happens* to invert correctly — primary is
                    // near-white in light and near-black in dark; on-accent is
                    // the token that is guaranteed legible on an accent fill.)
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      active ? 'text-on-accent' : 'text-text'
                    }`}
                  >
                    {cat === 'TODOS' ? 'Todos' : cat}
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
              {/* `<Skeleton className="w-10 h-10 rounded-full" />` (page.tsx:196). */}
              <SkeletonBlock className="h-10 w-10 rounded-full" />
              <Text className="text-xs font-bold uppercase tracking-widest text-text">
                Sincronizando Cartelera...
              </Text>
            </View>
          ) : filteredNotices.length === 0 ? (
            <LiquidGlass
              variant="card"
              radius={32}
              className="rounded-[32px] border border-border"
              // Web is `py-20 gap-4 … p-10` (page.tsx:200): Tailwind emits the
              // `p-10` shorthand before `py-20`, so vertical padding is 80 and
              // horizontal 40 — not a uniform 40.
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                paddingVertical: 80,
                paddingHorizontal: 40,
              }}
            >
              <View className="mb-2">
                <Megaphone size={32} color={t.text} />
              </View>
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
                    variant="card"
                    radius={32}
                    className="overflow-hidden rounded-[32px] border border-border"
                  >
                    {notice.image ? (
                      <View className="h-40 w-full overflow-hidden">
                        <Image
                          source={{ uri: notice.image }}
                          alt={notice.title}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          transition={300}
                        />
                        {/* `bg-linear-to-t from-black/60 to-transparent opacity-60`
                            (page.tsx:209) — web hardcodes the black scrim. */}
                        <LinearGradient
                          pointerEvents="none"
                          colors={['transparent', 'rgba(0, 0, 0, 0.6)']}
                          style={[StyleSheet.absoluteFill, { opacity: 0.6 }]}
                        />
                      </View>
                    ) : null}
                    <View className="gap-4 p-6">
                      <View className="flex-row items-start justify-between">
                        {/* getPriorityColor (page.tsx:170-177) returns the same
                            neutral chip for ALTA/MEDIA/BAJA. */}
                        <View className="rounded-lg border border-text/20 bg-text/10 px-2.5 py-1 dark:border-text/30 dark:bg-text/20">
                          <Text className="text-[9px] font-black uppercase tracking-widest text-text">
                            Prioridad {notice.priority}
                          </Text>
                        </View>
                        <Text className="text-[10px] font-bold text-text">{notice.date}</Text>
                      </View>

                      <View className="gap-2">
                        <View className="flex-row items-center gap-2">
                          {getNoticeIcon(notice.category, t.accent)}
                          <Text
                            className="text-[10px] font-bold uppercase tracking-widest text-accent"
                            style={{ opacity: 0.8 }}
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

                      <View className="flex-row items-center justify-between border-t border-border pt-2">
                        <View className="flex-row items-center gap-2">
                          <Megaphone size={12} color={t.text} />
                          <Text className="text-[10px] text-text">{notice.author}</Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Text className="text-[10px] font-bold uppercase text-accent">
                            Leer más
                          </Text>
                          <ArrowRight size={14} color={t.accent} />
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
            backgroundColor: t.accent,
            alignItems: 'center',
            justifyContent: 'center',
            // shadow-[0_15px_40px_rgba(45,212,191,0.28)] (page.tsx:320).
            shadowColor: t.accent,
            shadowOpacity: 0.28,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 15 },
            elevation: 8,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <MessageCircle size={28} color={t.onAccent} />
          {/* Status Indicator Dot — web fills it `bg-text/10` in BOTH states and
              rings it `border-4 border-primary` (page.tsx:325-327). */}
          <View
            className="bg-text/10"
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 20,
              height: 20,
              borderRadius: 10,
              borderWidth: 4,
              borderColor: t.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isAdminOnline ? <PingRing color={t.text} /> : null}
          </View>
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
// Detail modal — full-screen slide-up sheet mirroring the web overlay,
// including the 'Documentos Adjuntos' list (page.tsx:265-291).
// ---------------------------------------------------------------------------

interface NoticeDetailModalProps {
  notice: Notice | null;
  onClose: () => void;
}

function NoticeDetailModal({ notice, onClose }: NoticeDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = tokensFor(theme);

  const handleShare = useCallback(async () => {
    if (!notice) return;
    try {
      // Web passes { title, text: content, url: window.location.href }
      // (page.tsx:294-299). iOS takes a discrete `url`; Android only shares
      // `message`, so the link is appended there.
      await Share.share(
        Platform.OS === 'ios'
          ? { title: notice.title, message: notice.content, url: CARTELERA_LINK }
          : { title: notice.title, message: `${notice.content}\n\n${CARTELERA_LINK}` },
      );
    } catch {
      // Same fallback as web's `.catch()` / no-navigator.share branch.
      await Clipboard.setStringAsync(CARTELERA_LINK);
      toast.success('Link copiado al portapapeles');
    }
  }, [notice]);

  const openAttachment = useCallback((url: string) => {
    const safe = safeHttpUrl(url);
    if (!safe) return;
    Linking.openURL(safe).catch(() => {});
  }, []);

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
            className="overflow-hidden rounded-t-[40px] border-t border-border"
            style={{
              maxHeight: '85%',
              backgroundColor: theme === 'dark' ? DETAIL_SHEET_DARK_BG : t.primary,
            }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
              {notice.image ? (
                <View className="h-56 w-full">
                  <Image
                    source={{ uri: notice.image }}
                    alt=""
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={300}
                  />
                  {/* `bg-linear-to-t from-primary dark:from-[#000000] to-transparent`
                      (page.tsx:245) — the photo fades into the sheet. */}
                  <LinearGradient
                    pointerEvents="none"
                    colors={[
                      'transparent',
                      theme === 'dark' ? DETAIL_SHEET_DARK_BG : t.primary,
                    ]}
                    style={StyleSheet.absoluteFill}
                  />
                  {/* Web hardcodes `border-white/20` + `text-white` on this
                      button because it sits over the photo (page.tsx:246). */}
                  <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar"
                    className="absolute right-6 top-6 h-10 w-10 items-center justify-center rounded-full border bg-black/40"
                    style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }}
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
                      accessibilityRole="button"
                      accessibilityLabel="Cerrar"
                      className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2"
                    >
                      <X size={20} color={t.text} />
                    </Pressable>
                  </View>
                ) : null}

                <View className="gap-3">
                  <View className="flex-row items-center gap-3">
                    {/* `bg-accent … text-primary` (page.tsx:253). The tile is a
                        filled accent surface, so the glyph uses the on-accent
                        token rather than primary — primary only reads on an
                        accent fill by coincidence of the two schemes. */}
                    <View className="h-10 w-10 items-center justify-center rounded-2xl bg-accent">
                      {getNoticeIcon(notice.category, t.onAccent)}
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-accent">
                        {notice.category}
                      </Text>
                      <Text className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight text-text">
                        {notice.title}
                      </Text>
                    </View>
                  </View>
                  <View className="mt-2 flex-row items-center gap-4">
                    <View className="flex-row items-center gap-1.5">
                      <Clock size={12} color={t.text} />
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                        {notice.date}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <Megaphone size={12} color={t.text} />
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                        {notice.author}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text className="text-base leading-relaxed text-text">{notice.content}</Text>

                {notice.archivosUrl && notice.archivosUrl.length > 0 ? (
                  <View className="gap-4 border-t border-border pt-6">
                    <View className="flex-row items-center gap-2">
                      <Info size={16} color={t.accent} />
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                        Documentos Adjuntos
                      </Text>
                    </View>
                    {notice.archivosUrl.map((url, idx) => {
                      const fileName = url.split('/').pop() || `Documento ${idx + 1}`;
                      const ext = fileName.split('.').pop()?.toUpperCase() || 'DOC';
                      return (
                        <Pressable
                          key={`${url}-${idx}`}
                          onPress={() => openAttachment(url)}
                          accessibilityRole="link"
                          accessibilityLabel={fileName}
                          className="w-full flex-row items-center justify-between rounded-2xl border border-border bg-surface2 p-4"
                        >
                          <View className="flex-1 flex-row items-center gap-3">
                            <View className="h-10 w-10 items-center justify-center rounded-xl bg-text/10">
                              <FileText size={18} color={t.text} />
                            </View>
                            <View className="flex-1">
                              <Text className="text-sm font-bold text-text">{fileName}</Text>
                              <Text className="text-[10px] font-bold uppercase tracking-tighter text-text">
                                {ext}
                              </Text>
                            </View>
                          </View>
                          <Download size={18} color={t.text} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                <Pressable
                  onPress={handleShare}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    // shadow-xl shadow-accent/20 (page.tsx:305).
                    shadowColor: t.accent,
                    shadowOpacity: 0.2,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 6,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                  className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-accent py-4"
                >
                  <Share2 size={18} color={t.onAccent} />
                  <Text className="text-base font-bold text-on-accent">Compartir</Text>
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
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const sheetBg = theme === 'dark' ? CHAT_SHEET_DARK_BG : t.primary;

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
            className="overflow-hidden rounded-t-[40px] border-t border-border"
            style={{ height: '90%', backgroundColor: sheetBg }}
          >
            {/* Chat Header */}
            <View className="flex-row items-center justify-between border-b border-border bg-surface-2 p-6">
              <View className="flex-row items-center gap-4">
                <View className="h-12 w-12 items-center justify-center rounded-full border border-text/30 bg-text/20">
                  <Building2 size={24} color={t.text} />
                  {/* `border-2 border-primary dark:border-[#0B0B0B]`, filled
                      `bg-text/10` in BOTH states (page.tsx:347). */}
                  <View
                    className="bg-text/10"
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      borderWidth: 2,
                      borderColor: sheetBg,
                    }}
                  />
                </View>
                <View>
                  <Text className="text-sm font-bold tracking-tight text-text">
                    Atención al Copropietario
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    {isAdminOnline ? <PulseDot color={t.text} /> : null}
                    <Text className="text-[10px] font-medium uppercase tracking-widest text-text">
                      {isAdminOnline ? 'Disponible' : 'Ausente'}
                    </Text>
                  </View>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                className="h-10 w-10 items-center justify-center rounded-full bg-surface-2"
              >
                <X size={20} color={t.text} />
              </Pressable>
            </View>

            {/* Chat Body (Messages) */}
            <View className="flex-1">
              {/* `bg-linear-to-b from-transparent to-black/20` (page.tsx:370). */}
              <LinearGradient
                pointerEvents="none"
                colors={['transparent', 'rgba(0, 0, 0, 0.2)']}
                style={StyleSheet.absoluteFill}
              />
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
                    {/* `text-text/50` (page.tsx:373). */}
                    <View style={{ opacity: 0.5 }}>
                      <MessageCircle size={48} color={t.text} />
                    </View>
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
                            ? 'rounded-tl-none border border-border bg-surface-2'
                            : 'rounded-tr-none bg-accent'
                        }`}
                        style={
                          m.esDeAdmin
                            ? undefined
                            : {
                                // shadow-lg shadow-black/10 (page.tsx:383).
                                shadowColor: '#000000',
                                shadowOpacity: 0.1,
                                shadowRadius: 8,
                                shadowOffset: { width: 0, height: 4 },
                                elevation: 3,
                              }
                        }
                      >
                        <Text
                          className={`text-sm leading-relaxed ${
                            m.esDeAdmin ? 'text-text' : 'font-medium text-on-accent'
                          }`}
                        >
                          {m.mensaje}
                        </Text>
                        <Text
                          className={`mt-2 text-[8px] opacity-40 ${
                            m.esDeAdmin
                              ? 'text-left text-text'
                              : 'text-right font-normal text-on-accent'
                          }`}
                        >
                          {formatTime(m.createdAt)}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>

            {/* Chat Input */}
            <View
              className="border-t border-border bg-surface-2 p-6"
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
                    // web: `placeholder:text-text` (page.tsx:405).
                    placeholderTextColor={t.text}
                    className="flex-1 text-sm text-text"
                  />
                </View>
                <Pressable
                  onPress={sendMessage}
                  disabled={!newMessage.trim() || isSending}
                  accessibilityRole="button"
                  accessibilityLabel="Enviar"
                  style={({ pressed }) => ({
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: t.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    // shadow-[0_10px_25px_rgba(45,212,191,0.28)] (page.tsx:411).
                    shadowColor: t.accent,
                    shadowOpacity: 0.28,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 10 },
                    elevation: 6,
                    opacity: !newMessage.trim() || isSending ? 0.5 : 1,
                    transform: [{ scale: pressed ? 0.9 : 1 }],
                  })}
                >
                  {isSending ? (
                    /* `<Skeleton className="w-6 h-6 rounded-full" />` (page.tsx:413). */
                    <SkeletonBlock className="h-6 w-6 rounded-full" />
                  ) : (
                    <ArrowRight size={24} color={t.onAccent} />
                  )}
                </Pressable>
              </View>
              <View className="mt-4 flex-row items-center justify-center gap-2">
                <ShieldAlert size={10} color={t.text} />
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
