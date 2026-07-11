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
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'enconjunto',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    icon: './assets/expo.icon',
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
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['RECORD_AUDIO', 'CAMERA', 'POST_NOTIFICATIONS', 'INTERNET'],
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
    'expo-image-picker',
    'expo-av',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
  ],
  experiments: {
    reactCompiler: true,
  },
};

module.exports = { expo: config };
