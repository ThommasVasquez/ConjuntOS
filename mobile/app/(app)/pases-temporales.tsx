/**
 * PASES TEMPORALES - CONJUNTOSAPP (mobile port)
 * Gestión de pases para huéspedes de alquiler corto (AirBnB).
 *
 * Ported from web src/app/(app)/pases-temporales/page.tsx. Behavior preserved:
 *  - roles PROPIETARIO / ADMINISTRADOR / SUPER_ADMIN (others get the same
 *    toast + redirect to /inicio as web; unauthenticated users go to /login)
 *  - list = GET /pases-temporales/mis-pases (+ silent refetch on WS
 *    'pase_temporal')
 *  - create = POST /pases-temporales (CrearPaseTemporalRequest, snake_case);
 *    unidad comes from the authenticated user (one unit per propietario)
 *  - edit = PUT /pases-temporales/{id} (unidad_id immutable — not edited)
 *  - revoke = PUT /pases-temporales/{id}/revocar (native confirm first)
 *  - codigo_acceso copied via expo-clipboard
 *  - "Mensajes" deep-links to /chat?huespedId=<usuario_id> when the pase has
 *    a linked usuario_id
 *
 * Intentional divergences from web (documented, not accidental):
 *  1. Fechas: web uses `<input type="date">` (page.tsx:314-331) so the browser
 *     guarantees a real YYYY-MM-DD value. RN has no equivalent primitive and no
 *     date-picker dependency is installed, so the two fields keep the
 *     `AAAA-MM-DD` mask, auto-format the digits, and are validated (real
 *     calendar date + fin >= inicio) before POST/PUT.
 *  2. Revocar shows a native confirmation Alert; web (page.tsx:516) fires the
 *     PUT immediately. Kept because the action is destructive and irreversible
 *     on a phone.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Calendar,
  Car,
  ClipboardList,
  DoorOpen,
  Dumbbell,
  Megaphone,
  MessageCircle,
  Pencil,
  PlusCircle,
  ShieldAlert,
  Users,
  Waves,
  XCircle,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { GlassCard } from '@/components/ui/GlassCard';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import type {
  CrearPaseTemporalRequest,
  PaseTemporalDto,
  VehiculoTemporalInput,
} from '@/lib/api/types';

const ALLOWED_ROLES = ['PROPIETARIO', 'ADMINISTRADOR', 'SUPER_ADMIN'];

type FormData = Omit<CrearPaseTemporalRequest, 'fecha_inicio' | 'fecha_fin'> & {
  fecha_inicio: string;
  fecha_fin: string;
};

const PERMISOS = [
  { key: 'permiso_gimnasio', label: 'Gimnasio', Icon: Dumbbell },
  { key: 'permiso_piscina', label: 'Piscina', Icon: Waves },
  { key: 'permiso_entrada_salida', label: 'Entrada/Salida', Icon: DoorOpen },
  { key: 'permiso_vehiculo', label: 'Vehículo', Icon: Car },
  { key: 'permiso_asamblea', label: 'Asamblea', Icon: Megaphone },
] as const;

/** Web `font-display font-medium` — the Plus Jakarta Sans 500 face. */
const DISPLAY_MEDIUM = 'PlusJakartaSans_500Medium';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Keeps typing inside the `AAAA-MM-DD` shape web gets for free from `type="date"`. */
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)]
    .filter((p) => p.length > 0)
    .join('-');
}

/** `true` only for a complete, real calendar date in YYYY-MM-DD. */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/**
 * Estado badge tints — ported VERBATIM from web getEstadoBadge
 * (page.tsx:190-197): token classes, no hex literals.
 */
function getEstadoBadge(estado: string): {
  bg: string;
  border: string;
  text: string;
  label: string;
} {
  switch (estado) {
    case 'ACTIVO':
      return {
        bg: 'bg-success/10',
        border: 'border-success/30',
        text: 'text-success',
        label: 'ACTIVO',
      };
    case 'EXPIRADO':
      return {
        bg: 'bg-text/10',
        border: 'border-text/30',
        text: 'text-text',
        label: 'EXPIRADO',
      };
    case 'REVOCADO':
      return {
        bg: 'bg-danger/10',
        border: 'border-danger/30',
        text: 'text-danger',
        label: 'REVOCADO',
      };
    default:
      return {
        bg: 'bg-text/10',
        border: 'border-text/30',
        text: 'text-text',
        label: estado,
      };
  }
}

