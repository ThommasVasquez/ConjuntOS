"use client";

import { 
  Camera, CheckCircle2, X, ChevronLeft, ArrowRight,
  LogOut, Settings
} from "lucide-react";
import { useState, useEffect, useRef, Suspense } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { getUserProfile } from "@/app/actions/userActions";

// Define Rol locally to avoid importing Prisma in a Client Component
enum Rol {
  ARRENDATARIO = "ARRENDATARIO",
  PROPIETARIO = "PROPIETARIO",
  ADMINISTRADOR = "ADMINISTRADOR",
  CONCEJO = "CONCEJO",
  VIGILANTE = "VIGILANTE",
  SUPERVISOR_VIGILANCIA = "SUPERVISOR_VIGILANCIA",
  ENCARGADO_PARQUEADERO = "ENCARGADO_PARQUEADERO",
  SUPER_ADMIN = "SUPER_ADMIN"
}

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
  
  const defaultPlaceholder = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1000";
  const [profilePic, setProfilePic] = useState<string>(defaultPlaceholder);
  
  const [userData, setUserData] = useState({
    name: "Amélie Thommy",
    apto: "Apto 301",
    torre: "Torre B",
    phone: "+57 300 000 0000",
    gender: "femenino"
  });

  const [editForm, setEditForm] = useState(userData);

  useEffect(() => {
    async function loadData() {
      const res = await getUserProfile("current-user");
      if (res.success && res.data) {
        const u = res.data;
        const mapped = {
          name: u.nombre,
          apto: (u as { unidad?: { numero: string; } }).unidad?.numero || "S/N",
          torre: (u as { unidad?: { torre: string; } }).unidad?.torre || "S/T",
          phone: u.telefono || "",
          gender: (u as { genero?: string }).genero || "neutro"
        };
        setUserData(mapped);
        setEditForm(mapped);
        if (u.avatar) setProfilePic(u.avatar);
      } else {
        const savedPic = localStorage.getItem("conjunto_app_profile_pic");
        if (savedPic) setProfilePic(savedPic);

        const savedData = localStorage.getItem("conjunto_app_profile_data");
        if (savedData) {
          const parsed = JSON.parse(savedData);
          setUserData(parsed);
          setEditForm(parsed);
        }
      }
    }
    
    loadData();

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
  }, []);

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
        e.target.value = "";
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    
    // Sincronizar el estado de la UI
    setUserData(editForm);

    try {
      const response = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          gender: editForm.gender,
          avatar: profilePic
        })
      });

      console.log("Response status:", response.status);
      
      if (response.status === 401) {
        toast.error("Sesión expirada o inválida. Por favor, cierra sesión y vuelve a entrar.");
        return;
      }

      if (response.status === 405) {
        toast.error("Error de configuración del servidor (Method Not Allowed).");
        return;
      }

      const res = await response.json();
      console.log("Response data:", res);

      if (res.success) {
        toast.success("Perfil guardado en la nube");
        localStorage.setItem("conjunto_app_profile_data", JSON.stringify(editForm));
        localStorage.setItem("conjunto_app_profile_pic", profilePic);
        
        // Limpiar URL y cerrar modal (redirigiendo a la ruta base)
        window.history.replaceState(null, '', '/perfil');
      } else {
        toast.error("Error: " + (res.error || "No se pudo sincronizar"));
      }
    } catch (e) {
      console.error("Error updating profile via API:", e);
      toast.error("Error de conexión al servidor");
    }
  };

  const handleLogout = async () => {
    toast.promise(signOut({ callbackUrl: "/login" }), {
      loading: "Cerrando sesión...",
      success: "¡Hasta pronto!",
      error: "Error al cerrar sesión"
    });
  };

  const roleConfig: Record<string, { label: string, color: string }> = {
    ARRENDATARIO: { label: "Residente", color: "from-blue-500 to-cyan-500" },
    PROPIETARIO: { label: "Propietario", color: "from-yellow-400 to-amber-600" },
    ADMINISTRADOR: { label: "Administrador", color: "from-fuchsia-500 to-purple-600" },
    VIGILANTE: { label: "Vigilante", color: "from-orange-500 to-red-500" },
  };

  const currRole = roleConfig[Rol.PROPIETARIO];

  return (
    <div ref={containerRef} className="flex flex-col min-h-screen relative overflow-x-hidden pb-32">
      
      <div className="absolute top-0 left-0 w-full h-[55vh] z-0 cursor-pointer group/hero" onClick={() => document.getElementById('profilePhotoInput')?.click()}>
        {profilePic && (
          <Image 
            src={profilePic}
            alt=""
            width={500}
            height={300}
            className="absolute bottom-[-15%] left-0 w-full h-[40%] object-cover object-bottom scale-110 blur-[45px] opacity-90 saturate-150 transition-all duration-700 group-hover/hero:opacity-100" 
            unoptimized
          />
        )}
        {profilePic && (
          <Image 
            src={profilePic}
            alt="Foto de perfil"
            fill
            className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover/hero:scale-[1.02]" 
            style={{ 
              WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)', 
              maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)' 
            }}
            unoptimized
          />
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/hero:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
           <Camera size={40} className="text-white drop-shadow-lg" />
           <span className="text-white font-bold text-xs uppercase tracking-widest drop-shadow-md">Cambiar Foto</span>
        </div>
      </div>

      <div className="pt-[40vh] px-6 flex flex-col w-full relative z-10">
        <div className="absolute right-6 top-[32vh] z-20">
          <input id="profilePhotoInput" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <label htmlFor="profilePhotoInput" className="w-12 h-12 rounded-full liquid-glass shadow-xl shadow-black/50 flex items-center justify-center group active:scale-95 transition-all cursor-pointer">
            <Camera size={20} className="text-white group-hover:text-accent transition-colors" />
          </label>
        </div>

        <div className="fade-up text-center mb-6">
          <h1 className="text-4xl font-display font-medium tracking-tight text-white text-glow mb-1">{userData.name}</h1>
          <p className="text-lg text-white/80 font-light">{currRole.label}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <div className="pill-anim flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass bg-linear-to-tr from-blue-500/20 to-transparent">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span className="text-xs font-semibold text-white/90">{userData.apto}</span>
          </div>
          <div className="pill-anim flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass bg-linear-to-tr from-yellow-500/20 to-transparent">
            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
            <span className="text-xs font-semibold text-white/90">{userData.torre}</span>
          </div>
          <div className="pill-anim flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass bg-linear-to-tr from-emerald-500/20 to-transparent">
             <CheckCircle2 size={12} className="text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-100">Verficado</span>
          </div>
        </div>

        <p className="fade-up text-center text-xs text-white/60 leading-relaxed max-w-xs mx-auto mb-8 font-light">
          Responsable del inmueble. Autorizada para delegación de votos en asambleas y gestión de estacionamientos.
        </p>

        <div className="fade-up grid grid-cols-4 gap-3 w-full mb-8">
          {[
            { label: 'Deuda', val: '$0', color: 'bg-linear-to-br from-yellow-300 to-yellow-500 text-black' },
            { label: 'Visitas', val: '12', color: 'bg-[#2a1a4a]' },
            { label: 'Mascotas', val: '2', color: 'bg-purple-900/50' },
            { label: 'Tokens', val: '150', color: 'bg-white/20' }
          ].map((stat, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 cursor-pointer group">
              <span className="text-[10px] text-white/50 uppercase tracking-widest group-hover:text-white/80 transition-colors">{stat.label}</span>
              <div className={`w-full py-2.5 rounded-xl border border-white/10 text-center shadow-inner font-bold font-mono text-sm tracking-tighter transition-transform group-hover:-translate-y-1 ${stat.color}`}>
                {stat.val}
              </div>
            </div>
          ))}
        </div>

        <div className="fade-up liquid-glass rounded-[32px] p-5 w-full shadow-[0_30px_60px_rgba(0,0,0,0.6)] border-t border-white/20 relative overflow-hidden mb-8">
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
          <div className="relative h-24 w-full mt-4">
             <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0 80 Q 20 20, 40 60 T 80 40 T 100 70" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="4 4"/>
             </svg>
             <svg className="absolute inset-0 w-full h-full drop-shadow-[0_5px_5px_rgba(234,179,8,0.5)]" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0 70 Q 15 80, 30 50 T 60 70 T 90 20 T 100 40" fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round"/>
             </svg>
          </div>
          <div className="flex justify-between items-center mt-3 px-2">
             {['Ene', 'Feb', 'Mar', 'Abr', 'May'].map((mes, i) => (
                <span key={i} className={`text-[10px] font-mono tracking-wider ${i === 3 ? 'text-white font-bold bg-white/10 px-2 py-0.5 rounded-full' : 'text-white/30'}`}>
                  {mes}
                </span>
             ))}
          </div>
        </div>

        {/* SETTINGS & LOGOUT */}
        <section className="fade-up flex flex-col gap-3">
          <button className="w-full p-6 liquid-glass rounded-[32px] flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all active:scale-95 shadow-xl">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 group-hover:text-accent transition-colors">
                  <Settings size={20} />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-white leading-none">Ajustes de Cuenta</span>
                  <span className="text-[10px] text-white/40 mt-1 uppercase tracking-widest font-medium">Seguridad y Privacidad</span>
                </div>
             </div>
             <ChevronLeft className="rotate-180 text-white/20 group-hover:text-white transition-colors" size={18} />
          </button>

          <button 
            onClick={handleLogout}
            className="w-full p-6 liquid-glass rounded-[32px] flex items-center justify-between group border border-red-500/10 hover:bg-red-500/5 hover:border-red-500/30 transition-all active:scale-95 shadow-xl"
          >
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
                  <LogOut size={20} />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-red-400 leading-none">Cerrar Sesión</span>
                  <span className="text-[10px] text-red-400/40 mt-1 uppercase tracking-widest font-medium">Salir de este dispositivo</span>
                </div>
             </div>
             <ArrowRight className="text-red-400/20 group-hover:text-red-400 transition-colors" size={18} />
          </button>
        </section>

        <footer>
          <div className="py-10 text-center opacity-20 pointer-events-none">
             <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">ConjuntoApp v1.0.4 • 🔥</p>
          </div>
        </footer>

      </div>

      {isEditing && (
        <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center px-0 sm:px-4 pb-0 sm:pb-20 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => router.push('/perfil')} />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-6 pb-12 sm:pb-6 relative z-10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-display font-semibold text-white tracking-wide">Editar Perfil</h3>
              <button onClick={() => router.push('/perfil')} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all">
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-4 py-2">
                <div className="relative group/modal-avatar cursor-pointer" onClick={() => document.getElementById('profilePhotoInput')?.click()}>
                  <div className="w-24 h-24 rounded-full border-2 border-accent/30 p-1 group-hover/modal-avatar:border-accent transition-all">
                    <div className="w-full h-full rounded-full overflow-hidden shadow-xl relative">
                      <Image src={profilePic} alt="Current" width={96} height={96} className="w-full h-full object-cover" unoptimized />
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/modal-avatar:opacity-100 transition-opacity">
                    <Camera size={20} className="text-white" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/60 ml-2 uppercase tracking-widest">Nombre Completo</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-accent/50 focus:bg-white/5 transition-all" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/60 ml-2 uppercase tracking-widest">Teléfono</label>
                <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-accent/50 focus:bg-white/5 transition-all" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/60 ml-2 uppercase tracking-widest">Sexo / Identidad</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ id: 'masculino', label: 'Masculino', emoji: '👨' }, { id: 'femenino', label: 'Femenino', emoji: '👩' }, { id: 'neutro', label: 'Neutro', emoji: '✨' }].map((g) => (
                    <button key={g.id} onClick={() => setEditForm({...editForm, gender: g.id})} className={`py-3 rounded-2xl border transition-all flex flex-col items-center gap-1 ${editForm.gender === g.id ? 'bg-accent border-accent text-white' : 'bg-white/5 border-white/5 text-white/40'}`}>
                      <span className="text-sm">{g.emoji}</span>
                      <span className="text-[10px] font-bold uppercase">{g.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleSaveProfile} className="w-full mt-4 bg-linear-to-r from-accent to-purple-600 rounded-2xl py-4 font-bold text-white shadow-xl">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{__html: `.text-glow { text-shadow: 0 0 20px rgba(217,70,239,0.5); }`}} />
    </div>
  );
}
