"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

const slides = [
  {
    id: "residente",
    label: "Residentes",
    title: "Gestión residencial\ncon alma, creada\npara la comunidad",
    description: "Simplifica tu vida en copropiedad. Accede a servicios, pagos y comunicación con tu administración desde una sola plataforma intuitiva y elegante.",
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=1600",
    features: [
      {
        title: "Reserva de Áreas",
        desc: "Gestiona el uso de piscina, gimnasio y salón comunal. Consulta disponibilidad y reserva en segundos.",
        img: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=500&q=80"
      },
      {
        title: "Cartelera Digital",
        desc: "Mantente al tanto de circulares, eventos y noticias importantes de tu conjunto sin salir de casa.",
        img: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=500&q=80"
      },
      {
        title: "Citofonía Virtual",
        desc: "Recibe llamadas de portería directamente en tu celular. Autoriza ingresos estés donde estés.",
        img: "https://images.unsplash.com/photo-1563906267088-b029e7101114?auto=format&fit=crop&w=500&q=80"
      }
    ]
  },
  {
    id: "administrador",
    label: "Administración",
    title: "Administración\neficiente, clara\ny 100% digital",
    description: "Toma el control total de tu copropiedad. Herramientas financieras y operativas diseñadas para administradores modernos que buscan transparencia.",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1600",
    features: [
      {
        title: "Asambleas Virtuales",
        desc: "Dirige y ordena asambleas con votaciones en tiempo real y registro de quórum automático.",
        img: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=500&q=80"
      },
      {
        title: "Aprobaciones",
        desc: "Gestiona solicitudes de estacionamientos, registro de mascotas y trámites administrativos.",
        img: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=500&q=80"
      },
      {
        title: "Publicar Contenido",
        desc: "Crea y publica anuncios, circulares y noticias importantes en la cartelera digital del conjunto.",
        img: "https://images.unsplash.com/photo-1432888622747-4eb9a8f2c205?auto=format&fit=crop&w=500&q=80"
      }
    ]
  },
  {
    id: "seguridad",
    label: "Seguridad",
    title: "Seguridad total\npara lo que\nmás importa",
    description: "Empodera a tu equipo de seguridad. Tecnología de vigilancia y control preventivo para garantizar la tranquilidad de todas las familias.",
    image: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&q=80&w=1600",
    features: [
      {
        title: "Control de Acceso",
        desc: "Registro fotográfico y biométrico de personal externo y domicilios con alertas instantáneas.",
        img: "https://images.unsplash.com/photo-1551808198-b30a64776194?auto=format&fit=crop&w=500&q=80"
      },
      {
        title: "Bitácora Digital",
        desc: "Reporte de incidentes y novedades con evidencia multimedia compartido en tiempo real con admin.",
        img: "https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=500&q=80"
      },
      {
        title: "Rondas Activas",
        desc: "Supervisión de puntos de control mediante tecnología NFC/QR para asegurar cobertura total.",
        img: "https://images.unsplash.com/photo-1587614203976-365c74445aeb?auto=format&fit=crop&w=500&q=80"
      }
    ]
  },
  {
    id: "estacionamientos",
    label: "Estacionamientos",
    title: "Optimización\ny orden en cada\nmétro cuadrado",
    description: "Gestiona el parqueo de visitantes y residentes con inteligencia. Elimina conflictos y maximiza el uso de espacios compartidos.",
    image: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&q=80&w=1600",
    features: [
      {
        title: "Reserva de Cupos",
        desc: "Permite a tus visitas reservar su lugar antes de llegar. Control de tiempos y disponibilidad.",
        img: "https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?auto=format&fit=crop&w=500&q=80"
      },
      {
        title: "Acceso con QR",
        desc: "Entrada automatizada para vehículos autorizados mediante lectura de códigos QR seguros.",
        img: "https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&w=500&q=80"
      },
      {
        title: "Auditoría de Uso",
        desc: "Reportes detallados de rotación, tiempos de estancia y alertas de parqueo no autorizado.",
        img: "https://images.unsplash.com/photo-1470224114660-3f6686c562eb?auto=format&fit=crop&w=500&q=80"
      }
    ]
  }
];

