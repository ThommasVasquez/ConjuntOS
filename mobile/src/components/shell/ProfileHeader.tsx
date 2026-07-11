import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Package,
} from 'lucide-react-native';

import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api/client';
import type { NotificacionDto, ProfileResponse, ReservaDto } from '@/lib/api/types';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { getNotifTarget } from '@/lib/notif-routing';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Sheet } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/toast';

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1000';

const picKey = (id: string) => `conjuntos_profile_pic_${id}`;
const dataKey = (id: string) => `conjuntos_profile_data_${id}`;

type UserDisplay = { name: string; gender: string };

function greeting(gender: string): string {
  if (gender === 'masculino') return 'Bienvenido';
  if (gender === 'neutro') return 'Bienvenide';
  return 'Bienvenida';
}

function notifIcon(tipo: string) {
  switch (tipo) {
    case 'APROBACION':
      return <CheckCircle2 size={14} color="#ffffff" />;
    case 'SISTEMA':
      return <AlertTriangle size={14} color="#ffffff" />;
    case 'PAQUETE':
      return <Package size={14} color="#009df2" />;
    case 'INFO':
    default:
      return <Bell size={14} color="#009df2" />;
  }
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ProfileHeader() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const pathname = usePathname();
  const isProfilePage = pathname === '/perfil' || pathname.endsWith('/perfil');
  const userId = user?.id;

  const [profilePic, setProfilePic] = useState<string>(FALLBACK_AVATAR);
  const [userData, setUserData] = useState<UserDisplay>({
    name: 'Cargando...',
    gender: 'femenino',
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [hasStory, setHasStory] = useState(false);
  const [notifications, setNotifications] = useState<NotificacionDto[]>([]);

  const refetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.get<NotificacionDto[]>('/notificaciones');
      if (data) {
        setNotifications(data);
        setHasStory(data.some((n) => !n.leida));
      }
    } catch {
      /* non-critical */
    }
  }, [userId]);

  // Real-time WebSocket subscription (mirrors web).
  useWsSubscription('notification', () => {
    void refetchNotifications();
  });

  useEffect(() => {
    if (authLoading || !userId) return;

    let cancelled = false;
    let retry = 0;
    const MAX_RETRIES = 2;

    async function loadData() {
      if (!userId || cancelled) return;

      // Hydrate from cache first for instant paint.
      try {
        const [savedPic, savedData] = await Promise.all([
          AsyncStorage.getItem(picKey(userId)),
          AsyncStorage.getItem(dataKey(userId)),
        ]);
        if (cancelled) return;
        if (savedPic) setProfilePic(savedPic);
        if (savedData) setUserData(JSON.parse(savedData) as UserDisplay);
      } catch {
        /* ignore corrupt cache */
      }

      const [profileData, notifData, reservaData] = await Promise.all([
        api.get<ProfileResponse>('/usuarios/me/profile').catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 401 && retry < MAX_RETRIES) {
            retry += 1;
            setTimeout(loadData, 1000);
          }
          return null;
        }),
        api.get<NotificacionDto[]>('/notificaciones').catch(() => null),
        api.get<ReservaDto[]>('/reservas').catch(() => null),
      ]);

      if (cancelled) return;

      if (profileData) {
        const mapped: UserDisplay = {
          name: profileData.nombre || 'Residente',
          gender: profileData.genero || 'neutro',
        };
        setUserData(mapped);
        if (profileData.avatar) setProfilePic(profileData.avatar);
        AsyncStorage.setItem(dataKey(userId), JSON.stringify(mapped)).catch(() => {});
        if (profileData.avatar) {
          AsyncStorage.setItem(picKey(userId), profileData.avatar).catch(() => {});
        }
      }

      let pendingCount = 0;
      if (notifData) {
        setNotifications(notifData);
        pendingCount = notifData.filter((n) => !n.leida).length;
      }

      let activeReserva = false;
      if (reservaData) {
        const now = new Date();
        activeReserva = reservaData.some((r) => {
          const start = new Date(r.fechaInicio);
          const end = new Date(r.fechaFin);
          return now >= start && now <= end && r.estado !== 'CANCELADA';
        });
      }

      setHasStory(pendingCount > 0 || activeReserva);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  const markAsRead = useCallback(
    async (id: string) => {
      try {
        await api.put('/notificaciones/leidas', { ids: [id] });
        setNotifications((prev) => {
          const updated = prev.map((n) => (n.id === id ? { ...n, leida: true } : n));
          setHasStory(updated.some((n) => !n.leida));
          return updated;
        });
      } catch (err) {
        console.error('Error marking notification as read:', err);
      }
    },
    [],
  );

  const handleNotifClick = useCallback(
    (notif: NotificacionDto) => {
      const destino = getNotifTarget(notif, user?.rol);
      void markAsRead(notif.id);
      setNotifOpen(false);
      router.push(destino as never);
    },
    [markAsRead, router, user?.rol],
  );

  const clearAll = useCallback(async () => {
    const unread = notifications.filter((n) => !n.leida);
    if (unread.length === 0) return;
    try {
      await api.put('/notificaciones/leidas', { ids: unread.map((n) => n.id) });
      setNotifications((prev) => prev.map((n) => ({ ...n, leida: true })));
      setHasStory(false);
      toast.success('Notificaciones marcadas como leídas');
    } catch (err) {
      console.error('Error clearing notifications:', err);
    }
  }, [notifications]);

  const hasUnread = notifications.some((n) => !n.leida);

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 50,
      }}
    >
      {/* Avatar + gendered greeting */}
      <Pressable
        accessibilityRole="button"
        disabled={isProfilePage}
        onPress={() => {
          if (!isProfilePage) router.push('/(app)/perfil' as never);
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          transform: [{ scale: pressed && !isProfilePage ? 0.95 : 1 }],
        })}
      >
        <View style={{ width: 56, height: 56 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
            }}
          >
            <Image
              source={{ uri: profilePic }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={300}
            />
          </View>
          {/* Story-halo indicator: active reserva overlap or unread notifs */}
          {hasStory ? (
            <View
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#EF4444',
                borderWidth: 2,
                borderColor: '#0a0a0a',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: '#ffffff',
                }}
              />
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: 'column' }}>
          <Text
            style={{
              color: '#ffffff',
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            {greeting(userData.gender)} 👋
          </Text>
          <Text
            style={{
              color: '#ffffff',
              fontSize: 20,
              fontWeight: '700',
              fontFamily: 'PlusJakartaSans_700Bold',
            }}
          >
            {userData.name || 'Residente'}
          </Text>
        </View>
      </Pressable>

      {/* Notifications bell */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notificaciones"
        onPress={() => setNotifOpen(true)}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
      >
        <LiquidGlass
          intensity={40}
          className="rounded-full"
          style={{
            width: 48,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 24,
          }}
        >
          <Bell size={22} color="#ffffff" />
          {hasUnread ? (
            <View
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: '#EF4444',
                borderWidth: 2,
                borderColor: '#0a0a0a',
              }}
            />
          ) : null}
        </LiquidGlass>
      </Pressable>

      {/* Notifications panel */}
      <Sheet open={notifOpen} onClose={() => setNotifOpen(false)}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
              Notificaciones
            </Text>
            <Pressable onPress={clearAll}>
              <Text
                style={{
                  color: '#009df2',
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                }}
              >
                Limpiar
              </Text>
            </Pressable>
          </View>

          {notifications.length === 0 ? (
            <Text
              style={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: 13,
                textAlign: 'center',
                paddingVertical: 24,
              }}
            >
              No tienes notificaciones
            </Text>
          ) : (
            notifications.map((notif) => (
              <Pressable
                key={notif.id}
                onPress={() => handleNotifClick(notif)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255,255,255,0.08)',
                  opacity: notif.leida ? 0.6 : 1,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    marginTop: 2,
                  }}
                >
                  {notifIcon(notif.tipo)}
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 2,
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>
                      {notif.titulo}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>
                      {formatTime(notif.createdAt)}
                    </Text>
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                    {notif.mensaje}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </Sheet>
    </View>
  );
}

export default ProfileHeader;
