"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Building2, Plus, FileText, CheckCircle2, ShieldCheck, MapPin, 
  User, Calendar, List, Layers, HelpCircle, Loader2, ArrowRight,
  Upload, Edit3
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import { toast } from "sonner";
import { supabase } from "@/lib/db";

export default function SuperAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role;
  const containerRef = useRef<HTMLDivElement>(null);

  const [conjuntos, setConjuntos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tab, setTab] = useState<"CREAR" | "LISTAR">("CREAR");
  const [editingConjuntoId, setEditingConjuntoId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    nombre: "",
    nit: "",
    subdominio: "",
    direccion: "",
    ciudad: "",
    representanteLegal: "",
    notariaEscritura: "",
    numeroEscritura: "",
    fechaEscritura: "",
    matriculaInmobiliaria: "",
    totalUnidades: "1",
    logoUrl: "",
    colorPrimario: "#7C3AED" // Default premium violet
  });

  const handleEditClick = (c: any) => {
    setEditingConjuntoId(c.id);
    setFormData({
      nombre: c.nombre || "",
      nit: c.nit || "",
      subdominio: c.subdominio || "",
      direccion: c.direccion || "",
      ciudad: c.ciudad || "",
      representanteLegal: c.representanteLegal || "",
      notariaEscritura: c.notariaEscritura || "",
      numeroEscritura: c.numeroEscritura || "",
      fechaEscritura: c.fechaEscritura ? new Date(c.fechaEscritura).toISOString().split('T')[0] : "",
      matriculaInmobiliaria: c.matriculaInmobiliaria || "",
      totalUnidades: c.totalUnidades ? String(c.totalUnidades) : "1",
      logoUrl: c.logoUrl || "",
      colorPrimario: c.colorPrimario || "#7C3AED"
    });
    setTab("CREAR");
  };

  const handleCancelEdit = () => {
    setEditingConjuntoId(null);
    setFormData({
      nombre: "",
      nit: "",
      subdominio: "",
      direccion: "",
      ciudad: "",
      representanteLegal: "",
      notariaEscritura: "",
      numeroEscritura: "",
      fechaEscritura: "",
      matriculaInmobiliaria: "",
      totalUnidades: "1",
      logoUrl: "",
      colorPrimario: "#7C3AED"
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error("El tamaño de la imagen supera el límite de 5MB");
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('logos')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, logoUrl: publicUrl }));
      toast.success("Logotipo subido correctamente");
    } catch (err: any) {
      console.error("Error uploading logo:", err);
      toast.error("Error al subir imagen: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const fetchConjuntos = async () => {
    try {
      const res = await fetch("/api/superadmin/conjuntos");
      const data = await res.json();
      if (data.success) {
        setConjuntos(data.data);
      }
    } catch {
      toast.error("Error al cargar conjuntos registrados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }

    if (role !== "SUPER_ADMIN") {
      toast.error("No autorizado. Esta sección es exclusiva de SuperAdministradores.");
      router.push("/inicio");
      return;
    }

    fetchConjuntos();
  }, [session, status, role, router]);

  useEffect(() => {
    if (!loading) {
      const ctx = gsap.context(() => {
        gsap.fromTo(".fade-up", 
          { opacity: 0, y: 20 }, 
          { opacity: 1, y: 0, stagger: 0.08, duration: 0.5, ease: "power2.out" }
        );
      }, containerRef);
      return () => ctx.revert();
    }
  }, [loading, tab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.nombre || !formData.nit || !formData.subdominio || !formData.direccion || !formData.ciudad) {
      return toast.error("Por favor completa todos los campos obligatorios");
    }

    setIsSubmitting(true);
    try {
      const url = "/api/superadmin/conjuntos";
      const method = editingConjuntoId ? "PUT" : "POST";
      const payload = editingConjuntoId ? { id: editingConjuntoId, ...formData } : formData;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        toast.success(editingConjuntoId ? "Copropiedad actualizada con éxito" : "Conjunto de Propiedad Horizontal registrado con éxito");
        // Reset form
        setFormData({
          nombre: "",
          nit: "",
          subdominio: "",
          direccion: "",
          ciudad: "",
          representanteLegal: "",
          notariaEscritura: "",
          numeroEscritura: "",
          fechaEscritura: "",
          matriculaInmobiliaria: "",
          totalUnidades: "1",
          logoUrl: "",
          colorPrimario: "#7C3AED"
        });
        setEditingConjuntoId(null);
        fetchConjuntos();
        setTab("LISTAR");
      } else {
        toast.error(data.error || "Error al procesar la solicitud");
      }
    } catch {
      toast.error("Error de conexión al servidor");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden">
      <ProfileHeader />

      <div className="fade-up flex items-center justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent italic">SuperAdmin Dashboard</span>
          <h1 className="text-3xl font-display font-bold text-text leading-none mt-1">Registrar Copropiedad</h1>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
          <Building2 size={22} />
        </div>
      </div>

      {/* Tabs */}
      <div className="fade-up flex bg-surface-2 rounded-full p-1 border border-border">
        <button 
          onClick={() => setTab("CREAR")} 
          className={`flex-1 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${tab === "CREAR" ? "bg-accent/10 text-accent shadow-inner" : "text-text/70 hover:text-text"}`}
        >
          Nuevo Registro
        </button>
        <button 
          onClick={() => setTab("LISTAR")} 
          className={`flex-1 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${tab === "LISTAR" ? "bg-surface text-text border border-border shadow-md" : "text-text/70 hover:text-text"}`}
        >
          Ver Registrados ({conjuntos.length})
        </button>
      </div>

      {tab === "CREAR" ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {editingConjuntoId && (
            <div className="fade-up flex items-center justify-between bg-accent/15 border border-accent/20 rounded-2xl p-4 text-xs text-text shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
                <span>Modo edición activo: Editando <strong>{formData.nombre || "copropiedad"}</strong></span>
              </div>
              <button 
                type="button"
                onClick={handleCancelEdit}
                className="py-1.5 px-3 rounded-xl border border-border text-[9px] font-black uppercase tracking-wider bg-surface hover:bg-text/5 text-text cursor-pointer transition-all active:scale-95"
              >
                Cancelar
              </button>
            </div>
          )}
          {/* SECCIÓN 1: IDENTIFICACIÓN GENERAL */}
          <div className="fade-up liquid-glass rounded-[28px] p-6 border border-border shadow-2xl flex flex-col gap-4">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2">
              <Building2 size={16} className="text-accent" /> 1. Datos Generales de la Copropiedad
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Nombre Comercial *</label>
                <input 
                  required
                  type="text" 
                  value={formData.nombre}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej: Residencial Club del Sol" 
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">NIT *</label>
                <input 
                  required
                  type="text" 
                  value={formData.nit}
                  onChange={e => setFormData({...formData, nit: e.target.value})}
                  placeholder="Ej: 900.123.456-1" 
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Dirección de Ubicación *</label>
                <input 
                  required
                  type="text" 
                  value={formData.direccion}
                  onChange={e => setFormData({...formData, direccion: e.target.value})}
                  placeholder="Ej: Calle 26 # 69-76" 
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Municipio / Ciudad *</label>
                <input 
                  required
                  type="text" 
                  value={formData.ciudad}
                  onChange={e => setFormData({...formData, ciudad: e.target.value})}
                  placeholder="Ej: Medellín" 
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Subdominio Único (Tenant ID) *</label>
              <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3 focus-within:border-accent transition-colors">
                <input 
                  required
                  type="text" 
                  value={formData.subdominio}
                  onChange={e => setFormData({...formData, subdominio: e.target.value})}
                  placeholder="clubdelsol" 
                  className="bg-transparent border-none outline-none text-sm text-text flex-1"
                />
                <span className="text-xs text-text/40 font-mono">.conjuntos.app</span>
              </div>
              <p className="text-[9px] text-text/50 pl-1 mt-0.5">Identificador de URL único para acceso directo al portal de residentes.</p>
            </div>
          </div>

          {/* SECCIÓN 2: DATOS DE REGULACIÓN LEGAL (LEY 675 DE 2001) */}
          <div className="fade-up liquid-glass rounded-[28px] p-6 border border-border shadow-2xl flex flex-col gap-4">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2">
              <FileText size={16} className="text-accent" /> 2. Registro de Personería Jurídica y Representación
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Representante Legal (Administrador)</label>
                <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3">
                  <User size={16} className="text-text/40 mr-2" />
                  <input 
                    type="text" 
                    value={formData.representanteLegal}
                    onChange={e => setFormData({...formData, representanteLegal: e.target.value})}
                    placeholder="Nombre completo" 
                    className="bg-transparent border-none outline-none text-sm text-text flex-1"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Notaría del Reglamento H.P.</label>
                <input 
                  type="text" 
                  value={formData.notariaEscritura}
                  onChange={e => setFormData({...formData, notariaEscritura: e.target.value})}
                  placeholder="Ej: Notaría Primera de Envigado" 
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Número Escritura Pública</label>
                <input 
                  type="text" 
                  value={formData.numeroEscritura}
                  onChange={e => setFormData({...formData, numeroEscritura: e.target.value})}
                  placeholder="Ej: Escritura 4289" 
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Fecha de la Escritura</label>
                <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3">
                  <Calendar size={16} className="text-text/40 mr-2" />
                  <input 
                    type="date" 
                    value={formData.fechaEscritura}
                    onChange={e => setFormData({...formData, fechaEscritura: e.target.value})}
                    className="bg-transparent border-none outline-none text-sm text-text flex-1"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Matrícula Principal Oficina Registro</label>
                <input 
                  type="text" 
                  value={formData.matriculaInmobiliaria}
                  onChange={e => setFormData({...formData, matriculaInmobiliaria: e.target.value})}
                  placeholder="Ej: 001-1234567" 
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Total Unidades Privadas (Aptos / Casas)</label>
              <div className="flex items-center bg-surface-2 border border-border rounded-xl px-4 py-3">
                <Layers size={16} className="text-text/40 mr-2" />
                <input 
                  type="number" 
                  min="1"
                  value={formData.totalUnidades}
                  onChange={e => setFormData({...formData, totalUnidades: e.target.value})}
                  className="bg-transparent border-none outline-none text-sm text-text flex-1"
                />
              </div>
              <p className="text-[9px] text-text/50 pl-1 mt-0.5">Define la cantidad de inmuebles que componen la asamblea general de copropietarios.</p>
            </div>
          </div>

          {/* SECCIÓN 3: PERSONALIZACIÓN */}
          <div className="fade-up liquid-glass rounded-[28px] p-6 border border-border shadow-2xl flex flex-col gap-4">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-border/40 pb-2">
              <Plus size={16} className="text-accent" /> 3. Personalización del Portal ConjuntOS
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Logotipo de la Copropiedad</label>
              
              <div className="flex flex-col sm:flex-row gap-4 items-center bg-surface-2 border border-border rounded-2xl p-4">
                {formData.logoUrl ? (
                  <div className="w-16 h-16 rounded-xl bg-white border border-border overflow-hidden flex items-center justify-center p-1 relative group shrink-0">
                    <img 
                      src={formData.logoUrl} 
                      alt="Logo preview" 
                      className="w-full h-full object-contain" 
                    />
                    <button 
                      type="button" 
                      onClick={() => setFormData({...formData, logoUrl: ""})}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold uppercase tracking-wider transition-opacity cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-surface/40 border border-dashed border-border flex items-center justify-center text-text/40 shrink-0">
                    <Building2 size={24} />
                  </div>
                )}

                <div className="flex-1 flex flex-col gap-2 w-full">
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={isUploading}
                      id="logo-file-input"
                      className="hidden"
                    />
                    <label 
                      htmlFor="logo-file-input"
                      className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border text-xs font-bold uppercase tracking-wider text-text bg-surface hover:bg-text/5 cursor-pointer active:scale-98 transition-all ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> Subiendo...
                        </>
                      ) : (
                        <>
                          <Upload size={12} className="text-accent" /> {formData.logoUrl ? 'Cambiar Logotipo' : 'Subir Logotipo'}
                        </>
                      )}
                    </label>
                  </div>
                  <p className="text-[9px] text-text/40 leading-tight">Formatos permitidos: PNG, JPG, WebP, SVG. Max 5MB.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Color de Marca Primario</label>
              <div className="flex items-center gap-4 bg-surface-2 border border-border rounded-xl px-4 py-2">
                <input 
                  type="color" 
                  value={formData.colorPrimario}
                  onChange={e => setFormData({...formData, colorPrimario: e.target.value})}
                  className="w-10 h-10 border-0 rounded-full cursor-pointer bg-transparent"
                />
                <span className="text-xs text-text font-mono font-bold">{formData.colorPrimario}</span>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting || isUploading} 
            className="fade-up w-full py-4 bg-linear-to-r from-accent to-violet-600 hover:from-accent/90 hover:to-violet-500 transition-all rounded-2xl font-black uppercase text-xs tracking-widest text-white shadow-xl shadow-accent/20 active:scale-[0.98] flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {editingConjuntoId ? "Guardando Cambios..." : "Registrando Copropiedad..."}
              </>
            ) : (
              <>
                <ShieldCheck size={18} /> {editingConjuntoId ? "Guardar Cambios de Personería" : "Validar y Crear Personería Jurídica"}
              </>
            )}
          </button>
        </form>
      ) : (
        /* LISTADO DE CONJUNTOS REGISTRADOS */
        <div className="flex flex-col gap-4">
          {conjuntos.length === 0 ? (
            <p className="text-center text-text/50 text-sm py-12">No hay conjuntos registrados en el sistema.</p>
          ) : (
            conjuntos.map((c, idx) => (
              <div key={c.id || idx} className="fade-up liquid-glass-card rounded-[24px] p-5 border border-border flex flex-col gap-3 relative overflow-hidden group hover:border-accent/40 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl pointer-events-none translate-x-1/2 -translate-y-1/2 group-hover:bg-accent/15 transition-all"></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex gap-3 items-center">
                    {c.logoUrl && (
                      <div className="w-10 h-10 rounded-lg bg-white border border-border overflow-hidden p-0.5 flex items-center justify-center shrink-0">
                        <img src={c.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-text leading-tight">{c.nombre}</h3>
                      <p className="text-accent font-mono text-[10px] tracking-widest uppercase font-black">{c.nit}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <span className="bg-surface-2 px-3 py-1 rounded-full border border-border text-[9px] font-black text-text/60 font-mono">
                      {c.subdominio}.conjuntos.app
                    </span>
                    <button
                      onClick={() => handleEditClick(c)}
                      className="inline-flex items-center gap-1 py-1.5 px-3 rounded-xl border border-border text-[10px] font-black uppercase tracking-wider text-accent bg-accent/5 hover:bg-accent/10 active:scale-95 transition-all cursor-pointer"
                    >
                      <Edit3 size={10} /> Editar
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-xs text-text/75 border-t border-border/40 pt-3 mt-1">
                  <div className="flex items-center gap-2">
                    <MapPin size={12} className="text-text/40" />
                    <span>{c.direccion}, {c.ciudad}</span>
                  </div>
                  {c.representanteLegal && (
                    <div className="flex items-center gap-2">
                      <User size={12} className="text-text/40" />
                      <span>Rep. Legal: <strong>{c.representanteLegal}</strong></span>
                    </div>
                  )}
                  {c.matriculaInmobiliaria && (
                    <div className="flex items-center gap-2">
                      <FileText size={12} className="text-text/40" />
                      <span>F. Matrícula: <strong className="font-mono text-[11px]">{c.matriculaInmobiliaria}</strong></span>
                    </div>
                  )}
                  {c.numeroEscritura && (
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={12} className="text-text/40" />
                      <span>{c.notariaEscritura || "Deed"}: {c.numeroEscritura} ({c.fechaEscritura ? new Date(c.fechaEscritura).toLocaleDateString() : "N/A"})</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Layers size={12} className="text-text/40" />
                    <span>Unidades Totales: <strong>{c.totalUnidades || 1} celdas/unidades</strong></span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
