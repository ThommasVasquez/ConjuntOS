import { Text, View } from 'react-native';

/**
 * Crash-safe façade over `expo-camera`.
 *
 * WHY THIS EXISTS
 * `expo-camera` is a NATIVE module: it only exists in a dev client / build that
 * was compiled after the dependency was added. A bare `import … from
 * 'expo-camera'` throws "Cannot find native module 'ExpoCamera'" at MODULE
 * EVALUATION time, so the importing route file never finishes evaluating and
 * expo-router then reports the confusing follow-on error
 * `Route "./(app)/control-visitas.tsx" is missing the required default export`.
 * One stale binary therefore takes out whole screens.
 *
 * Importing from here keeps those screens mounting: the module is required
 * lazily inside a try/catch, and when it is absent `CameraView` falls back to a
 * component that explains the situation instead of crashing, while
 * `useCameraPermissions` reports a permanent denial so each consumer's existing
 * "sin permiso" branch renders naturally.
 *
 * This is a SAFETY NET, not a substitute for building the native module — QR
 * scanning (control-visitas, SOS) and the assembly camera preview genuinely need
 * the real thing. Export `cameraAvailable` if a caller needs to distinguish
 * "denied" from "not installed".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-camera');
} catch {
  mod = null;
}

/** True when the native module is present in this binary. */
export const cameraAvailable: boolean = !!mod?.CameraView;

/**
 * Minimal structural copy of expo-camera's `BarcodeScanningResult`. Declared
 * locally so consumers can keep their `type` import even when the native module
 * is missing (a type re-export of an absent module would not resolve).
 */
export interface BarcodeScanningResult {
  type: string;
  data: string;
  cornerPoints?: { x: number; y: number }[];
  bounds?: {
    origin: { x: number; y: number };
    size: { width: number; height: number };
  };
}

/** Rendered in place of the camera when the native module is not in the build. */
function CameraUnavailable() {
  return (
    <View className="flex-1 items-center justify-center bg-primary-light px-6">
      <Text className="text-center text-sm font-semibold text-text">
        Cámara no disponible
      </Text>
      <Text className="mt-1 text-center text-xs text-textMuted">
        Esta versión de la app no incluye el módulo de cámara. Vuelve a
        instalarla para usar el escáner.
      </Text>
    </View>
  );
}

const DENIED = {
  granted: false,
  canAskAgain: false,
  expires: 'never' as const,
  status: 'denied' as const,
};

function useCameraPermissionsStub(): [typeof DENIED, () => Promise<typeof DENIED>] {
  return [DENIED, async () => DENIED];
}

/** `CameraView` when available, otherwise the explanatory fallback. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CameraView: any = mod?.CameraView ?? CameraUnavailable;

export const useCameraPermissions: () => [
  { granted: boolean; canAskAgain: boolean },
  () => Promise<{ granted: boolean }>,
] = mod?.useCameraPermissions ?? useCameraPermissionsStub;
