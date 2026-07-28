'use client';

import { useState } from 'react';
import {
  Play, Square, ListOrdered, Plus, BarChart3, FileCheck,
  CheckCircle2, Radio, Hand, ChevronRight, Loader2,
} from 'lucide-react';

interface OrdenDiaItem { id?: string; titulo: string; descripcion?: string }

interface Votacion {
  id: string; titulo: string; descripcion: string | null;
  opciones: string[]; activa: boolean;
}

interface Turno {
  id: string; usuarioId: string; nombre: string; apto: string | null; estado: string;
}

interface Poder {
  id: string; otorganteId: string; apoderadoId: string;
  documentoUrl: string; verificado: boolean;
}

interface ModeratorPanelProps {
  enSesion: boolean;
  ordenDia: OrdenDiaItem[];
  itemActivoIndex: number;
  votaciones: Votacion[];
  turnos: Turno[];
  poderes: Poder[];
  onStartSession: () => Promise<void>;
  onFinishSession: () => Promise<void>;
  onGoToItem: (index: number) => Promise<void>;
  onCreateVotacion: (titulo: string, opciones: string[]) => Promise<void>;
  onToggleVotacion: (id: string, activa: boolean) => Promise<void>;
  onUpdateTurno: (id: string, estado: string) => Promise<void>;
  onVerifyPoder: (id: string, verificado: boolean) => Promise<void>;
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 mb-2 flex items-center gap-1.5">
      {icon} {children}
    </p>
  );
}

/**
 * Everything a moderator needs while the assembly is running, docked inside the
 * room. Before this, running a session meant driving it from /admin-asamblea in
 * another tab while watching the video here.
 */
