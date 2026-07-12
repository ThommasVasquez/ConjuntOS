/**
 * PASES TEMPORALES - CONJUNTOSAPP (mobile port)
 * Gestión de pases para huéspedes de alquiler corto (AirBnB).
 *
 * Ported from web src/app/(app)/pases-temporales/page.tsx. Behavior preserved:
 *  - roles PROPIETARIO / ADMINISTRADOR / SUPER_ADMIN (others get a friendly
 *    block instead of the web redirect; unauthenticated users go to /login)
 *  - list = GET /pases-temporales/mis-pases (+ silent refetch on WS
 *    'pase_temporal')
 *  - create = POST /pases-temporales (CrearPaseTemporalRequest, snake_case);
 *    unidad comes from the authenticated user (one unit per propietario)
 *  - edit = PUT /pases-temporales/{id} (unidad_id immutable — not edited)
 *  - revoke = PUT /pases-temporales/{id}/revocar (native confirm first)
 *  - codigo_acceso copied via expo-clipboard
 *  - "Mensajes" deep-links to /chat?huespedId=<usuario_id> when the pase has
 *    a linked usuario_id
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
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
import type {
  CrearPaseTemporalRequest,
  PaseTemporalDto,
  VehiculoTemporalInput,
} from '@/lib/api/types';

// Accent tints (accent palette only — no grays).
const INFO = '#009df2';
const INFO_BG = 'rgba(0, 157, 242, 0.1)';
const INFO_BORDER = 'rgba(0, 157, 242, 0.3)';
const SUCCESS = '#57bf00';
const SUCCESS_BG = 'rgba(87, 191, 0, 0.1)';
const SUCCESS_BORDER = 'rgba(87, 191, 0, 0.3)';
const DANGER = '#EF4444';
const DANGER_BG = 'rgba(239, 68, 68, 0.1)';
const DANGER_BORDER = 'rgba(239, 68, 68, 0.3)';
const PLACEHOLDER = 'rgba(255,255,255,0.5)';

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

/** Estado badge tints — ported from web getEstadoBadge. */
function getEstadoBadge(estado: string): {
  bg: string;
  border: string;
  color: string;
  label: string;
} {
  switch (estado) {
    case 'ACTIVO':
      return { bg: SUCCESS_BG, border: SUCCESS_BORDER, color: SUCCESS, label: 'ACTIVO' };
    case 'REVOCADO':
      return { bg: DANGER_BG, border: DANGER_BORDER, color: DANGER, label: 'REVOCADO' };
    case 'EXPIRADO':
    default:
      return { bg: 'transparent', border: '', color: '', label: estado };
  }
}

/** Permission chip — mirrors the web PermisoIcon pill. */
function PermisoChip({ activo, label }: { activo: boolean; label: string }) {
  return (
    <View
      className={`rounded-full border px-2 py-1 ${activo ? '' : 'border-border bg-surface'}`}
      style={activo ? { backgroundColor: INFO_BG, borderColor: INFO_BORDER } : undefined}
    >
      <Text
        className={`text-[9px] font-bold uppercase tracking-wider ${activo ? '' : 'text-textMuted'}`}
        style={activo ? { color: INFO } : { opacity: 0.5 }}
      >
        {label}
      </Text>
    </View>
  );
}

const EMPTY_VEHICULO: VehiculoTemporalInput = { placa: '', marca: '', modelo: '', color: '' };

