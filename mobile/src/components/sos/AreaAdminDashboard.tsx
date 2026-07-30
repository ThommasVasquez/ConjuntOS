/**
 * AreaAdminDashboard — mobile port of web `src/components/sos/AreaAdminDashboard.tsx`.
 *
 * The whole-screen dashboard the ADMINISTRADOR_PISCINA / ADMINISTRADOR_GYM
 * roles get instead of the resident home: today's reservations for their area
 * plus a QR scanner that verifies a reservation pass.
 *
 * Web used `@yudiel/react-qr-scanner`; here it is `expo-camera`'s `CameraView`
 * with `barcodeScannerSettings.barcodeTypes = ['qr']` (same component the
 * shared QrScanner uses).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from '@/lib/native/camera';
import { Camera, Check, Clock, Home, MapPin, User, X } from 'lucide-react-native';

import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { toast } from '@/components/ui/toast';
import { withAlpha } from '@/components/visitas/colorAlpha';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

interface ReservaAdmin {
  id: string;
  areaId: string;
  areaNombre: string;
  usuarioNombre: string;
  usuarioTorre?: string;
  usuarioApto?: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  notas?: string;
}

/** `toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })`. */
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AreaAdminDashboard() {
  const user = useAuth((s) => s.user);
  const role = user?.rol;
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [reservas, setReservas] = useState<ReservaAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificada, setVerificada] = useState<ReservaAdmin | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const processingRef = useRef(false);
  /**
   * Last decoded value handed to `verificarQR`. Web's `<Scanner>` only fired
   * `onScan` for values it had not seen yet; `expo-camera` fires per decoded
   * frame, so without this dedupe one QR held in frame would hammer the
   * endpoint at frame rate.
   */
  const lastScannedRef = useRef<string | null>(null);

  const [permission, requestPermission] = useCameraPermissions();

  const areaNombre = role === 'ADMINISTRADOR_PISCINA' ? 'Piscina' : 'Gimnasio';

  const fetchReservas = useCallback(async () => {
    if (!user) return;
    try {
      const areas = await api.get<{ id: string; nombre: string }[]>('/areas-comunes');
      const area = areas.find(
        (a) => a.nombre.toLowerCase() === areaNombre.toLowerCase(),
      );
      if (!area) return;
      const data = await api.get<ReservaAdmin[]>(`/reservas/area/${area.id}/hoy`);
      setReservas(data);
    } catch {
      // Silent — API may not have authorization yet
    } finally {
      setLoading(false);
    }
  }, [user, areaNombre]);

  useEffect(() => {
    if (user) void fetchReservas();
  }, [user, fetchReservas]);

  const verificarQR = useCallback(async (code: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setVerifying(true);
    setScanning(false);
    try {
      const data = await api.get<ReservaAdmin>(`/reservas/${code}/verificar`);
      setVerificada(data);
      toast.success(`Reserva verificada: ${data.usuarioNombre}`);
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : 'Error de conexion';
      toast.error(detail);
      setVerificada(null);
    } finally {
      setVerifying(false);
      processingRef.current = false;
    }
  }, []);

  const handleScan = useCallback(
    (result: BarcodeScanningResult) => {
      if (!result.data || processingRef.current) return;
      if (lastScannedRef.current === result.data) return;
      lastScannedRef.current = result.data;
      void verificarQR(result.data);
    },
    [verificarQR],
  );

  /**
   * Web could open the scanner synchronously (the `<Scanner>` asked for the
   * permission itself and reported failures through `onError`, which is where
   * the "permission-denied" / "no-camera" / secure-context copy came from). On
   * native the permission has to be requested up front.
   */
  const toggleScanner = useCallback(async () => {
    if (scanning) {
      setScanning(false);
      setVerificada(null);
      setCameraError(null);
      return;
    }
    setCameraError(null);
    lastScannedRef.current = null;

    let granted = permission?.granted ?? false;
    if (!granted) {
      const res = await requestPermission();
      granted = res?.granted ?? false;
    }

    setScanning(true);
    setVerificada(null);
    if (!granted) setCameraError('Permiso de cámara denegado.');
  }, [scanning, permission?.granted, requestPermission]);

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.text} />
        </View>
      </Screen>
    );
  }

  const ahora = new Date();
  const reservasActivas = reservas.filter(
    (r) => r.estado !== 'CANCELADA' && new Date(r.fechaFin) > ahora,
  );
  const reservasPasadas = reservas.filter(
    (r) => r.estado !== 'CANCELADA' && new Date(r.fechaFin) <= ahora,
  );

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-6 px-6 pt-4">
        <ProfileHeader />

        {/* Header */}
        <View className="items-center gap-1">
          <Text className="text-2xl font-bold text-text">
            {role === 'ADMINISTRADOR_PISCINA' ? '🏊 Admin. Piscina' : '🏋️ Admin. Gym'}
          </Text>
          <Text className="text-xs" style={{ color: withAlpha(tokens.text, 0.6) }}>
            Reservas del dia — {areaNombre}
          </Text>
        </View>

        {/* Scanner toggle */}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void toggleScanner();
          }}
          style={({ pressed }) => ({
            width: '100%',
            borderRadius: 16,
            padding: 16,
            borderWidth: 2,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            borderColor: scanning ? tokens.danger : tokens.accent,
            backgroundColor: scanning
              ? withAlpha(tokens.danger, 0.2)
              : withAlpha(tokens.accent, 0.1),
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          {scanning ? (
            <>
              <X size={20} color={tokens.danger} />
              <Text className="text-sm font-bold" style={{ color: tokens.danger }}>
                Detener escaner
              </Text>
            </>
          ) : (
            <>
              <Camera size={20} color={tokens.accent} />
              <Text className="text-sm font-bold" style={{ color: tokens.accent }}>
                Escanear QR de reserva
              </Text>
            </>
          )}
        </Pressable>

        {/* Camera view */}
        {scanning ? (
          <View
            className="w-full overflow-hidden"
            style={{
              aspectRatio: 1,
              borderRadius: 24,
              borderWidth: 2,
              borderColor: withAlpha(tokens.accent, 0.4),
              backgroundColor: tokens.primary,
            }}
          >
            {cameraError ? (
              <View
                className="h-full items-center justify-center gap-3 p-6"
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: withAlpha(tokens.danger, 0.3),
                  backgroundColor: withAlpha(tokens.danger, 0.1),
                }}
              >
                <Text className="text-center text-xs" style={{ color: tokens.danger }}>
                  {cameraError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setScanning(false);
                    setCameraError(null);
                  }}
                  style={{
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: withAlpha(tokens.accent, 0.1),
                  }}
                >
                  <Text className="text-xs font-bold" style={{ color: tokens.accent }}>
                    Cerrar
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <CameraView
                  style={{ width: '100%', height: '100%' }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleScan}
                  onMountError={() => setCameraError('Cámara no disponible.')}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 32,
                    left: 32,
                    right: 32,
                    bottom: 32,
                    borderWidth: 3,
                    borderRadius: 24,
                    borderColor: withAlpha(tokens.accent, 0.6),
                  }}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    bottom: 16,
                    left: 0,
                    right: 0,
                    paddingVertical: 8,
                    backgroundColor: withAlpha(tokens.primary, 0.5),
                  }}
                >
                  <Text
                    className="text-center text-xs"
                    style={{ color: tokens.text }}
                  >
                    Apunta al codigo QR de la reserva
                  </Text>
                </View>
              </>
            )}
          </View>
        ) : null}

        {/* Verifying */}
        {verifying ? (
          <View
            className="flex-row items-center justify-center gap-3 p-4"
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: withAlpha(tokens.accent, 0.2),
              backgroundColor: withAlpha(tokens.accent, 0.1),
            }}
          >
            <ActivityIndicator size="small" color={tokens.accent} />
            <Text className="text-sm font-bold" style={{ color: tokens.accent }}>
              Verificando reserva...
            </Text>
          </View>
        ) : null}

        {/* Verification result */}
        {verificada ? (
          <View
            className="gap-2 p-4"
            style={{
              borderRadius: 16,
              borderWidth: 2,
              borderColor: tokens.success,
              backgroundColor: withAlpha(tokens.success, 0.1),
            }}
          >
            <View className="flex-row items-center gap-2">
              <Check size={20} color={tokens.success} />
              <Text className="font-bold" style={{ color: tokens.success }}>
                Reserva valida!
              </Text>
            </View>
            <View className="gap-1">
              <View className="flex-row items-center gap-2">
                <User size={14} color={tokens.text} />
                <Text className="text-sm text-text">{verificada.usuarioNombre}</Text>
              </View>
              {verificada.usuarioTorre && verificada.usuarioApto ? (
                <View className="flex-row items-center gap-2">
                  <Home size={14} color={tokens.text} />
                  <Text className="text-sm text-text">
                    Torre {verificada.usuarioTorre}, Apto {verificada.usuarioApto}
                  </Text>
                </View>
              ) : null}
              <View className="flex-row items-center gap-2">
                <Clock size={14} color={tokens.text} />
                <Text className="text-sm text-text">
                  {hhmm(verificada.fechaInicio)}
                  {' → '}
                  {hhmm(verificada.fechaFin)}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <MapPin size={14} color={tokens.text} />
                <Text className="text-sm text-text">{verificada.areaNombre}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Active reservations */}
        <View className="gap-3">
          <Text className="px-1 text-xs font-bold uppercase tracking-widest text-accent">
            Reservas activas hoy ({reservasActivas.length})
          </Text>

          {reservasActivas.length === 0 ? (
            <View
              className="items-center py-8"
              style={{
                borderRadius: 24,
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: tokens.border,
              }}
            >
              <View className="mb-2">
                <Clock size={32} color={withAlpha(tokens.text, 0.3)} />
              </View>
              <Text className="text-xs" style={{ color: withAlpha(tokens.text, 0.5) }}>
                No hay reservas activas hoy
              </Text>
            </View>
          ) : null}

          {reservasActivas.map((r) => (
            <View
              key={r.id}
              className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4"
            >
              <View
                className="h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: withAlpha(tokens.accent, 0.2) }}
              >
                <User size={18} color={tokens.accent} />
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-bold text-text">
                  {r.usuarioNombre}
                </Text>
                <Text
                  className="text-[10px]"
                  style={{ color: withAlpha(tokens.text, 0.6) }}
                >
                  {r.usuarioTorre && r.usuarioApto
                    ? `Torre ${r.usuarioTorre}, Apto ${r.usuarioApto}`
                    : 'Sin unidad'}
                  {' · '}
                  {hhmm(r.fechaInicio)}
                  {' → '}
                  {hhmm(r.fechaFin)}
                </Text>
              </View>
              <View
                className="shrink-0 rounded-full px-2 py-0.5"
                style={{
                  backgroundColor:
                    r.estado === 'CONFIRMADA'
                      ? withAlpha(tokens.success, 0.2)
                      : withAlpha(tokens.text, 0.1),
                }}
              >
                <Text
                  className="text-[9px] font-bold uppercase"
                  style={{
                    color:
                      r.estado === 'CONFIRMADA'
                        ? tokens.success
                        : withAlpha(tokens.text, 0.6),
                  }}
                >
                  {r.estado === 'CONFIRMADA' ? 'Activa' : r.estado}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Past reservations */}
        {reservasPasadas.length > 0 ? (
          <View className="gap-3">
            <Text
              className="px-1 text-xs font-bold uppercase tracking-widest"
              style={{ color: withAlpha(tokens.text, 0.4) }}
            >
              Finalizadas hoy ({reservasPasadas.length})
            </Text>
            {reservasPasadas.map((r) => (
              <View
                key={r.id}
                className="flex-row items-center gap-3 rounded-2xl p-4"
                style={{
                  opacity: 0.6,
                  borderWidth: 1,
                  borderColor: withAlpha(tokens.border, 0.5),
                  backgroundColor: withAlpha(tokens.surface, 0.5),
                }}
              >
                <View
                  className="h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: withAlpha(tokens.text, 0.1) }}
                >
                  <Check size={18} color={withAlpha(tokens.text, 0.4)} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm text-text">
                    {r.usuarioNombre}
                  </Text>
                  <Text
                    className="text-[10px]"
                    style={{ color: withAlpha(tokens.text, 0.4) }}
                  >
                    {hhmm(r.fechaInicio)}
                    {' → '}
                    {hhmm(r.fechaFin)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

export default AreaAdminDashboard;
