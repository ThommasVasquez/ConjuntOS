/**
 * QrScanner — mobile port of web `src/components/visitas/QrScanner.tsx`.
 *
 * Validates a pre-registered visitor pass in one tap: scan the QR the resident
 * generated in `/visitas/preregistro`, POST the opaque token to
 * `/visitas/scan`, and render a green/red verdict. A manual text fallback
 * covers the case where the camera is unavailable.
 *
 * Web used `@yudiel/react-qr-scanner` (BarcodeDetector); here it is
 * `expo-camera`'s `CameraView` with `barcodeScannerSettings.barcodeTypes = ['qr']`.
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from '@/lib/native/camera';
import { Camera, Check, ScanLine, X } from 'lucide-react-native';

import { withAlpha } from '@/components/visitas/colorAlpha';
import { api, ApiError } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { onSemantic, tokensFor } from '@/theme/tokens';

/**
 * Slice of the backend `VisitaDto` returned by `POST /visitas/scan` that this
 * component reads (mirrors the web interface of the same name).
 */
interface ScanVisita {
  id: string;
  nombre: string;
  tipo: string;
}

type Verdict = { ok: true; nombre: string } | { ok: false; reason: string };

export function QrScanner() {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const infoInk = onSemantic(theme);

  const [showCamera, setShowCamera] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const processingRef = useRef(false);
  /**
   * Last barcode value handed to `submitToken`. Web's `<Scanner>` only fires
   * `onScan` for a value it has not seen yet (`anyNewCodesDetected`, with
   * `allowMultiple` defaulting to false), so holding one QR in frame POSTs
   * once. `expo-camera` instead invokes `onBarcodeScanned` on every decoded
   * frame, so without this dedupe a rejected pass (verdict shown, camera left
   * open — exactly the web flow) would hammer `/visitas/scan` at frame rate.
   */
  const lastScannedRef = useRef<string | null>(null);

  const [permission, requestPermission] = useCameraPermissions();

  const submitToken = useCallback(
    async (token: string) => {
      const t = token.trim();
      if (!t || busy || processingRef.current) return;
      processingRef.current = true;
      setBusy(true);
      try {
        const dto = await api.post<ScanVisita>('/visitas/scan', { token: t });
        setVerdict({ ok: true, nombre: dto.nombre });
        setManual('');
        setShowCamera(false);
      } catch (e) {
        setVerdict({
          ok: false,
          reason: e instanceof ApiError ? e.detail : 'Error de conexion',
        });
      } finally {
        setBusy(false);
        processingRef.current = false;
      }
    },
    [busy],
  );

  const handleScan = useCallback(
    (result: BarcodeScanningResult) => {
      if (!result.data || processingRef.current) return;
      if (lastScannedRef.current === result.data) return;
      lastScannedRef.current = result.data;
      void submitToken(result.data);
    },
    [submitToken],
  );

  /**
   * Web could open the camera synchronously (the `<Scanner>` asked for the
   * permission itself and reported failures through `onError`). On native the
   * permission has to be requested up-front, so the "permission-denied" branch
   * of the web error handler moves here.
   */
  const openCamera = useCallback(async () => {
    setVerdict(null);
    setCameraError(null);
    // Fresh session: web remounted `<Scanner>`, wiping its seen-codes set.
    lastScannedRef.current = null;

    let granted = permission?.granted ?? false;
    if (!granted) {
      const res = await requestPermission();
      granted = res?.granted ?? false;
    }

    setShowCamera(true);
    if (!granted) {
      setCameraError('Permiso de cámara denegado. Habilita el acceso en Ajustes.');
    }
  }, [permission?.granted, requestPermission]);

  const stopCamera = useCallback(() => {
    setShowCamera(false);
  }, []);

  const canValidate = !busy && manual.trim().length > 0;

  return (
    <View className="flex flex-col gap-4 rounded-3xl border border-light-border bg-light-primaryLight p-6 dark:border-border dark:bg-primary-light">
      {/* Header */}
      <View className="flex-row items-center gap-3">
        <View
          className="h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withAlpha(tokens.info, 0.1) }}
        >
          <ScanLine size={22} color={tokens.info} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-bold leading-tight text-light-text dark:text-text">
            Escanear pase QR
          </Text>
          <Text
            className="mt-0.5 text-[11px]"
            style={{ color: withAlpha(tokens.text, 0.55) }}
          >
            Valida el codigo del visitante
          </Text>
        </View>
      </View>

      {/* Verdict banner */}
      {verdict ? (
        <View
          className="flex-row items-center gap-3 rounded-2xl border p-4"
          style={{
            backgroundColor: withAlpha(verdict.ok ? tokens.success : tokens.danger, 0.1),
            borderColor: withAlpha(verdict.ok ? tokens.success : tokens.danger, 0.4),
          }}
        >
          {verdict.ok ? (
            <Check size={22} color={tokens.success} />
          ) : (
            <X size={22} color={tokens.danger} />
          )}
          <View className="flex-1">
            <Text
              className="text-sm font-bold"
              style={{ color: verdict.ok ? tokens.success : tokens.danger }}
            >
              {verdict.ok ? 'Ingreso autorizado' : 'Codigo rechazado'}
            </Text>
            <Text
              className="text-[11px]"
              style={{ color: withAlpha(tokens.text, 0.6) }}
            >
              {verdict.ok ? verdict.nombre : verdict.reason}
            </Text>
          </View>
        </View>
      ) : null}

      {showCamera ? (
        <View className="relative overflow-hidden rounded-2xl border border-light-border dark:border-border">
          {cameraError ? (
            <View
              className="items-center justify-center gap-3 rounded-2xl border p-6"
              style={{
                backgroundColor: withAlpha(tokens.danger, 0.1),
                borderColor: withAlpha(tokens.danger, 0.3),
              }}
            >
              <Text className="text-center text-xs" style={{ color: tokens.danger }}>
                {cameraError}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setShowCamera(false);
                  setCameraError(null);
                }}
                style={({ pressed }) => ({
                  backgroundColor: withAlpha(tokens.info, 0.1),
                  opacity: pressed ? 0.85 : 1,
                })}
                className="rounded-xl px-3 py-1.5"
              >
                <Text className="text-xs font-bold" style={{ color: tokens.info }}>
                  Cerrar
                </Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              style={{ width: '100%', aspectRatio: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScan}
              onMountError={() =>
                setCameraError('Cámara no disponible. Usa el ingreso manual.')
              }
            />
          )}
          <Pressable
            accessibilityRole="button"
            onPress={stopCamera}
            style={({ pressed }) => ({
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              opacity: pressed ? 0.85 : 1,
            })}
            className="rounded-xl px-3 py-1.5"
          >
            <Text className="text-xs font-bold" style={{ color: '#ffffff' }}>
              Detener
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void openCamera();
          }}
          style={({ pressed }) => ({
            backgroundColor: tokens.info,
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
          className="w-full flex-row items-center justify-center gap-2 rounded-2xl py-3"
        >
          <Camera size={18} color={infoInk} />
          <Text className="font-bold" style={{ color: infoInk }}>
            Escanear con camara
          </Text>
        </Pressable>
      )}

      {/* Manual fallback */}
      <View className="flex-row gap-2">
        <TextInput
          value={manual}
          onChangeText={setManual}
          onSubmitEditing={() => {
            void submitToken(manual);
          }}
          returnKeyType="done"
          placeholder="o escribe el codigo (VIS-…)"
          placeholderTextColor={tokens.textMuted}
          className="flex-1 rounded-2xl border border-light-border bg-light-surface2 px-4 py-3 text-sm text-light-text dark:border-border dark:bg-surface2 dark:text-text"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canValidate }}
          disabled={!canValidate}
          onPress={() => {
            void submitToken(manual);
          }}
          style={({ pressed }) => ({
            backgroundColor: withAlpha(tokens.text, 0.1),
            opacity: !canValidate ? 0.5 : pressed ? 0.85 : 1,
          })}
          className="justify-center rounded-2xl border border-light-border px-4 dark:border-border"
        >
          <Text className="text-sm font-bold text-light-text dark:text-text">Validar</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default QrScanner;
