"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { Send, Loader2, Image, Camera, Paperclip, Mic, X, Play, Pause } from "lucide-react";
import { toast } from "sonner";

interface ChatMsg {
  id: string;
  mensaje: string;
  audioUrl?: string;
  transcripcion?: string;
  esDeAdmin: boolean;
  huespedId?: string;
  huespedNombre?: string;
  createdAt: string;
}

interface ChatSectionProps {
  compact?: boolean;
  huespedId?: string;
}

export default function ChatSection({ compact = false, huespedId }: ChatSectionProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Voice recording state ──────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Audio playback ──────────────────────────────────────────────────
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distFromBottom < 100;
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get<ChatMsg[]>("/chat");
      const filtered = huespedId
        ? data.filter((m: ChatMsg) => !m.huespedId || m.huespedId === huespedId)
        : data;
      setMessages((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(filtered)) return prev;
        return filtered;
      });
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [user, fetchMessages]);

  useEffect(() => {
    if (justSentRef.current) {
      scrollToBottom(true);
      justSentRef.current = false;
    } else if (isNearBottomRef.current) {
      scrollToBottom(true);
    }
  }, [messages, scrollToBottom]);

  // ── File → base64 data URL ──────────────────────────────────────────
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Error leyendo archivo"));
      reader.readAsDataURL(file);
    });
  };

  // ── Upload file and get URL ─────────────────────────────────────────
  const uploadAndGetUrl = async (file: File): Promise<{ url: string; isImage: boolean }> => {
    const dataUrl = await fileToDataUrl(file);
    const isImage = file.type.startsWith("image/");

    if (isImage) {
      const res = await api.post<{ url: string }>("/uploads/imagen", {
        data: dataUrl,
        carpeta: "chat",
      });
      return { url: res.url, isImage: true };
    } else {
      const res = await api.post<{ url: string; content_type: string }>("/uploads/archivo", {
        data: dataUrl,
        nombre: file.name,
      });
      return { url: res.url, isImage: false };
    }
  };

  // ── Send file as chat message ───────────────────────────────────────
  const sendFileMessage = async (file: File) => {
    setUploading(true);
    try {
      const { url, isImage } = await uploadAndGetUrl(file);
      const prefix = isImage ? "[imagen]" : "[archivo]";
      const name = file.name;
      await api.post("/chat", { mensaje: `${prefix}${name}|${url}`, ...(huespedId ? { huespedId } : {}) });
      justSentRef.current = true;
      await fetchMessages();
      toast.success(isImage ? "Imagen enviada" : "Archivo enviado");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al subir archivo";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await sendFileMessage(files[0]);
    e.target.value = "";
  };

  // ── Voice recording ─────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendVoiceMessage(blob);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      toast.error("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const sendVoiceMessage = async (blob: Blob) => {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Error convirtiendo audio"));
        reader.readAsDataURL(blob);
      });

      // Extraer base64 puro del data URL
      const base64 = dataUrl.split(",")[1];
      await api.post("/chat", {
        mensaje: "[audio]",
        audioBase64: base64,
        ...(huespedId ? { huespedId } : {}),
      });
      justSentRef.current = true;
      await fetchMessages();
      toast.success("Nota de voz enviada");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al enviar audio";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const cancelRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    chunksRef.current = [];
  };

  // ── Audio playback ──────────────────────────────────────────────────
  const togglePlayAudio = (msgId: string, url: string) => {
    if (playingId === msgId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
    setPlayingId(msgId);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Message parser ──────────────────────────────────────────────────
  const parseMessage = (mensaje: string): {
    type: "text" | "image" | "file" | "audio_placeholder";
    text?: string;
    url?: string;
    fileName?: string;
  } => {
    if (mensaje === "[audio]") return { type: "audio_placeholder" };
    const imgMatch = mensaje.match(/^\[imagen\](.+?)\|(.+)$/);
    if (imgMatch) return { type: "image", fileName: imgMatch[1], url: imgMatch[2] };
    const fileMatch = mensaje.match(/^\[archivo\](.+?)\|(.+)$/);
    if (fileMatch) return { type: "file", fileName: fileMatch[1], url: fileMatch[2] };
    return { type: "text", text: mensaje };
  };

  // ── Send text ───────────────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await api.post("/chat", { mensaje: input.trim(), ...(huespedId ? { huespedId } : {}) });
      setInput("");
      justSentRef.current = true;
      await fetchMessages();
    } catch {
      toast.error("Error al enviar mensaje");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  };

  const isGuest = user?.rol === "HUESPED_TEMPORAL";
  const isOwner = user?.rol === "PROPIETARIO";

  // ── Render message content ──────────────────────────────────────────
  const renderMessageContent = (msg: ChatMsg) => {
    // Audio message
    if (msg.audioUrl) {
      return (
        <div className="flex items-center gap-2 min-w-[140px]">
          <button
            onClick={(e) => { e.stopPropagation(); togglePlayAudio(msg.id, msg.audioUrl!); }}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0"
          >
            {playingId === msg.id ? <Pause size={14} className="text-white" /> : <Play size={14} className="text-white ml-0.5" />}
          </button>
          <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className={`h-full bg-white rounded-full ${playingId === msg.id ? "animate-pulse" : ""}`} style={{ width: "60%" }} />
          </div>
          <span className="text-[10px] opacity-60">🎤</span>
        </div>
      );
    }

    const parsed = parseMessage(msg.mensaje);

    if (parsed.type === "audio_placeholder") {
      return <span className="text-xs italic opacity-60">🎤 Mensaje de voz</span>;
    }

    if (parsed.type === "image" && parsed.url) {
      return (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={parsed.url}
            alt={parsed.fileName || "Imagen"}
            className="rounded-xl max-w-full max-h-64 object-cover cursor-pointer"
            loading="lazy"
            onClick={() => window.open(parsed.url!, "_blank")}
          />
          {parsed.fileName && <p className="text-[10px] mt-1 opacity-60">{parsed.fileName}</p>}
        </div>
      );
    }

    if (parsed.type === "file" && parsed.url) {
      return (
        <a
          href={parsed.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 underline hover:opacity-80"
        >
          <Paperclip size={14} />
          <span className="text-sm">{parsed.fileName || "Archivo adjunto"}</span>
        </a>
      );
    }

    return <p className="text-sm whitespace-pre-wrap break-words">{parsed.text}</p>;
  };

  // ── Render ──────────────────────────────────────────────────────────
  const containerClass = compact
    ? "flex flex-col"
    : "flex flex-col flex-1 min-h-0";

  return (
    <div className={containerClass}>
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={compact
          ? "overflow-y-auto overflow-x-hidden px-4 space-y-2 max-h-48"
          : "flex-1 overflow-y-auto overflow-x-hidden px-4 space-y-3 min-h-0"}
      >
        {loading || !user ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-accent" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-text-secondary text-center text-sm mt-8">
            No hay mensajes aún. Escribe uno para contactar a tu {isGuest ? "anfitrión" : huespedId ? "huésped" : "administración"}.
          </p>
        ) : (
          messages.map((msg) => {
            const isOwn = isGuest
              ? !!msg.huespedId
              : isOwner
                ? !msg.huespedId && !msg.esDeAdmin
                : msg.esDeAdmin;
            return (
              <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isOwn
                      ? "bg-accent text-on-accent rounded-tr-sm"
                      : "bg-surface-2 text-text rounded-tl-sm"
                  }`}
                >
                  {renderMessageContent(msg)}
                  <p className="text-[10px] mt-1 opacity-60 text-right">
                    {msg.huespedNombre && <span className="mr-2">{msg.huespedNombre}</span>}
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Voice recording bar */}
      {recording && (
        <div className="mx-3 mb-1 px-4 py-2.5 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] animate-pulse shrink-0" />
          <span className="text-sm text-text flex-1">
            Grabando… {formatDuration(recordingTime)}
          </span>
          <button onClick={cancelRecording} className="text-text/60 hover:text-text p-1">
            <X size={18} />
          </button>
          <button onClick={stopRecording} className="bg-accent text-on-accent rounded-full p-2">
            <Send size={16} />
          </button>
        </div>
      )}

      {/* Attachment bar — solo en modo completo */}
      {!compact && !recording && (
        <div className="flex items-center justify-center gap-4 px-4 py-2">
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploading}
            className="text-text/50 hover:text-accent transition-colors p-2 disabled:opacity-30"
            aria-label="Galería de fotos"
          >
            {uploading ? <Loader2 size={22} className="animate-spin" /> : <Image size={22} />}
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            className="text-text/50 hover:text-accent transition-colors p-2 disabled:opacity-30"
            aria-label="Tomar foto"
          >
            <Camera size={22} />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-text/50 hover:text-accent transition-colors p-2 disabled:opacity-30"
            aria-label="Adjuntar archivo"
          >
            <Paperclip size={22} />
          </button>
          <button
            type="button"
            onClick={startRecording}
            disabled={uploading}
            className="text-text/50 hover:text-accent transition-colors p-2 disabled:opacity-30"
            aria-label="Grabar mensaje de voz"
          >
            <Mic size={22} />
          </button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      {/* Input area */}
      {!recording && (
        <form onSubmit={handleSend} className={compact
          ? "mx-3 mb-2 p-2 border border-border rounded-2xl bg-surface-2"
          : "mx-3 mb-2 p-3 border border-border rounded-3xl bg-surface-2"}>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe un mensaje..."
              disabled={uploading}
              className="flex-1 bg-primary border border-border rounded-full px-4 py-2.5 text-sm text-text placeholder:text-text/40 focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || uploading}
              className="bg-accent text-on-accent rounded-full p-2.5 disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
