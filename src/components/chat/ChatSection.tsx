"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ChatMsg {
  id: string;
  mensaje: string;
  esDeAdmin: boolean;
  huespedId?: string;
  huespedNombre?: string;
  createdAt: string;
}

interface ChatSectionProps {
  /** Si es true, se muestra en modo compacto (para incrustar en otra página) */
  compact?: boolean;
}

export default function ChatSection({ compact = false }: ChatSectionProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const justSentRef = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = 100;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distFromBottom < threshold;
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get<ChatMsg[]>("/chat");
      setMessages((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
        return data;
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await api.post("/chat", { mensaje: input.trim() });
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
          ? "overflow-y-auto px-4 space-y-2 max-h-48"
          : "flex-1 overflow-y-auto px-4 space-y-3 min-h-0"}
      >
        {loading || !user ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-accent" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-text-secondary text-center text-sm mt-8">
            No hay mensajes aún. Escribe uno para contactar a tu {isGuest ? "anfitrión" : "administración"}.
          </p>
        ) : (
          messages.map((msg) => {
            const isOwn = isGuest
              ? !!msg.huespedId
              : isOwner
                ? !msg.huespedId && !msg.esDeAdmin
                : !msg.esDeAdmin;
            return (
              <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isOwn
                      ? "bg-accent text-on-accent rounded-tr-sm"
                      : "bg-surface-2 text-text rounded-tl-sm"
                  }`}
                >
                  <p className="text-sm">{msg.mensaje}</p>
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

      {/* Input area */}
      <form onSubmit={handleSend} className={compact
        ? "mx-3 mb-2 p-2 border border-border rounded-2xl bg-surface-2"
        : "mx-3 mb-2 p-3 border border-border rounded-3xl bg-surface-2"}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-primary border border-border rounded-full px-4 py-2.5 text-sm text-text placeholder:text-text/40 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-accent text-on-accent rounded-full p-2.5 disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
