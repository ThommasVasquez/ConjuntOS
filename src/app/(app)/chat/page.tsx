"use client";

import { useState, useEffect, useRef } from "react";
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

  const fetchMessages = async () => {
    try {
      const data = await api.get<ChatMsg[]>("/chat");
      setMessages(data);
    } catch {}
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await api.post("/chat", { mensaje: input.trim() });
      setInput("");
      fetchMessages();
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
    <div className="min-h-screen bg-primary flex flex-col">
      <ProfileHeader />
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-text-secondary text-center text-sm mt-8">
            No hay mensajes aún. Escribe uno para contactar a tu {isGuest ? "anfitrión" : "administración"}.
          </p>
        )}
        {messages.map((msg) => {
          // HUESPED_TEMPORAL: huesped_id presente = propio (right), ausente = propietario (left)
          // Otros roles: es_de_admin=false = propio (right), true = admin (left)
          const isOwn = isGuest ? !!msg.huesped_id : !msg.es_de_admin;
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

      <form onSubmit={handleSend} className="p-3 border-t border-border bg-surface-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-primary border border-border rounded-full px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent"
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
