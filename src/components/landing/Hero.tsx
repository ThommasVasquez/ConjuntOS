"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";
import { useTheme } from "@/components/providers/ThemeContext";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

const slides = [
  {
    id: "residente",
    label: "Residentes",
    title: "Gestión residencial\nsin desorden ni sobrecupos\npara tu comunidad",
    description:
      "Eliminamos el desorden y la saturación en áreas comunes. Reserva piscinas, salones sociales y gimnasios de forma justa, transparente y sin filas desde tu celular.",
    image:
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1920&q=80",
    imageLight:
      "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1920&q=80",
    features: [
      {
        title: "Piscina y Zonas Húmedas",
        desc: "Control inteligente de reservas y aforo en piscina, sauna y turco para evitar sobrecupos y aglomeraciones.",
        img: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=600&q=80",
      },
      {
        title: "Salones Sociales y BBQ",
        desc: "Reserva rápida de salón de eventos, zona BBQ y áreas de reuniones sin desorden ni cruces de fechas.",
        img: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=600&q=80",
      },
      {
        title: "Gimnasio y Deporte",
        desc: "Gestión de turnos y capacidad en el gimnasio comunal para garantizar que todos disfruten su entrenamiento.",
        img: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&q=80",
      },
    ],
  },
  {
    id: "administrador",
    label: "Administración",
    title: "Administración\neficiente, clara\ny 100% digital",
    description:
      "Toma el control total de tu copropiedad. Cero desorden en recaudos, asambleas fluidas y transparencia absoluta en el uso de las instalaciones.",
    image:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1920&q=80",
    imageLight:
      "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1920&q=80",
    features: [
      {
        title: "Asambleas Virtuales",
        desc: "Dirige y ordena asambleas con votaciones en tiempo real y registro de quórum automático.",
        img: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=600&q=80",
      },
      {
        title: "Finanzas y Cartera",
        desc: "Monitoreo transparente de expensas comunes, pagos de cuotas y reportes financieros sin mora.",
        img: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80",
      },
      {
        title: "Cartelera Oficial",
        desc: "Publica avisos, circulares y comunicados con notificación directa al smartphone del residente.",
        img: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80",
      },
    ],
  },
  {
    id: "seguridad",
    label: "Seguridad",
    title: "Control de acceso\ny seguridad total\npara tu conjunto",
    description:
      "Portería moderna sin filas ni congestiones. Autoriza visitantes y domicilios al instante con citofonía virtual y accesos QR verificados.",
    image:
      "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=1920&q=80",
    imageLight:
      "https://images.unsplash.com/photo-1563906267088-b029e7101114?auto=format&fit=crop&w=1920&q=80",
    features: [
      {
        title: "Pases QR de Acceso",
        desc: "Entrada rápida y segura para invitados previa autorización del propietario mediante escaneo de código QR.",
        img: "https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&w=600&q=80",
      },
      {
        title: "Citofonía Virtual",
        desc: "Llamadas inmediatas desde portería al celular del residente sin depender de cables obsoletos.",
        img: "https://images.unsplash.com/photo-1586105251261-72a756497a11?auto=format&fit=crop&w=600&q=80",
      },
      {
        title: "Bitácora de Eventos",
        desc: "Registro en tiempo real de novedades e ingresos con fotos y respaldo digital en la nube.",
        img: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80",
      },
    ],
  },
  {
    id: "estacionamientos",
    label: "Estacionamientos",
    title: "Parqueaderos ordenados\nsin invasión ni conflictos",
    description:
      "Termina con el desorden vehicular. Asignación inteligente, control de tiempos de estancia y cero sorpresas en cupos de visitantes.",
    image:
      "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1920&q=80",
    imageLight:
      "https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?auto=format&fit=crop&w=1920&q=80",
    features: [
      {
        title: "Reserva de Cupos",
        desc: "Permite a tus visitas asegurar su lugar antes de llegar. Control estricto de cupos disponibles.",
        img: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=600&q=80",
      },
      {
        title: "Control de Tiempos",
        desc: "Monitoreo en línea de duraciones de estacionamiento para evitar estancias prolongadas o indebidas.",
        img: "https://images.unsplash.com/photo-1590674899484-d5640e854abe?auto=format&fit=crop&w=600&q=80",
      },
      {
        title: "Alertas de Sobrecupo",
        desc: "Notificaciones automáticas a la portería ante ocupaciones no autorizadas en bahías.",
        img: "https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?auto=format&fit=crop&w=600&q=80",
      },
    ],
  },
];

