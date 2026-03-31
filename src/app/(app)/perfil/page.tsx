"use client";

import { 
  Camera, CheckCircle2, X, Plus
} from "lucide-react";
import { useState, useEffect, useRef, Suspense } from "react";
import { gsap } from "gsap";
import { Rol } from "@prisma/client";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";

export default function PerfilPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white/50">Cargando...</div>}>
      <ProfileContent />
    </Suspense>
  )
}

function ProfileContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('modal') === 'edit';
  
  // Estado para la foto (con placeholder simulando la estética de la usuaria)
  const defaultPlaceholder = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1000";
  const [profilePic, setProfilePic] = useState<string>(defaultPlaceholder);
  
  const [activeRole, setActiveRole] = useState<Rol>(Rol.PROPIETARIO);
  
  // Custom user fields
  const [userData, setUserData] = useState({
    name: "Amélie Thommy",
    apto: "Apto 301",
    torre: "Torre B",
    phone: "+57 300 000 0000",
    gender: "femenino"
  });

  // Edit form state
  const [editForm, setEditForm] = useState(userData);

  useEffect(() => {
    // Intentar recuperar foto y datos guardados previamente en este dispositivo
    const savedPic = localStorage.getItem("conjunto_app_profile_pic");
    if (savedPic) setProfilePic(savedPic);

    const savedData = localStorage.getItem("conjunto_app_profile_data");
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setUserData(parsed);
      setEditForm(parsed);
    }

    // Animaciones iniciales
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", 
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.1 }
      );
      gsap.fromTo(".pill-anim", 
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, stagger: 0.05, ease: "back.out(1.5)", delay: 0.3 }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [activeRole]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        toast.error("La imagen es muy grande. Usa una menor a 4MB.");
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        try {
          localStorage.setItem("conjunto_app_profile_pic", base64String);
          setProfilePic(base64String);
          toast.success("Foto actualizada con éxito");
        } catch (error) {
          console.error("LocalStorage quota exceeded", error);
          toast.error("Error guardando. La foto es muy pesada para la memoria del navegador.");
          setProfilePic(base64String);
        }
        
        // Limpiamos el input para permitir resubidas de la misma imagen
        e.target.value = "";
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = () => {
    setUserData(editForm);
    localStorage.setItem("conjunto_app_profile_data", JSON.stringify(editForm));
    toast.success("Perfil actualizado");
    router.push('/perfil'); // Cierra el modal quitando el query param
  };

  const roleConfig: Record<string, { label: string, color: string }> = {
    ARRENDATARIO: { label: "Residente", color: "from-blue-500 to-cyan-500" },
    PROPIETARIO: { label: "Propietario", color: "from-yellow-400 to-amber-600" },
    ADMINISTRADOR: { label: "Administrador", color: "from-fuchsia-500 to-purple-600" },
    VIGILANTE: { label: "Vigilante", color: "from-orange-500 to-red-500" },
  };

  const currRole = roleConfig[activeRole] || roleConfig.PROPIETARIO;

  return (
    <div ref={containerRef} className="flex flex-col min-h-screen relative overflow-x-hidden pb-32">
      
      {/* HERO IMAGE AND AMBIENT GLOW (Cinematic youtube effect only underneath) */}
      <div className="absolute top-0 left-0 w-full h-[55vh] z-0 cursor-pointer group/hero" onClick={() => document.getElementById('profilePhotoInput')?.click()}>
        
        {/* AMBIENT GLOW (Blurred bottom edge of the photo bleeding into background) */}
        {profilePic && (
          <img 
            src={profilePic}
            alt=""
            className="absolute bottom-[-15%] left-0 w-full h-[40%] object-cover object-bottom scale-110 blur-[45px] opacity-90 saturate-150 transition-all duration-700 group-hover/hero:opacity-100" 
          />
        )}

        {/* CRISP HERO IMAGE with fading bottom */}
        {profilePic && (
          <img 
            src={profilePic}
            alt="Foto de perfil"
            className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover/hero:scale-[1.02]" 
            style={{ 
              WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)', 
              maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)' 
            }}
          />
        )}
        
        {/* EDIT OVERLAY ON HERO */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/hero:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
           <Camera size={40} className="text-white drop-shadow-lg" />
           <span className="text-white font-bold text-xs uppercase tracking-widest drop-shadow-md">Cambiar Foto</span>
        </div>
      </div>

      {/* 
        SECCIÓN PRINCIPAL DE INFORMACIÓN (Desplazada hacia abajo sobre la imagen)
      */}
      <div className="pt-[40vh] px-6 flex flex-col w-full relative z-10">
        
        {/* Botón flotante para editar foto que aparece cerca de la cara */}
        <div className="absolute right-6 top-[32vh] z-20">
          <input 
            id="profilePhotoInput"
            type="file" 
            accept="image/jpeg, image/png, image/webp" 
            className="hidden" 
            onChange={handleImageUpload} 
          />
          <label 
            htmlFor="profilePhotoInput"
            className="w-12 h-12 rounded-full liquid-glass shadow-xl shadow-black/50 flex items-center justify-center group active:scale-95 transition-all outline-none cursor-pointer"
            aria-label="Cambiar foto de perfil"
          >
            <Camera size={20} className="text-white group-hover:text-accent transition-colors" />
          </label>
        </div>

        {/* Nombres y Rol */}
        <div className="fade-up text-center mb-6">
          <h1 className="text-4xl font-display font-medium tracking-tight text-white text-glow mb-1">{userData.name}</h1>
          <p className="text-lg text-white/80 font-light">{currRole.label}</p>
        </div>

        {/* Custom Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <div className="pill-anim flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass bg-gradient-to-tr from-blue-500/20 to-transparent">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span className="text-xs font-semibold text-white/90">{userData.apto}</span>
          </div>
          <div className="pill-anim flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass bg-gradient-to-tr from-yellow-500/20 to-transparent">
            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
            <span className="text-xs font-semibold text-white/90">{userData.torre}</span>
          </div>
          <div className="pill-anim flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass bg-gradient-to-tr from-emerald-500/20 to-transparent">
             <CheckCircle2 size={12} className="text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-100">Verficado</span>
          </div>
        </div>

        <p className="fade-up text-center text-xs text-white/60 leading-relaxed max-w-xs mx-auto mb-8 font-light">
          Responsable del inmueble. Autorizada para delegación de votos en asambleas y gestión de estacionamientos.
        </p>

        {/* 
          STATS GRID (Emulando "Experience, Skills, Testing, Interview")
        */}
        <div className="fade-up grid grid-cols-4 gap-3 w-full mb-8">
          <div className="flex flex-col items-center gap-1.5 cursor-pointer group">
            <span className="text-[10px] text-white/50 uppercase tracking-widest group-hover:text-white/80 transition-colors">Deuda</span>
            <div className={`w-full py-2.5 rounded-xl bg-gradient-to-br from-yellow-300 to-yellow-500 text-black text-center shadow-[0_0_15px_rgba(253,224,71,0.3)] font-bold font-mono text-sm tracking-tighter transition-transform group-hover:-translate-y-1`}>
              $0
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5 cursor-pointer group">
            <span className="text-[10px] text-white/50 uppercase tracking-widest group-hover:text-white/80 transition-colors">Visitas</span>
            <div className={`w-full py-2.5 rounded-xl bg-[#2a1a4a] border border-white/10 text-white text-center shadow-inner font-bold font-mono text-sm tracking-tighter transition-transform group-hover:-translate-y-1`}>
              12
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5 cursor-pointer group">
            <span className="text-[10px] text-white/50 uppercase tracking-widest group-hover:text-white/80 transition-colors">Mascotas</span>
            <div className={`w-full py-2.5 rounded-xl bg-purple-900/50 border border-white/10 text-white/70 text-center font-bold font-mono text-sm tracking-tighter transition-transform group-hover:-translate-y-1`}>
              2
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5 cursor-pointer group">
            <span className="text-[10px] text-white/50 uppercase tracking-widest group-hover:text-white/80 transition-colors">Tokens</span>
            <div className={`w-full py-2.5 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white text-center shadow-lg font-bold font-mono text-sm tracking-tighter transition-transform group-hover:-translate-y-1`}>
              150
            </div>
          </div>
        </div>

        {/* 
          GRAPH DASHBOARD (Liquid Glass Card)
        */}
        <div className="fade-up liquid-glass rounded-[32px] p-5 w-full shadow-[0_30px_60px_rgba(0,0,0,0.6)] border-t border-white/20 relative overflow-hidden">
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <h3 className="text-white font-display font-medium text-lg tracking-wide">Reporte de Expensas</h3>
            </div>
            <div className="flex flex-col gap-1.5 text-right">
               <div className="flex items-center gap-1.5 justify-end">
                 <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_5px_yellow]"></span>
                 <span className="text-[10px] text-white/80">Administración</span>
               </div>
               <div className="flex items-center gap-1.5 justify-end">
                 <span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                 <span className="text-[10px] text-white/50">Extraordinarios</span>
               </div>
            </div>
          </div>

          {/* Tooltip superpuesto dinámico "278 points" */}
          <div className="absolute top-[40%] left-[30%] z-20 flex flex-col items-center animate-pulse">
            <div className="bg-white text-black text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> $250k
            </div>
            {/* Punta del tooltip */}
            <div className="w-2 h-2 bg-white rotate-45 -mt-1 shadow-md"></div>
            {/* Punto de la gráfica */}
            <div className="w-3 h-3 bg-white border-[3px] border-yellow-400 rounded-full mt-1 shadow-[0_0_10px_yellow]"></div>
          </div>

          {/* Contenedor del Gráfico (SVG Curve emulado) */}
          <div className="relative h-24 w-full mt-4">
             {/* Línea punteada de fondo */}
             <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0 80 Q 20 20, 40 60 T 80 40 T 100 70" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="4 4"/>
             </svg>
             {/* Línea Principal amarilla solid */}
             <svg className="absolute inset-0 w-full h-full drop-shadow-[0_5px_5px_rgba(234,179,8,0.5)]" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0 70 Q 15 80, 30 50 T 60 70 T 90 20 T 100 40" fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round"/>
             </svg>
          </div>

          {/* Ejes X simulados (Q1, Q2...) -> Ene, Feb, Mar */}
          <div className="flex justify-between items-center mt-3 px-2">
             {['Ene', 'Feb', 'Mar', 'Abr', 'May'].map((mes, i) => (
                <span key={i} className={`text-[10px] font-mono tracking-wider ${i === 2 ? 'text-white font-bold bg-white/10 px-2 py-0.5 rounded-full' : 'text-white/30'}`}>
                  {mes}
                </span>
             ))}
          </div>
        </div>

        {/* DEV HELPER: Selector de Rol Temporal Flotante Subterráneo */}
        <div className="fade-up bg-black/40 backdrop-blur-md border border-accent/30 p-3 rounded-2xl flex items-center gap-3 z-10 w-full mt-8 opacity-50 hover:opacity-100 transition-opacity">
          <label className="text-[10px] text-accent font-bold uppercase tracking-widest whitespace-nowrap">Simular Rol DEV:</label>
          <select 
            className="bg-transparent text-white text-xs w-full outline-none appearance-none cursor-pointer"
            value={activeRole}
            onChange={(e) => setActiveRole(e.target.value as Rol)}
          >
            {Object.keys(roleConfig).map(r => (
              <option key={r} value={r} className="bg-[#1a0b2e] text-white py-2">{roleConfig[r].label}</option>
            ))}
          </select>
        </div>

      </div>

      {/* 
        MODAL DE EDICIÓN DE PERFIL (Liquid Glass)
        Se activa con ?modal=edit en la URL
      */}
      {isEditing && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center px-0 sm:px-4 pb-0 sm:pb-20 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => router.push('/perfil')} />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-6 pb-12 sm:pb-6 relative z-10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-display font-semibold text-white tracking-wide">Editar Perfil</h3>
              <button onClick={() => router.push('/perfil')} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-6">
              {/* EDIT AVATAR INSIDE MODAL */}
              <div className="flex flex-col items-center gap-4 py-2">
                <div className="relative group/modal-avatar cursor-pointer" onClick={() => document.getElementById('profilePhotoInput')?.click()}>
                  <div className="w-24 h-24 rounded-full border-2 border-accent/30 p-1 group-hover/modal-avatar:border-accent transition-all">
                    <div className="w-full h-full rounded-full overflow-hidden shadow-xl">
                      <img src={profilePic} alt="Current" className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/modal-avatar:opacity-100 transition-opacity">
                    <Camera size={20} className="text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-accent flex items-center justify-center border-2 border-[#1a0b2e] shadow-lg">
                    <Plus size={16} className="text-white" />
                  </div>
                </div>
                <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Toca para cambiar foto</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/60 ml-2 uppercase tracking-widest">Nombre Completo</label>
                <input 
                  type="text" 
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-accent/50 focus:bg-white/5 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 opacity-60">
                  <label className="text-xs font-semibold text-white/60 ml-2 uppercase tracking-widest">Torre</label>
                  <div className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-3.5 text-white/50 cursor-not-allowed">
                    {userData.torre}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 opacity-60">
                  <label className="text-xs font-semibold text-white/60 ml-2 uppercase tracking-widest">Apto</label>
                  <div className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-3.5 text-white/50 cursor-not-allowed">
                    {userData.apto}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-white/30 px-2 italic">
                * Torre, Apartamento y registros de vehículos/mascotas son gestionados por administración.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/60 ml-2 uppercase tracking-widest">Teléfono</label>
                <input 
                  type="tel" 
                  value={editForm.phone}
                  onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                  className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-accent/50 focus:bg-white/5 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/60 ml-2 uppercase tracking-widest">Sexo / Identidad</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'masculino', label: 'Masculino', emoji: '👨' },
                    { id: 'femenino', label: 'Femenino', emoji: '👩' },
                    { id: 'neutro', label: 'Otro / Neutro', emoji: '✨' },
                  ].map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setEditForm({...editForm, gender: g.id})}
                      className={`py-3 rounded-2xl border transition-all flex flex-col items-center gap-1 ${editForm.gender === g.id ? 'bg-accent border-accent text-white shadow-lg' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                      <span className="text-sm">{g.emoji}</span>
                      <span className="text-[10px] font-bold uppercase tracking-tight">{g.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleSaveProfile}
                className="w-full mt-4 bg-gradient-to-r from-accent to-purple-600 rounded-2xl py-4 font-bold text-white shadow-[0_10px_30px_rgba(217,70,239,0.4)] active:scale-[0.98] transition-all"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