export default function ModeratorPanel({
  enSesion, ordenDia, itemActivoIndex, votaciones, turnos, poderes,
  onStartSession, onFinishSession, onGoToItem, onCreateVotacion,
  onToggleVotacion, onUpdateTurno, onVerifyPoder,
}: ModeratorPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showVotacionForm, setShowVotacionForm] = useState(false);
  const [votacionTitulo, setVotacionTitulo] = useState('');
  const [votacionOpciones, setVotacionOpciones] = useState('');

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const pendientes = turnos.filter((t) => t.estado === 'PENDIENTE' || t.estado === 'HABLANDO');
  const poderesPendientes = poderes.filter((p) => !p.verificado);

  return (
    <div className="flex flex-col gap-5">
      {/* Session control */}
      <div>
        <SectionTitle icon={<Radio size={11} />}>Sesión</SectionTitle>
        {enSesion ? (
          <button
            onClick={() => run('finish', onFinishSession)}
            disabled={busy !== null}
            className="w-full py-3 rounded-2xl bg-red-500/15 border border-red-500/40 text-[#fca5a5] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f87171]/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy === 'finish' ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
            Finalizar asamblea
          </button>
        ) : (
          <button
            onClick={() => run('start', onStartSession)}
            disabled={busy !== null}
            className="w-full py-3 rounded-2xl bg-white text-black text-[11px] font-bold uppercase tracking-widest hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Iniciar la sesión
          </button>
        )}
      </div>

      {/* Agenda control */}
      {ordenDia.length > 0 && (
        <div>
          <SectionTitle icon={<ListOrdered size={11} />}>
            Orden del día · punto {itemActivoIndex + 1} de {ordenDia.length}
          </SectionTitle>
          <div className="flex flex-col gap-1.5">
            {ordenDia.map((item, i) => {
              const current = i === itemActivoIndex;
              const done = i < itemActivoIndex;
              return (
                <button
                  key={item.id ?? i}
                  onClick={() => run(`item-${i}`, () => onGoToItem(i))}
                  disabled={busy !== null || current}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all disabled:cursor-default ${
                    current
                      ? 'border-white/40 bg-white/[0.08]'
                      : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold shrink-0 ${
                        current ? 'bg-white text-black' : done ? 'bg-white/10 text-white/40' : 'bg-white/5 text-white/40'
                      }`}
                    >
                      {done ? <CheckCircle2 size={11} /> : i + 1}
                    </span>
                    <span className={`text-[11px] truncate ${done ? 'text-white/35 line-through' : 'text-white/85'}`}>
                      {item.titulo}
                    </span>
                    {!current && !done && (
                      <ChevronRight size={12} className="ml-auto text-white/25 shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Speaking queue */}
      <div>
        <SectionTitle icon={<Hand size={11} />}>Cola de palabra ({pendientes.length})</SectionTitle>
        {pendientes.length === 0 ? (
          <p className="text-white/30 text-[11px]">Nadie ha pedido la palabra.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {pendientes.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                  t.estado === 'HABLANDO'
                    ? 'border-white/40 bg-white/[0.08]'
                    : 'border-white/8 bg-white/[0.02]'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white/8 grid place-items-center text-[9px] font-bold text-white/50 shrink-0">
                  {t.estado === 'HABLANDO' ? <Radio size={10} /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold truncate">{t.nombre}</p>
                  {t.apto && <p className="text-[9px] text-white/35">{t.apto}</p>}
                </div>
                <button
                  onClick={() =>
                    run(`turno-${t.id}`, () =>
                      onUpdateTurno(t.id, t.estado === 'HABLANDO' ? 'COMPLETADO' : 'HABLANDO'),
                    )
                  }
                  disabled={busy !== null}
                  className="ml-auto shrink-0 px-2.5 py-1 rounded-lg bg-white/10 border border-white/12 hover:bg-white hover:text-black transition-all text-[9px] font-bold uppercase disabled:opacity-50"
                >
                  {t.estado === 'HABLANDO' ? 'Terminar' : 'Dar palabra'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Votaciones */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionTitle icon={<BarChart3 size={11} />}>Votaciones</SectionTitle>
          <button
            onClick={() => setShowVotacionForm((v) => !v)}
            className="mb-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/8 border border-white/12 hover:bg-white/15 transition-colors text-[9px] font-bold uppercase"
          >
            <Plus size={10} /> Nueva
          </button>
        </div>

        {showVotacionForm && (
          <div className="mb-2.5 p-3 rounded-2xl border border-white/12 bg-white/[0.04] flex flex-col gap-2">
            <input
              value={votacionTitulo}
              onChange={(e) => setVotacionTitulo(e.target.value)}
              placeholder="¿Qué se vota?"
              className="bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
            <input
              value={votacionOpciones}
              onChange={(e) => setVotacionOpciones(e.target.value)}
              placeholder="Opciones separadas por coma (por defecto: Sí, No, Abstención)"
              className="bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
            <button
              onClick={() =>
                run('crear-votacion', async () => {
                  const opciones = votacionOpciones
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean);
                  await onCreateVotacion(votacionTitulo.trim(), opciones);
                  setVotacionTitulo('');
                  setVotacionOpciones('');
                  setShowVotacionForm(false);
                })
              }
              disabled={!votacionTitulo.trim() || busy !== null}
              className="py-2 rounded-xl bg-white text-black text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 hover:bg-white/90 transition-colors"
            >
              {busy === 'crear-votacion' ? 'Creando…' : 'Crear votación'}
            </button>
          </div>
        )}

        {votaciones.length === 0 ? (
          <p className="text-white/30 text-[11px]">Todavía no hay votaciones.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {votaciones.map((v) => (
              <div
                key={v.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                  v.activa ? 'border-white/30 bg-white/[0.06]' : 'border-white/8 bg-white/[0.02]'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold truncate">{v.titulo}</p>
                  <p className="text-[9px] text-white/35">{(v.opciones ?? []).join(' · ')}</p>
                </div>
                <button
                  onClick={() => run(`vot-${v.id}`, () => onToggleVotacion(v.id, !v.activa))}
                  disabled={busy !== null}
                  className={`ml-auto shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all disabled:opacity-50 ${
                    v.activa
                      ? 'bg-[#2dd4bf] text-[#04211d] hover:brightness-110'
                      : 'bg-white/10 border border-white/12 text-white hover:bg-white/20'
                  }`}
                >
                  {v.activa ? 'Cerrar' : 'Abrir'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Poderes */}
      {poderes.length > 0 && (
        <div>
          <SectionTitle icon={<FileCheck size={11} />}>
            Poderes · {poderesPendientes.length} por verificar
          </SectionTitle>
          <div className="flex flex-col gap-1.5">
            {poderes.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/8 bg-white/[0.02]"
              >
                <div className="min-w-0">
                  <p className="text-[10px] text-white/70 truncate">
                    {p.otorganteId.slice(0, 8)}… → {p.apoderadoId.slice(0, 8)}…
                  </p>
                  <a
                    href={p.documentoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] text-white/40 underline hover:text-white/70"
                  >
                    Ver documento
                  </a>
                </div>
                <button
                  onClick={() => run(`poder-${p.id}`, () => onVerifyPoder(p.id, !p.verificado))}
                  disabled={busy !== null}
                  className={`ml-auto shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all disabled:opacity-50 ${
                    p.verificado
                      ? 'bg-white text-black'
                      : 'bg-white/10 border border-white/12 text-white hover:bg-white/20'
                  }`}
                >
                  {p.verificado ? 'Verificado' : 'Verificar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