export default function Hero() {
  const { navigate } = useViewTransition();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const heroRef = useRef<HTMLElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);

  // Main Timer for Slides (11 seconds per main tab)
  useEffect(() => {
    const mainTimer = setInterval(() => {
      handleSlideChange((activeSlide + 1) % slides.length);
    }, 11000);

    return () => clearInterval(mainTimer);
  }, [activeSlide]);

  // Feature Rotation Timer (4 seconds per feature thumbnail step)
  useEffect(() => {
    const featureTimer = setInterval(() => {
      // First, animate current content out
      gsap.to(".feature-content", {
        opacity: 0,
        y: -10,
        duration: 0.4,
        onComplete: () => {
          setActiveFeature((prev) => (prev + 1) % 3);
          // Then, animate new content in
          gsap.fromTo(
            ".feature-content",
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
          );
        },
      });
    }, 4000);

    return () => clearInterval(featureTimer);
  }, [activeSlide]);

  const handleSlideChange = (index: number) => {
    if (index === activeSlide) return;
    // Smooth cinematic timeline transition
    gsap
      .timeline({ overwrite: "auto" })
      .to([".hero-text", ".hero-card"], {
        opacity: 0,
        y: 12,
        duration: 0.4,
        ease: "power2.in",
      })
      .add(() => {
        setActiveSlide(index);
        setActiveFeature(0);
      })
      .to([".hero-text", ".hero-card"], {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: "power2.out",
      });
  };

  const current = slides[activeSlide];
  const currentFeature = current.features[activeFeature];

  return (
    <section
      ref={heroRef}
      className={`relative w-full h-screen ${isLight ? "bg-white" : "bg-[#000000]"}`}
    >
      <div
        className={`relative w-full h-full overflow-hidden isolate ${isLight ? "bg-white" : "bg-[#000000]"}`}
      >
        {/* Background Layers for Crossfade */}
        {slides.map((slide, idx) => (
          <div
            key={`bg-${slide.id}`}
            className="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out"
            style={{
              backgroundImage: `url('${isLight ? slide.imageLight : slide.image}')`,
              opacity: activeSlide === idx ? (isLight ? 1 : 0.45) : 0,
              zIndex: activeSlide === idx ? 1 : 0,
              transform: activeSlide === idx ? "scale(1)" : "scale(1.05)",
              visibility:
                activeSlide === idx || Math.abs(activeSlide - idx) <= 1
                  ? "visible"
                  : "hidden",
            }}
          />
        ))}

        {/* Ambient Orbs */}
        <div
          className={`absolute top-[-10%] right-[-10%] w-[80%] h-[70%] blur-[130px] rounded-full pointer-events-none z-10 ${isLight ? "bg-white/40" : "bg-[#FFFFFF]/15"}`}
        />
        <div
          className={`absolute bottom-[-15%] left-[-15%] w-[80%] h-[70%] blur-[130px] rounded-full pointer-events-none z-10 ${isLight ? "bg-black/5" : "bg-[#262626]/10"}`}
        />

        {/* Readability scrim */}
        <div
          className={`absolute inset-0 z-10 ${isLight ? "bg-gradient-to-tr from-white/95 via-white/60 to-white/10" : "bg-gradient-to-tr from-[#000000]/95 via-[#000000]/80 to-transparent"}`}
        />

        <div className="relative z-20 w-full h-full flex items-center justify-between px-8 md:px-20">
          <div
            className={`hero-text max-w-2xl ${isLight ? "text-neutral-900" : "text-white"}`}
          >
            {/* Category Selector Tabs */}
            <div
              className={`inline-flex items-center gap-1 mb-8 p-1.5 rounded-full backdrop-blur-md border ${isLight ? "bg-black/[0.04] border-black/10" : "bg-white/5 border-white/10"}`}
            >
              {slides.map((slide, idx) => (
                <button
                  key={slide.id}
                  onClick={() => handleSlideChange(idx)}
                  className={`px-4 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wider uppercase transition-all duration-300 ${
                    activeSlide === idx
                      ? "bg-accent text-on-accent shadow-[0_0_15px_rgba(0,0,0,0.15)]"
                      : isLight
                        ? "text-neutral-500 hover:text-neutral-900"
                        : "text-white/60 hover:text-white"
                  }`}
                >
                  {slide.label}
                </button>
              ))}
              <div
                className={`w-8 h-8 rounded-full border flex items-center justify-center ml-2 ${isLight ? "border-black/15" : "border-white/20"}`}
              >
                <div
                  className="w-2 h-2 rounded-full bg-accent animate-pulse"
                  style={{ animationDuration: "4s" }}
                />
              </div>
            </div>

            <h1
              className={`text-4xl md:text-6xl lg:text-[4.2rem] font-medium leading-[1.1] mb-6 font-[family-name:var(--font-serif)] tracking-tight whitespace-pre-line ${isLight ? "" : "text-glow"}`}
            >
              {current.title}
            </h1>

            <p
              className={`text-base md:text-lg mb-10 max-w-lg font-[family-name:var(--font-inter)] leading-relaxed ${isLight ? "text-neutral-700" : "text-white/90"}`}
            >
              {current.description}
            </p>

            <div className="flex items-center gap-8">
              {/* "Lo quiero en mi conjunto!" Button with Perfectly Symmetric 360° Infinite Liquid Conic Halo */}
              <button
                onClick={() => navigate("/login")}
                className="relative group rounded-full font-bold text-xs tracking-widest uppercase transition-all duration-300 active:scale-95 cursor-pointer"
              >
                {/* 1. Orbiting Conic Organic Halo Glow (Perfect 4-Quadrant Symmetric Seamless Loop) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280%] aspect-square rounded-full overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-md group-hover:blur-lg pointer-events-none">
                  <div
                    className="w-full h-full animate-[spin_5s_linear_infinite]"
                    style={{
                      background:
                        "conic-gradient(from 0deg, #009df1 0%, #57bf00 25%, #009df1 50%, #57bf00 75%, #009df1 100%)",
                    }}
                  />
                </div>

                {/* 2. Border Ring Container with Rotating Conic Light Beam */}
                <div className="relative rounded-full p-[1.5px] overflow-hidden shadow-lg transition-all duration-300 group-hover:shadow-[0_0_25px_rgba(0,157,241,0.6)]">
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300%] aspect-square animate-[spin_5s_linear_infinite] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    style={{
                      background:
                        "conic-gradient(from 0deg, #009df1 0%, #57bf00 25%, #009df1 50%, #57bf00 75%, #009df1 100%)",
                    }}
                  />

                  {/* Button Content Surface */}
                  <span className="relative block px-8 py-4 rounded-full bg-accent group-hover:bg-[#0a0f1d] text-on-accent group-hover:text-white transition-all duration-300">
                    <span className="relative flex items-center gap-2 drop-shadow-[0_0_8px_rgba(0,157,241,0.5)]">
                      Lo quiero en mi conjunto!
                    </span>
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Interactive Feature Card (Right Container with 3 Detailed Amenities Thumbnails) */}
          <div
            className={`hero-card backdrop-blur-xl p-10 rounded-[40px] w-[480px] shadow-2xl relative overflow-hidden border ${isLight ? "bg-white/80 border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.08)]" : "bg-white/5 border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"}`}
          >
            <div className="relative z-10">
              <div className="feature-content">
                {/* High-Definition Verified Thumbnail Image Container */}
                <div
                  className={`w-24 h-24 rounded-2xl overflow-hidden mb-6 flex items-center justify-center border shadow-md relative ${isLight ? "bg-black/5 border-black/10" : "bg-white/5 border-white/15"}`}
                >
                  <img
                    src={currentFeature.img}
                    alt={currentFeature.title}
                    className="w-full h-full object-cover transition-all duration-500 hover:scale-105"
                    loading="eager"
                  />
                </div>
                <div>
                  <h3
                    className={`text-2xl font-medium font-[family-name:var(--font-serif)] mb-3 ${isLight ? "text-neutral-900" : "text-white"}`}
                  >
                    {currentFeature.title}
                  </h3>
                  <p
                    className={`text-sm leading-relaxed mb-6 h-16 ${isLight ? "text-neutral-700" : "text-white/80"}`}
                  >
                    {currentFeature.desc}
                  </p>

                  <button
                    className={`w-full py-3.5 rounded-full border text-xs font-bold tracking-widest uppercase hover:text-on-accent hover:bg-accent hover:border-accent transition-all duration-300 ${isLight ? "border-black/15 text-neutral-900" : "border-white/15 text-white"}`}
                  >
                    Ver cómo funciona
                  </button>
                </div>
              </div>

              {/* 3 Step Indicators for the 3 Key Features */}
              <div className="flex gap-2.5 mt-6">
                {current.features.map((feat, i) => (
                  <button
                    key={feat.title}
                    onClick={() => setActiveFeature(i)}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-500 cursor-pointer ${activeFeature === i ? "bg-accent scale-y-125" : isLight ? "bg-black/15 hover:bg-black/30" : "bg-white/20 hover:bg-white/40"}`}
                    title={feat.title}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Soft Blurred Gradient Transition Mask to next section */}
        <div
          className={`absolute inset-x-0 bottom-0 h-40 z-30 pointer-events-none transition-all duration-300 ${
            isLight
              ? "bg-gradient-to-t from-white via-white/80 to-transparent backdrop-blur-[2px]"
              : "bg-gradient-to-t from-[#000000] via-[#000000]/80 to-transparent backdrop-blur-[2px]"
          }`}
        />
      </div>
    </section>
  );
}
