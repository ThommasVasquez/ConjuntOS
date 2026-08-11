/**
 * PreJoin — mobile port of web `src/components/asamblea/PreJoin.tsx`.
 *
 * Green room. Runs its own camera preview *before* the LiveKit room is created,
 * so people can see themselves and fix a dead mic without the rest of the
 * assembly watching them do it. Nobody should land in an assembly mid-sentence
 * with a camera they never checked.
 *
 * Differences forced by the platform: web previews a `getUserMedia` stream in a
 * `<video>` and offers `enumerateDevices()` selects. React Native has no device
 * enumeration, so the preview is `expo-camera`'s `CameraView` (already mirrored
 * for the front lens, which is what web's `-scale-x-100` reproduces) and the
 * device pickers keep web's labels with their default option plus a front/back
 * flip, which is the only camera choice a phone actually has.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from '@/lib/native/camera';
import { Eye, Mic, MicOff, Settings, SwitchCamera, Video as VideoIcon, VideoOff } from 'lucide-react-native';

import { ensureMicPermission } from '@/components/asamblea/permissions';
import { chrome, ink, tint } from '@/components/asamblea/stageChrome';

export interface JoinChoices {
  audioEnabled: boolean;
  videoEnabled: boolean;
  /** Which lens to publish — the phone's equivalent of web's `videoDeviceId`. */
  facing: 'front' | 'back';
}

interface PreJoinProps {
  titulo: string;
  /** Watch-only participants get no device controls — just a clear explanation. */
  canPublish: boolean;
  onJoin: (choices: JoinChoices) => void;
}

