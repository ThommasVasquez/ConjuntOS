/**
 * withMediaProjectionService
 *
 * Enables @livekit/react-native-webrtc's embedded MediaProjection foreground
 * service by setting `WebRTCModuleOptions.enableMediaProjectionService = true`
 * in MainApplication.
 *
 * Why: on Android 14+ (targetSdk 34+) MediaProjectionManager.getMediaProjection()
 * throws a SecurityException unless a foreground service of type `mediaProjection`
 * is running within 5 seconds of the user accepting the screen-capture consent
 * dialog. The service + permission are declared in the merged manifest by
 * @livekit/react-native-webrtc, but the library's `MediaProjectionService.launch()`
 * no-ops unless this flag is set — and nothing sets it by default. That made
 * "Compartir pantalla" fail silently in the asamblea on Android.
 *
 * This is a config plugin (not a manual edit) so the change survives
 * `npx expo prebuild`.
 */

const { withMainApplication } = require('@expo/config-plugins');

const WEBRTC_IMPORT = 'import com.oney.WebRTCModule.WebRTCModuleOptions';

const ENABLE_LINE =
  'WebRTCModuleOptions.getInstance().enableMediaProjectionService = true';

/** Adds the WebRTCModuleOptions import after the last `import` in the file. */
function addWebRTCImport(src) {
  if (src.includes(WEBRTC_IMPORT)) {
    return src;
  }
  const lines = src.split('\n');
  let lastImportIdx = -1;
  lines.forEach((line, idx) => {
    if (/^\s*import\s/.test(line)) {
      lastImportIdx = idx;
    }
  });
  if (lastImportIdx === -1) {
    return src;
  }
  lines.splice(lastImportIdx + 1, 0, WEBRTC_IMPORT);
  return lines.join('\n');
}

/**
 * Inserts the flag assignment right after `super.onCreate()` so it runs before
 * any React Native / WebRTC initialization.
 */
function enableMediaProjectionService(src) {
  if (src.includes(ENABLE_LINE)) {
    return src;
  }
  const marker = 'super.onCreate()';
  const markerIdx = src.indexOf(marker);
  if (markerIdx === -1) {
    return src;
  }
  const lineEnd = src.indexOf('\n', markerIdx);
  const insertion = [
    '',
    '    // LiveKit screenshare: MediaProjection on Android 14+ requires a',
    '    // foreground service of type mediaProjection running within 5s of the',
    '    // capture consent, otherwise getMediaProjection() throws SecurityException.',
    `    ${ENABLE_LINE}`,
    '',
  ].join('\n');
  return src.slice(0, lineEnd) + insertion + src.slice(lineEnd + 1);
}

module.exports = function withMediaProjectionService(config) {
  return withMainApplication(config, (config) => {
    let src = config.modResults.contents;
    src = addWebRTCImport(src);
    src = enableMediaProjectionService(src);
    config.modResults.contents = src;
    return config;
  });
};
