"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function ProductsSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const products = [
    { name: "Acceso Vehicular", desc: "Reconocimiento Facial & Placas", img: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=400&q=80" },
    { name: "Pagos PSE", desc: "Integración Directa", img: "https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&w=400&q=80" },
    { name: "Alertas SOS", desc: "Seguridad 24/7", img: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=400&q=80" },
    { name: "Cámaras", desc: "Integración CCTV", img: "https://images.unsplash.com/photo-1557401625-1e4e2d3bb164?auto=format&fit=crop&w=400&q=80" }
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".product-card",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power2.out", scrollTrigger: { trigger: ".product-grid", start: "top 85%" } }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-16 bg-[#05020a]">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <div className="flex flex-wrap gap-4">
            <button className="text-white font-bold border-b-2 border-white pb-1">Seguridad</button>
            <button className="text-gray-400 font-medium hover:text-white transition-colors pb-1">Finanzas</button>
            <button className="text-gray-400 font-medium hover:text-white transition-colors pb-1">Comunidad</button>
            <button className="text-gray-400 font-medium hover:text-white transition-colors pb-1">Hardware</button>
          </div>
          <button className="px-6 py-2 bg-white/10 text-white rounded-full text-sm font-semibold hover:bg-[#D946EF] transition-colors border border-white/5">
            Ver Todos
          </button>
        </div>

        <div className="product-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((p, i) => (
            <div key={i} className="product-card group cursor-pointer">
              <div className="w-full h-64 bg-white/5 border border-white/5 rounded-3xl overflow-hidden p-6 flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-[1.02]">
                <img src={p.img} alt={p.name} className="w-full h-full object-cover rounded-xl shadow-sm opacity-80 group-hover:opacity-100 transition-opacity" />
              </div>
              <h4 className="font-bold text-white">{p.name}</h4>
              <p className="text-sm text-gray-500">{p.desc}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
