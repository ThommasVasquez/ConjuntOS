"use client";

/**
 * PERFIL DE USUARIO - CONJUNTOS (Stage 15-Final-D)
 * Restauración Total: Modales, Gestión de Activos y Perfil Premium.
 */

import { 
  LogOut, ArrowRight, ChevronLeft, Search, MoreHorizontal,
  Edit, Camera, Car, PawPrint, ShieldCheck, Mail, Phone,
  CheckCircle2, X, Plus, FileText, Info, ClipboardList, Lock, 
  HelpCircle, CreditCard, Calendar, Package, User as UserIcon,
  Sun, Moon
} from "lucide-react";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { BrandedFooter } from "@/components/shell/BrandedFooter";
import { useTheme } from "@/components/providers/ThemeContext";

export default function PerfilPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white">Cargando...</div>}>
      <ProfileContent />
    </Suspense>
  )
}

function ProfileContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const userId = user?.id;
  const { theme, toggleTheme } = useTheme();
  
  const defaultPlaceholder = "/placeholder.svg";
  const [profilePic, setProfilePic] = useState<string>(defaultPlaceholder);
  const [hasMounted, setHasMounted] = useState(false);
  
  // 🏗️ INITIAL STATE: Pure static defaults to avoid Hydration Mismatch
  interface UserData { name: string; apto: string; torre: string; phone: string; gender: string; email: string; avatar?: string; bio: string; }
  interface Vehiculo { placa: string; marca: string; modelo: string; color: string; }
  interface Mascota { nombre: string; tipo: string; raza?: string; fotoUrl?: string; }
  interface Tramite { id: string; tipo: string; estado: string; createdAt: string; }
  interface Pago { id: string; concepto: string; monto: number; estado: string; fechaVencimiento: string; fechaPago?: string; }
  interface Recibo { id: string; servicio: string; monto: number; pagado: boolean; vencimiento: string; fechaPago?: string; }

  const [userData, setUserData] = useState<UserData>({
    name: "Residente",
    apto: "S/N",
    torre: "S/T",
    phone: "",
    gender: "neutro",
    email: "",
    bio: "¡Hola! Soy residente de este ConjuntOS."
  });

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [tramites, setTramites] = useState<Tramite[]>([]);
  
  // Vistas y Modales
  const [viewMode, setViewMode] = useState<"profile" | "vehicles" | "pets" | "deuda" | "requests" | "reservas" | "paquetes">("profile");
  const [activeReservas, setActiveReservas] = useState<any[]>([]);
  const [activePaquetes, setActivePaquetes] = useState<any[]>([]);
  
  // ... rest of the component state ...

  // 🏗️ HYDRATION SYNC & FETCHING
  useEffect(() => {
    async function loadData() {
      if (!userId) return;
      try {
        const apiPackages = await api.get<any[]>('/paquetes/mios');
        setActivePaquetes(apiPackages);
      } catch (e) {
        console.error("Error loading packages", e);
        setActivePaquetes([]);
      }
    }
    if (hasMounted && user) loadData();
  }, [userId, hasMounted, user]);
  const [financialTab, setFinancialTab] = useState<"pendientes" | "historial">("pendientes");
  const [financialData, setFinancialData] = useState<{pagos: Pago[], recibos: Recibo[], totalDebt: number}>({ pagos: [], recibos: [], totalDebt: 0 });
  const [isPaying, setIsPaying] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState(userData);
  
  // 📝 REGISTRATION MODAL STATE (Stage 36)
  const [showRegModal, setShowRegModal] = useState(false);
  const [regType, setRegType] = useState<"VEHICULO" | "MASCOTA" | "OTRO">("VEHICULO");
  const [isRegSubmitting, setIsRegSubmitting] = useState(false);
  const [regForm, setRegForm] = useState({
    nombre: "", tipo: "", raza: "", // Pets
    placa: "", marca: "", modelo: "", ano: "", color: "", tipoVehiculo: "" // Vehicles
  });
  const [regDocs, setRegDocs] = useState<{nombre: string, base64: string, mimeType: string}[]>([]);

  // 🏗️ HYDRATION SYNC
  useEffect(() => {
    setHasMounted(true);
    if (user) {
        setUserData(prev => ({ 
            ...prev, 
            name: (user?.nombre || prev.name) as string,
            email: (user?.email || prev.email) as string
        }));
    }
  }, [user]);
  useEffect(() => {
    if (userId && hasMounted) {
      const savedPic = localStorage.getItem(`conjuntos_profile_pic_${userId}`);
      if (savedPic) setProfilePic(savedPic);

      const savedData = localStorage.getItem(`conjuntos_profile_data_${userId}`);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setUserData(prev => ({ ...prev, ...parsed }));
          setEditForm(prev => ({ ...prev, ...parsed }));
        } catch {
          // Ignore corrupt local data
        }
      }
    }
  }, [userId, hasMounted]);

  const searchParams = useSearchParams();
  const modalParam = searchParams.get("modal");

  // Sync with Query Params (?modal=edit)
  useEffect(() => {
    if (modalParam === "edit") {
        setEditForm({ ...userData });
        setShowEditModal(true);
        toast.info("Editor sincronizado");
    }
  }, [modalParam, userData]);

  // 🌍 FETCH DATA (With timeout and fallback logic)
  useEffect(() => {
    async function loadData() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        clearTimeout(timeoutId);
        
        const [profileData, financeData, reservasData, paquetesData] = await Promise.all([
          api.get<any>('/usuarios/me/profile').catch(() => null),
          api.get<any>('/pagos').catch(() => null),
          api.get<any[]>('/reservas?filter=future').catch(() => null),
          api.get<any[]>('/paquetes/mios').catch(() => null),
        ]);
        
        if (profileData) {
            const u = profileData;
            const mapped = {
              name: u.nombre || user?.nombre || userData.name,
              apto: u.unidad?.numero || u.apto || "S/N",
              torre: u.unidad?.torre || u.torre || "S/T",
              phone: u.telefono || "",
              gender: u.genero || "neutro",
              email: u.email || user?.email || "",
              bio: u.bio || userData.bio
            };
            setUserData(mapped);
            setEditForm(mapped);
            setVehiculos(u.vehiculos || []);
            setMascotas(u.mascotas || []);
            setTramites(u.tramitesSolicitados || []);
            if (u.avatar) setProfilePic(u.avatar);
        }

        if (financeData) {
          const totalDebt = [...(financeData.pagos || []), ...(financeData.recibos || [])]
            .filter((p: any) => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO' || p.pagado === false)
            .reduce((acc: number, p: any) => acc + Number(p.monto), 0);
          setFinancialData({ ...financeData, totalDebt });
        }

        if (reservasData) setActiveReservas(reservasData);

        setActivePaquetes(paquetesData || []);
      } catch (error: unknown) {
        // Non-critical: API unavailable, using cached data
      }
    }
    
    if (!authLoading && !!user) {
      loadData();
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.1 });
    }, containerRef);
    return () => {
        ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId, hasMounted]); 

  /**
   * 🖼️ COMPRESOR DE IMÁGENES
   * Optimiza el Base64 para evitar errores de tamaño en Cloudflare Edge
   */
  const compressImage = (base64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400; // Suficiente para perfil
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
    });
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagen demasiado grande (máx 5MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      try {
        const compressed = await compressImage(base64);
        setProfilePic(compressed);
        if (userId) {
          localStorage.setItem(`conjuntos_profile_pic_${userId}`, compressed);
        }
        
        // Persistir en base de datos
        try {
          await api.put('/usuarios/me/profile', { avatar: compressed });
          toast.success("Foto de perfil actualizada");
        } catch {
          toast.success("Foto cargada localmente");
        }
      } catch (err) {
          toast.error("Error al procesar la imagen");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // El API espera nombres en español (nombre/telefono/genero), no los
      // del estado local (name/phone/gender). Mapear antes de enviar.
      await api.put('/usuarios/me/profile', {
        nombre: editForm.name,
        telefono: editForm.phone,
        genero: editForm.gender,
        torre: editForm.torre,
        apto: editForm.apto,
      });
      setUserData(editForm);
      if (userId) {
        localStorage.setItem(
          `conjuntos_profile_data_${userId}`,
          JSON.stringify(editForm)
        );
      }
      setShowEditModal(false);
      toast.success("Perfil actualizado con éxito");
    } catch {
      toast.error("Fallo de conexión");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
    toast.success("Sesión cerrada");
  };

  // 📝 REGISTRATION LOGIC (Stage 36)
  const handleRegFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 5 * 1024 * 1024) {
            toast.error(`${file.name} es muy grande (máx 5MB)`);
            continue;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const rawBase64 = event.target?.result as string;
            let finalBase = rawBase64;
            // mimeType real del archivo; el backend lo exige (DocumentoAdjuntoDto.mimeType)
            const mimeType = file.type || "application/octet-stream";

            if (file.type.startsWith("image/")) {
                finalBase = await compressImage(rawBase64);
            }

            setRegDocs(prev => [...prev, { 
                nombre: file.name, 
                base64: finalBase, 
                mimeType 
            }]);
        };
        reader.readAsDataURL(file);
    }
  };

  const handleRegisterAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regDocs.length === 0) {
        toast.error("Debes adjuntar al menos un documento");
        return;
    }
    setIsRegSubmitting(true);
    
    try {
        // Construir el payload EXACTO que valida el backend (deny_unknown_fields).
        // VEHICULO espera {placa, marca, modelo, color, tipo}; MASCOTA {nombre, tipo, raza}.
        let payload: any = regForm;
        if (regType === "VEHICULO") {
            if (!regForm.tipoVehiculo) { toast.error("Selecciona la clase de vehículo"); setIsRegSubmitting(false); return; }
            payload = {
                placa: regForm.placa.trim().toUpperCase(),
                marca: regForm.marca || undefined,
                modelo: regForm.modelo || undefined,
                color: regForm.color || undefined,
                tipo: regForm.tipoVehiculo,
            };
        } else if (regType === "MASCOTA") {
            payload = {
                nombre: regForm.nombre,
                tipo: regForm.tipo,
                raza: regForm.raza || undefined,
            };
        }
        await api.post('/tramites', {
                tipo: regType,
                payload,
                documentos: regDocs
            });
        toast.success("Solicitud enviada. Sujeta a aprobación administrativa.");
        setShowRegModal(false);
        setRegDocs([]);
        setRegForm({
            nombre: "", tipo: "", raza: "",
            placa: "", marca: "", modelo: "", ano: "", color: "", tipoVehiculo: ""
        });
        // Recargar trámites
        const refreshed = await api.get<any>('/usuarios/me/profile');
        if (refreshed) setTramites(refreshed.tramitesSolicitados || []);
    } catch {
        toast.error("Error de conexión");
    } finally {
        setIsRegSubmitting(false);
    }
  };

  const handlePay = async (id: string, type: 'PAGO' | 'RECIBO') => {
    setIsPaying(true);

    try {
      await api.put(`/pagos/${id}/pagar`, { metodo: 'PSE' });
      toast.success("¡Pago confirmado por la entidad financiera!");
      
      // ✨ OPTIMISTIC UI (Stage 53): Update local state immediately
      setFinancialData(prev => {
        const updatedPagos = prev.pagos.map(p => 
          p.id === id ? { ...p, estado: 'PAGADO', fechaPago: new Date().toISOString() } : p
        );
        const updatedRecibos = prev.recibos.map(r => 
          r.id === id ? { ...r, pagado: true, fechaPago: new Date().toISOString() } : r
        );
        
        // Recalculate total debt from non-paid items
        const newTotal = [...updatedPagos, ...updatedRecibos]
          .filter(item => {
            const itemEstado = (item as any).estado || ((item as any).pagado ? 'PAGADO' : 'PENDIENTE');
            return itemEstado === 'PENDIENTE' || itemEstado === 'VENCIDO' || (item as any).pagado === false;
          })
          .reduce((acc, item) => acc + Number(item.monto), 0);

        return { ...prev, pagos: updatedPagos, recibos: updatedRecibos, totalDebt: newTotal };
      });

      // Background sync with API
      api.get<any>('/pagos').then(d => {
        const totalDebt = [...(d.pagos || []), ...(d.recibos || [])]
          .filter((p: any) => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO' || p.pagado === false)
          .reduce((acc: number, p: any) => acc + Number(p.monto), 0);
        setFinancialData({ ...d, totalDebt });
      });
    } catch {
      toast.error("Fallo de conexión con la pasarela");
    } finally {
      setIsPaying(false);
    }
  };

  const userRole = user?.rol || "RESIDENTE";

  const statusIcons = [
    { label: 'Deuda', val: `$${financialData.totalDebt?.toLocaleString() || '0'}`, color: 'bg-linear-to-br from-text to-text text-black ring-4 ring-text/20 shadow-black/10', icon: <CreditCard size={12}/>, view: 'deuda' },
    { label: 'Trámites', val: tramites.length.toString(), color: 'bg-text/5 text-text', icon: <ClipboardList size={12}/>, view: 'requests' },
    { label: 'Mascotas', val: mascotas.length.toString(), color: 'bg-text/5 text-text', icon: <PawPrint size={12}/>, view: 'pets' },
    { label: 'Vehículos', val: vehiculos.length.toString(), color: 'bg-text/5 text-text', icon: <Car size={12}/>, view: 'vehicles' },
    { label: 'Reservas', val: activeReservas.length.toString(), color: 'bg-text/5 text-text', icon: <Calendar size={12}/>, view: 'reservas' },
    { label: 'Paquetes', val: activePaquetes.length.toString(), color: 'bg-text/5 text-text', icon: <Package size={12}/>, view: 'paquetes' }
  ];

  return (
    <div ref={containerRef} className="flex flex-col min-h-screen relative overflow-x-hidden pb-32">

      {/* TOP NAV - MOBILE VIEWPORT SYNC (max-w-[430px] + Centered) */}
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-[9999] px-6 pt-10 pb-4 flex justify-between items-center bg-gradient-to-b from-primary/60 to-transparent transition-all duration-300 pointer-events-none">
        <button 
          onClick={() => router.back()} 
          className="w-12 h-12 rounded-full liquid-glass flex items-center justify-center text-text hover:text-text transition-all active:scale-95 pointer-events-auto shadow-2xl"
        >
          <ChevronLeft size={24} />
        </button>
        
        <div className="flex gap-3 relative pointer-events-auto">
          <button className="w-12 h-12 rounded-full liquid-glass flex items-center justify-center text-text hover:text-text transition-all">
            <Search size={20} />
          </button>
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="w-12 h-12 rounded-full liquid-glass flex items-center justify-center text-text hover:text-text transition-all active:scale-90 shadow-2xl"
          >
            <MoreHorizontal size={20} />
          </button>

          {/* DROPDOWN MENU - MAX PRIORITY */}
          {showMenu && hasMounted && (
            <div 
              className="fixed top-20 right-6 w-52 bg-[#1a1a2e] border border-white/10 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.7)] animate-in fade-in slide-in-from-top-4 duration-300 z-[9999]"
              style={{ pointerEvents: 'auto' }}
            >
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEditModal(true);
                  setShowMenu(false);
                }}
                className="w-full p-5 flex items-center gap-3 text-[15px] font-bold text-text hover:bg-text/10 transition-colors text-left border-b border-border cursor-pointer"
              >
                <Edit size={18} className="text-accent"/> Editar Perfil
              </button>
              <button className="w-full p-5 flex items-center gap-3 text-[15px] font-medium text-text hover:bg-text/10 transition-colors text-left border-b border-border">
                <ShieldCheck size={18} className="text-text"/> Privacidad
              </button>
              <button 
                type="button"
                onClick={() => {
                  handleLogout();
                  setShowMenu(false);
                }}
                className="w-full p-5 flex items-center gap-3 text-[15px] font-bold text-text hover:bg-text/10 transition-colors text-left cursor-pointer"
              >
                <LogOut size={18} /> Cerrar Sesión
              </button>
            </div>
          )}
        </div>
      </header>
 
      {/* HERO IMAGE - PERFECT CINEMATIC BLUR ARCHITECTURE (Stage 74) */}
      <div 
        className="absolute top-0 left-0 w-full h-[65vh] z-0 overflow-hidden bg-primary transition-colors duration-300"
        style={{ 
          maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)'
        }}
      >
        
        {/* Layer 1: Base Ambient Blur (Bokeh backdrop) */}
        <div className="absolute inset-0 z-0 blur-[60px] opacity-60 scale-125">
           <Image src={profilePic} alt="" fill className="object-cover object-top" unoptimized />
        </div>
        
        {/* Layer 2: Transition Sharp-to-Blur (Masked Sharp Image) */}
        <div 
          className="absolute inset-0 z-10 w-full h-full"
          style={{ 
            maskImage: 'linear-gradient(to bottom, black 0%, black 50%, rgba(0,0,0,0.5) 75%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 50%, rgba(0,0,0,0.5) 75%, transparent 100%)'
          }}
        >
          <Image src={profilePic} alt="" fill className="object-cover object-top scale-105" unoptimized />
        </div>
 
        {/* Layer 2.1: Progressive Blur HUD (Stage 74.5) - Blurs the edge of Layer 2 */}
        <div 
          className="absolute inset-0 z-11 w-full h-full backdrop-blur-[20px]"
          style={{ 
            maskImage: 'linear-gradient(to top, black 0%, black 20%, transparent 60%)',
            WebkitMaskImage: 'linear-gradient(to top, black 0%, black 20%, transparent 60%)'
          }}
        />
        
        {/* Layer 3: HUD Contrast Gradient & Base Shadow */}
        <div className="absolute inset-x-0 bottom-0 h-[450px] bg-linear-to-t from-primary via-primary/95 via-primary/40 to-transparent transition-all duration-300 z-20" />
      </div>

      <div className="pt-[45vh] px-6 flex flex-col w-full relative z-10">
        <section className="fade-up text-center mb-8 relative flex flex-col items-center">
          <h1 className="text-4xl font-display font-bold tracking-tight text-text mb-1 drop-shadow-2xl">{userData.name}</h1>
          <p className="text-lg text-text font-light capitalize tracking-wide mb-4">{userRole.toLowerCase()}</p>
          
          {/* STATUS STICKER REMOVED AS REQUESTED */}
        </section>
 
        {/* PILLS */}
        <div className="fade-up flex flex-wrap items-center justify-center gap-3 mb-10">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full liquid-glass border border-border">
            <div className="w-2 h-2 rounded-full bg-text/10 animate-pulse" />
            <span className="text-xs font-bold text-text uppercase tracking-widest">Torre {userData.torre}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full liquid-glass border border-border">
            <div className="w-2 h-2 rounded-full bg-text/10 animate-pulse" />
            <span className="text-xs font-bold text-text uppercase tracking-widest">Apto {userData.apto}</span>
          </div>
        </div>
 
        {/* 🧭 UNIFIED 6-GRID STATUS BAR (Stage 68 - High Fidelity Refinement) */}
        <div className="fade-up grid grid-cols-4 gap-2.5 w-full mb-10 text-center">
          {statusIcons.map((stat, i) => (
            <button 
              key={i} 
              onClick={() => setViewMode(stat.view as any)} 
              className={`flex flex-col items-center gap-2 group ${i >= 4 ? 'col-span-2 mx-auto w-1/2' : ''}`}
            >
              <span className="text-[10px] text-text uppercase tracking-[0.15em] font-black leading-none">{stat.label}</span>
              <div className={`w-full h-[62px] flex flex-col items-center justify-center gap-1.5 rounded-[22px] border border-border transition-all group-active:scale-95 ${stat.color} shadow-xl shadow-black/10 dark:shadow-black/40`}>
                
                {/* ICONS (Improved Visibility) */}
                {stat.icon && stat.label !== 'Deuda' && (
                  <div className="opacity-60 scale-90 -mb-0.5 group-hover:opacity-100 transition-opacity">{stat.icon}</div>
                )}

                {/* VALUES (Dense/Plate style for Vehicles - No extra box as per feedback) */}
                <span className={`
                  ${stat.label === 'Vehículos' ? 'font-mono text-[14px] tracking-tight' : 'font-sans text-[12px]'} 
                  font-black uppercase truncate w-full px-1
                `}>
                  {stat.val}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* DYNAMIC VIEW CONTENT */}
        <main className="fade-up space-y-4 mb-10">
          {viewMode === "profile" && (
            <div className="space-y-3">
              <div className="liquid-glass-card rounded-[32px] p-6 border border-border">
                 <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center text-accent">
                      <UserIcon size={24} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xl font-bold text-text tracking-tight">Información</span>
                      <span className="text-[10px] text-text uppercase tracking-widest font-black">Datos Personales</span>
                    </div>
                 </div>
                 
                 <div className="space-y-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-text uppercase tracking-widest font-black">Correo Electrónico</span>
                      <span className="text-sm font-medium text-text">{userData.email}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-text uppercase tracking-widest font-black">Teléfono</span>
                      <span className="text-sm font-medium text-text">{userData.phone || "No especificado"}</span>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {viewMode === "reservas" && (
            <div className="space-y-4">
               <div className="flex justify-between items-center px-2">
                 <h3 className="text-text text-lg font-bold flex items-center gap-2">Mis Reservas Activas <Calendar size={18} className="text-accent" /></h3>
                 <button onClick={() => router.push('/reservas')} className="text-[10px] font-black uppercase text-accent/80 hover:text-accent tracking-tighter transition-colors">Solicitar Nueva</button>
               </div>
               
               <div className="space-y-3">
                  {activeReservas.length === 0 ? (
                    <div className="text-center py-12 px-6 border-2 border-dashed border-border rounded-[32px]">
                       <Calendar className="mx-auto text-text mb-3" size={40} />
                       <p className="text-text text-xs italic">No tienes reservas activas en este momento.</p>
                    </div>
                  ) : (
                    activeReservas.map((res, i) => (
                       <div key={i} className="liquid-glass-card rounded-[28px] overflow-hidden border border-border bg-primary-light/30">
                        <div className="flex">
                           <div className="relative w-24 h-24 shrink-0">
                             {res.area?.imagenUrl ? (
                               <Image src={res.area.imagenUrl} alt="" fill className="object-cover" unoptimized />
                             ) : (
                               <div className="w-full h-full bg-text/5 flex items-center justify-center opacity-20"><Calendar size={24} /></div>
                             )}
                           </div>
                           <div className="p-4 flex flex-col justify-between flex-1">
                              <div>
                                <div className="flex justify-between items-start mb-1">
                                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">{res.area?.nombre || "Cargando..."}</span>
                                  <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                    res.estado === "CONFIRMADA" ? "bg-text/20 text-text" : "bg-text/20 text-text"
                                  }`}>
                                    {res.estado === "PENDIENTE" ? "En Proceso" : res.estado}
                                  </div>
                                </div>
                                <h4 className="text-sm font-bold text-text leading-tight">
                                  {new Date(res.fechaInicio).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                                </h4>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-text font-mono tracking-tighter">
                                  {new Date(res.fechaInicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} • {new Date(res.fechaFin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                           </div>
                        </div>
                      </div>
                    ))
                  )}
               </div>
            </div>
          )}

          {viewMode === "vehicles" && (
            <div className="space-y-4">
               <div className="flex justify-between items-center px-2">
                 <h3 className="text-text text-lg font-bold flex items-center gap-2">Mis Vehículos <Car size={18} className="text-accent" /></h3>
                 <button 
                   onClick={() => { setRegType("VEHICULO"); setShowRegModal(true); }}
                   className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-accent/20 text-accent text-[11px] font-bold uppercase tracking-wider hover:bg-accent/30 transition-all active:scale-95 border border-accent/20"
                 >
                   <Plus size={14} /> Solicitar Vinculación
                 </button>
               </div>
               {vehiculos.length === 0 ? (
                 <p className="text-text text-sm italic px-2">No tienes vehículos registrados.</p>
               ) : (
                 vehiculos.map((v, i) => (
                   <div key={i} className="liquid-glass-card rounded-2xl p-5 border border-border flex justify-between items-center bg-primary-light/50">
                      <div className="flex flex-col">
                         <span className="text-2xl font-black text-text tracking-widest font-mono uppercase">{v.placa}</span>
                         <span className="text-xs text-text">{v.marca} {v.modelo} • {v.color}</span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                         <CheckCircle2 size={18} />
                      </div>
                   </div>
                 ))
               )}
            </div>
          )}

          {viewMode === "pets" && (
            <div className="space-y-4">
               <div className="flex justify-between items-center px-2">
                 <h3 className="text-text text-lg font-bold flex items-center gap-2">Mis Mascotas <PawPrint size={18} className="text-text" /></h3>
                 <button 
                    onClick={() => { setRegType("MASCOTA"); setShowRegModal(true); }}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-text/20 text-text text-[11px] font-bold uppercase tracking-wider hover:bg-text/30 transition-all active:scale-95 border border-text/20"
                 >
                   <Plus size={14} /> Solicitar Vinculación
                 </button>
               </div>
               {mascotas.length === 0 ? (
                 <p className="text-text text-sm italic px-2">No tienes mascotas registradas.</p>
               ) : (
                 mascotas.map((m, i) => (
                    <div key={i} className="liquid-glass-card rounded-2xl p-4 border border-border flex gap-4 items-center bg-primary-light/50">
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-border shrink-0">
                         {m.fotoUrl ? <Image src={m.fotoUrl} alt="" width={56} height={56} className="object-cover" /> : <div className="w-full h-full bg-text/5 flex items-center justify-center"><PawPrint className="text-text"/></div>}
                      </div>
                      <div className="flex flex-col">
                         <span className="text-lg font-bold text-text capitalize">{m.nombre}</span>
                         <span className="text-xs text-text">{m.tipo} • {m.raza || "Cruce"}</span>
                      </div>
                   </div>
                 ))
               )}
            </div>
          )}

          {viewMode === "requests" && (
            <div className="space-y-4">
               <div className="flex justify-between items-center px-2">
                 <h3 className="text-text text-lg font-bold flex items-center gap-2">Trámites y Solicitudes <ClipboardList size={18} className="text-accent" /></h3>
               </div>
               
               {/* ACCIONES RÁPIDAS (Stage 46) */}
               <div className="grid grid-cols-2 gap-3 mb-6">
                  {[
                    { label: "Cambiar Celular", type: "CELULAR", icon: <Phone size={16}/> },
                    { label: "Cambiar Correo", type: "EMAIL", icon: <Mail size={16}/> },
                    { label: "Cambiar Clave", type: "PASSWORD", icon: <Lock size={16}/> },
                    { label: "Otro Trámite", type: "OTRO", icon: <HelpCircle size={16}/> }
                  ].map((btn, i) => (
                    <button 
                      key={i}
                      onClick={() => {
                        if (btn.type === "OTRO") {
                          setRegType("VEHICULO" as any); // Fallback to a valid registration type for the modal
                          setShowRegModal(true);
                        } else {
                          toast.info(`Iniciando solicitud de: ${btn.label}`);
                          setRegType("OTRO" as any);
                          setRegForm(prev => ({ ...prev, tipo: btn.type }));
                          setShowRegModal(true);
                        }
                      }}
                      className="liquid-glass-card rounded-2xl p-4 flex flex-col items-center gap-3 border border-border hover:bg-text/10 transition-all active:scale-95"
                    >
                      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                        {btn.icon}
                      </div>
                      <span className="text-[10px] font-bold text-text uppercase tracking-widest">{btn.label}</span>
                    </button>
                  ))}
               </div>

               <div className="space-y-3">
                  <p className="text-[10px] text-text uppercase tracking-widest font-black ml-2 mb-2">Solicitudes Recientes</p>
                  {tramites.length === 0 ? (
                    <p className="text-text text-xs italic ml-2">No hay trámites pendientes.</p>
                  ) : (
                    tramites.map((t, i) => (
                      <div key={i} className="liquid-glass-card rounded-2xl p-4 border border-border flex justify-between items-center bg-primary-light/30">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-text capitalize">{t.tipo.toLowerCase()}</span>
                          <span className="text-[10px] text-text uppercase tracking-tighter">{t.createdAt ? new Date(t.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : "—"}</span>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          t.estado === "APROBADO" ? "bg-text/20 text-text" : 
                          t.estado === "RECHAZADO" ? "bg-text/20 text-text" : 
                          "bg-text/20 text-text"
                        }`}>
                          {t.estado}
                        </div>
                      </div>
                    ))
                  )}
               </div>
            </div>
          )}

          {viewMode === "deuda" && (
            <div className="space-y-4">
               <div className="flex justify-between items-center px-2 mb-2">
                 <h3 className="text-text text-lg font-bold">Estado de Cuenta</h3>
                 <div className="flex gap-2 liquid-glass p-1 rounded-full border border-border">
                    {["pendientes", "historial"].map((tab) => (
                      <button 
                         key={tab}
                         onClick={() => setFinancialTab(tab as "pendientes" | "historial")}
                         className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${financialTab === tab ? "bg-accent text-primary shadow-lg" : "text-text"}`}
                      >
                         {tab}
                      </button>
                    ))}
                 </div>
               </div>

               <div className="space-y-3">
                  {financialTab === "pendientes" ? (
                    <>
                      {/* PAGOS DE ADMINISTRACIÓN PENDIENTES */}
                      {financialData.pagos.filter(p => p.estado !== 'PAGADO').map((p, i) => (
                        <div key={i} className="liquid-glass-card rounded-2xl p-5 border border-border flex justify-between items-center bg-primary-light/50">
                           <div className="flex flex-col">
                              <span className="text-[10px] text-accent/60 uppercase tracking-widest font-black mb-1">Administración</span>
                              <span className="text-sm font-bold text-text">{p.concepto}</span>
                              <span className="text-[10px] text-text uppercase mt-1">Vence: {new Date(p.fechaVencimiento).toLocaleDateString()}</span>
                           </div>
                           <div className="flex flex-col items-end gap-2">
                              <span className="text-lg font-black text-text">${Number(p.monto).toLocaleString()}</span>
                              <button 
                                 onClick={() => handlePay(p.id, 'PAGO')}
                                 className="px-4 py-1.5 rounded-full bg-text/10 text-text text-[10px] font-black uppercase hover:bg-accent hover:text-primary transition-all active:scale-90"
                               >
                                 Pagar
                               </button>
                           </div>
                        </div>
                      ))}
                      {/* RECIBOS PÚBLICOS PENDIENTES */}
                      {financialData.recibos.filter(r => !r.pagado).map((r, i) => (
                        <div key={i} className="liquid-glass-card rounded-2xl p-5 border border-border flex justify-between items-center bg-primary-light/50 border-text/20">
                           <div className="flex flex-col">
                              <span className="text-[10px] text-text uppercase tracking-widest font-black mb-1">Servicios Públicos</span>
                              <span className="text-sm font-bold text-text">{r.servicio}</span>
                              <span className="text-[10px] text-text uppercase mt-1">Vence: {new Date(r.vencimiento).toLocaleDateString()}</span>
                           </div>
                           <div className="flex flex-col items-end gap-2">
                               <span className="text-lg font-black text-text">${Number(r.monto).toLocaleString()}</span>
                               <button 
                                 onClick={() => handlePay(r.id, 'RECIBO')}
                                 className="px-4 py-1.5 rounded-full bg-text/20 text-text text-[10px] font-black uppercase hover:bg-text/10 hover:text-white transition-all active:scale-90"
                               >
                                 Pagar Ahora
                               </button>
                            </div>
                        </div>
                      ))}

                      {financialData.pagos.filter(p => (p as any).estado !== 'PAGADO').length === 0 && 
                       financialData.recibos.filter(r => !(r as any).pagado).length === 0 && (
                        <div className="text-center py-10">
                           <p className="text-text text-sm italic mb-4">No tienes deudas pendientes.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* HISTORIAL DE PAGOS */}
                      {[...financialData.pagos.filter(p => p.estado === 'PAGADO'), ...financialData.recibos.filter(r => r.pagado)].length === 0 ? (
                        <p className="text-text text-xs italic ml-2">No hay registros de pagos anteriores.</p>
                      ) : (
                        [...financialData.pagos.filter(p => p.estado === 'PAGADO'), ...financialData.recibos.filter(r => r.pagado)]
                          .sort((a,b) => new Date((b as any).fechaPago || (b as any).createdAt).getTime() - new Date((a as any).fechaPago || (a as any).createdAt).getTime())
                          .map((item, i) => (
                            <div key={i} className="liquid-glass-card rounded-2xl p-4 border border-border flex justify-between items-center bg-primary-light/30">
                               <div className="flex flex-col">
                                  <span className="text-sm font-bold text-text">{(item as any).concepto || (item as any).servicio}</span>
                                  <span className="text-[10px] text-text uppercase tracking-tighter">
                                    Pagado el: {((item as any).fechaPago || (item as any).createdAt) ? new Date((item as any).fechaPago || (item as any).createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : "—"}
                                  </span>
                               </div>
                               <div className="flex flex-col items-end">
                                  <span className="text-sm font-black text-text">${Number((item as any).monto).toLocaleString()}</span>
                                  <div className="flex items-center gap-1 text-[8px] text-text uppercase font-black">
                                     <CheckCircle2 size={10} /> Conciliado
                                  </div>
                               </div>
                            </div>
                          ))
                      )}
                    </>
                  )}
               </div>
            </div>
          )}

          {viewMode === "paquetes" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-2">
                <h3 className="text-text text-lg font-bold flex items-center gap-2">Paquetes en Portería <Package size={18} className="text-accent" /></h3>
                <span className="bg-accent/10 text-accent text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">
                  {activePaquetes.length} {activePaquetes.length === 1 ? 'Pendiente' : 'Pendientes'}
                </span>
              </div>

              <div className="space-y-3">
                {activePaquetes.length === 0 ? (
                  <div className="text-center py-12 px-6 border-2 border-dashed border-border rounded-[32px]">
                    <Package className="mx-auto text-text mb-3" size={40} />
                    <p className="text-text text-xs italic text-pretty">No hay paquetes registrados a tu nombre en este momento.</p>
                  </div>
                ) : (
                  activePaquetes.map((pkg, i) => (
                    <div key={i} className="liquid-glass-card rounded-[28px] overflow-hidden border border-border bg-primary-light/50 p-5 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center text-accent shrink-0 shadow-lg shadow-accent/5">
                        <Package size={24} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-black text-text uppercase tracking-widest leading-none">{pkg.remitente || "Remitente Desconocido"}</span>
                          <span className="text-[8px] font-black text-accent uppercase bg-accent/10 px-2 py-0.5 rounded-full ring-1 ring-accent/20">{pkg.origen || "Nacional"}</span>
                        </div>
                        <h4 className="text-sm font-bold text-text mb-1">Guía: {pkg.guia || "S/G"}</h4>
                        <p className="text-[10px] text-text uppercase tracking-tighter">Recibido: {new Date(pkg.fechaLlegada).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                         <div className="w-2 h-2 rounded-full bg-text/10 animate-pulse shadow-[0_0_10px_rgba(137,137,137,0.5)]"></div>
                         <span className="text-[8px] font-black text-text uppercase tracking-tighter">Listo</span>
                      </div>
                    </div>
                  ))
                )}

                <div className="mt-8 p-4 rounded-3xl bg-text/5 border border-text/20 flex gap-3 items-center">
                   <Info size={16} className="text-text shrink-0" />
                   <p className="text-[10px] text-text leading-relaxed uppercase tracking-tighter italic">Recuerda presentar tu identificación o el número de guía para retirar tus paquetes en la portería principal.</p>
                </div>
              </div>
            </div>
          )}
        </main>

        <section className="fade-up flex flex-col gap-3 mb-8">
          {/* Alternar Tema (Modo Claro / Modo Oscuro) */}
          <button 
            type="button"
            onClick={toggleTheme} 
            className="w-full p-6 liquid-glass rounded-[32px] flex items-center justify-between group border border-border hover:border-accent/20 active:scale-95 shadow-xl shadow-accent/5 transition-all"
          >
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent transition-colors">
                  {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-text leading-none group-hover:text-accent transition-colors">
                    {theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
                  </span>
                  <span className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-black">
                    {theme === "dark" ? "Cambiar a visualización clara" : "Cambiar a visualización oscura"}
                  </span>
                </div>
             </div>
             <ArrowRight className="text-text-muted group-hover:text-accent group-hover:translate-x-2 transition-all" size={18} />
          </button>

          <button onClick={handleLogout} className="w-full p-6 liquid-glass rounded-[32px] flex items-center justify-between group border border-text/10 active:scale-95 shadow-xl shadow-black/5">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-text/10 flex items-center justify-center text-text/60 group-hover:text-text transition-colors">
                  <LogOut size={20} />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-text/80 leading-none group-hover:text-text transition-colors">Cerrar Sesión</span>
                  <span className="text-[10px] text-text/30 mt-1 uppercase tracking-widest font-black">Desvincular dispositivo</span>
                </div>
             </div>
             <ArrowRight className="text-text/20 group-hover:text-text group-hover:translate-x-2 transition-all" size={18} />
          </button>
        </section>

        {/* GLOBAL BRANDING - Stage 29 */}
      </div>

      {/* EDIT MODAL - LIQUID GLASS VERSION (Transparency Restored) */}
      {showEditModal && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center p-0 animate-in fade-in duration-300 pointer-events-auto isolate">
           {/* Backdrop con Blur 3XL */}
           <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl" onClick={() => setShowEditModal(false)} />
           
           <div className="w-full max-w-[430px] liquid-glass rounded-t-[48px] p-8 pb-40 border-t border-border shadow-[0_-20px_80px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom duration-500 overflow-y-auto max-h-[90vh] relative z-10">
              <div className="flex justify-between items-center mb-8">
                 <div>
                   <h2 className="text-2xl font-display font-bold text-text tracking-tight">Editar Perfil</h2>
                   <p className="text-[10px] text-accent/70 uppercase tracking-[0.2em] mt-1 font-black">Configuración personal</p>
                 </div>
                 <button onClick={() => setShowEditModal(false)} className="w-12 h-12 rounded-full bg-text/5 flex items-center justify-center text-text hover:bg-text/10 transition-colors">
                    <X size={20} />
                 </button>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                 {/* AVATAR SELECTOR (Funcional) */}
                 <div className="flex justify-center mb-8">
                     <div className="relative group">
                        <div className="w-24 h-24 rounded-full p-[3px] liquid-status-halo relative">
                           <div className="w-full h-full rounded-full overflow-hidden shadow-xl z-20 relative">
                              <Image src={profilePic} alt="" width={96} height={96} className="w-full h-full object-cover rounded-full" />
                              <div className="absolute inset-0 border border-border rounded-full pointer-events-none" />
                           </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-accent text-primary flex items-center justify-center shadow-lg border-2 border-primary active:scale-90 transition-all hover:scale-110 z-30"
                        >
                           <Camera size={18} />
                        </button>
                     </div>
                  </div>

                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handlePhotoChange} 
                 />

                 <div className="space-y-2">
                    <label className="text-[10px] text-text uppercase tracking-[0.2em] font-bold ml-1">Nombre Completo</label>
                    <input 
                      type="text" 
                      value={editForm.name}
                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      className="w-full bg-primary-light/50 border border-border rounded-[24px] p-5 text-text focus:outline-none focus:border-accent/40 focus:bg-primary-light/80 transition-all placeholder:text-text"
                    />
                  </div>

                    <div className="space-y-2 opacity-50">
                       <label className="text-[10px] text-text uppercase tracking-[0.2em] font-bold ml-1">Torre</label>
                       <input 
                         type="text" 
                         value={editForm.torre}
                         disabled
                         className="w-full bg-primary-light/20 border border-border rounded-[24px] p-5 text-text cursor-not-allowed transition-all"
                       />
                    </div>
                    <div className="space-y-2 opacity-50">
                       <label className="text-[10px] text-text uppercase tracking-[0.2em] font-bold ml-1">Apto</label>
                       <input 
                         type="text" 
                         value={editForm.apto}
                         disabled
                         className="w-full bg-primary-light/20 border border-border rounded-[24px] p-5 text-text cursor-not-allowed transition-all"
                       />
                    </div>

                 <div className="space-y-2">
                    <label className="text-[10px] text-text uppercase tracking-[0.2em] font-bold ml-1">Teléfono Móvil</label>
                    <input 
                      type="text" 
                      value={editForm.phone}
                      onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                      className="w-full bg-primary-light/50 border border-border rounded-[24px] p-5 text-text focus:outline-none focus:border-accent/40 focus:bg-primary-light/80 transition-all placeholder:text-text"
                    />
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] text-text uppercase tracking-[0.2em] font-bold ml-1">Género</label>
                    <select
                      value={editForm.gender}
                      onChange={(e) => setEditForm({...editForm, gender: e.target.value as any})}
                      className="w-full bg-primary-light/50 border border-border rounded-[24px] p-5 text-text focus:outline-none focus:border-accent/40 focus:bg-primary-light/80 transition-all appearance-none cursor-pointer"
                    >
                      <option value="masculino" className="bg-primary text-text">Masculino</option>
                      <option value="femenino" className="bg-primary text-text">Femenino</option>
                      <option value="otro" className="bg-primary text-text">Otro</option>
                      <option value="neutro" className="bg-primary text-text">Prefiero no decir</option>
                    </select>
                 </div>
                 
                 <button 
                   type="submit"
                   disabled={isSubmitting}
                   className="w-full bg-accent text-primary font-bold py-6 rounded-[28px] shadow-accent/20 active:scale-95 transition-all disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                 >
                   {isSubmitting ? "Guardando..." : "Guardar Cambios"}
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* ASSET REGISTRATION MODAL - Stage 36 (Multi-file & Coexistence Rules) */}
      {showRegModal && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center p-0 animate-in fade-in duration-300 pointer-events-auto overflow-hidden isolate">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" onClick={() => setShowRegModal(false)} />
           
           <div className="w-full max-w-[430px] liquid-glass rounded-t-[48px] p-8 pb-12 border-t border-border shadow-[0_-20px_80px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom duration-500 overflow-y-auto max-h-[92vh] relative z-10 scrollbar-hide">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h2 className="text-2xl font-display font-bold text-text tracking-tight flex items-center gap-3">
                       {regType === "VEHICULO" ? <><Car className="text-accent" /> Registrar Vehículo</> : 
                        regType === "MASCOTA" ? <><PawPrint className="text-text" /> Registrar Mascota</> :
                        <><ClipboardList className="text-text" /> Solicitud de Trámite</>}
                    </h2>
                    <p className="text-[10px] text-text uppercase tracking-[0.2em] mt-1 font-black">
                       {regType === "OTRO" ? "Actualización de Datos Sensibles" : "Solicitud de Vinculación Oficial"}
                    </p>
                 </div>
                 <button onClick={() => setShowRegModal(false)} className="w-12 h-12 rounded-full bg-text/5 flex items-center justify-center text-text hover:bg-text/10 transition-colors">
                    <X size={20} />
                 </button>
              </div>
 
              <form onSubmit={handleRegisterAsset} className="space-y-5">
                 {regType === "VEHICULO" ? (
                    <>
                       <div className="space-y-1.5">
                           <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Clase de Vehículo</label>
                           <div className="grid grid-cols-2 gap-2">
                              {["CARRO", "MOTO"].map((t) => (
                                 <button 
                                   key={t}
                                   type="button"
                                   onClick={() => setRegForm({...regForm, tipoVehiculo: t})}
                                   className={`py-3 rounded-2xl text-[10px] font-bold tracking-widest border transition-all ${regForm.tipoVehiculo === t ? 'bg-accent/20 border-accent text-accent' : 'bg-primary-light/50 border-border text-text'}`}
                                 >
                                    {t}
                                 </button>
                              ))}
                           </div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1.5">
                            <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Marca</label>
                            <input required placeholder="Ej: Toyota" type="text" value={regForm.marca} onChange={(e) => setRegForm({...regForm, marca: e.target.value})} className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-sm text-text focus:outline-none focus:border-accent/40 focus:bg-primary-light/80 transition-all placeholder:text-text" />
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Modelo</label>
                            <input required placeholder="Ej: Corolla" type="text" value={regForm.modelo} onChange={(e) => setRegForm({...regForm, modelo: e.target.value})} className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-sm text-text focus:outline-none focus:border-accent/40 focus:bg-primary-light/80 transition-all placeholder:text-text" />
                         </div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1.5">
                            <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Año</label>
                            <input required placeholder="2024" type="text" value={regForm.ano} onChange={(e) => setRegForm({...regForm, ano: e.target.value})} className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-sm text-text focus:outline-none focus:border-accent/40 focus:bg-primary-light/80 transition-all placeholder:text-text" />
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Color</label>
                            <input required placeholder="Blanco" type="text" value={regForm.color} onChange={(e) => setRegForm({...regForm, color: e.target.value})} className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-sm text-text focus:outline-none focus:border-accent/40 focus:bg-primary-light/80 transition-all placeholder:text-text" />
                         </div>
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Placa</label>
                          <input required placeholder="ABC-123" type="text" value={regForm.placa} onChange={(e) => setRegForm({...regForm, placa: e.target.value})} className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-lg font-mono text-center tracking-[0.3em] font-black text-text focus:outline-none focus:border-accent/40 focus:bg-primary-light/80 uppercase transition-all placeholder:text-text" />
                       </div>
                    </>
                 ) : regType === "MASCOTA" ? (
                    <>
                       <div className="space-y-1.5">
                          <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Nombre de la Mascota</label>
                          <input required placeholder="Ej: Toby" type="text" value={regForm.nombre} onChange={(e) => setRegForm({...regForm, nombre: e.target.value})} className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-sm text-text focus:outline-none focus:border-text/40 focus:bg-primary-light/80 transition-all placeholder:text-text" />
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1.5">
                            <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Tipo</label>
                            <select required value={regForm.tipo} onChange={(e) => setRegForm({...regForm, tipo: e.target.value})} className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-sm text-text focus:outline-none appearance-none cursor-pointer focus:bg-primary-light/80 transition-all">
                               <option value="" className="bg-primary text-text">Seleccionar...</option>
                               <option value="PERRO" className="bg-primary text-text">Perro</option>
                               <option value="GATO" className="bg-primary text-text">Gato</option>
                               <option value="OTRO" className="bg-primary text-text">Otro</option>
                            </select>
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Raza</label>
                            <input required placeholder="Ej: Criollo" type="text" value={regForm.raza} onChange={(e) => setRegForm({...regForm, raza: e.target.value})} className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-sm text-text focus:outline-none focus:bg-primary-light/80 transition-all placeholder:text-text" />
                         </div>
                       </div>
                    </>
                 ) : (
                    <>
                       <div className="space-y-1.5">
                          <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                            {regForm.tipo === "CELULAR" ? "Nuevo Número Celular" : 
                             regForm.tipo === "EMAIL" ? "Nuevo Correo Electrónico" : 
                             regForm.tipo === "PASSWORD" ? "Nueva Contraseña" : "Descripción del Trámite"}
                          </label>
                          <input 
                            required 
                            placeholder={regForm.tipo === "CELULAR" ? "Ej: 3001234567" : regForm.tipo === "EMAIL" ? "Ej: nuevo@correo.com" : "Escribe aquí..."} 
                            type={regForm.tipo === "PASSWORD" ? "password" : "text"} 
                            value={regForm.nombre} 
                            onChange={(e) => setRegForm({...regForm, nombre: e.target.value})} 
                            className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-sm text-text focus:outline-none focus:border-text/40 focus:bg-primary-light/80 transition-all placeholder:text-text" 
                          />
                       </div>
                       <div className="p-4 rounded-2xl bg-primary-light/30 border border-border">
                         <p className="text-[10px] text-text leading-relaxed italic">
                            * Al solicitar este cambio, recibirás una notificación una vez el administrador haya verificado y aprobado la actualización.
                         </p>
                       </div>
                    </>
                 )}
 
                 {/* DOCUMENT DROPZONE (Multi-format) */}
                 <div className="space-y-3">
                    <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Documentación Requerida (PDF/IMG)</label>
                    <div className="grid grid-cols-3 gap-2">
                       {regDocs.map((doc, idx) => (
                          <div key={idx} className="relative aspect-square rounded-2xl bg-text/5 border border-border flex flex-col items-center justify-center p-2 group overflow-hidden">
                             {doc.mimeType === "application/pdf" ? (
                                <FileText size={20} className="text-text opacity-60" />
                             ) : (
                                <Image src={doc.base64} alt="" fill className="object-cover opacity-60" />
                             )}
                             <span className="text-[8px] text-text truncate w-full text-center mt-1 px-1">{doc.nombre}</span>
                             <button type="button" onClick={() => setRegDocs(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-text/80 text-white flex items-center justify-center scale-0 group-hover:scale-100 transition-transform">
                                <X size={12} />
                             </button>
                          </div>
                       ))}
                       <label className="aspect-square rounded-2xl border-2 border-dashed border-border hover:border-accent/40 cursor-pointer flex flex-col items-center justify-center transition-colors hover:bg-text/5 group">
                          <Plus size={20} className="text-text group-hover:text-accent transition-colors" />
                          <span className="text-[8px] text-text mt-1 uppercase font-bold tracking-tighter">Adjuntar</span>
                          <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleRegFileSelection} />
                       </label>
                    </div>
                    <p className="text-[9px] text-text italic px-1">
                       {regType === "VEHICULO" ? "Adjuntar: SOAT, Técnico-Mecánica, Licencia y Matrícula." : 
                        regType === "MASCOTA" ? "Adjuntar: Certificado de Vacunación actualizado." :
                        "Adjuntar: Copia de Cédula o Documento que soporte el cambio."}
                    </p>
                 </div>
 
                 {/* COEXISTENCE NOTICE (Stage 36) */}
                 <div className="p-5 rounded-3xl bg-text/5 border border-text/20 flex gap-4 mt-2">
                    <Info size={20} className="text-text shrink-0 mt-0.5" />
                    <div className="space-y-2">
                       <h4 className="text-[11px] font-black text-text uppercase tracking-widest">Aviso de Reglas y Convivencia</h4>
                       <p className="text-[10px] text-text leading-relaxed">
                          La vinculación está sujeta a **aprobación administrativa y disponibilidad**. Es indispensable estar **a paz y salvo**. 
                          Queda prohibido el lavado o reparaciones de vehículos en áreas comunes. 
                          <span className="text-text dark:text-text font-bold block mt-1">⚠️ El incumplimiento de las normas de convivencia puede generar multas pecuniarias.</span>
                       </p>
                    </div>
                 </div>
                 
                 <button 
                    type="submit"
                    disabled={isRegSubmitting}
                    className={`w-full ${regType === "VEHICULO" ? "bg-accent" : "bg-text/10"} text-primary font-bold py-5 rounded-[24px] shadow-2xl active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
                 >
                    {isRegSubmitting ? "Enviando..." : "Enviar Solicitud"}
                 </button>
              </form>
           </div>
        </div>
      )}
 
      {/* 🔐 PSE PAYMENT GATEWAY - PROCESSING */}
      {isPaying && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-3xl animate-in fade-in duration-500">
           <div className="w-full max-w-[380px] bg-white rounded-[40px] p-10 flex flex-col items-center text-center shadow-[0_0_100px_rgba(255,255,255,0.1)]">
              <div className="w-20 h-20 rounded-full bg-text/10 flex items-center justify-center mb-8 relative">
                 <div className="absolute inset-0 rounded-full border-4 border-border border-t-white animate-spin" />
                 <ShieldCheck size={40} className="text-white" />
              </div>
              <h3 className="text-[#000000] text-2xl font-black mb-3">Procesando Pago</h3>
              <p className="text-text text-sm leading-relaxed mb-8">
                 Estamos conectando de forma segura con tu entidad financiera a través de <b>PSE</b>. Por favor, no cierres esta ventana.
              </p>
              <div className="w-full bg-text/10 h-1.5 rounded-full overflow-hidden">
                 <div className="h-full bg-text/10 transition-all duration-[2500ms] ease-out" style={{ width: isPaying ? '100%' : '0%' }} />
              </div>
              <p className="text-[10px] text-text uppercase tracking-widest font-bold mt-4">Transacción Encriptada 256-bit</p>
           </div>
        </div>
      )}
 
      <BrandedFooter />
    </div>
  );
}
