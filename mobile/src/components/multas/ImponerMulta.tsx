/**
 * ImponerMulta (mobile port of web src/components/multas/ImponerMulta.tsx).
 *
 * Admin-only: issue a fine to a resident. Self-gates by role (renders nothing
 * for non-admins), exactly like the web component.
 *
 * Web → RN mappings:
 *  - `<select>` residente  → full-screen slide-up Modal list (paqueteria's
 *    picker pattern, but Modal-based so it works inside a ScrollView).
 *  - `<input type="date">` → token-styled stepper row (Hoy / +1 día /
 *    +1 semana / Limpiar). No date-picker dependency is added.
 *  - Web's raw `red-500` utilities map onto the `danger` token (the palette
 *    rule: never write a raw hex/off-palette color in a component).
 */

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { ArrowRight, Calendar, CheckCircle2, Gavel, X } from 'lucide-react-native';

import { toast } from '@/components/ui/toast';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api/client';
import type { CrearMultaRequest, DirectorioEntradaDto } from '@/lib/api/types';
import { useTheme } from '@/providers/ThemeProvider';
import { onSemantic, tokensFor } from '@/theme/tokens';

/** Same shape the web component consumes from `GET /directorio`. */
type Residente = Pick<DirectorioEntradaDto, 'id' | 'nombre' | 'torre' | 'apto'>;

const ADMIN_ROLES = ['ADMINISTRADOR', 'CONCEJO', 'SUPER_ADMIN'];

