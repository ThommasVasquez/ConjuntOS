'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video as VideoIcon, VideoOff, Settings, Eye } from 'lucide-react';

export interface JoinChoices {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
}

interface PreJoinProps {
  titulo: string;
  /** Watch-only participants get no device controls — just a clear explanation. */
  canPublish: boolean;
  onJoin: (choices: JoinChoices) => void;
}

/**
 * Green room. Runs its own getUserMedia preview *before* the LiveKit room is
 * created, so people can see themselves, pick devices and fix a dead mic
 * without the rest of the assembly watching them do it.
 */
export default function PreJoin({ titulo, canPublish, onJoin }: PreJoinProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [audioEnabled, setAudioEnabled] = useState(canPublish);
  const [videoEnabled, setVideoEnabled] = useState(canPublish);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState<string>();
  const [videoDeviceId, setVideoDeviceId] = useState<string>();
  const [showSettings, setShowSettings] = useState(false);
  const [permissionError, setPermissionError] = useState('');

  // (Re)open the preview whenever the camera choice changes.
  useEffect(() => {
    if (!canPublish || !videoEnabled) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
        audio: false,
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPermissionError('');
        // Labels only populate once permission is granted.
        setDevices(await navigator.mediaDevices.enumerateDevices());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPermissionError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Habilítalo en el navegador para mostrar tu video.'
            : 'No se pudo abrir la cámara.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [canPublish, videoEnabled, videoDeviceId]);

  // Release the preview devices when leaving the green room.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const cams = devices.filter((d) => d.kind === 'videoinput');
  const mics = devices.filter((d) => d.kind === 'audioinput');

  return (
    <div className="fixed inset-0 bg-[#050d0c] grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/60 mb-2">
            Asamblea
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white">{titulo}</h1>
          <p className="text-white/60 text-sm mt-2">
            {canPublish
              ? 'Revisa tu cámara y micrófono antes de entrar'
              : 'Entrarás en modo espectador'}
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5 items-center">
          {/* Preview */}
          <div className="relative aspect-video rounded-3xl overflow-hidden bg-[#0b1614] border border-white/10">
            {canPublish && videoEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover -scale-x-100"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 grid place-items-center mx-auto mb-3">
                    {canPublish ? (
                      <VideoOff size={26} className="text-white/55" />
                    ) : (
                      <Eye size={26} className="text-white/55" />
                    )}
                  </div>
                  <p className="text-white/60 text-xs">
                    {canPublish ? 'Cámara apagada' : 'Modo espectador'}
                  </p>
                </div>
              </div>
            )}

            {permissionError && (
              <div className="absolute inset-x-3 bottom-3 px-3 py-2 rounded-xl bg-[#f87171]/15 border border-[#f87171]/35">
                <p className="text-[11px] text-[#fecaca]">{permissionError}</p>
              </div>
            )}

            {canPublish && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
                <button
                  onClick={() => setAudioEnabled((v) => !v)}
                  aria-label={audioEnabled ? 'Silenciar micrófono' : 'Activar micrófono'}
                  className={`w-11 h-11 rounded-full grid place-items-center border transition-all active:scale-90 ${
                    audioEnabled
                      ? 'bg-white/10 border-white/15 text-white hover:bg-white/20'
                      : 'bg-[#f87171] border-[#f87171] text-[#2a0707]'
                  }`}
                >
                  {audioEnabled ? <Mic size={17} /> : <MicOff size={17} />}
                </button>
                <button
                  onClick={() => setVideoEnabled((v) => !v)}
                  aria-label={videoEnabled ? 'Apagar cámara' : 'Encender cámara'}
                  className={`w-11 h-11 rounded-full grid place-items-center border transition-all active:scale-90 ${
                    videoEnabled
                      ? 'bg-white/10 border-white/15 text-white hover:bg-white/20'
                      : 'bg-[#f87171] border-[#f87171] text-[#2a0707]'
                  }`}
                >
                  {videoEnabled ? <VideoIcon size={17} /> : <VideoOff size={17} />}
                </button>
                <button
                  onClick={() => setShowSettings((v) => !v)}
                  aria-label="Configuración de dispositivos"
                  className="w-11 h-11 rounded-full grid place-items-center border bg-white/10 border-white/15 text-white hover:bg-white/20 transition-all active:scale-90"
                >
                  <Settings size={17} />
                </button>
              </div>
            )}
          </div>

          {/* Join card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-4">
            {canPublish && showSettings && (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                    Micrófono
                  </span>
                  <select
                    value={audioDeviceId ?? ''}
                    onChange={(e) => setAudioDeviceId(e.target.value || undefined)}
                    className="bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                  >
                    <option value="">Predeterminado</option>
                    {mics.map((d) => (
                      <option key={d.deviceId} value={d.deviceId} className="bg-[#111]">
                        {d.label || 'Micrófono'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                    Cámara
                  </span>
                  <select
                    value={videoDeviceId ?? ''}
                    onChange={(e) => setVideoDeviceId(e.target.value || undefined)}
                    className="bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                  >
                    <option value="">Predeterminada</option>
                    {cams.map((d) => (
                      <option key={d.deviceId} value={d.deviceId} className="bg-[#111]">
                        {d.label || 'Cámara'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {!canPublish && (
              <p className="text-xs text-white/50 leading-relaxed">
                Podrás ver y escuchar la asamblea, votar y escribir en el chat. Para hablar,
                pide la palabra desde la sala y la administración te dará el turno.
              </p>
            )}

            <button
              onClick={() =>
                onJoin({ audioEnabled, videoEnabled, audioDeviceId, videoDeviceId })
              }
              className="w-full py-3.5 rounded-full bg-[#2dd4bf] text-[#04211d] font-bold text-sm hover:bg-white/90 active:scale-[0.98] transition-all"
            >
              Entrar a la asamblea
            </button>

            <p className="text-[10px] text-white/55 text-center">
              Al entrar, tu asistencia puede registrarse para el quórum.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