export default function PasesTemporalesScreen() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;
  const allowed = !!role && ALLOWED_ROLES.includes(role);

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
    if (!allowed) return; // friendly block rendered below

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

  if (authLoading || (allowed && loading)) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </Screen>
    );
  }

  // Friendly block for roles without access (web redirects; mobile informs).
  if (user && !allowed) {
    return (
      <Screen className="bg-primary">
        <View className="flex flex-col gap-6 px-6 pt-4">
          <ProfileHeader />
          <Animated.View entering={FadeInDown.duration(500)}>
            <GlassCard className="items-center gap-4 rounded-[32px] p-8">
              <View className="h-14 w-14 items-center justify-center rounded-full border border-border bg-surface2">
                <ShieldAlert size={28} color="#FFFFFF" />
              </View>
              <Text className="text-center text-base font-bold text-text">
                Pases Temporales
              </Text>
              <Text className="text-center text-xs text-textMuted">
                Solo propietarios pueden acceder a esta sección.
              </Text>
            </GlassCard>
          </Animated.View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-6 px-6 pt-4">
        <ProfileHeader />

        {/* Header + toggle form */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-2xl font-medium tracking-wide text-text">
                Pases Temporales
              </Text>
              <Text className="text-sm text-textMuted">
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
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
              className="flex-row items-center gap-2 rounded-2xl bg-accent px-5 py-3"
            >
              {showForm ? (
                <XCircle size={16} color="#000000" />
              ) : (
                <PlusCircle size={16} color="#000000" />
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
            <GlassCard className="rounded-[28px] p-6">
              <View className="flex flex-col gap-4">
                <View className="border-b border-border pb-2">
                  <Text className="text-base font-bold text-text">
                    {editingId ? 'Editar Pase Temporal' : 'Emitir Pase Temporal'}
                  </Text>
                </View>

                {/* Unidad — solo al crear */}
                {!editingId ? (
                  <View className="flex flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-textMuted">
                      Unidad *
                    </Text>
                    {unidades.length === 0 ? (
                      <View className="rounded-xl border border-border bg-surface2 px-4 py-3">
                        <Text className="text-xs text-textMuted">Seleccionar unidad...</Text>
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
                              selected ? 'bg-surface2' : 'border-border bg-surface2'
                            }`}
                            style={selected ? { borderColor: INFO_BORDER } : undefined}
                          >
                            <Text className="text-xs text-text">
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
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-textMuted">
                    Anfitrión
                  </Text>
                  <TextInput
                    value={formData.nombre_anfitrion}
                    onChangeText={(t) =>
                      setFormData((prev) => ({ ...prev, nombre_anfitrion: t }))
                    }
                    placeholderTextColor={PLACEHOLDER}
                    className="rounded-xl border border-border bg-surface2 px-4 py-3 text-xs text-text"
                  />
                </View>

                {/* Huésped */}
                <View className="flex flex-col gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-textMuted">
                    Huésped *
                  </Text>
                  <TextInput
                    value={formData.nombre_huesped}
                    onChangeText={(t) =>
                      setFormData((prev) => ({ ...prev, nombre_huesped: t }))
                    }
                    placeholder="Nombre del huésped"
                    placeholderTextColor={PLACEHOLDER}
                    className="rounded-xl border border-border bg-surface2 px-4 py-3 text-xs text-text"
                  />
                </View>

                {/* Email y Teléfono */}
                <View className="flex-row gap-4">
                  <View className="flex-1 flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-textMuted">
                      Email
                    </Text>
                    <TextInput
                      value={formData.email_huesped || ''}
                      onChangeText={(t) =>
                        setFormData((prev) => ({ ...prev, email_huesped: t }))
                      }
                      placeholder="huesped@email.com"
                      placeholderTextColor={PLACEHOLDER}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      className="rounded-xl border border-border bg-surface2 px-4 py-3 text-xs text-text"
                    />
                  </View>
                  <View className="flex-1 flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-textMuted">
                      Teléfono
                    </Text>
                    <TextInput
                      value={formData.telefono_huesped || ''}
                      onChangeText={(t) =>
                        setFormData((prev) => ({ ...prev, telefono_huesped: t }))
                      }
                      placeholder="+57 300..."
                      placeholderTextColor={PLACEHOLDER}
                      keyboardType="phone-pad"
                      className="rounded-xl border border-border bg-surface2 px-4 py-3 text-xs text-text"
                    />
                  </View>
                </View>

                {/* Fechas (YYYY-MM-DD, como el input date del web) */}
                <View className="flex-row gap-4">
                  <View className="flex-1 flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-textMuted">
                      Fecha Inicio *
                    </Text>
                    <TextInput
                      value={formData.fecha_inicio}
                      onChangeText={(t) =>
                        setFormData((prev) => ({ ...prev, fecha_inicio: t }))
                      }
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor={PLACEHOLDER}
                      autoCapitalize="none"
                      className="rounded-xl border border-border bg-surface2 px-4 py-3 text-xs text-text"
                    />
                  </View>
                  <View className="flex-1 flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-textMuted">
                      Fecha Fin *
                    </Text>
                    <TextInput
                      value={formData.fecha_fin}
                      onChangeText={(t) =>
                        setFormData((prev) => ({ ...prev, fecha_fin: t }))
                      }
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor={PLACEHOLDER}
                      autoCapitalize="none"
                      className="rounded-xl border border-border bg-surface2 px-4 py-3 text-xs text-text"
                    />
                  </View>
                </View>

                {/* Permisos */}
                <View className="flex flex-col gap-2">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-textMuted">
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
                            active ? '' : 'border-border bg-surface2'
                          }`}
                          style={[
                            { width: '47%' },
                            active
                              ? { backgroundColor: INFO_BG, borderColor: INFO_BORDER }
                              : null,
                          ]}
                        >
                          <Icon size={14} color={active ? INFO : '#FFFFFF'} />
                          <Text
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              active ? '' : 'text-text'
                            }`}
                            style={active ? { color: INFO } : undefined}
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
                      <Text className="text-[10px] font-black uppercase tracking-[2px] text-textMuted">
                        Vehículos Autorizados
                      </Text>
                      <Pressable
                        onPress={() =>
                          setVehiculosForm((prev) => [...prev, { ...EMPTY_VEHICULO }])
                        }
                        className="flex-row items-center gap-1"
                      >
                        <PlusCircle size={12} color={INFO} />
                        <Text
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: INFO }}
                        >
                          Agregar
                        </Text>
                      </Pressable>
                    </View>
                    {vehiculosForm.map((v, i) => (
                      <View key={i} className="flex-row gap-2">
                        <TextInput
                          value={v.placa}
                          onChangeText={(t) => updateVehiculo(i, { placa: t })}
                          placeholder="Placa *"
                          placeholderTextColor={PLACEHOLDER}
                          autoCapitalize="characters"
                          className="flex-1 rounded-xl border border-border bg-surface2 px-3 py-2 text-xs text-text"
                        />
                        <TextInput
                          value={v.marca || ''}
                          onChangeText={(t) => updateVehiculo(i, { marca: t })}
                          placeholder="Marca"
                          placeholderTextColor={PLACEHOLDER}
                          className="flex-1 rounded-xl border border-border bg-surface2 px-3 py-2 text-xs text-text"
                        />
                        <TextInput
                          value={v.modelo || ''}
                          onChangeText={(t) => updateVehiculo(i, { modelo: t })}
                          placeholder="Modelo"
                          placeholderTextColor={PLACEHOLDER}
                          className="flex-1 rounded-xl border border-border bg-surface2 px-3 py-2 text-xs text-text"
                        />
                        <TextInput
                          value={v.color || ''}
                          onChangeText={(t) => updateVehiculo(i, { color: t })}
                          placeholder="Color"
                          placeholderTextColor={PLACEHOLDER}
                          className="flex-1 rounded-xl border border-border bg-surface2 px-3 py-2 text-xs text-text"
                        />
                      </View>
                    ))}
                  </View>
                ) : null}

                <Pressable
                  onPress={() => void handleSubmit()}
                  disabled={isSubmitting}
                  style={({ pressed }) => ({
                    opacity: isSubmitting ? 0.5 : pressed ? 0.9 : 1,
                  })}
                  className="mt-2 w-full items-center rounded-2xl bg-accent py-4"
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#000000" />
                  ) : (
                    <Text className="text-xs font-bold uppercase tracking-widest text-on-accent">
                      {editingId ? 'Guardar Cambios' : 'Emitir Pase Temporal'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </GlassCard>
          </Animated.View>
        ) : null}

        {/* Lista de pases */}
        <Animated.View entering={FadeInDown.duration(500).delay(80)}>
          <View className="flex flex-col gap-4">
            <Text className="px-1 text-xs font-black uppercase tracking-[2px] text-textMuted">
              Pases Emitidos ({pases.length})
            </Text>

            {pases.length === 0 ? (
              <GlassCard className="rounded-3xl p-8">
                <Text className="text-center text-xs italic text-textMuted">
                  No has emitido ningún pase temporal.
                </Text>
              </GlassCard>
            ) : (
              pases.map((pase, i) => {
                const badge = getEstadoBadge(pase.estado);
                const neutral = pase.estado !== 'ACTIVO' && pase.estado !== 'REVOCADO';
                return (
                  <Animated.View
                    key={pase.id}
                    entering={FadeInDown.duration(400).delay(i * 60)}
                  >
                    <GlassCard className="rounded-2xl p-5">
                      <View className="flex flex-col gap-3">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1">
                            <View className="mb-1 flex-row items-center gap-2">
                              <Users size={14} color={INFO} />
                              <Text className="text-sm font-bold text-text">
                                {pase.nombre_huesped}
                              </Text>
                            </View>
                            <Text className="text-[10px] text-textMuted">
                              Anfitrión: {pase.nombre_anfitrion}
                            </Text>
                          </View>
                          <View
                            className={`rounded-full border px-2.5 py-0.5 ${
                              neutral ? 'border-border bg-surface2' : ''
                            }`}
                            style={
                              neutral
                                ? undefined
                                : { backgroundColor: badge.bg, borderColor: badge.border }
                            }
                          >
                            <Text
                              className={`text-[9px] font-black uppercase tracking-widest ${
                                neutral ? 'text-text' : ''
                              }`}
                              style={neutral ? undefined : { color: badge.color }}
                            >
                              {badge.label}
                            </Text>
                          </View>
                        </View>

                        {/* Fechas */}
                        <View className="flex-row items-center gap-2 rounded-xl border border-border bg-surface2 px-3 py-2">
                          <Calendar size={12} color="#FFFFFF" />
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

                        {/* Código de acceso (copiar) */}
                        <Pressable
                          onPress={() => void handleCopyCodigo(pase.codigo_acceso)}
                          accessibilityLabel="Copiar código de acceso"
                          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                          className="flex-row items-center gap-2 self-start"
                        >
                          <ClipboardList size={14} color={INFO} />
                          <Text className="text-[10px] font-bold tracking-wider text-text">
                            {pase.codigo_acceso}
                          </Text>
                        </Pressable>

                        {/* Acciones — solo pases activos */}
                        {pase.estado === 'ACTIVO' ? (
                          <View className="flex-row flex-wrap items-center gap-2">
                            {pase.usuario_id ? (
                              <Pressable
                                onPress={() =>
                                  router.push(
                                    `/chat?huespedId=${pase.usuario_id}` as never,
                                  )
                                }
                                style={({ pressed }) => ({
                                  backgroundColor: SUCCESS_BG,
                                  borderColor: SUCCESS_BORDER,
                                  opacity: pressed ? 0.8 : 1,
                                })}
                                className="flex-row items-center gap-1 rounded-full border px-3 py-1"
                              >
                                <MessageCircle size={12} color={SUCCESS} />
                                <Text
                                  className="text-[10px] font-bold uppercase tracking-widest"
                                  style={{ color: SUCCESS }}
                                >
                                  Mensajes
                                </Text>
                              </Pressable>
                            ) : null}
                            <Pressable
                              onPress={() => startEditing(pase)}
                              style={({ pressed }) => ({
                                backgroundColor: INFO_BG,
                                borderColor: INFO_BORDER,
                                opacity: pressed ? 0.8 : 1,
                              })}
                              className="flex-row items-center gap-1 rounded-full border px-3 py-1"
                            >
                              <Pencil size={12} color={INFO} />
                              <Text
                                className="text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: INFO }}
                              >
                                Editar
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleRevocar(pase)}
                              style={({ pressed }) => ({
                                backgroundColor: DANGER_BG,
                                borderColor: DANGER_BORDER,
                                opacity: pressed ? 0.8 : 1,
                              })}
                              className="flex-row items-center gap-1 rounded-full border px-3 py-1"
                            >
                              <ShieldAlert size={12} color={DANGER} />
                              <Text
                                className="text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: DANGER }}
                              >
                                Revocar
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}

                        {/* Vehículos del pase */}
                        {pase.vehiculos.length > 0 ? (
                          <View className="flex-row flex-wrap gap-1.5 border-t border-border pt-2">
                            {pase.vehiculos.map((v) => (
                              <View
                                key={v.id}
                                className="flex-row items-center gap-1 rounded-full border border-border bg-surface px-2 py-1"
                              >
                                <Car size={10} color="#FFFFFF" />
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
