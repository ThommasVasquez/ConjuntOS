"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Smartphone } from "lucide-react";
import RevealText from "./RevealText";

gsap.registerPlugin(ScrollTrigger);

export default function ProductsSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const products = [
    {
      name: "Citofonía Virtual sin Cables",
      badge: "WebRTC en vivo",
      img: "/img/app/app-citofonia.webp",
      position: "object-top",
      desc: "Recibe llamadas de portería directo en tu celular por internet, autoriza ingresos y comunícate con administración sin citófonos físicos ni cableado.",
    },
    {
      name: "Pases Temporales (Airbnb)",
      badge: "Estancias Cortas",
      img: "/img/app/app-pases-temporales.webp",
      position: "object-top",
      desc: "Controla huéspedes de rentas cortas con check-in y check-out exactos, QR con vencimiento automático y portal privado Mi Estancia para el huésped.",
    },
    {
      name: "Encuestas y Participación",
      badge: "Comunidad",
      img: "/img/app/app-encuestas.webp",
      position: "object-top",
      desc: "Consulta la opinión de los residentes en segundos, toma decisiones transparentes y mide resultados en tiempo real desde la app.",
    },
    {
      name: "Pagos de Administración",
      badge: "Nequi",
      img: "/img/app/app-pagos.webp",
      position: "object-top",
      desc: "Consulta tu estado de cuenta, paga tu cuota con Nequi desde el celular y recibe tu recibo digital conciliado en tiempo real.",
    },
    {
      name: "Reservas de Zonas Comunes",
      badge: "Sin filas",
      img: "/img/app/app-reservas.webp",
      position: "object-top",
      desc: "Agenda piscina, gimnasio, salón social o zona BBQ con control de aforo, horarios y disponibilidad en tiempo real sin sobrecupos.",
    },
    {
      name: "Control de Acceso QR",
      badge: "Autorizado",
      img: "/img/app/app-visitantes.webp",
      position: "object-top",
      desc: "Genera pases QR peatonales y vehiculares para invitados, familiares y domicilios con validación instantánea en portería.",
    },
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".product-card",
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: { trigger: ".product-grid", start: "top 85%" },
        },
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-28 px-6 md:px-16 bg-text/[0.02] relative border-t border-b border-text/10 overflow-hidden"
    >
      {/* Top Section Divider Line */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-text/20 to-transparent pointer-events-none" />

      {/* Subtle Grid Pattern for Section Contrast */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-50" />

      {/* Background orbs for depth */}
      <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-accent/5 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-10%] w-[500px] h-[500px] bg-text/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          {/* Section Index Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold tracking-widest uppercase mb-4">
            <Smartphone className="w-3.5 h-3.5" />
            04 • Ecosistema Web App (PWA) & Kiosko
          </div>

          <RevealText
            as="h2"
            className="text-3xl md:text-5xl font-bold text-text tracking-tight font-[family-name:var(--font-serif)]"
          >
            Todo tu conjunto en una sola app instalable
          </RevealText>
          <p className="text-text/80 text-sm md:text-base mt-4 leading-relaxed font-[family-name:var(--font-inter)]">
            Sin tiendas de apps ni hardware propietario. Residentes, huéspedes
            de estancias cortas, portería y administración conectados en tiempo
            real desde cualquier celular, tablet o computador.
          </p>
        </div>

        <div className="product-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p, i) => (
            <div
              key={i}
              className="product-card group cursor-pointer flex flex-col justify-between h-full bg-text/[0.03] border border-text/10 rounded-[36px] p-5 transition-all duration-500 hover:border-accent/40 hover:bg-text/[0.05] hover:shadow-[0_15px_35px_rgba(0,0,0,0.3)]"
            >
              <div className="w-full h-72 bg-[#050d0c] border border-text/10 rounded-[28px] overflow-hidden mb-5 relative">
                <Image
                  src={p.img}
                  alt={p.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className={`object-cover ${p.position} transition-transform duration-700 group-hover:scale-105`}
                  unoptimized
                />
                <span className="absolute top-3 right-3 text-[10px] bg-black/75 backdrop-blur-md text-accent font-bold uppercase px-2.5 py-1 rounded-full border border-accent/30 tracking-wider">
                  {p.badge}
                </span>
              </div>
              <div>
                <h4 className="font-bold text-text text-lg tracking-tight group-hover:text-accent transition-colors duration-300">
                  {p.name}
                </h4>
                <p className="text-sm text-text/70 mt-2 font-light leading-relaxed">
                  {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
