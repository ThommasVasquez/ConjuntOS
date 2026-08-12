"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Minus, HelpCircle } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import RevealText from "./RevealText";

gsap.registerPlugin(ScrollTrigger);

export default function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(1);
  const sectionRef = useRef<HTMLElement>(null);

  const faqs = [
    {
      q: "¿Cómo son las asambleas por ConjuntOS?",
      a: "100% en vivo: video en tiempo real, orden del día punto por punto, voto ponderado por coeficiente de copropiedad conforme a la Ley 675, control de quórum y poderes, y el acta oficial redactada automáticamente por IA y exportable a PDF. Incluso con subtítulos y traducción en vivo.",
    },
    {
      q: "¿ConjuntOS cumple la Ley 675 de propiedad horizontal?",
      a: "Sí, está construido sobre la norma: multas con cobro automático a la cartera, comité de convivencia con validación de miembros, actas de mediación firmables (Art. 58), y quórum y votación ponderada por coeficiente en la asamblea.",
    },
    {
      q: "¿Cómo se pagan las cuotas de administración?",
      a: "Directamente desde la app con Nequi: el residente ingresa su celular, el sistema concilia el estado del pago en tiempo real y genera el recibo digital al instante. El administrador ve el recaudo, la morosidad y los gastos en un panel financiero.",
    },
    {
      q: "¿Necesito instalar hardware o citófonos nuevos?",
      a: "No. ConjuntOS es 100% software y funciona desde el celular, la tablet o el computador. La citofonía virtual (LiveKit) reemplaza al citófono físico, y los visitantes ingresan con pases QR de un solo uso.",
    },
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".faq-left",
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: ".faq-left", start: "top 80%" },
        },
      );

      gsap.fromTo(
        ".faq-img",
        { scale: 0.8, opacity: 0, rotation: -10 },
        {
          scale: 1,
          opacity: 1,
          rotation: 3,
          duration: 1,
          ease: "back.out(1.5)",
          scrollTrigger: { trigger: ".faq-left", start: "top 70%" },
        },
      );

      gsap.fromTo(
        ".faq-item",
        { x: 30, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.1,
          ease: "power2.out",
          scrollTrigger: { trigger: ".faq-right", start: "top 85%" },
        },
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="soporte"
      className="py-28 px-6 md:px-16 bg-primary relative overflow-hidden"
    >
      {/* Top Section Hairline Divider */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-accent/30 to-transparent pointer-events-none" />

      {/* Ambient background blur */}
      <div className="absolute top-1/3 right-[5%] w-[450px] h-[450px] bg-accent/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Elevated Section Card Wrapper */}
        <div className="rounded-[44px] border border-text/10 bg-text/[0.02] backdrop-blur-sm p-8 md:p-14 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-16 items-start">
            <div className="faq-left flex-1 relative pb-20 lg:pb-0">
              {/* Section Index Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold tracking-widest uppercase mb-4">
                <HelpCircle className="w-3.5 h-3.5" />
                07 • Preguntas Frecuentes
              </div>

              <RevealText
                as="h2"
                className="text-3xl md:text-5xl font-bold text-text font-[family-name:var(--font-serif)] max-w-md leading-tight mb-8"
              >
                Si tienes alguna duda sobre el proceso de implementación, estamos
                listos para ayudarte.
              </RevealText>

              <div className="faq-img absolute -bottom-10 right-10 lg:bottom-0 lg:right-10 w-48 h-48 rounded-[28px] border border-text/15 overflow-hidden shadow-2xl rotate-3">
                <Image
                  fill
                  sizes="192px"
                  src="/img/support.webp"
                  alt="Soporte y acompañamiento"
                  className="object-cover"
                />
              </div>
            </div>

            <div className="faq-right flex-1 w-full pt-8 lg:pt-0">
              <div className="flex flex-col gap-4">
                {faqs.map((faq, idx) => (
                  <div
                    key={idx}
                    className={`faq-item border rounded-3xl p-6 cursor-pointer transition-all duration-300 ${
                      openIdx === idx
                        ? "bg-text/[0.05] border-accent/40 shadow-lg"
                        : "bg-text/[0.02] border-text/10 hover:border-text/20"
                    }`}
                    onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h4
                        className={`text-lg font-bold transition-colors ${
                          openIdx === idx ? "text-accent" : "text-text"
                        }`}
                      >
                        {faq.q}
                      </h4>
                      {openIdx === idx ? (
                        <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0">
                          <Minus className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-text/10 border border-text/15 flex items-center justify-center text-text flex-shrink-0">
                          <Plus className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    {openIdx === idx && (
                      <p className="mt-4 text-text/80 leading-relaxed pr-6 font-light animate-in fade-in slide-in-from-top-2 duration-300">
                        {faq.a}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