export default function Hero() {
  const { navigate } = useViewTransition();
  const heroRef = useRef<HTMLElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);

  // Main 10s Timer for Slides
  useEffect(() => {
    const mainTimer = setInterval(() => {
      handleSlideChange((activeSlide + 1) % slides.length);
    }, 10000);

    return () => clearInterval(mainTimer);
  }, [activeSlide]);

  // Nested 3s Timer for Features (within the current slide)
  useEffect(() => {
    const featureTimer = setInterval(() => {
      // First, animate current content out
      gsap.to(".feature-content", {
        opacity: 0,
        y: -10,
        duration: 0.3,
        onComplete: () => {
          setActiveFeature((prev) => (prev + 1) % 3);
          // Then, animate new content in
          gsap.fromTo(".feature-content", 
            { opacity: 0, y: 10 }, 
            { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
          );
        }
      });
    }, 3000);

    return () => clearInterval(featureTimer);
  }, [activeSlide]);

  const handleSlideChange = (index: number) => {
    const tl = gsap.timeline();
    tl.to([".hero-text", ".hero-card"], {
      opacity: 0,
      y: 10,
      duration: 0.3,
      onComplete: () => {
        setActiveSlide(index);
        setActiveFeature(0); 
        gsap.to(".hero-text", { y: 0, opacity: 1, duration: 0.6, delay: 0.2 });
        gsap.to(".hero-card", { x: 0, opacity: 1, duration: 0.6, delay: 0.3, ease: "back.out" });
      }
    });
  };

  const current = slides[activeSlide];
  const currentFeature = current.features[activeFeature];

  return (
    <section ref={heroRef} className="relative w-full h-screen p-6 bg-[#05020a]">
      <div className="relative w-full h-full rounded-[48px] overflow-hidden bg-[#05020a] isolate">
        {/* Background Layers for Crossfade */}
        {slides.map((slide, idx) => (
          <div 
            key={`bg-${slide.id}`}
            className="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out"
            style={{ 
              backgroundImage: `url('${slide.image}')`,
              opacity: activeSlide === idx ? 1 : 0,
              zIndex: activeSlide === idx ? 1 : 0,
              transform: activeSlide === idx ? "scale(1)" : "scale(1.1)",
              visibility: activeSlide === idx || Math.abs(activeSlide - idx) <= 1 ? 'visible' : 'hidden'
            }}
          />
        ))}
        
        <div className="absolute inset-0 bg-gradient-to-r from-[#05020a]/80 via-[#05020a]/30 to-transparent z-10" />

        <div className="relative z-20 w-full h-full flex items-center justify-between px-8 md:px-20">
          <div className="hero-text max-w-2xl text-white">
            
            <div className="inline-flex items-center gap-1 mb-8 p-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
              {slides.map((slide, idx) => (
                <button 
                  key={slide.id}
                  onClick={() => handleSlideChange(idx)}
                  className={`px-4 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wider uppercase transition-all duration-300 ${
                    activeSlide === idx ? "bg-white text-[#05020a]" : "text-white hover:bg-white/10"
                  }`}
                >
                  {slide.label}
                </button>
              ))}
              <div className="w-8 h-8 rounded-full border border-white/40 flex items-center justify-center ml-2">
                 <div 
                    className="w-2 h-2 rounded-full bg-white animate-pulse" 
                    style={{ animationDuration: '3s' }}
                  />
              </div>
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-[4.5rem] font-medium leading-[1.1] mb-6 font-[family-name:var(--font-montserrat)] tracking-tight whitespace-pre-line">
              {current.title}
            </h1>
            
            <p className="text-white/70 text-base md:text-lg mb-10 max-w-lg font-[family-name:var(--font-inter)] leading-relaxed">
              {current.description}
            </p>

            <div className="flex items-center gap-8">
              <button 
                onClick={() => window.location.href = "https://app.conjuntos.app/login"}
                className="bg-white text-[#05020a] px-8 py-4 rounded-full text-xs font-bold tracking-widest uppercase hover:bg-gray-100 transition-colors"
              >
                Comenzar Ahora
              </button>
              <button className="text-white flex items-center gap-2 text-xs font-bold tracking-widest uppercase hover:text-white/80 transition-colors">
                <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center">
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 6L0.25 11.1962L0.25 0.803848L10 6Z" fill="currentColor"/>
                  </svg>
                </div>
                Ver Historia
              </button>
            </div>
          </div>

          {/* Interactive Feature Card */}
          <div className="hero-card bg-white/10 border border-white/20 backdrop-blur-xl p-10 rounded-[40px] w-[480px] shadow-2xl relative overflow-hidden">
            <div className="relative z-10">
              <div className="feature-content">
                <div className="w-20 h-20 rounded-2xl bg-white/20 overflow-hidden mb-8 flex items-center justify-center">
                   <img 
                      src={currentFeature.img} 
                      alt={currentFeature.title} 
                      className="w-16 h-16 object-cover rounded-xl opacity-90" 
                    />
                </div>
                <div>
                  <h3 className="text-3xl font-medium text-white font-[family-name:var(--font-montserrat)] mb-4">{currentFeature.title}</h3>
                  <p className="text-base text-white/70 leading-relaxed mb-8 h-20">{currentFeature.desc}</p>
                  
                  <button className="w-full py-4 rounded-full border border-white/20 text-white text-xs font-bold tracking-widest uppercase hover:bg-white hover:text-[#05020a] transition-all duration-300">
                    Ver cómo funciona
                  </button>
                </div>
              </div>

              {/* Step Indicators */}
              <div className="flex gap-2 mt-8">
                {[0, 1, 2].map((i) => (
                  <div 
                    key={i} 
                    className={`h-1 flex-1 rounded-full transition-all duration-500 ${activeFeature === i ? "bg-white" : "bg-white/20"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
