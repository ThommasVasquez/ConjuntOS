// deploy trigger
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ChatMsg {
  id: string;
  mensaje: string;
  es_de_admin: boolean;
  huesped_id?: string;
  huesped_nombre?: string;
  created_at: string;
}

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const justSentRef = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Detect if user manually scrolled up
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = 100; // px from bottom to consider "near bottom"
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distFromBottom < threshold;
  }, []);

  const fetchMessages = async () => {
    try {
      const data = await api.get<ChatMsg[]>("/chat");
      setMessages((prev) => {
        // Only trigger scroll effect if messages actually changed
        if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
        return data;
      });
    } catch {}
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll on new messages: only if user is near bottom or just sent
  useEffect(() => {
    if (justSentRef.current) {
      // After sending, always scroll
      scrollToBottom(true);
      justSentRef.current = false;
    } else if (isNearBottomRef.current) {
      // Poll found new messages and user is reading at bottom → scroll
      scrollToBottom(true);
    }
    // If user scrolled up (not near bottom), don't interrupt
  }, [messages]);

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

  return (
    <div className="min-h-screen bg-primary flex flex-col pt-16 pb-32">
      <ProfileHeader className="px-4" />
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 space-y-3"
      >
        {messages.length === 0 && (
          <p className="text-text-secondary text-center text-sm mt-8">
            No hay mensajes aún. Escribe uno para contactar a tu {isGuest ? "anfitrión" : "administración"}.
          </p>
        )}
        {messages.map((msg) => {
          const isOwner = user?.rol === "PROPIETARIO";
          const isOwn = isGuest
            ? !!msg.huesped_id           // huésped: sus mensajes tienen huesped_id
            : isOwner
              ? !msg.huesped_id          // propietario: sus mensajes NO tienen huesped_id
              : !msg.es_de_admin;        // admin/residente: lógica original
          return (
            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isOwn
                    ? "bg-accent text-white rounded-tr-sm"
                    : "bg-surface-2 text-text rounded-tl-sm"
                }`}
              >
                <p className="text-sm">{msg.mensaje}</p>
                <p className="text-[10px] mt-1 opacity-60 text-right">
                  {msg.huesped_nombre && <span className="mr-2">{msg.huesped_nombre}</span>}
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="mx-3 mb-2 p-3 border border-border rounded-3xl bg-surface-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-surface-2 border border-border rounded-full px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-accent text-white rounded-full p-2.5 disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
