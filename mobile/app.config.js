// ConjuntOS (EN-CONJUNTO mobile) Expo config.
//
// IMPORTANT: LiveKit / WebRTC (citofonia) and push notifications use native
// modules that are NOT available in Expo Go. You must build and run a CUSTOM
// DEV CLIENT (`npx expo prebuild` + `npx expo run:ios|android`, or an EAS dev
// build) to exercise calls, camera/mic, and push. Expo Go will crash or no-op
// on those features.
//
// typedRoutes is intentionally DISABLED: routes are added incrementally across
// phases, and typed routes would fail to compile against not-yet-created paths.

/** @type {import('@expo/config-types').ExpoConfig} */
const config = {
  name: 'ConjuntOS',
  slug: 'conjuntos',
  owner: 'conjuntoss-team',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'enconjunto',
  // Web hardcodes `<html className="light">` (src/app/layout.tsx:78) and
  // ThemeContext defaults to "light", so the app ships light and the in-app
  // toggle (perfil) switches to dark. 'automatic' would let the OS override
  // that default and diverge from web on a dark-mode device.
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'app.conjuntos',
    supportsTablet: true,
    infoPlist: {
      NSMicrophoneUsageDescription:
        'ConjuntOS usa el micrófono para las llamadas de citofonía con portería y residentes.',
      NSCameraUsageDescription:
        'ConjuntOS usa la cámara para videollamadas de citofonía y para registrar visitantes y paquetería.',
      NSPhotoLibraryUsageDescription:
        'ConjuntOS accede a tus fotos para adjuntar imágenes en PQRS, visitantes y paquetería.',
      NSUserNotificationsUsageDescription:
        'ConjuntOS envía notificaciones de llamadas entrantes, visitantes, paquetería y novedades del conjunto.',
    },
  },
  android: {
    // Must match the Play Console app record exactly — Play rejects any upload
    // whose package differs, and the record's package name is permanent once
    // created. The listing was registered as com.conjuntos.app, so this is
    // fixed for the life of the app: do NOT "tidy" it back to app.conjuntos to
    // match ios.bundleIdentifier.
    package: 'com.conjuntos.app',
    adaptiveIcon: {
      // Matches android-icon-background.png; the image wins when both are set,
      // but leaving the old template blue here would silently change the icon
      // background if that file were ever dropped.
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // BLUETOOTH_CONNECT is required from API 31+ for audioswitch (pulled in by
    // @livekit/react-native) to enumerate bonded devices. Without it
    // AudioSession.startAudioSession() finds no Bluetooth route and citofonía /
    // asamblea audio is stuck on earpiece+speaker. The legacy BLUETOOTH /
    // BLUETOOTH_ADMIN entries added by @config-plugins/react-native-webrtc are
    // inert on 31+ and are left alone.
    //
    // ponytail: screen share (FOREGROUND_SERVICE_MEDIA_PROJECTION + LiveKit's
    // MediaProjectionService) is disabled on Android. Any FOREGROUND_SERVICE_*
    // permission forces Play's "Foreground service permissions" declaration
    // (demo video + review), which blocked release. To re-enable: move
    // FOREGROUND_SERVICE_MEDIA_PROJECTION back into `permissions`, drop both
    // from `blockedPermissions`, un-gate the button in
    // src/components/asamblea/ControlBar.tsx, and complete the Play declaration.
    permissions: [
      'RECORD_AUDIO',
      'CAMERA',
      'POST_NOTIFICATIONS',
      'INTERNET',
      'BLUETOOTH_CONNECT',
    ],
    // @config-plugins/react-native-webrtc adds SYSTEM_ALERT_WINDOW for
    // draw-over-other-apps incoming-call UIs. We surface calls through
    // expo-notifications + in-app navigation (src/providers/CallProvider.tsx),
    // never an overlay, so the permission only serves to flag the listing in
    // Play review. Debug builds keep it: android/app/src/debug/AndroidManifest.xml
    // declares it and the debug source set outranks main's tools:node="remove",
    // so the RN dev-menu overlay is unaffected. Verified in the merged manifests.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-notifications',
    // WebRTC native config plugin (LiveKit citofonia). @livekit/react-native-webrtc
    // ships no app.plugin.js, so we use the community @config-plugins variant to
    // wire the iOS/Android native build (permissions, podspec, gradle).
    '@config-plugins/react-native-webrtc',
    // Enables @livekit/react-native-webrtc's mediaProjection foreground service
    // (WebRTCModuleOptions.enableMediaProjectionService). Required for screen
    // share on Android 14+: getMediaProjection() throws SecurityException unless
    // a mediaProjection FGS is running within 5s of the capture consent.
    './plugins/withMediaProjectionService',
    'expo-image-picker',
    'expo-font',
    'expo-image',
    'expo-sharing',
    'expo-status-bar',
    'expo-web-browser',
    // Background playback is DISABLED (enableBackgroundPlayback: false) on
    // purpose: the app only plays short foreground audio (chat voice notes via
    // createAudioPlayer, call ring tones), never lock-screen/background
    // playback. The plugin default (true) injects
    // android.permission.FOREGROUND_SERVICE + FOREGROUND_SERVICE_MEDIA_PLAYBACK
    // and the mediaPlayback AudioControlsService into the manifest, which flags
    // the listing with Play's "Foreground service permissions" declaration for
    // a service type we never use. Keep this false. Voice-note playback and
    // recording in the foreground are unaffected.
    ['expo-audio', { enableBackgroundPlayback: false }],
    // QR scanning for visitor check-in / pases temporales (web parity with
    // src/components/visitas/QrScanner.tsx). Permission strings are declared in
    // ios.infoPlist.NSCameraUsageDescription and android.permissions above.
    'expo-camera',
    [
      'expo-splash-screen',
      {
        // Matches web `--color-primary` (globals.css :root) — the app paints its
        // background from this token, so the splash must not flash a different hue.
        backgroundColor: '#050d0c',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
  ],
  extra: {
    eas: {
      // Required by getExpoPushTokenAsync (src/services/push.ts): without a
      // projectId Expo cannot mint a device push token, so push is dead on real
      // devices even though permissions are granted. `eas init` can't write to a
      // dynamic config, so the literal for @conjuntoss-team/conjuntos is inlined
      // here; the env var still wins so a different environment can override it.
      // Do NOT change this id casually — it invalidates every issued push token.
      projectId: process.env.EAS_PROJECT_ID || '5cced80d-5db8-43e5-8cc1-2323dba30a66',
    },
  },
  experiments: {
    reactCompiler: true,
  },
};

module.exports = { expo: config };
