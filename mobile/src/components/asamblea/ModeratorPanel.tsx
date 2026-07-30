/**
 * ModeratorPanel — mobile port of web `src/components/asamblea/ModeratorPanel.tsx`.
 *
 * Everything a moderator needs while the assembly is running, docked inside the
 * room: start/finish the session, jump between agenda items, hand out the floor,
 * open and close ballots, and verify poderes. Before this, running a session
 * from the phone was impossible — the admin had to drive it from /admin-asamblea.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  Hand,
  ListOrdered,
  Play,
  Plus,
  Radio,
  Square,
} from 'lucide-react-native';

import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import type { OrdenDiaItem, PoderDto, TurnoDto, VotacionDto } from '@/lib/api/types';

interface ModeratorPanelProps {
  enSesion: boolean;
  ordenDia: OrdenDiaItem[];
  itemActivoIndex: number;
  votaciones: VotacionDto[];
  turnos: TurnoDto[];
  poderes: PoderDto[];
  onStartSession: () => Promise<void>;
  onFinishSession: () => Promise<void>;
  onGoToItem: (index: number) => Promise<void>;
  onCreateVotacion: (titulo: string, opciones: string[]) => Promise<void>;
  onToggleVotacion: (id: string, activa: boolean) => Promise<void>;
  onUpdateTurno: (id: string, estado: string) => Promise<void>;
  onVerifyPoder: (id: string, verificado: boolean) => Promise<void>;
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <View className="mb-2 flex-row items-center gap-1.5">
      {icon}
      <Text className="text-[9px] font-bold uppercase tracking-widest text-text/60">
        {children}
      </Text>
    </View>
  );
}

export default function ModeratorPanel({
  enSesion,
  ordenDia,
  itemActivoIndex,
  votaciones,
  turnos,
  poderes,
  onStartSession,
  onFinishSession,
  onGoToItem,
  onCreateVotacion,
  onToggleVotacion,
  onUpdateTurno,
  onVerifyPoder,
}: ModeratorPanelProps) {
  const { theme } = useTheme();
  const t = tokensFor(theme);

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

  const pendientes = turnos.filter(
    (turno) => turno.estado === 'PENDIENTE' || turno.estado === 'HABLANDO',
  );
  const poderesPendientes = poderes.filter((p) => !p.verificado);

  return (
    <View className="gap-5">
      {/* Session control */}
      <View>
        <SectionTitle icon={<Radio size={11} color={t.textMuted} />}>Sesión</SectionTitle>
        {enSesion ? (
          <Pressable
            onPress={() => run('finish', onFinishSession)}
            disabled={busy !== null}
            accessibilityRole="button"
            className="w-full flex-row items-center justify-center gap-2 rounded-2xl border border-danger/40 bg-danger/15 py-3"
            style={{ opacity: busy !== null ? 0.5 : 1 }}
          >
            {busy === 'finish' ? (
              <ActivityIndicator size="small" color={t.danger} />
            ) : (
              <Square size={13} color={t.danger} />
            )}
            <Text className="text-[11px] font-bold uppercase tracking-widest text-danger">
              Finalizar asamblea
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => run('start', onStartSession)}
            disabled={busy !== null}
            accessibilityRole="button"
            className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-text py-3"
            style={{ opacity: busy !== null ? 0.5 : 1 }}
          >
            {busy === 'start' ? (
              <ActivityIndicator size="small" color={t.primary} />
            ) : (
              <Play size={13} color={t.primary} />
            )}
            <Text className="text-[11px] font-bold uppercase tracking-widest text-primary">
              Iniciar la sesión
            </Text>
          </Pressable>
        )}
      </View>

      {/* Agenda control */}
      {ordenDia.length > 0 ? (
        <View>
          <SectionTitle icon={<ListOrdered size={11} color={t.textMuted} />}>
            {`Orden del día · punto ${itemActivoIndex + 1} de ${ordenDia.length}`}
          </SectionTitle>
          <View className="gap-1.5">
            {ordenDia.map((item, i) => {
              const current = i === itemActivoIndex;
              const done = i < itemActivoIndex;
              return (
                <Pressable
                  key={item.id ?? i}
                  onPress={() => run(`item-${i}`, () => onGoToItem(i))}
                  disabled={busy !== null || current}
                  accessibilityRole="button"
                  className={`w-full rounded-xl border px-3 py-2.5 ${
                    current ? 'border-text/40 bg-text/[0.08]' : 'border-text/[0.08] bg-text/[0.02]'
                  }`}
                >
                  <View className="flex-row items-center gap-2">
                    <View
                      className={`h-5 w-5 items-center justify-center rounded-full ${
                        current ? 'bg-text' : done ? 'bg-text/10' : 'bg-text/5'
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 size={11} color={t.textMuted} />
                      ) : (
                        <Text
                          className={`text-[9px] font-bold ${
                            current ? 'text-primary' : 'text-text/60'
                          }`}
                        >
                          {i + 1}
                        </Text>
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      className={`flex-1 text-[11px] ${
                        done ? 'text-text/60 line-through' : 'text-text/85'
                      }`}
                    >
                      {item.titulo}
                    </Text>
                    {!current && !done ? (
                      <ChevronRight size={12} color={t.textMuted} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Speaking queue */}
      <View>
        <SectionTitle icon={<Hand size={11} color={t.textMuted} />}>
          {`Cola de palabra (${pendientes.length})`}
        </SectionTitle>
        {pendientes.length === 0 ? (
          <Text className="text-[11px] text-text/55">Nadie ha pedido la palabra.</Text>
        ) : (
          <View className="gap-1.5">
            {pendientes.map((turno, i) => (
              <View
                key={turno.id}
                className={`flex-row items-center gap-2 rounded-xl border px-3 py-2 ${
                  turno.estado === 'HABLANDO'
                    ? 'border-text/40 bg-text/[0.08]'
                    : 'border-text/[0.08] bg-text/[0.02]'
                }`}
              >
                <View className="h-5 w-5 items-center justify-center rounded-full bg-text/[0.08]">
                  {turno.estado === 'HABLANDO' ? (
                    <Radio size={10} color={t.textMuted} />
                  ) : (
                    <Text className="text-[9px] font-bold text-text/50">{i + 1}</Text>
                  )}
                </View>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-[11px] font-semibold text-text">
                    {turno.nombre}
                  </Text>
                  {turno.apto ? (
                    <Text className="text-[9px] text-text/60">{turno.apto}</Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() =>
                    run(`turno-${turno.id}`, () =>
                      onUpdateTurno(
                        turno.id,
                        turno.estado === 'HABLANDO' ? 'COMPLETADO' : 'HABLANDO',
                      ),
                    )
                  }
                  disabled={busy !== null}
                  accessibilityRole="button"
                  className="rounded-lg border border-text/[0.12] bg-text/10 px-2.5 py-1"
                  style={{ opacity: busy !== null ? 0.5 : 1 }}
                >
                  <Text className="text-[9px] font-bold uppercase text-text">
                    {turno.estado === 'HABLANDO' ? 'Terminar' : 'Dar palabra'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Votaciones */}
      <View>
        <View className="mb-2 flex-row items-center justify-between">
          <SectionTitle icon={<BarChart3 size={11} color={t.textMuted} />}>
            Votaciones
          </SectionTitle>
          <Pressable
            onPress={() => setShowVotacionForm((v) => !v)}
            accessibilityRole="button"
            className="mb-2 flex-row items-center gap-1 rounded-lg border border-text/[0.12] bg-text/[0.08] px-2 py-1"
          >
            <Plus size={10} color={t.text} />
            <Text className="text-[9px] font-bold uppercase text-text">Nueva</Text>
          </Pressable>
        </View>

        {showVotacionForm ? (
          <View className="mb-2.5 gap-2 rounded-2xl border border-text/[0.12] bg-text/[0.04] p-3">
            <TextInput
              value={votacionTitulo}
              onChangeText={setVotacionTitulo}
              placeholder="¿Qué se vota?"
              placeholderTextColor={t.textMuted}
              className="rounded-xl border border-text/10 bg-text/[0.06] px-3 py-2 text-[11px] text-text"
            />
            <TextInput
              value={votacionOpciones}
              onChangeText={setVotacionOpciones}
              placeholder="Opciones separadas por coma (por defecto: Sí, No, Abstención)"
              placeholderTextColor={t.textMuted}
              className="rounded-xl border border-text/10 bg-text/[0.06] px-3 py-2 text-[11px] text-text"
            />
            <Pressable
              onPress={() =>
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
              accessibilityRole="button"
              className="items-center rounded-xl bg-text py-2"
              style={{ opacity: !votacionTitulo.trim() || busy !== null ? 0.3 : 1 }}
            >
              <Text className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {busy === 'crear-votacion' ? 'Creando…' : 'Crear votación'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {votaciones.length === 0 ? (
          <Text className="text-[11px] text-text/55">Todavía no hay votaciones.</Text>
        ) : (
          <View className="gap-1.5">
            {votaciones.map((v) => (
              <View
                key={v.id}
                className={`flex-row items-center gap-2 rounded-xl border px-3 py-2 ${
                  v.activa
                    ? 'border-text/30 bg-text/[0.06]'
                    : 'border-text/[0.08] bg-text/[0.02]'
                }`}
              >
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-[11px] font-semibold text-text">
                    {v.titulo}
                  </Text>
                  <Text className="text-[9px] text-text/60">
                    {(v.opciones ?? []).join(' · ')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => run(`vot-${v.id}`, () => onToggleVotacion(v.id, !v.activa))}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  className={`rounded-lg px-2.5 py-1 ${
                    v.activa ? 'bg-accent' : 'border border-text/[0.12] bg-text/10'
                  }`}
                  style={{ opacity: busy !== null ? 0.5 : 1 }}
                >
                  <Text
                    className={`text-[9px] font-bold uppercase ${
                      v.activa ? 'text-on-accent' : 'text-text'
                    }`}
                  >
                    {v.activa ? 'Cerrar' : 'Abrir'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Poderes */}
      {poderes.length > 0 ? (
        <View>
          <SectionTitle icon={<FileCheck size={11} color={t.textMuted} />}>
            {`Poderes · ${poderesPendientes.length} por verificar`}
          </SectionTitle>
          <View className="gap-1.5">
            {poderes.map((p) => (
              <View
                key={p.id}
                className="flex-row items-center gap-2 rounded-xl border border-text/[0.08] bg-text/[0.02] px-3 py-2"
              >
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-[10px] text-text/70">
                    {`${p.otorganteId.slice(0, 8)}… → ${p.apoderadoId.slice(0, 8)}…`}
                  </Text>
                  <Pressable
                    onPress={() => {
                      WebBrowser.openBrowserAsync(p.documentoUrl).catch(() => {});
                    }}
                    accessibilityRole="link"
                  >
                    <Text className="text-[9px] text-text/60 underline">Ver documento</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => run(`poder-${p.id}`, () => onVerifyPoder(p.id, !p.verificado))}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  className={`rounded-lg px-2.5 py-1 ${
                    p.verificado ? 'bg-text' : 'border border-text/[0.12] bg-text/10'
                  }`}
                  style={{ opacity: busy !== null ? 0.5 : 1 }}
                >
                  <Text
                    className={`text-[9px] font-bold uppercase ${
                      p.verificado ? 'text-primary' : 'text-text'
                    }`}
                  >
                    {p.verificado ? 'Verificado' : 'Verificar'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