export default function PreJoin({ titulo, canPublish, onJoin }: PreJoinProps) {
  const [audioEnabled, setAudioEnabled] = useState(canPublish);
  const [videoEnabled, setVideoEnabled] = useState(canPublish);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [showSettings, setShowSettings] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  // Ask for the camera only when we actually intend to preview it.
  useEffect(() => {
    if (!canPublish || !videoEnabled) return;
    if (permission?.granted) {
      setPermissionError('');
      return;
    }
    let cancelled = false;
    requestPermission()
      .then((result) => {
        if (cancelled) return;
        setPermissionError(
          result.granted
            ? ''
            : 'Permiso de cámara denegado. Habilítalo en el navegador para mostrar tu video.',
        );
      })
      .catch(() => {
        if (!cancelled) setPermissionError('No se pudo abrir la cámara.');
      });
    return () => {
      cancelled = true;
    };
  }, [canPublish, videoEnabled, permission?.granted, requestPermission]);

  const showPreview = canPublish && videoEnabled && Boolean(permission?.granted);

  const roundButton = (on: boolean) => ({
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    backgroundColor: on ? ink(0.1) : chrome.danger,
    borderColor: on ? ink(0.15) : chrome.danger,
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: chrome.primary }}
      contentContainerStyle={{ padding: 16, gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 2.5,
            color: ink(0.6),
          }}
        >
          Asamblea
        </Text>
        <Text
          style={{ fontSize: 24, fontWeight: '600', color: chrome.text, textAlign: 'center' }}
        >
          {titulo}
        </Text>
        <Text style={{ fontSize: 14, color: ink(0.6), textAlign: 'center' }}>
          {canPublish
            ? 'Revisa tu cámara y micrófono antes de entrar'
            : 'Entrarás en modo espectador'}
        </Text>
      </View>

      {/* Preview */}
      <View
        style={{
          width: '100%',
          aspectRatio: 16 / 9,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: chrome.primaryLight,
          borderWidth: 1,
          borderColor: ink(0.1),
        }}
      >
        {showPreview ? (
          <CameraView style={{ flex: 1 }} facing={facing} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: ink(0.05),
                borderWidth: 1,
                borderColor: ink(0.1),
                marginBottom: 12,
              }}
            >
              {canPublish ? (
                <VideoOff size={26} color={ink(0.55)} />
              ) : (
                <Eye size={26} color={ink(0.55)} />
              )}
            </View>
            <Text style={{ fontSize: 12, color: ink(0.6) }}>
              {canPublish ? 'Cámara apagada' : 'Modo espectador'}
            </Text>
          </View>
        )}

        {permissionError ? (
          <View
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: tint(chrome.danger, 0.15),
              borderWidth: 1,
              borderColor: tint(chrome.danger, 0.35),
            }}
          >
            <Text style={{ fontSize: 11, color: chrome.danger }}>{permissionError}</Text>
          </View>
        ) : null}

        {canPublish ? (
          <View
            style={{
              position: 'absolute',
              bottom: 12,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Pressable
              onPress={() => setAudioEnabled((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={audioEnabled ? 'Silenciar micrófono' : 'Activar micrófono'}
              style={roundButton(audioEnabled)}
            >
              {audioEnabled ? (
                <Mic size={17} color={chrome.text} />
              ) : (
                <MicOff size={17} color={chrome.primary} />
              )}
            </Pressable>
            <Pressable
              onPress={() => setVideoEnabled((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={videoEnabled ? 'Apagar cámara' : 'Encender cámara'}
              style={roundButton(videoEnabled)}
            >
              {videoEnabled ? (
                <VideoIcon size={17} color={chrome.text} />
              ) : (
                <VideoOff size={17} color={chrome.primary} />
              )}
            </Pressable>
            <Pressable
              onPress={() => setShowSettings((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Configuración de dispositivos"
              style={roundButton(true)}
            >
              <Settings size={17} color={chrome.text} />
            </Pressable>
            <Pressable
              onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
              accessibilityRole="button"
              accessibilityLabel="Cambiar cámara"
              style={roundButton(true)}
            >
              <SwitchCamera size={17} color={chrome.text} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Join card */}
      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: ink(0.1),
          backgroundColor: ink(0.03),
          padding: 24,
          gap: 16,
        }}
      >
        {canPublish && showSettings ? (
          <View style={{ gap: 12 }}>
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  color: ink(0.6),
                }}
              >
                Micrófono
              </Text>
              <View
                style={{
                  backgroundColor: ink(0.06),
                  borderWidth: 1,
                  borderColor: ink(0.1),
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ fontSize: 12, color: chrome.text }}>Predeterminado</Text>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  color: ink(0.6),
                }}
              >
                Cámara
              </Text>
              <View
                style={{
                  backgroundColor: ink(0.06),
                  borderWidth: 1,
                  borderColor: ink(0.1),
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ fontSize: 12, color: chrome.text }}>Predeterminada</Text>
              </View>
            </View>
          </View>
        ) : null}

        {!canPublish ? (
          <Text style={{ fontSize: 12, color: ink(0.5), lineHeight: 18 }}>
            Podrás ver y escuchar la asamblea, votar y escribir en el chat. Para hablar, pide
            la palabra desde la sala y la administración te dará el turno.
          </Text>
        ) : null}

        <Pressable
          // The camera prompt already happened in the preview; the microphone
          // has none on Android, so ask here instead of joining with a mic that
          // silently fails to publish.
          onPress={() => {
            if (!canPublish || !audioEnabled) {
              onJoin({ audioEnabled, videoEnabled, facing });
              return;
            }
            ensureMicPermission()
              .then((granted) => onJoin({ audioEnabled: granted, videoEnabled, facing }))
              .catch(() => onJoin({ audioEnabled: false, videoEnabled, facing }));
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            width: '100%',
            paddingVertical: 14,
            borderRadius: 999,
            alignItems: 'center',
            backgroundColor: chrome.accent,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: chrome.onAccent }}>
            Entrar a la asamblea
          </Text>
        </Pressable>

        <Text style={{ fontSize: 10, color: ink(0.55), textAlign: 'center' }}>
          Al entrar, tu asistencia puede registrarse para el quórum.
        </Text>
      </View>
    </ScrollView>
  );
}
