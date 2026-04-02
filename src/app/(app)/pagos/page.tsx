"use client";

/**
 * PAGOS / WALLET - CONJUNTOAPP
 * Gestión financiera del residente, historial de pagos y pasarela simulada.
 */

import { 
  CreditCard, CheckCircle2, 
  ArrowRight, Info, Loader2,
  DollarSign, ListFilter, AlertCircle, ChevronRight
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { gsap } from "gsap";
import { toast } from "sonner";

interface Transaction {
  id: string;
  concepto: string;
  monto: number;
  estado: 'PENDIENTE' | 'PAGADO' | 'VENCIDO' | 'EN_DISPUTA';
  fechaVencimiento: string;
  fechaPago?: string;
  metodo?: string;
}

export default function PagosPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [activeTab, setActiveTab] = useState<'PENDIENTES' | 'HISTORIAL'>('PENDIENTES');
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<{ 
    unidad: { torre: string; numero: string } | null, 
    pagos: Transaction[], 
    totalDebt: number 
  }>({
    unidad: null,
    pagos: [],
    totalDebt: 0
  });

  const [selectedPayment, setSelectedPayment] = useState<Transaction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function fetchPagos() {
      try {
        const res = await fetch("/api/user/pagos", { cache: 'no-store' });
        const json = await res.json();
        if (json.success) {
          setData({
            unidad: json.data.unidad,
            pagos: json.data.pagos,
            totalDebt: json.data.totalDebt
          });
        }
      } catch (error) {
        console.error("❌ Error loading pagos:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (session) fetchPagos();

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.1 });
    }, containerRef);
    return () => ctx.revert();
  }, [session, userId]);

  const handleSimulatePayment = () => {
    if (!selectedPayment) return;
    setIsProcessing(true);
    
    // Simulación de procesamiento (Mock Wompi)
    setTimeout(() => {
      setIsProcessing(false);
      setSelectedPayment(null);
      toast.success("¡Pago procesado con éxito!", {
        description: "Tu recibo ha sido generado y enviado a tu correo."
      });
      // Recargar datos localmente
      setData(prev => ({
        ...prev,
        totalDebt: prev.totalDebt - selectedPayment.monto,
        pagos: prev.pagos.map(p => p.id === selectedPayment.id ? { ...p, estado: 'PAGADO', fechaPago: new Date().toISOString() } : p)
      }));
    }, 3500);
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'PAGADO': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'VENCIDO': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'PENDIENTE': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default: return 'bg-white/10 text-white/50 border-white/5';
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
                      <span className="text-white text-sm font-bold lowercase">{data.unidad ? `Torre ${data.unidad.torre} • Apto ${data.unidad.numero}` : 'Sin unidad'}</span>
                   </div>
                </div>
                <div className="liquid-glass px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
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
      <section className="fade-up flex bg-white/5 p-1.5 rounded-[24px] border border-white/5">
         {['PENDIENTES', 'HISTORIAL'].map((tab) => (
           <button 
             key={tab} 
             onClick={() => setActiveTab(tab as 'PENDIENTES' | 'HISTORIAL')}
             className={`flex-1 py-3.5 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white/10 text-white shadow-lg border border-white/10' : 'text-white/30 hover:text-white/50'}`}
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
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Calculando saldos...</p>
           </div>
         ) : filteredPagos.length === 0 ? (
           <div className="py-20 flex flex-col items-center gap-4 liquid-glass-card rounded-[32px] border border-white/5 p-10">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/20 mb-2">
                 <ListFilter size={32} />
              </div>
              <p className="text-white/50 text-sm font-bold">No hay movimientos en esta sección</p>
           </div>
         ) : (
           filteredPagos.map((p) => (
             <div 
               key={p.id} 
               onClick={() => activeTab === 'PENDIENTES' && setSelectedPayment(p)}
               className="fade-up liquid-glass-card rounded-[32px] p-5 flex items-center justify-between border border-white/5 hover:border-white/15 transition-all cursor-pointer group shadow-xl"
             >
                <div className="flex items-center gap-4">
                   <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${getStatusStyle(p.estado)}`}>
                      <DollarSign size={24} />
                   </div>
                   <div className="flex flex-col">
                      <h4 className="text-white font-bold text-base leading-none mb-1.5 group-hover:text-accent transition-colors">{p.concepto}</h4>
                      <div className="flex items-center gap-3">
                         <span className="text-accent text-xs font-bold">$ {p.monto.toLocaleString()}</span>
                         <span className="text-white/20 text-[10px] font-medium tracking-tight">Vence {new Date(p.fechaVencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
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

      {/* MODAL: PAYMENT PROCESSING (Simulated) */}
      {selectedPayment && (
        <div className="fixed inset-0 z-200 flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-[#0d041a]/95 backdrop-blur-3xl" onClick={() => !isProcessing && setSelectedPayment(null)} />
           
           <div className="relative w-full max-w-sm liquid-glass-card rounded-[40px] border border-white/20 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-400">
              <div className="p-8 flex flex-col gap-8">
                 <div className="flex justify-between items-center">
                    <h3 className="text-xl font-display font-bold text-white tracking-tight">Completar Pago</h3>
                    {!isProcessing && (
                      <button onClick={() => setSelectedPayment(null)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40"><DollarSign size={18} className="rotate-45" /></button>
                    )}
                 </div>

                 {isProcessing ? (
                   <div className="py-12 flex flex-col items-center gap-6">
                      <div className="w-20 h-20 rounded-full border-4 border-white/10 border-t-accent animate-spin" />
                      <div className="text-center">
                         <p className="text-white text-lg font-bold mb-1">Verificando transacción</p>
                         <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Seguridad Wompi Activa</p>
                      </div>
                   </div>
                 ) : (
                   <>
                     <div className="bg-white/5 rounded-3xl p-6 border border-white/10">
                        <div className="flex flex-col gap-4">
                           <div className="flex justify-between items-center border-b border-white/5 pb-4">
                              <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest ">Concepto</span>
                              <span className="text-white text-sm font-bold">{selectedPayment.concepto}</span>
                           </div>
                           <div className="flex justify-between items-end">
                              <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest ">Monto a Pagar</span>
                              <span className="text-3xl font-display font-bold text-accent text-glow">$ {selectedPayment.monto.toLocaleString()}</span>
                           </div>
                        </div>
                     </div>

                     <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#1a1333] border border-accent/20">
                           <CreditCard size={18} className="text-accent" />
                           <div className="flex-1">
                              <p className="text-white text-xs font-bold">Tarjeta de Crédito / PSE</p>
                              <p className="text-white/30 text-[10px]">Pago seguro procesado por Wompi</p>
                           </div>
                           <CheckCircle2 size={16} className="text-accent" />
                        </div>
                        
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                           <Info size={14} className="text-amber-400" />
                           <p className="text-amber-400/80 text-[9px] font-bold leading-tight">Este pago incluye el descuento por pronto pago si se realiza antes del vencimiento.</p>
                        </div>
                     </div>

                     <button 
                       onClick={handleSimulatePayment}
                       className="w-full bg-accent py-5 rounded-[22px] font-bold text-white shadow-xl shadow-accent/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
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
         <div className="bg-white/5 border border-white/5 rounded-[32px] p-6 flex items-center justify-between group cursor-pointer hover:bg-white/10 transition-all">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <AlertCircle size={24} />
               </div>
               <div>
                  <h4 className="text-white font-bold text-sm">¿Dudas con tu pago?</h4>
                  <p className="text-white/30 text-[10px]">Contacta directamente con administración</p>
               </div>
            </div>
            <ArrowRight size={20} className="text-white/20 group-hover:text-accent group-hover:translate-x-1 transition-all" />
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