/** Permission chip — mirrors the web PermisoIcon pill (page.tsx:207-211). */
function PermisoChip({ activo, label }: { activo: boolean; label: string }) {
  return (
    <View
      className={`rounded-full border px-2 py-1 ${
        activo ? 'border-accent/30 bg-accent/10' : 'border-border bg-text/5'
      }`}
    >
      <Text
        className={`text-[9px] font-bold uppercase tracking-wider ${
          activo ? 'text-accent' : 'text-text/40'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * TextInput carrying the web inputs' `focus:border-accent` behaviour
 * (page.tsx:252, 270, 281, 295, 305, 319, 329, 388-421).
 */
function FieldInput({
  className = '',
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & { className?: string }) {
  const [focused, setFocused] = useState(false);
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  return (
    <TextInput
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      placeholderTextColor={tokens.textMuted}
      className={`rounded-xl border bg-surface2 text-xs text-text ${
        focused ? 'border-accent' : 'border-border'
      } ${className}`}
    />
  );
}

const EMPTY_VEHICULO: VehiculoTemporalInput = { placa: '', marca: '', modelo: '', color: '' };

export default function PasesTemporalesScreen() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;
  const allowed = !!role && ALLOWED_ROLES.includes(role);
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  /** `shadow-lg shadow-accent/20` / `shadow-xl shadow-accent/20` (page.tsx:227, 431). */
  const accentGlow = {
    shadowColor: tokens.accent,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  };

  const [pases, setPases] = useState<PaseTemporalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unidades, setUnidades] = useState<{ id: string; numero: string; torre?: string }[]>([]);

  const emptyForm = (): FormData => ({
    unidad_id: '',
    nombre_anfitrion: user?.nombre || '',
    nombre_huesped: '',
    email_huesped: '',
    telefono_huesped: '',
    fecha_inicio: '',
    fecha_fin: '',
    permiso_gimnasio: false,
    permiso_piscina: false,
    permiso_entrada_salida: true,
    permiso_vehiculo: false,
    permiso_asamblea: false,
    vehiculos: [],
  });

  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [vehiculosForm, setVehiculosForm] = useState<VehiculoTemporalInput[]>([
    { ...EMPTY_VEHICULO },
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchPases = async () => {
    try {
      const data = await api.get<PaseTemporalDto[]>('/pases-temporales/mis-pases');
      setPases(data);
    } catch {
      toast.error('Error al cargar pases temporales');
    } finally {
      setLoading(false);
    }
  };

  useWsSubscription('pase_temporal', () => {
    void fetchPases();
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as never);
      return;
    }
    // Web (page.tsx:83-88): toast + redirect to /inicio for any other role.
    if (!allowed) {
      toast.error('Solo propietarios pueden acceder a esta sección.');
      router.replace('/(app)/inicio' as never);
      return;
    }

    void fetchPases();

    // Use user's unit from auth context — each propietario has one unit.
    if (user.unidadId) {
      const u = {
        id: user.unidadId,
        numero: user.apto || user.torre || user.unidadId.slice(0, 8),
        torre: user.torre || undefined,
      };
      setUnidades([u]);
      setFormData((prev) => (prev.unidad_id ? prev : { ...prev, unidad_id: u.id }));
    }
    setFormData((prev) => ({ ...prev, nombre_anfitrion: user.nombre || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role]);

  const resetForm = () => {
    setFormData(emptyForm());
    setVehiculosForm([{ ...EMPTY_VEHICULO }]);
  };

  const handleSubmit = async () => {
    if (!formData.nombre_huesped || !formData.fecha_inicio || !formData.fecha_fin) {
      toast.error('Campos obligatorios: huésped y fechas');
      return;
    }
    // Web delegates this to <input type="date">; RN must validate by hand.
    if (!isRealDate(formData.fecha_inicio) || !isRealDate(formData.fecha_fin)) {
      toast.error('Fechas inválidas: usa el formato AAAA-MM-DD');
      return;
    }
    if (formData.fecha_fin < formData.fecha_inicio) {
      toast.error('La fecha fin debe ser posterior a la fecha inicio');
      return;
    }
    if (!editingId && !formData.unidad_id) {
      toast.error('Selecciona una unidad');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        vehiculos: formData.permiso_vehiculo
          ? vehiculosForm.filter((v) => v.placa.trim())
          : undefined,
      };
      if (editingId) {
        // PUT: enviar solo campos presentes (unidad_id inmutable)
        await api.put<PaseTemporalDto>(`/pases-temporales/${editingId}`, payload);
        toast.success('Pase actualizado');
      } else {
        await api.post<PaseTemporalDto>('/pases-temporales', payload);
        toast.success('Pase temporal emitido exitosamente');
      }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      void fetchPases();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Error al guardar pase');
    } finally {
      setIsSubmitting(false);
    }
  };

  const revocarPase = async (paseId: string) => {
    try {
      await api.put(`/pases-temporales/${paseId}/revocar`, {});
      toast.success('Pase revocado exitosamente');
      void fetchPases();
    } catch {
      toast.error('Error al revocar el pase');
    }
  };

  const handleRevocar = (pase: PaseTemporalDto) => {
    Alert.alert(
      'Revocar pase',
      `¿Revocar el pase de ${pase.nombre_huesped}? El huésped perderá el acceso.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Revocar', style: 'destructive', onPress: () => void revocarPase(pase.id) },
      ],
    );
  };

  const startEditing = (pase: PaseTemporalDto) => {
    setEditingId(pase.id);
    setFormData({
      unidad_id: '', // no se edita
      nombre_anfitrion: pase.nombre_anfitrion,
      nombre_huesped: pase.nombre_huesped,
      email_huesped: pase.email_huesped || '',
      telefono_huesped: pase.telefono_huesped || '',
      fecha_inicio: pase.fecha_inicio,
      fecha_fin: pase.fecha_fin,
      permiso_gimnasio: pase.permiso_gimnasio,
      permiso_piscina: pase.permiso_piscina,
      permiso_entrada_salida: pase.permiso_entrada_salida,
      permiso_vehiculo: pase.permiso_vehiculo,
      permiso_asamblea: pase.permiso_asamblea,
      vehiculos: [],
    });
    if (pase.vehiculos.length > 0) {
      setVehiculosForm(
        pase.vehiculos.map((v) => ({
          placa: v.placa,
          marca: v.marca || '',
          modelo: v.modelo || '',
          color: v.color || '',
        })),
      );
    } else {
      setVehiculosForm([{ ...EMPTY_VEHICULO }]);
    }
    setShowForm(true);
  };

  const handleCopyCodigo = async (codigo: string) => {
    try {
      await Clipboard.setStringAsync(codigo);
      toast.success('Código copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar el código');
    }
  };

  const updateVehiculo = (index: number, patch: Partial<VehiculoTemporalInput>) => {
    setVehiculosForm((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  // Full-screen block ONLY while auth resolves (web page.tsx:199-205); the list
  // gets its own in-place spinner so the chrome stays visible.
  if (authLoading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={tokens.accent} />
        </View>
      </Screen>
    );
  }

  // Unauthenticated / unauthorized: the effect above already toasted and
  // redirected (same as web), so render nothing.
  if (!user || !allowed) return null;

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-6 px-6 pt-4">
        <ProfileHeader />

        {/* Header + toggle form */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              {/* Web h1 is `font-display font-medium` (page.tsx:219) = Plus
                  Jakarta Sans @500. The `font-display` alias resolves to the
                  700 face, so name the exact loaded 500 face. */}
              <Text
                className="text-2xl tracking-wide text-text"
                style={{ fontFamily: DISPLAY_MEDIUM }}
              >
                Pases Temporales
              </Text>
              <Text className="text-sm text-text">
                Huéspedes de alquiler corto (AirBnB)
              </Text>
            </View>
            <Pressable
              onPress={() => {
                if (showForm) {
                  setEditingId(null);
                  resetForm();
                }
                setShowForm((v) => !v);
              }}
              style={({ pressed }) => [
                accentGlow,
                { transform: [{ scale: pressed ? 0.95 : 1 }] },
              ]}
              className="flex-row items-center gap-2 rounded-2xl bg-accent px-5 py-3"
            >
              {showForm ? (
                <XCircle size={16} color={tokens.onAccent} />
              ) : (
                <PlusCircle size={16} color={tokens.onAccent} />
              )}
              <Text className="text-xs font-bold uppercase tracking-widest text-on-accent">
                {showForm ? 'Cancelar' : 'Nuevo Pase'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Formulario */}
        {showForm ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            {/* web `liquid-glass-card` (page.tsx:238) → variant="card" */}
            <GlassCard variant="card" className="rounded-[28px] p-6">
              <View className="flex flex-col gap-4">
                <View className="border-b border-border pb-2">
                  <Text className="text-base font-bold text-text">
                    {editingId ? 'Editar Pase Temporal' : 'Emitir Pase Temporal'}
                  </Text>
                </View>

                {/* Unidad — solo al crear */}
                {!editingId ? (
                  <View className="flex flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                      Unidad *
                    </Text>
                    {unidades.length === 0 ? (
                      <View className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
                        <Text className="text-xs text-danger">Selecciona una unidad</Text>
                      </View>
                    ) : (
                      unidades.map((u) => {
                        const selected = formData.unidad_id === u.id;
                        return (
                          <Pressable
                            key={u.id}
                            onPress={() =>
                              setFormData((prev) => ({ ...prev, unidad_id: u.id }))
                            }
                            className={`rounded-xl border px-4 py-3 ${
                              selected
                                ? 'border-accent bg-accent/10'
                                : 'border-border bg-surface2'
                            }`}
                          >
                            <Text
                              className={`text-xs ${selected ? 'text-accent' : 'text-text'}`}
                            >
                              {u.torre ? `Torre ${u.torre} - ` : ''}Apto {u.numero}
                            </Text>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                ) : null}

                {/* Anfitrión */}
                <View className="flex flex-col gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                    Anfitrión
                  </Text>
                  <FieldInput
                    value={formData.nombre_anfitrion}
                    onChangeText={(t) =>
                      setFormData((prev) => ({ ...prev, nombre_anfitrion: t }))
                    }
                    className="px-4 py-3"
                  />
                </View>

                {/* Huésped */}
                <View className="flex flex-col gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                    Huésped *
                  </Text>
                  <FieldInput
                    value={formData.nombre_huesped}
                    onChangeText={(t) =>
                      setFormData((prev) => ({ ...prev, nombre_huesped: t }))
                    }
                    placeholder="Nombre del huésped"
                    className="px-4 py-3"
                  />
                </View>

                {/* Email y Teléfono */}
                <View className="flex-row gap-4">
                  <View className="flex-1 flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                      Email
                    </Text>
                    <FieldInput
                      value={formData.email_huesped || ''}
                      onChangeText={(t) =>
                        setFormData((prev) => ({ ...prev, email_huesped: t }))
                      }
                      placeholder="huesped@email.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      className="px-4 py-3"
                    />
                  </View>
                  <View className="flex-1 flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                      Teléfono
                    </Text>
                    <FieldInput
                      value={formData.telefono_huesped || ''}
                      onChangeText={(t) =>
                        setFormData((prev) => ({ ...prev, telefono_huesped: t }))
                      }
                      placeholder="+57 300..."
                      keyboardType="phone-pad"
                      className="px-4 py-3"
                    />
                  </View>
                </View>

                {/* Fechas (YYYY-MM-DD, como el input date del web) */}
                <View className="flex-row gap-4">
                  <View className="flex-1 flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                      Fecha Inicio *
                    </Text>
                    <FieldInput
                      value={formData.fecha_inicio}
                      onChangeText={(t) =>
                        setFormData((prev) => ({
                          ...prev,
                          fecha_inicio: formatDateInput(t),
                        }))
                      }
                      placeholder="AAAA-MM-DD"
                      autoCapitalize="none"
                      keyboardType="number-pad"
                      maxLength={10}
                      className="px-4 py-3"
                    />
                  </View>
                  <View className="flex-1 flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                      Fecha Fin *
                    </Text>
                    <FieldInput
                      value={formData.fecha_fin}
                      onChangeText={(t) =>
                        setFormData((prev) => ({ ...prev, fecha_fin: formatDateInput(t) }))
                      }
                      placeholder="AAAA-MM-DD"
                      autoCapitalize="none"
                      keyboardType="number-pad"
                      maxLength={10}
                      className="px-4 py-3"
                    />
                  </View>
                </View>

                {/* Permisos */}
                <View className="flex flex-col gap-2">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                    Permisos
                  </Text>
                  <View className="flex-row flex-wrap gap-3">
                    {PERMISOS.map(({ key, label, Icon }) => {
                      const active = formData[key];
                      return (
                        <Pressable
                          key={key}
                          onPress={() =>
                            setFormData((prev) => ({ ...prev, [key]: !prev[key] }))
                          }
                          className={`flex-row items-center gap-2 rounded-xl border p-3 ${
                            active
                              ? 'border-accent/30 bg-accent/10'
                              : 'border-border bg-surface2'
                          }`}
                          style={{ width: '47%' }}
                        >
                          <Icon size={14} color={active ? tokens.accent : tokens.text} />
                          <Text
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              active ? 'text-accent' : 'text-text'
                            }`}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Vehículos (si permiso_vehiculo está activo) */}
                {formData.permiso_vehiculo ? (
                  <View className="flex flex-col gap-3 rounded-2xl border border-border bg-surface2 p-4">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[10px] font-black uppercase tracking-[2px] text-text">
                        Vehículos Autorizados
                      </Text>
                      <Pressable
                        onPress={() =>
                          setVehiculosForm((prev) => [...prev, { ...EMPTY_VEHICULO }])
                        }
                        className="flex-row items-center gap-1"
                      >
                        <PlusCircle size={12} color={tokens.accent} />
                        <Text className="text-[10px] font-bold uppercase tracking-wider text-accent">
                          Agregar
                        </Text>
                      </Pressable>
                    </View>
                    {vehiculosForm.map((v, i) => (
                      // Web is `grid grid-cols-4` (page.tsx:378); on a phone four
                      // 25% columns truncate "Placa *", so the same four fields
                      // wrap 2x2.
                      <View key={i} className="flex-row flex-wrap gap-2">
                        <FieldInput
                          value={v.placa}
                          onChangeText={(t) => updateVehiculo(i, { placa: t })}
                          placeholder="Placa *"
                          autoCapitalize="characters"
                          style={{ width: '48%' }}
                          className="px-3 py-2"
                        />
                        <FieldInput
                          value={v.marca || ''}
                          onChangeText={(t) => updateVehiculo(i, { marca: t })}
                          placeholder="Marca"
                          style={{ width: '48%' }}
                          className="px-3 py-2"
                        />
                        <FieldInput
                          value={v.modelo || ''}
                          onChangeText={(t) => updateVehiculo(i, { modelo: t })}
                          placeholder="Modelo"
                          style={{ width: '48%' }}
                          className="px-3 py-2"
                        />
                        <FieldInput
                          value={v.color || ''}
                          onChangeText={(t) => updateVehiculo(i, { color: t })}
                          placeholder="Color"
                          style={{ width: '48%' }}
                          className="px-3 py-2"
                        />
                      </View>
                    ))}
                  </View>
                ) : null}

                <Pressable
                  onPress={() => void handleSubmit()}
                  disabled={isSubmitting}
                  style={({ pressed }) => [
                    accentGlow,
                    { opacity: isSubmitting ? 0.5 : pressed ? 0.9 : 1 },
                  ]}
                  className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-accent py-4"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={tokens.onAccent} />
                  ) : null}
                  <Text className="text-xs font-bold uppercase tracking-widest text-on-accent">
                    {isSubmitting
                      ? editingId
                        ? 'Guardando...'
                        : 'Emitiendo...'
                      : editingId
                        ? 'Guardar Cambios'
                        : 'Emitir Pase Temporal'}
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          </Animated.View>
        ) : null}

        {/* Lista de pases */}
        <Animated.View entering={FadeInDown.duration(500).delay(80)}>
          <View className="flex flex-col gap-4">
            <Text className="px-1 text-xs font-black uppercase tracking-[2px] text-text">
              Pases Emitidos ({pases.length})
            </Text>

            {loading ? (
              // Web: small in-list pulse, chrome stays visible (page.tsx:445-447).
              <View className="w-full items-center justify-center py-10">
                <ActivityIndicator color={tokens.accent} />
              </View>
            ) : pases.length === 0 ? (
              <GlassCard className="rounded-3xl p-8">
                <Text className="text-center text-xs italic text-text">
                  No has emitido ningún pase temporal.
                </Text>
              </GlassCard>
            ) : (
              pases.map((pase, i) => {
                const badge = getEstadoBadge(pase.estado);
                return (
                  <Animated.View
                    key={pase.id}
                    entering={FadeInDown.duration(400).delay(i * 60)}
                  >
                    {/* web `liquid-glass-card` (page.tsx:456) → variant="card" */}
                    <GlassCard variant="card" className="rounded-2xl p-5">
                      <View className="flex flex-col gap-3">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1">
                            <View className="mb-1 flex-row items-center gap-2">
                              <Users size={14} color={tokens.accent} />
                              <Text className="text-sm font-bold text-text">
                                {pase.nombre_huesped}
                              </Text>
                            </View>
                            <Text className="text-[10px] text-text">
                              Anfitrión: {pase.nombre_anfitrion}
                            </Text>
                          </View>
                          <View
                            className={`rounded-full border px-2.5 py-0.5 ${badge.bg} ${badge.border}`}
                          >
                            <Text
                              className={`text-[9px] font-black uppercase tracking-widest ${badge.text}`}
                            >
                              {badge.label}
                            </Text>
                          </View>
                        </View>

                        {/* Fechas */}
                        <View className="flex-row items-center gap-2 rounded-xl border border-border bg-surface2 px-3 py-2">
                          <Calendar size={12} color={tokens.text} />
                          <Text className="text-[10px] text-text">
                            {pase.fecha_inicio} → {pase.fecha_fin}
                          </Text>
                        </View>

                        {/* Permisos */}
                        <View className="flex-row flex-wrap gap-1.5">
                          <PermisoChip activo={pase.permiso_gimnasio} label="Gimnasio" />
                          <PermisoChip activo={pase.permiso_piscina} label="Piscina" />
                          <PermisoChip
                            activo={pase.permiso_entrada_salida}
                            label="Entrada/Salida"
                          />
                          <PermisoChip activo={pase.permiso_vehiculo} label="Vehículo" />
                          <PermisoChip activo={pase.permiso_asamblea} label="Asamblea" />
                        </View>

                        {/* Código y acciones — web keeps both on ONE wrapping
                            row: `flex items-center justify-between flex-wrap
                            gap-2` (page.tsx:486). */}
                        <View className="flex-row flex-wrap items-center justify-between gap-2">
                          <Pressable
                            onPress={() => void handleCopyCodigo(pase.codigo_acceso)}
                            accessibilityLabel="Copiar código de acceso"
                            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                            className="flex-row items-center gap-2"
                          >
                            <ClipboardList size={14} color={tokens.accent} />
                            <Text className="font-mono text-[10px] font-bold tracking-wider text-text">
                              {pase.codigo_acceso}
                            </Text>
                          </Pressable>

                          {/* Acciones — solo pases activos */}
                          {pase.estado === 'ACTIVO' ? (
                            // `shrink` so the three pills wrap inside the card
                            // instead of overflowing it on a narrow phone.
                            <View className="shrink flex-row flex-wrap items-center gap-2">
                              {pase.usuario_id ? (
                                <Pressable
                                  onPress={() =>
                                    router.push(
                                      `/(app)/chat?huespedId=${pase.usuario_id}` as never,
                                    )
                                  }
                                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                  className="flex-row items-center gap-1 rounded-full border border-success/30 bg-success/10 px-3 py-1"
                                >
                                  <MessageCircle size={12} color={tokens.success} />
                                  <Text className="text-[10px] font-bold uppercase tracking-widest text-success">
                                    Mensajes
                                  </Text>
                                </Pressable>
                              ) : null}
                              <Pressable
                                onPress={() => startEditing(pase)}
                                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                className="flex-row items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-3 py-1"
                              >
                                <Pencil size={12} color={tokens.accent} />
                                <Text className="text-[10px] font-bold uppercase tracking-widest text-accent">
                                  Editar
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => handleRevocar(pase)}
                                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                className="flex-row items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-3 py-1"
                              >
                                <ShieldAlert size={12} color={tokens.danger} />
                                <Text className="text-[10px] font-bold uppercase tracking-widest text-danger">
                                  Revocar
                                </Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>

                        {/* Vehículos del pase */}
                        {pase.vehiculos.length > 0 ? (
                          <View className="flex-row flex-wrap gap-1.5 border-t border-border pt-2">
                            {pase.vehiculos.map((v) => (
                              <View
                                key={v.id}
                                className="flex-row items-center gap-1 rounded-full border border-border bg-text/5 px-2 py-1"
                              >
                                <Car size={10} color={tokens.text} />
                                <Text className="text-[9px] font-bold uppercase tracking-wider text-text">
                                  {v.placa}
                                  {v.marca ? ` (${v.marca})` : ''}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </GlassCard>
                  </Animated.View>
                );
              })
            )}
          </View>
        </Animated.View>
      </View>
    </Screen>
  );
}
