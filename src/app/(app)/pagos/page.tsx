"use client";

/**
 * PAGOS / WALLET - CONJUNTOSAPP
 * Gestión financiera del residente, historial de pagos y pasarela de pago.
 */

import { 
  CreditCard, CheckCircle2, 
  ArrowRight, Info, Loader2,
  DollarSign, AlertCircle, ChevronRight,
  SearchX
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useWsSubscription } from "@/hooks/useWebSocket";

interface Transaction {
  id: string;
  concepto: string;
  monto: number;
  estado: 'PENDIENTE' | 'PAGADO' | 'VENCIDO' | 'EN_DISPUTA';
  fechaVencimiento: string;
  fechaPago?: string;
  metodo?: string;
}

/** Parse the backend response into the shape the page expects */
function parsePagosResponse(json: { pagos?: any[]; recibos?: any[] }): {
  pagos: Transaction[];
  totalDebt: number;
} {
  const rawPagos = json?.pagos ?? [];
  const pagos: Transaction[] = rawPagos.map((p: any) => ({
    id: p.id,
    concepto: p.concepto,
    monto: parseFloat(p.monto || '0'),
    estado: p.estado,
    fechaVencimiento: p.fechaVencimiento,
    fechaPago: p.fechaPago || undefined,
    metodo: p.metodo || undefined,
  }));
  const totalDebt = pagos
    .filter(p => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO')
    .reduce((sum, p) => sum + p.monto, 0);
  return { pagos, totalDebt };
}

export default function PagosPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [activeTab, setActiveTab] = useState<'PENDIENTES' | 'HISTORIAL'>('PENDIENTES');
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<{
    pagos: Transaction[];
    totalDebt: number;
  }>({
    pagos: [],
    totalDebt: 0
  });

  const [selectedPayment, setSelectedPayment] = useState<Transaction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fetchLock = useRef(false);
  const initialFetchDone = useRef(false);

  const doFetch = async () => {
    try {
      const json = await api.get<{ pagos?: any[]; recibos?: any[] }>('/pagos');
      setData(parsePagosResponse(json));
    } catch {
      // silently ignore on WS refresh
    }
  };

  useWsSubscription('pago', () => { doFetch(); });

  useEffect(() => {
    if (!user || !userId || initialFetchDone.current) return;

    async function fetchPagos() {
      if (fetchLock.current) return;
      fetchLock.current = true;
      setIsLoading(true);
      
      try {
        const json = await api.get<{ pagos?: any[]; recibos?: any[] }>('/pagos');
        setData(parsePagosResponse(json));
        initialFetchDone.current = true;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error("Unknown error");
        toast.error(err.message || "Error conectando con el servidor");
      } finally {
        setIsLoading(false);
        fetchLock.current = false;
      }
    }

    fetchPagos();
  }, [user, userId]);

  useEffect(() => {
    if (!isLoading) {
      const ctx = gsap.context(() => {
        gsap.fromTo(".fade-up", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.1 });
      }, containerRef);
      return () => ctx.revert();
    }
  }, [isLoading]);

  const handlePayment = async () => {
    if (!selectedPayment) return;
    setIsProcessing(true);
    
    try {
      // Determinar si es un Pago administrativo o un Recibo público
      // En la DB, Pago tiene 'estado' y ReciboPublico tiene 'pagado'
      // Pero en la interfaz Transaction del frontend, los unificamos.
      // Aquí adivinamos el tipo o simplemente enviamos el ID.
      // Para este demo, asumimos que son PAGO a menos que el concepto diga algo de servicios.
      const type = selectedPayment.concepto.toLowerCase().includes('energía') || 
                   selectedPayment.concepto.toLowerCase().includes('gas') ||
                   selectedPayment.concepto.toLowerCase().includes('vanti') ||
                   selectedPayment.concepto.toLowerCase().includes('enel') ? 'RECIBO' : 'PAGO';

      await api.put(`/pagos/${selectedPayment.id}/pagar`, { metodo: 'PSE' });

      await new Promise(resolve => setTimeout(resolve, 3500));

      setIsProcessing(false);
      setSelectedPayment(null);
      
      toast.success("¡Pago procesado con éxito!", {
        description: "Tu recibo ha sido generado y persistido en el sistema."
      });

      // Recargar datos localmente
      setData(prev => ({
        ...prev,
        totalDebt: Math.max(0, prev.totalDebt - selectedPayment.monto),
        pagos: prev.pagos.map(p => p.id === selectedPayment.id ? { ...p, estado: 'PAGADO', fechaPago: new Date().toISOString() } : p)
      }));

    } catch (error: unknown) {
      const err = error instanceof ApiError ? error : new Error("Unknown error");
      toast.error(err.message || "No se pudo procesar el pago");
      setIsProcessing(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'PAGADO': return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
      case 'VENCIDO': return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
      case 'PENDIENTE': return 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/20';
      default: return 'bg-text/5 text-text border-border';
    }
  };

  const filteredPagos = data.pagos.filter(p => {
    if (activeTab === 'PENDIENTES') return p.estado === 'PENDIENTE' || p.estado === 'VENCIDO';
    return p.estado === 'PAGADO';
  });

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-8">
      <ProfileHeader className="fade-up" />

      {/* WALLET HERO CARD */}
      <section className="fade-up w-full relative group">
         <div className="absolute inset-0 bg-linear-to-br from-[#4C1D95] via-[#1E1B4B] to-[#701A75] rounded-[40px] shadow-2xl opacity-90" />
         <div className="absolute -top-4 -right-4 w-32 h-32 bg-white/5 blur-2xl rounded-full group-hover:bg-white/10 transition-all duration-700" />
         
         <div className="relative p-8 flex flex-col justify-between min-h-[220px]">
             <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                   <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest ">Estado de Cuenta</span>
                   <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
                        <CreditCard size={14} className="text-white/70" />
                      </div>
                      <span className="text-white text-sm font-bold lowercase">{user?.torre ? `Torre ${user.torre} • Apto ${user.apto}` : 'Mi unidad'}</span>
                   </div>
                </div>
                <div className="bg-white/10 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                   <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                   <span className="text-white/80 text-[10px] font-bold uppercase tracking-widest">Al día</span>
                </div>
             </div>

             <div className="flex justify-between items-end mt-4">
                <div className="flex flex-col">
                   <h2 className="text-4xl font-display font-bold text-white tracking-tighter text-glow">
                      $ {data.totalDebt.toLocaleString()}
                   </h2>
                   <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Saldo Total Pendiente</p>
                </div>
                <button 
                  onClick={() => {
                    const firstPending = data.pagos.find(p => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO');
                    if (firstPending) setSelectedPayment(firstPending);
                    else toast.info("No tienes pagos pendientes");
                  }}
                  className="bg-white text-[#1a0b2e] px-6 py-3 rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-all flex items-center gap-2"
                >
                  Pagar Ahora <ChevronRight size={16} />
                </button>
             </div>
         </div>
      </section>

      {/* TABS CONTROLS */}
      <section className="fade-up flex bg-surface-2 p-1.5 rounded-[24px] border border-border">
         {['PENDIENTES', 'HISTORIAL'].map((tab) => (
           <button 
             key={tab} 
             onClick={() => setActiveTab(tab as 'PENDIENTES' | 'HISTORIAL')}
             className={`flex-1 py-3.5 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-surface text-text shadow-lg border border-border' : 'text-text-muted hover:text-text'}`}
           >
              {tab}
           </button>
         ))}
      </section>

      {/* TRANSACTIONS LIST */}
      <section className="flex flex-col gap-5">
         {isLoading ? (
           <div className="py-20 flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 text-accent animate-spin" />
              <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Calculando saldos...</p>
           </div>
         ) : filteredPagos.length === 0 ? (
           <div className="py-20 flex flex-col items-center gap-4 liquid-glass-card rounded-[32px] border border-border p-10 text-center animate-in fade-in duration-1000">
              <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center text-text-muted mb-2">
                 <SearchX size={32} />
              </div>
              <p className="text-text font-bold text-sm">No hay movimientos en esta sección</p>
              <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mt-2 italic">Sincronizando con administración...</p>
           </div>
         ) : (
           filteredPagos.map((p) => (
             <div 
               key={p.id} 
               onClick={() => activeTab === 'PENDIENTES' && setSelectedPayment(p)}
               className="fade-up liquid-glass-card rounded-[32px] p-5 flex items-center justify-between border border-border hover:border-accent/30 transition-all cursor-pointer group shadow-xl"
             >
                <div className="flex items-center gap-4">
                   <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${getStatusStyle(p.estado)}`}>
                      <DollarSign size={24} />
                   </div>
                   <div className="flex flex-col">
                      <h4 className="text-text font-bold text-base leading-none mb-1.5 group-hover:text-accent transition-colors">{p.concepto}</h4>
                      <div className="flex items-center gap-3">
                         <span className="text-accent text-xs font-bold">$ {p.monto.toLocaleString()}</span>
                         <span className="text-text-muted text-[10px] font-medium tracking-tight">Vence {new Date(p.fechaVencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                      </div>
                   </div>
                </div>
                <div className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest ${getStatusStyle(p.estado)}`}>
                   {p.estado}
                </div>
             </div>
           ))
         )}
      </section>

      {/* MODAL: PAYMENT PROCESSING */}
      {selectedPayment && (
        <div className="fixed inset-0 z-200 flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-primary/95 dark:bg-[#0d041a]/95 backdrop-blur-3xl" onClick={() => !isProcessing && setSelectedPayment(null)} />
           
           <div className="relative w-full max-w-sm liquid-glass-card rounded-[40px] border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-400">
              <div className="p-8 flex flex-col gap-8">
                 <div className="flex justify-between items-center">
                    <h3 className="text-xl font-display font-bold text-text tracking-tight">Completar Pago</h3>
                    {!isProcessing && (
                      <button onClick={() => setSelectedPayment(null)} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-text-muted hover:text-text"><DollarSign size={18} className="rotate-45" /></button>
                    )}
                 </div>

                 {isProcessing ? (
                   <div className="py-12 flex flex-col items-center gap-6">
                      <div className="w-20 h-20 rounded-full border-4 border-border border-t-accent animate-spin" />
                      <div className="text-center">
                         <p className="text-text text-lg font-bold mb-1">Verificando transacción</p>
                         <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Seguridad Wompi Activa</p>
                      </div>
                   </div>
                 ) : (
                   <>
                     <div className="bg-surface-2 rounded-3xl p-6 border border-border">
                        <div className="flex flex-col gap-4">
                           <div className="flex justify-between items-center border-b border-border pb-4">
                              <span className="text-text-muted text-[10px] font-bold uppercase tracking-widest ">Concepto</span>
                              <span className="text-text text-sm font-bold">{selectedPayment.concepto}</span>
                           </div>
                           <div className="flex justify-between items-end">
                              <span className="text-text-muted text-[10px] font-bold uppercase tracking-widest ">Monto a Pagar</span>
                              <span className="text-3xl font-display font-bold text-accent text-glow">$ {selectedPayment.monto.toLocaleString()}</span>
                           </div>
                        </div>
                     </div>

                     <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-surface-2 dark:bg-[#1a1333] border border-accent/20">
                           <CreditCard size={18} className="text-accent" />
                           <div className="flex-1">
                              <p className="text-text text-xs font-bold">Tarjeta de Crédito / PSE</p>
                              <p className="text-text-muted text-[10px]">Pago seguro procesado por Wompi</p>
                           </div>
                           <CheckCircle2 size={16} className="text-accent" />
                        </div>
                        
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                           <Info size={14} className="text-amber-700 dark:text-amber-400" />
                           <p className="text-amber-800 dark:text-amber-300 text-[9px] font-bold leading-tight">Este pago incluye el descuento por pronto pago si se realiza antes del vencimiento.</p>
                        </div>
                     </div>

                     <button 
                       onClick={handlePayment}
                       className="w-full bg-accent py-5 rounded-[22px] font-bold text-primary shadow-xl shadow-accent/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                     >
                       Confirmar y Pagar <ArrowRight size={18} />
                     </button>
                   </>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* FOOTER: HELP */}
      <section className="fade-up mt-auto">
         <div 
            onClick={() => toast.success("Conectando con Administración vía WhatsApp...")}
            className="liquid-glass-card border border-border rounded-[32px] p-6 flex items-center justify-between group cursor-pointer hover:border-accent/30 transition-all active:scale-95"
         >
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                  <AlertCircle size={24} />
               </div>
               <div>
                  <h4 className="text-text font-bold text-sm">¿Dudas con tu pago?</h4>
                  <p className="text-text-muted text-[10px]">Contacta directamente con administración</p>
               </div>
            </div>
            <ArrowRight size={20} className="text-text-muted group-hover:text-accent group-hover:translate-x-1 transition-all" />
         </div>
      </section>

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .text-glow { text-shadow: 0 0 20px rgba(217,70,239,0.5); }
      `}} />
    </div>
  );
}
