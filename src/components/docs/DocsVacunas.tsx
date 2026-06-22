"use client";

import { useEffect, useState } from "react";
import { Car, PawPrint, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

interface Vehiculo {
  id: string;
  placa: string;
  soatVence: string | null;
  tecnomecanicaVence: string | null;
}
interface Mascota { id: string; nombre: string }
interface Vacuna {
  id: string;
  mascotaId: string;
  vacuna: string;
  fechaAplicacion: string | null;
  proxima: string | null;
}

/** Color a future date by how close it is to lapsing. */
function badge(fecha: string | null): { label: string; cls: string } {
  if (!fecha) return { label: "Sin registrar", cls: "text-text/40 border-border bg-text/5" };
  const dias = Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000);
  if (dias < 0) return { label: "Vencido", cls: "text-red-300 border-red-500/40 bg-red-500/10" };
  if (dias <= 30) return { label: `Vence en ${dias}d`, cls: "text-amber-300 border-amber-500/40 bg-amber-500/10" };
  return { label: "Vigente", cls: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" };
}

export default function DocsVacunas() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [vacunas, setVacunas] = useState<Record<string, Vacuna[]>>({});
  const [nueva, setNueva] = useState<Record<string, { vacuna: string; proxima: string }>>({});

  useEffect(() => {
    api.get<{ vehiculos?: Vehiculo[]; mascotas?: Mascota[] }>("/usuarios/me/profile")
      .then((p) => {
        setVehiculos(p.vehiculos ?? []);
        setMascotas(p.mascotas ?? []);
        (p.mascotas ?? []).forEach((m) => {
          api.get<Vacuna[]>(`/mascotas/${m.id}/vacunas`).then((vs) => setVacunas((prev) => ({ ...prev, [m.id]: vs }))).catch(() => {});
        });
      })
      .catch(() => {});
  }, []);

  async function guardarDocs(id: string, campo: "soatVence" | "tecnomecanicaVence", valor: string) {
    const veh = vehiculos.find((v) => v.id === id);
    if (!veh) return;
    const next = { ...veh, [campo]: valor || null };
    setVehiculos((prev) => prev.map((v) => (v.id === id ? next : v)));
    try {
      await api.put(`/vehiculos/${id}/documentos`, {
        soatVence: next.soatVence || undefined,
        tecnomecanicaVence: next.tecnomecanicaVence || undefined,
      });
      toast.success("Documentos actualizados");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  async function agregarVacuna(mascotaId: string) {
    const form = nueva[mascotaId];
    if (!form?.vacuna?.trim()) { toast.error("Nombre de la vacuna"); return; }
    try {
      const v = await api.post<Vacuna>(`/mascotas/${mascotaId}/vacunas`, {
        vacuna: form.vacuna.trim(),
        proxima: form.proxima || undefined,
      });
      setVacunas((prev) => ({ ...prev, [mascotaId]: [...(prev[mascotaId] ?? []), v] }));
      setNueva((prev) => ({ ...prev, [mascotaId]: { vacuna: "", proxima: "" } }));
      toast.success("Vacuna registrada");
    } catch {
      toast.error("No se pudo registrar");
    }
  }

  async function eliminarVacuna(mascotaId: string, id: string) {
    try {
      await api.delete(`/vacunas/${id}`);
      setVacunas((prev) => ({ ...prev, [mascotaId]: (prev[mascotaId] ?? []).filter((v) => v.id !== id) }));
    } catch {
      toast.error("No se pudo eliminar");
    }
  }

  if (vehiculos.length === 0 && mascotas.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {vehiculos.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text/60 px-1 flex items-center gap-2"><Car size={14} /> Documentos de vehículos</h3>
          {vehiculos.map((v) => (
            <div key={v.id} className="liquid-glass rounded-2xl p-4 border border-border flex flex-col gap-3">
              <p className="text-sm font-bold text-text font-mono tracking-widest">{v.placa}</p>
              {([["soatVence", "SOAT"], ["tecnomecanicaVence", "Tecnomecánica"]] as const).map(([campo, label]) => {
                const b = badge(v[campo]);
                return (
                  <div key={campo} className="flex items-center gap-2">
                    <span className="text-[11px] text-text/70 w-28">{label}</span>
                    <input type="date" value={v[campo] ?? ""} onChange={(e) => guardarDocs(v.id, campo, e.target.value)}
                      className="flex-1 bg-primary-light/50 border border-border rounded-xl py-2 px-3 text-xs text-text focus:outline-none focus:border-accent" />
                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${b.cls}`}>{b.label}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {mascotas.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text/60 px-1 flex items-center gap-2"><PawPrint size={14} /> Vacunas de mascotas</h3>
          {mascotas.map((m) => (
            <div key={m.id} className="liquid-glass rounded-2xl p-4 border border-border flex flex-col gap-2">
              <p className="text-sm font-bold text-text">{m.nombre}</p>
              {(vacunas[m.id] ?? []).map((vac) => {
                const b = badge(vac.proxima);
                return (
                  <div key={vac.id} className="flex items-center gap-2 text-xs text-text">
                    <span className="flex-1">{vac.vacuna}{vac.proxima ? ` · refuerzo ${vac.proxima}` : ""}</span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${b.cls}`}>{b.label}</span>
                    <button onClick={() => eliminarVacuna(m.id, vac.id)} className="text-text/40"><Trash2 size={13} /></button>
                  </div>
                );
              })}
              <div className="flex gap-2 mt-1">
                <input value={nueva[m.id]?.vacuna ?? ""} onChange={(e) => setNueva((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? { vacuna: "", proxima: "" }), vacuna: e.target.value } }))}
                  placeholder="Vacuna" className="flex-1 bg-primary-light/50 border border-border rounded-xl py-2 px-3 text-xs text-text focus:outline-none focus:border-accent" />
                <input type="date" value={nueva[m.id]?.proxima ?? ""} onChange={(e) => setNueva((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? { vacuna: "", proxima: "" }), proxima: e.target.value } }))}
                  className="bg-primary-light/50 border border-border rounded-xl py-2 px-2 text-xs text-text focus:outline-none focus:border-accent" />
                <button onClick={() => agregarVacuna(m.id)} className="px-3 rounded-xl bg-accent text-primary"><Plus size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