/** `YYYY-MM-DD` (the value shape a web `<input type="date">` submits). */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, days: number): string {
  const base = iso ? new Date(`${iso}T00:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return toIsoDate(base);
}

/** Label for the residente option — identical to the web `<option>` text. */
function residenteLabel(r: Residente): string {
  return `${r.nombre}${r.torre && r.apto ? ` — Torre ${r.torre} Apto ${r.apto}` : ''}`;
}

/** Admin-only: issue a fine to a resident. Self-gates by role. */
export default function ImponerMulta({ casoId }: { casoId?: string }) {
  const role = useAuth((s) => s.user?.rol);
  const isAdmin = !!role && ADMIN_ROLES.includes(role);
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const dangerInk = onSemantic(theme);

  const [open, setOpen] = useState(false);
  const [residentes, setResidentes] = useState<Residente[]>([]);
  const [usuarioId, setUsuarioId] = useState('');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open && residentes.length === 0) {
      api
        .get<Residente[]>('/directorio')
        .then(setResidentes)
        .catch(() => {});
    }
  }, [open, residentes.length]);

  if (!isAdmin) return null;

  const selected = residentes.find((r) => r.id === usuarioId) ?? null;

  async function emitir() {
    if (!usuarioId || !monto || !motivo.trim()) {
      toast.error('Completa residente, monto y motivo');
      return;
    }
    setBusy(true);
    try {
      const body: CrearMultaRequest = {
        usuarioId,
        casoId,
        monto,
        motivo: motivo.trim(),
        fechaLimite: fechaLimite || undefined,
      };
      await api.post('/multas', body);
      toast.success('Multa impuesta y notificada');
      setOpen(false);
      setUsuarioId('');
      setMonto('');
      setMotivo('');
      setFechaLimite('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'No se pudo imponer la multa');
    } finally {
      setBusy(false);
    }
  }

  // Collapsed state — the CTA row.
  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
        className="w-full flex-row items-center justify-between gap-2 rounded-2xl border border-danger/20 bg-danger/10 px-5 py-4"
      >
        <View className="flex-row items-center gap-2.5">
          <Gavel size={18} color={t.danger} />
          <Text className="text-sm font-bold text-danger">Imponer multa</Text>
        </View>
        <ArrowRight size={18} color={t.danger} />
      </Pressable>
    );
  }

  return (
    <LiquidGlass radius={24} className="w-full rounded-3xl border border-danger/30">
      <View className="flex-col gap-3 p-5">
        <View className="flex-row items-center gap-2">
          <Gavel size={16} color={t.danger} />
          {/* web `text-text font-bold` on a div inherits the 16px body size. */}
          <Text className="text-base font-bold text-text">Imponer multa</Text>
        </View>

        {/* Residente picker (web <select>) */}
        <Pressable
          accessibilityRole="button"
          onPress={() => setPickerOpen(true)}
          className="w-full rounded-2xl border border-border bg-primary-light/50 px-4 py-3"
        >
          <Text
            className="text-sm text-text"
            numberOfLines={1}
            style={{ opacity: selected ? 1 : 0.6 }}
          >
            {selected ? residenteLabel(selected) : 'Selecciona residente…'}
          </Text>
        </Pressable>

        <TextInput
          value={monto}
          onChangeText={(v) => setMonto(v.replace(/[^\d.]/g, ''))}
          keyboardType="numeric"
          placeholder="Monto (COP)"
          placeholderTextColor={t.textMuted}
          className="w-full rounded-2xl border border-border bg-primary-light/50 px-4 py-3 text-sm text-text"
        />

        <TextInput
          value={motivo}
          onChangeText={setMotivo}
          placeholder="Motivo de la multa"
          placeholderTextColor={t.textMuted}
          multiline
          textAlignVertical="top"
          className="min-h-[64px] w-full rounded-2xl border border-border bg-primary-light/50 px-4 py-3 text-sm text-text"
        />

        {/* Fecha límite (web <input type="date">) */}
        <View className="w-full rounded-2xl border border-border bg-primary-light/50 px-4 py-3">
          <View className="flex-row items-center gap-2">
            <Calendar size={14} color={t.textMuted} />
            <Text className="text-sm text-text" style={{ opacity: fechaLimite ? 1 : 0.6 }}>
              {fechaLimite || 'Fecha límite'}
            </Text>
          </View>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {[
              { l: 'Hoy', get: () => toIsoDate(new Date()) },
              { l: '+1 día', get: () => addDays(fechaLimite, 1) },
              { l: '+1 semana', get: () => addDays(fechaLimite, 7) },
            ].map((opt) => (
              <Pressable
                key={opt.l}
                accessibilityRole="button"
                onPress={() => setFechaLimite(opt.get())}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                className="rounded-xl border border-border bg-surface2 px-3 py-2"
              >
                <Text className="text-[11px] font-bold text-text">{opt.l}</Text>
              </Pressable>
            ))}
            {fechaLimite ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setFechaLimite('')}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                className="flex-row items-center gap-1 rounded-xl border border-border bg-surface2 px-3 py-2"
              >
                <X size={12} color={t.text} />
                <Text className="text-[11px] font-bold text-text">Limpiar</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            className="flex-1 items-center rounded-2xl border border-border bg-text/10 py-3"
          >
            <Text className="text-sm font-bold text-text">Cancelar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() => void emitir()}
            style={({ pressed }) => ({ opacity: busy ? 0.5 : pressed ? 0.85 : 1 })}
            className="flex-1 items-center rounded-2xl bg-danger py-3"
          >
            <Text className="text-sm font-bold" style={{ color: dangerInk }}>
              {busy ? 'Imponiendo…' : 'Imponer'}
            </Text>
          </Pressable>
        </View>
      </View>

      <ResidentePicker
        open={pickerOpen}
        residentes={residentes}
        selectedId={usuarioId}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          setUsuarioId(id);
          setPickerOpen(false);
        }}
      />
    </LiquidGlass>
  );
}

// ---------------------------------------------------------------------------
// Residente picker — slide-up Modal list replacing the web <select>.
// ---------------------------------------------------------------------------

interface ResidentePickerProps {
  open: boolean;
  residentes: Residente[];
  selectedId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}

function ResidentePicker({
  open,
  residentes,
  selectedId,
  onClose,
  onSelect,
}: ResidentePickerProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = tokensFor(theme);

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={onClose}
          className="absolute inset-0 bg-black/80"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(400)}
            className="max-h-[80%] overflow-hidden rounded-t-[32px] border border-border bg-primary"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <View className="flex-row items-center justify-between px-6 py-4">
              <Text className="text-base font-bold text-text">Selecciona residente…</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                onPress={onClose}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-full bg-surface2"
              >
                <X size={16} color={t.text} />
              </Pressable>
            </View>

            {residentes.length === 0 ? (
              <Text className="px-6 pb-6 text-center text-sm text-textMuted">
                No hay residentes en el directorio.
              </Text>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
              >
                {residentes.map((r) => (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    onPress={() => onSelect(r.id)}
                    className="flex-row items-center justify-between border-b border-border py-3.5"
                  >
                    <Text className="flex-1 pr-2 text-sm text-text" numberOfLines={1}>
                      {residenteLabel(r)}
                    </Text>
                    {r.id === selectedId ? (
                      <CheckCircle2 size={18} color={t.accent} />
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
