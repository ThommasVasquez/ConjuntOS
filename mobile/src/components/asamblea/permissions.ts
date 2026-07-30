/**
 * Runtime media permissions for the assembly room.
 *
 * Web gets the browser's `getUserMedia` prompt for free, so its ControlBar just
 * calls `setMicrophoneEnabled()`. On Android nothing prompts: the publish then
 * fails with a permission error, so a resident who was given the palabra could
 * not actually speak — the exact failure the ported ControlBar was supposed to
 * fix. iOS prompts on first capture from the Info.plist strings.
 *
 * Same precedent as `src/providers/CallProvider.tsx` (ensureMicPermission).
 */

import { PermissionsAndroid, Platform } from 'react-native';

export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Micrófono',
        message: 'Se necesita el micrófono para hablar en la asamblea.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Cancelar',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: 'Cámara',
      message: 'Se necesita la cámara para mostrar tu video en la asamblea.',
      buttonPositive: 'Permitir',
      buttonNegative: 'Cancelar',
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
