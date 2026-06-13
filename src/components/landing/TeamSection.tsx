"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function TeamSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const modules = [
    { title: "Control de Acceso", subtitle: "Seguridad y Citofonía", img: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=600&q=80" },
    { title: "Gestión Financiera", subtitle: "Pagos y Reportes", img: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=600&q=80" },
    { title: "Reservas", subtitle: "Zonas Comunes", img: "https://images.unsplash.com/photo-1542181961-9590d0c79227?auto=format&fit=crop&w=600&q=80" }
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".team-header > *",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, stagger: 0.1, scrollTrigger: { trigger: ".team-header", start: "top 80%" } }
      );

      gsap.fromTo(".team-card",
        { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, stagger: 0.2, ease: "power3.out", scrollTrigger: { trigger: ".team-card-container", start: "top 75%" } }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-16 bg-[#000000]">
      <div className="max-w-7xl mx-auto">
        
        <div className="team-header mb-16">
          <p className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-4">Módulos</p>
          <h2 className="text-3xl md:text-5xl font-bold text-white font-[family-name:var(--font-montserrat)] max-w-3xl leading-tight">
            Creemos en tecnología que facilita la vida. Cada módulo que desarrollamos es un compromiso con la tranquilidad.
          </h2>
        </div>

        <div className="team-card-container grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map((mod, i) => (
            <div key={i} className="team-card relative h-[450px] rounded-[32px] overflow-hidden group">
              <img src={mod.img} alt={mod.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#000000] via-[#000000]/80 to-transparent flex flex-col justify-end p-8">
                <h3 className="text-xl font-bold text-white">{mod.title}</h3>
                <p className="text-sm text-neutral-500">{mod.subtitle}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
