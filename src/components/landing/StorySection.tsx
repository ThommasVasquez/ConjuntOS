"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function StorySection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Text animation
      gsap.fromTo(".story-text > *", 
        { y: 40, opacity: 0 },
        { 
          y: 0, opacity: 1, duration: 1, stagger: 0.2, ease: "power3.out",
          scrollTrigger: { trigger: ".story-text", start: "top 80%" }
        }
      );

      // Images stagger animation
      gsap.fromTo(".story-img",
        { y: 60, opacity: 0, scale: 0.95 },
        {
          y: 0, opacity: 1, scale: 1, duration: 1, stagger: 0.15, ease: "back.out(1.2)",
          scrollTrigger: { trigger: ".story-img-container", start: "top 75%" }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-16 bg-[#05020a]">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
        
        <div className="story-text flex-1 space-y-6">
          <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight font-[family-name:var(--font-montserrat)] tracking-tight max-w-xl">
            Una historia de comunidad, seguridad y tecnología — <span className="text-gray-400">creamos tranquilidad.</span>
          </h2>
          <p className="text-gray-400 text-lg md:text-xl max-w-lg leading-relaxed">
            Cada módulo está diseñado con técnicas probadas para asegurar que cada interacción sea no solo eficiente, sino construida para mejorar tu calidad de vida. Con cada línea de código, llevamos calidez, tradición y sostenibilidad a tu hogar.
          </p>
        </div>

        <div className="story-img-container flex-1 flex gap-4 h-[500px]">
          <div className="flex flex-col gap-4 w-1/2 pt-12">
            <img src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80" alt="Home interior 1" className="story-img w-full h-1/2 object-cover rounded-[32px]" />
            <img src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=600&q=80" alt="Home interior 2" className="story-img w-full h-1/2 object-cover rounded-[32px]" />
          </div>
          <div className="flex flex-col gap-4 w-1/2 pb-12">
            <img src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=600&q=80" alt="Home interior 3" className="story-img w-full h-1/2 object-cover rounded-[32px]" />
            <img src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80" alt="Home interior 4" className="story-img w-full h-1/2 object-cover rounded-[32px]" />
          </div>
        </div>

      </div>
    </section>
  );
}
