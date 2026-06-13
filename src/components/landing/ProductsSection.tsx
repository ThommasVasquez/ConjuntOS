"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { PhoneCall, CreditCard, Calendar, ShieldCheck } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

export default function ProductsSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const products = [
    { 
      name: "Citofonía Digital", 
      desc: "Recibe llamadas de portería directamente en tu celular, autoriza ingresos y abre puertas con un toque.", 
      component: (
        <div className="w-full h-full flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-[0_0_15px_rgba(0,0,0,0.3)]">
              <PhoneCall size={20} className="animate-pulse" />
            </div>
            <span className="text-[9px] bg-accent/20 text-accent font-bold uppercase px-2.5 py-1 rounded-full border border-accent/30 tracking-wider">Llamando</span>
          </div>
          <div>
            <h5 className="text-[9px] text-accent font-black uppercase tracking-widest">Citófono Virtual</h5>
            <p className="text-white text-lg font-bold truncate mt-1">Lobby Portería</p>
            <div className="w-full h-[3px] bg-white/5 rounded-full overflow-hidden mt-3">
              <div className="h-full bg-accent w-2/3 animate-pulse" />
            </div>
          </div>
        </div>
      )
    },
    { 
      name: "Pagos de Administración", 
      desc: "Consulta tu saldo, genera recibos digitales y realiza pagos seguros por PSE de forma automatizada.", 
      component: (
        <div className="w-full h-full flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-2xl bg-text/10 border border-text/20 flex items-center justify-center text-black">
              <CreditCard size={20} />
            </div>
            <span className="text-[9px] bg-text/20 text-black font-bold uppercase px-2.5 py-1 rounded-full border border-text/30 tracking-wider">Al día</span>
          </div>
          <div>
            <h5 className="text-[9px] text-white uppercase tracking-widest font-bold">Tu Residencia</h5>
            <p className="text-white text-lg font-bold truncate mt-1">$ 0 Pendiente</p>
            <p className="text-[9px] text-white mt-1">Mes de Abril • Pago Exitoso</p>
          </div>
        </div>
      )
    },
    { 
      name: "Reservas de Áreas", 
      desc: "Agenda el salón comunal, gimnasio o zona de BBQ. Control de aforo y disponibilidad en tiempo real.", 
      component: (
        <div className="w-full h-full flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-2xl bg-text/10 border border-text/20 flex items-center justify-center text-black">
              <Calendar size={20} />
            </div>
            <span className="text-[9px] bg-text/20 text-black font-bold uppercase px-2.5 py-1 rounded-full border border-text/30 tracking-wider">Aprobado</span>
          </div>
          <div>
            <h5 className="text-[9px] text-white uppercase tracking-widest font-bold">Zona Común</h5>
            <p className="text-white text-lg font-bold truncate mt-1">Piscina & BBQ</p>
            <p className="text-[9px] text-white mt-1">Hoy, 18:00 - 20:00</p>
          </div>
        </div>
      )
    },
    { 
      name: "Control de Acceso QR", 
      desc: "Genera códigos QR de acceso para tus invitados, domicilios y familiares autorizados con alertas inmediatas.", 
      component: (
        <div className="w-full h-full flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-2xl bg-text/10 border border-text/20 flex items-center justify-center text-black">
              <ShieldCheck size={20} />
            </div>
            <span className="text-[9px] bg-text/20 text-black font-bold uppercase px-2.5 py-1 rounded-full border border-text/30 tracking-wider">Autorizado</span>
          </div>
          <div>
            <h5 className="text-[9px] text-white uppercase tracking-widest font-bold">Invitado Activo</h5>
            <p className="text-white text-lg font-bold truncate mt-1">Carlos Rodríguez</p>
            <p className="text-[9px] text-white mt-1">Acceso Vehicular • Placa KJS-092</p>
          </div>
        </div>
      )
    }
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".product-card",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.15, ease: "power3.out", scrollTrigger: { trigger: ".product-grid", start: "top 85%" } }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-16 bg-[#000000] relative">
      {/* Background orbs for depth */}
      <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#FFFFFF]/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-10%] w-[500px] h-[500px] bg-[#262626]/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <span className="text-accent font-black tracking-[0.25em] text-xs uppercase mb-3 block">Módulos Integrales</span>
          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight font-[family-name:var(--font-montserrat)]">
            La potencia de la app web en tu escritorio
          </h2>
          <p className="text-white text-sm md:text-base mt-4 leading-relaxed font-[family-name:var(--font-inter)]">
            Cada sección de nuestra plataforma replica la robustez de las herramientas de gestión del conjunto residencial para darte control absoluto.
          </p>
        </div>

        <div className="product-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((p, i) => (
            <div key={i} className="product-card group cursor-pointer flex flex-col justify-between h-full">
              <div className="w-full h-64 bg-white/5 border border-white/5 rounded-[32px] overflow-hidden p-6 flex flex-col mb-4 transition-all duration-500 group-hover:scale-[1.02] group-hover:border-accent/30 group-hover:shadow-[0_15px_35px_rgba(0,0,0,0.3)] relative">
                <div className="absolute inset-0 bg-linear-to-b from-[#171717]/20 to-transparent" />
                <div className="relative z-10 w-full h-full">
                  {p.component}
                </div>
              </div>
              <h4 className="font-bold text-white text-lg tracking-tight group-hover:text-accent transition-colors duration-300">{p.name}</h4>
              <p className="text-sm text-white mt-1 font-light leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
