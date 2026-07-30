/**
 * ADMIN RESIDENTES - CONJUNTOSAPP (mobile port)
 * Directorio administrativo de residentes: búsqueda, filtros por rol, detalle
 * completo (unidad / vehículos / mascotas / últimos pagos), edición e
 * invitación de nuevos residentes.
 *
 * Ported 1:1 from web src/app/(app)/admin-residentes/page.tsx.
 *  - Guard: ADMINISTRADOR | SUPER_ADMIN (else toast + /inicio)
 *  - GET  /admin/usuarios?q=<search>        -> AdminResidenteItem[]
 *  - GET  /admin/usuarios/{id}              -> AdminResidenteDetalle
 *  - PUT  /admin/usuarios/{id}              -> editar
 *  - POST /admin/usuarios/invitar           -> invitación
 *  - useWsSubscription('usuario') -> refetch de la lista
 *  - Búsqueda con debounce de 400 ms; filtro de rol en cliente
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  FadeInDown,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Building2,
  Car,
  ChevronDown,
  Dog,
  Mail,
  Pencil,
  Phone,
  Search,
  ShieldCheck,
  User,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react-native';

import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import type { Rol } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Local type shapes for admin resident endpoints
// (identical to the web page's local interfaces — report hoists them later)
// ---------------------------------------------------------------------------

interface AdminResidenteItem {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: Rol;
  torre: string | null;
  apto: string | null;
  activo: boolean;
  interno: string | null;
}

interface VehiculoResumen {
  placa: string;
  marca: string | null;
  modelo: string | null;
  tipo: string;
}

interface MascotaResumen {
  nombre: string;
  tipo: string;
  raza: string | null;
}

interface PagoAdminResumen {
  id: string;
  concepto: string;
  monto: string;
  estado: string;
  fechaVencimiento: string;
}

interface AdminResidenteDetalle {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: Rol;
  torre: string | null;
  apto: string | null;
  activo: boolean;
  interno: string | null;
  unidad: {
    torre: string | null;
    numero: string;
    piso: number | null;
    tipo: string;
  } | null;
  vehiculos: VehiculoResumen[];
  mascotas: MascotaResumen[];
  ultimosPagos: PagoAdminResumen[];
}

interface InvitarResidenteRequest {
  email: string;
  nombre: string;
  rol: Rol;
  torre?: string;
  apto?: string;
}

interface EditarResidenteRequest {
  nombre: string;
  telefono?: string;
  torre?: string;
  apto?: string;
  rol: Rol;
  activo: boolean;
}

// Role badge helper
const ROL_LABELS: Record<Rol, string> = {
  PROPIETARIO: 'Propietario',
  ARRENDATARIO: 'Arrendatario',
  CONCEJO: 'Concejo',
  ADMINISTRADOR: 'Administrador',
  VIGILANTE: 'Vigilante',
  SUPERVISOR_VIGILANCIA: 'Supervisor Vigilancia',
  ENCARGADO_PARQUEADERO: 'Encargado Parqueadero',
  SUPER_ADMIN: 'Super Admin',
  HUESPED_TEMPORAL: 'Huésped',
  ADMINISTRADOR_PISCINA: 'Admin. Piscina',
  ADMINISTRADOR_GYM: 'Admin. Gym',
  MANTENIMIENTO_LOCATIVO: 'Mantenimiento',
  OPERARIO_LIMPIEZA: 'Limpieza',
};

const ROL_FILTER_OPTIONS: { label: string; value: Rol | 'TODOS' }[] = [
  { label: 'Todos', value: 'TODOS' },
  { label: 'Propietario', value: 'PROPIETARIO' },
  { label: 'Arrendatario', value: 'ARRENDATARIO' },
  { label: 'Concejo', value: 'CONCEJO' },
];

/** `<option>` list of the EDIT modal's `<select>` (web order + labels). */
const EDIT_ROL_OPTIONS: { label: string; value: Rol }[] = [
  { label: 'Propietario', value: 'PROPIETARIO' },
  { label: 'Arrendatario', value: 'ARRENDATARIO' },
  { label: 'Concejo', value: 'CONCEJO' },
  { label: 'Administrador', value: 'ADMINISTRADOR' },
  { label: 'Vigilante', value: 'VIGILANTE' },
  { label: 'Supervisor Vigilancia', value: 'SUPERVISOR_VIGILANCIA' },
  { label: 'Encargado Parqueadero', value: 'ENCARGADO_PARQUEADERO' },
];

/** `<option>` list of the INVITE modal's `<select>` (web order + labels). */
const INVITE_ROL_OPTIONS: { label: string; value: Rol }[] = [
  { label: 'Propietario', value: 'PROPIETARIO' },
  { label: 'Arrendatario', value: 'ARRENDATARIO' },
  { label: 'Concejo', value: 'CONCEJO' },
];

const ALLOWED_ROLES: string[] = ['ADMINISTRADOR', 'SUPER_ADMIN'];

/** `tracking-[0.2em]` at a 10px font size → 2pt of RN letterSpacing. */
const TRACK_10 = 2;
/** `tracking-[0.2em]` at an 11px font size → 2.2pt. */
const TRACK_11 = 2.2;

/** Web `font-display font-medium` — the Plus Jakarta Sans 500 face. */
const DISPLAY_MEDIUM = 'PlusJakartaSans_500Medium';

// ---------------------------------------------------------------------------
// Skeletons — RN reproduction of web `components/ui/Skeleton` (animate-pulse
// over a `bg-text/10` block). Kept local to this screen so it does not collide
// with the shared primitive being added elsewhere.
// ---------------------------------------------------------------------------

function Pulse({
  width,
  height,
  radius = 8,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
}) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 800 }), -1, true);
    // Stop the infinite repeat when the placeholder unmounts (the list swaps to
    // real rows the moment the fetch resolves).
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      // `bg-text/10` — token class, so it follows the active scheme.
      className="bg-text/10"
      style={[style, { width, height, borderRadius: radius }]}
    />
  );
}

/** Placeholder rows for list views (mirrors web `SkeletonRows`). */
function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View className="w-full gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <LiquidGlass
          key={i}
          className="rounded-3xl"
          radius={24}
          style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <Pulse width={40} height={40} radius={12} />
          <View className="flex-1 gap-2">
            <Pulse width="50%" height={12} />
            <Pulse width="33%" height={10} />
          </View>
          <Pulse width={64} height={16} />
        </LiquidGlass>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminResidentes() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;

  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  // List state
  const [loading, setLoading] = useState(true);
  const [residentes, setResidentes] = useState<AdminResidenteItem[]>([]);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [rolFilter, setRolFilter] = useState<Rol | 'TODOS'>('TODOS');

  // Detail modal
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<AdminResidenteDetalle | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<EditarResidenteRequest>({
    nombre: '',
    telefono: '',
    torre: '',
    apto: '',
    rol: 'PROPIETARIO',
    activo: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState<InvitarResidenteRequest>({
    email: '',
    nombre: '',
    rol: 'PROPIETARIO',
    torre: '',
    apto: '',
  });
  const [sendingInvite, setSendingInvite] = useState(false);

  // -------- Data fetching --------

  // `search` is read through a ref so the WS handler and the debounce timer
  // always send the latest query without re-subscribing.
  const searchRef = useRef(search);
  searchRef.current = search;

  const fetchResidentes = useCallback(async () => {
    setLoading(true);
    try {
      const q = searchRef.current;
      const qs = q ? `?q=${encodeURIComponent(q)}` : '';
      const data = await api.get<AdminResidenteItem[]>(`/admin/usuarios${qs}`);
      setResidentes(data);
    } catch {
      toast.error('Error al cargar residentes');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetalle = useCallback(async (id: string) => {
    setLoadingDetalle(true);
    try {
      const data = await api.get<AdminResidenteDetalle>(`/admin/usuarios/${id}`);
      setDetalle(data);
    } catch {
      toast.error('Error al cargar detalle del residente');
    } finally {
      setLoadingDetalle(false);
    }
  }, []);

  // Real-time WS subscription
  useWsSubscription('usuario', () => {
    void fetchResidentes();
  });

  // -------- Auth guard --------

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as never);
      return;
    }

    if (!role || !ALLOWED_ROLES.includes(role)) {
      toast.error('No tienes permisos para acceder a esta sección.');
      router.replace('/(app)/inicio' as never);
      return;
    }

    void fetchResidentes();
  }, [user, authLoading, role, router, fetchResidentes]);

  // Re-fetch on search change (debounced). The very first run is skipped: the
  // guard effect above already performed the initial load (web fired both and
  // double-fetched on mount).
  const skipFirstDebounce = useRef(true);
  useEffect(() => {
    if (!user) return;
    if (skipFirstDebounce.current) {
      skipFirstDebounce.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void fetchResidentes();
    }, 400);
    return () => clearTimeout(timer);
  }, [search, user, fetchResidentes]);

  // -------- Filters --------

  const filteredResidentes = residentes.filter((r) => {
    if (rolFilter !== 'TODOS' && r.rol !== rolFilter) return false;
    return true;
  });

  // -------- Handlers --------

  const openDetalle = (id: string) => {
    setSelectedId(id);
    void fetchDetalle(id);
  };

  const closeDetalle = () => {
    setSelectedId(null);
    setDetalle(null);
    setShowEdit(false);
  };

  const openEdit = () => {
    if (!detalle) return;
    setEditForm({
      nombre: detalle.nombre,
      telefono: detalle.telefono || '',
      torre: detalle.torre || '',
      apto: detalle.apto || '',
      rol: detalle.rol,
      activo: detalle.activo,
    });
    setShowEdit(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedId) return;
    // Mirrors the web `<input required>` on Nombre: an empty name cannot be
    // submitted.
    if (!editForm.nombre.trim()) return;
    setSavingEdit(true);
    try {
      const body: EditarResidenteRequest = {
        ...editForm,
        telefono: editForm.telefono || undefined,
        torre: editForm.torre || undefined,
        apto: editForm.apto || undefined,
      };
      await api.put(`/admin/usuarios/${selectedId}`, body);
      toast.success('Residente actualizado exitosamente');
      setShowEdit(false);
      void fetchResidentes();
      void fetchDetalle(selectedId);
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.detail : 'Error al actualizar residente');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteForm.email.trim() || !inviteForm.nombre.trim()) {
      toast.error('Email y nombre son obligatorios');
      return;
    }
    setSendingInvite(true);
    try {
      const body: InvitarResidenteRequest = {
        ...inviteForm,
        torre: inviteForm.torre || undefined,
        apto: inviteForm.apto || undefined,
      };
      await api.post('/admin/usuarios/invitar', body);
      toast.success('Invitación enviada exitosamente');
      setShowInvite(false);
      setInviteForm({
        email: '',
        nombre: '',
        rol: 'PROPIETARIO',
        torre: '',
        apto: '',
      });
      void fetchResidentes();
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.detail : 'Error al enviar invitación');
    } finally {
      setSendingInvite(false);
    }
  };

  // -------- Loading state --------

  if (authLoading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center px-6">
          <SkeletonRows />
        </View>
      </Screen>
    );
  }

  // -------- Render --------

  return (
    <View style={{ flex: 1 }} className="bg-primary">
      <Screen className="bg-primary">
        <View className="gap-6 px-6 pt-4">
          <Animated.View entering={FadeInDown.duration(500)}>
            <ProfileHeader />
          </Animated.View>

          {/* Header + invite button */}
          <Animated.View
            entering={FadeInDown.delay(60).duration(500)}
            className="flex-row items-center justify-between"
          >
            <View>
              {/* web `font-display font-medium` = Plus Jakarta Sans @500. The
                  `font-display` alias resolves to the 700 face, so name the
                  exact loaded 500 face (app/_layout.tsx loads it). */}
              <Text
                className="text-2xl tracking-wide text-text"
                style={{ fontFamily: DISPLAY_MEDIUM }}
              >
                Residentes
              </Text>
              <Text className="text-sm text-text" style={{ opacity: 0.6 }}>
                Gestión de unidades y usuarios
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowInvite(true)}
              style={({ pressed }) => ({
                transform: [{ scale: pressed ? 0.95 : 1 }],
                shadowColor: tokens.success,
                shadowOpacity: 0.3,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              })}
              className="flex-row items-center gap-2 rounded-full bg-success px-5 py-2.5"
            >
              <UserPlus size={18} color={tokens.onAccent} />
              <Text className="text-sm font-bold text-on-accent">Invitar</Text>
            </Pressable>
          </Animated.View>

          {/* Search bar */}
          <Animated.View entering={FadeInDown.delay(100).duration(500)} className="relative">
            <View
              className="absolute left-5 z-10"
              style={{ top: '50%', marginTop: -8, opacity: 0.5 }}
              pointerEvents="none"
            >
              <Search size={16} color={tokens.text} />
            </View>
            <TextInput
              placeholder="Buscar por nombre, email o apto..."
              placeholderTextColor={tokens.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              // web `focus:border-accent`
              style={searchFocused ? { borderColor: tokens.accent } : undefined}
              className="w-full rounded-xl border border-border bg-surface-2 py-3 pl-14 pr-4 text-sm text-text"
            />
          </Animated.View>

          {/* Role filter chips */}
          <Animated.View entering={FadeInDown.delay(140).duration(500)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            >
              {ROL_FILTER_OPTIONS.map((opt) => {
                const active = rolFilter === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="button"
                    onPress={() => setRolFilter(opt.value)}
                    style={({ pressed }) => [
                      { transform: [{ scale: pressed ? 0.95 : 1 }] },
                      active
                        ? {
                            shadowColor: tokens.info,
                            shadowOpacity: 0.3,
                            shadowRadius: 12,
                            shadowOffset: { width: 0, height: 6 },
                            elevation: 6,
                          }
                        : null,
                    ]}
                    className={`rounded-full px-4 py-2 ${
                      active ? 'bg-info' : 'border border-border bg-text/5'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold uppercase tracking-wider ${
                        active ? 'text-on-accent' : 'text-text'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          {/* Resident listing */}
          <View className="gap-4">
            {loading ? (
              <View className="w-full items-center py-12">
                <SkeletonRows />
              </View>
            ) : filteredResidentes.length === 0 ? (
              <LiquidGlass
                className="rounded-3xl"
                radius={24}
                style={{ padding: 32, alignItems: 'center' }}
              >
                <View style={{ opacity: 0.4, marginBottom: 12 }}>
                  <User size={40} color={tokens.text} />
                </View>
                <Text className="text-center font-medium text-text">
                  {search || rolFilter !== 'TODOS'
                    ? 'Sin resultados'
                    : 'No hay residentes registrados'}
                </Text>
                <Text
                  className="mt-1 text-center text-xs text-text"
                  style={{ opacity: 0.5 }}
                >
                  {search || rolFilter !== 'TODOS'
                    ? 'Intenta con otros filtros o términos de búsqueda.'
                    : 'Invita a los residentes usando el botón superior.'}
                </Text>
              </LiquidGlass>
            ) : (
              filteredResidentes.map((r, i) => (
                <Animated.View key={r.id} entering={FadeInDown.delay(i * 40).duration(450)}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openDetalle(r.id)}
                    style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
                  >
                    <LiquidGlass
                      className="rounded-3xl"
                      radius={24}
                      style={{ padding: 24, gap: 12 }}
                    >
                      {/* Top row: name + status */}
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 flex-row items-center gap-3">
                          <View className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
                            <User size={22} color={tokens.text} />
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-bold text-text">{r.nombre}</Text>
                            <View className="flex-row items-center gap-2">
                              <View
                                className={`h-2 w-2 rounded-full ${
                                  r.activo ? 'bg-success' : 'bg-text/30'
                                }`}
                              />
                              <Text className="text-[10px] text-text" style={{ opacity: 0.5 }}>
                                {r.activo ? 'Activo' : 'Inactivo'}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View className="rounded-full border border-text/20 bg-text/10 px-2 py-0.5">
                          <Text className="text-[10px] font-bold uppercase text-text">
                            {ROL_LABELS[r.rol] || r.rol}
                          </Text>
                        </View>
                      </View>

                      {/* Contact info */}
                      <View className="flex-row gap-2">
                        <View className="flex-1 flex-row items-center gap-2">
                          <View style={{ opacity: 0.5 }}>
                            <Mail size={13} color={tokens.text} />
                          </View>
                          <Text className="flex-1 text-xs text-text" numberOfLines={1}>
                            {r.email}
                          </Text>
                        </View>
                        <View className="flex-1 flex-row items-center gap-2">
                          <View style={{ opacity: 0.5 }}>
                            <Phone size={13} color={tokens.text} />
                          </View>
                          <Text className="flex-1 text-xs text-text" numberOfLines={1}>
                            {r.telefono || '—'}
                          </Text>
                        </View>
                      </View>

                      {/* Torre / Apto + Interno */}
                      <View className="flex-row items-center justify-between border-t border-border pt-2">
                        <View className="flex-1 flex-row items-center gap-2 pr-2">
                          <View style={{ opacity: 0.5 }}>
                            <Building2 size={14} color={tokens.text} />
                          </View>
                          <Text className="flex-1 text-xs font-bold text-text">
                            {r.torre && r.apto
                              ? `Torre ${r.torre} - Apto ${r.apto}`
                              : 'Sin unidad asignada'}
                          </Text>
                        </View>
                        {r.interno ? (
                          <View className="rounded-lg border border-border bg-surface-2 px-2 py-0.5">
                            {/* web `font-mono` → the JetBrains Mono face that
                                app/_layout.tsx already loads. */}
                            <Text className="font-mono text-[10px] text-text">#{r.interno}</Text>
                          </View>
                        ) : null}
                      </View>
                    </LiquidGlass>
                  </Pressable>
                </Animated.View>
              ))
            )}
          </View>
        </View>
      </Screen>

      {/* ============================================================ */}
      {/* DETAIL MODAL (+ nested EDIT MODAL, web z-60 / z-70) */}
      {/* ============================================================ */}
      <DetalleModal
        open={selectedId !== null}
        loading={loadingDetalle}
        detalle={detalle}
        onClose={closeDetalle}
        onEdit={openEdit}
        overlay={
          showEdit && selectedId !== null ? (
            <EditPanel
              form={editForm}
              saving={savingEdit}
              onChange={setEditForm}
              onClose={() => setShowEdit(false)}
              onSubmit={handleSaveEdit}
            />
          ) : null
        }
      />

      {/* ============================================================ */}
      {/* INVITE MODAL */}
      {/* ============================================================ */}
      <InviteModal
        open={showInvite}
        form={inviteForm}
        sending={sendingInvite}
        onChange={setInviteForm}
        onClose={() => setShowInvite(false)}
        onSubmit={handleSendInvite}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared modal chrome — reproduces the web
// `fixed inset-0 bg-black/70 … liquid-glass rounded-t-[32px] max-h-[90vh]`
// bottom sheet. `bg-black/70` is the web page's own literal.
// ---------------------------------------------------------------------------

interface SheetPanelProps {
  onClose: () => void;
  /** Blocks backdrop dismissal while a request is in flight. */
  dismissible?: boolean;
  children: ReactNode;
}

/** Backdrop + slide-up panel, WITHOUT its own `Modal` host. */
function SheetPanel({ onClose, dismissible = true, children }: SheetPanelProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 justify-end">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        onPress={dismissible ? onClose : undefined}
        className="absolute inset-0 bg-black/70"
      />
      <Animated.View
        entering={SlideInDown.duration(300)}
        className="overflow-hidden rounded-t-[32px] border-t border-border bg-primary"
        style={{ maxHeight: '90%', paddingBottom: insets.bottom + 24 }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

interface SheetModalProps extends SheetPanelProps {
  open: boolean;
  /**
   * Rendered inside the SAME native Modal, above the panel. The web stacks the
   * edit dialog (z-70) over the detail dialog (z-60); on iOS two sibling RN
   * `Modal`s visible at once do not reliably stack, so the upper layer is
   * nested here instead.
   */
  overlay?: ReactNode;
}

function SheetModal({
  open,
  onClose,
  dismissible = true,
  overlay,
  children,
}: SheetModalProps) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {open ? (
        <SheetPanel onClose={onClose} dismissible={dismissible}>
          {children}
        </SheetPanel>
      ) : null}
      {overlay ? <View style={StyleSheet.absoluteFill}>{overlay}</View> : null}
    </Modal>
  );
}

/** Round 40x40 close button used by all three modals. */
function CloseButton({ onClose, color }: { onClose: () => void; color: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cerrar"
      onPress={onClose}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2"
    >
      <X size={20} color={color} />
    </Pressable>
  );
}

/** `text-[10px] uppercase tracking-[0.2em] font-black` field label. */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      className="ml-1 text-[10px] font-black uppercase text-text"
      style={{ letterSpacing: TRACK_10 }}
    >
      {children}
    </Text>
  );
}

/** `bg-surface-2 border border-border rounded-xl py-3 px-4` text field. */
function SheetInput(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  placeholderColor: string;
  /** web `focus:border-accent` */
  accentColor: string;
}) {
  const { placeholderColor, accentColor, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...rest}
      placeholderTextColor={placeholderColor}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={focused ? { borderColor: accentColor } : undefined}
      className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
    />
  );
}

/**
 * Inline replacement for the web `<select>`: a Pressable trigger that expands
 * the option list in place (a bottom sheet cannot stack above a RN Modal).
 */
function RolSelect({
  value,
  options,
  onChange,
  iconColor,
  accentColor,
}: {
  value: Rol;
  options: { label: string; value: Rol }[];
  onChange: (rol: Rol) => void;
  iconColor: string;
  /** web `focus:border-accent` — applied while the option list is expanded. */
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={open ? { borderColor: accentColor } : undefined}
        className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3"
      >
        <Text className="flex-1 text-sm text-text">
          {current ? current.label : ROL_LABELS[value]}
        </Text>
        <ChevronDown size={18} color={iconColor} />
      </Pressable>

      {open ? (
        <View className="overflow-hidden rounded-xl border border-border bg-surface-2">
          {options.map((opt, i) => {
            const selected = opt.value === value;
            const last = i === options.length - 1;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`px-4 py-3 ${last ? '' : 'border-b border-border'} ${
                  selected ? 'bg-accent-soft' : ''
                }`}
              >
                <Text
                  className={`text-sm ${selected ? 'font-bold text-accent' : 'text-text'}`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Full-width pill submit button: `bg-success text-on-accent rounded-full`. */
function SubmitButton({
  label,
  loadingLabel,
  loading,
  disabled,
  icon,
  onPress,
  shadowColor,
}: {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  /**
   * Stands in for the web `<input required>` gate: the browser refuses to
   * submit the form and marks the field, so the button must not read as live.
   */
  disabled?: boolean;
  icon?: ReactNode;
  onPress: () => void;
  shadowColor: string;
}) {
  const inert = !!loading || !!disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: !!loading }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: inert ? 0.5 : 1,
        transform: [{ scale: pressed && !inert ? 0.98 : 1 }],
        shadowColor,
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      })}
      className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-full bg-success py-3.5"
    >
      {loading && loadingLabel ? (
        <>
          <Pulse width={20} height={20} radius={10} />
          <Text className="text-sm font-bold text-on-accent">{loadingLabel}</Text>
        </>
      ) : (
        <>
          {icon}
          <Text className="text-sm font-bold text-on-accent">{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// DETAIL MODAL
// ---------------------------------------------------------------------------

function DetalleModal({
  open,
  loading,
  detalle,
  onClose,
  onEdit,
  overlay,
}: {
  open: boolean;
  loading: boolean;
  detalle: AdminResidenteDetalle | null;
  onClose: () => void;
  onEdit: () => void;
  overlay?: ReactNode;
}) {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  return (
    <SheetModal open={open} onClose={onClose} overlay={overlay}>
      {/* Close button — pinned to the panel (top-4 right-4). */}
      <View style={{ position: 'absolute', top: 16, right: 16, zIndex: 20 }}>
        <CloseButton onClose={onClose} color={tokens.text} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24, paddingTop: 40 }}
      >
        {loading ? (
          <View className="items-center py-12">
            <SkeletonRows />
          </View>
        ) : detalle ? (
          <View className="gap-5">
            {/* Avatar + name */}
            <View className="flex-row items-center gap-4">
              <View className="h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface-2">
                <User size={28} color={tokens.text} />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-text">{detalle.nombre}</Text>
                <View className="flex-row items-center gap-2">
                  <View
                    className={`h-2 w-2 rounded-full ${
                      detalle.activo ? 'bg-success' : 'bg-text/30'
                    }`}
                  />
                  <Text className="text-[10px] text-text" style={{ opacity: 0.5 }}>
                    {detalle.activo ? 'Activo' : 'Inactivo'}
                  </Text>
                  <View className="rounded-full border border-text/20 bg-text/10 px-2 py-0.5">
                    <Text className="text-[10px] font-bold uppercase text-text">
                      {ROL_LABELS[detalle.rol] || detalle.rol}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Contact */}
            <View className="gap-2 rounded-2xl border border-border bg-surface-2 p-4">
              <View className="flex-row items-center gap-2">
                <View style={{ opacity: 0.5 }}>
                  <Mail size={14} color={tokens.text} />
                </View>
                <Text className="flex-1 text-sm text-text">{detalle.email}</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View style={{ opacity: 0.5 }}>
                  <Phone size={14} color={tokens.text} />
                </View>
                <Text className="flex-1 text-sm text-text">
                  {detalle.telefono || 'No registrado'}
                </Text>
              </View>
              {detalle.interno ? (
                <View className="flex-row items-center gap-2">
                  <View style={{ opacity: 0.5 }}>
                    <Building2 size={14} color={tokens.text} />
                  </View>
                  <Text className="flex-1 text-sm text-text">Interno #{detalle.interno}</Text>
                </View>
              ) : null}
            </View>

            {/* Unidad */}
            {detalle.unidad ? (
              <View className="rounded-2xl border border-border bg-surface-2 p-4">
                <Text
                  className="mb-2 text-[10px] font-black uppercase text-text"
                  style={{ letterSpacing: TRACK_10 }}
                >
                  Unidad Asignada
                </Text>
                <View className="flex-row items-center gap-3">
                  <View style={{ opacity: 0.6 }}>
                    <Building2 size={18} color={tokens.text} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-text">
                      {detalle.unidad.torre
                        ? `Torre ${detalle.unidad.torre} - ${detalle.unidad.numero}`
                        : detalle.unidad.numero}
                    </Text>
                    <Text className="text-xs text-text" style={{ opacity: 0.5 }}>
                      {detalle.unidad.tipo} • Piso {detalle.unidad.piso ?? '—'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Vehículos */}
            <View className="gap-3">
              <View className="flex-row items-center gap-2" style={{ opacity: 0.7 }}>
                <Car size={16} color={tokens.text} />
                <Text
                  className="text-[11px] font-black uppercase text-text"
                  style={{ letterSpacing: TRACK_11 }}
                >
                  Vehículos ({detalle.vehiculos.length})
                </Text>
              </View>
              {detalle.vehiculos.length === 0 ? (
                <View
                  className="items-center rounded-xl border border-dashed border-border bg-surface-2 p-4"
                >
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-text">
                    Sin vehículos registrados
                  </Text>
                </View>
              ) : (
                detalle.vehiculos.map((v, i) => (
                  <View
                    key={i}
                    className="flex-row items-center justify-between rounded-xl border border-border bg-surface-2 p-3"
                  >
                    <View className="flex-1 flex-row items-center gap-3">
                      <View className="h-10 w-10 items-center justify-center rounded-lg border border-border bg-text/5">
                        <Text className="text-sm font-black uppercase text-text">
                          {v.placa.slice(0, 2)}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-black tracking-wider text-text">
                          {v.placa}
                        </Text>
                        <Text className="text-[10px] font-bold uppercase text-text">
                          {v.marca} {v.modelo}
                        </Text>
                      </View>
                    </View>
                    <View className="rounded-full border border-border bg-text/10 px-2 py-0.5">
                      <Text className="text-[10px] font-bold uppercase text-text">{v.tipo}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Mascotas */}
            <View className="gap-3">
              <View className="flex-row items-center gap-2" style={{ opacity: 0.7 }}>
                <Dog size={16} color={tokens.text} />
                <Text
                  className="text-[11px] font-black uppercase text-text"
                  style={{ letterSpacing: TRACK_11 }}
                >
                  Mascotas ({detalle.mascotas.length})
                </Text>
              </View>
              {detalle.mascotas.length === 0 ? (
                <View
                  className="items-center rounded-xl border border-dashed border-border bg-surface-2 p-4"
                >
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-text">
                    Sin mascotas registradas
                  </Text>
                </View>
              ) : (
                detalle.mascotas.map((m, i) => (
                  <View
                    key={i}
                    className="flex-row items-center gap-3 rounded-xl border border-border bg-surface-2 p-3"
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-lg border border-border bg-text/5">
                      <Dog size={20} color={tokens.text} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-black uppercase text-text">{m.nombre}</Text>
                      <Text className="text-[10px] font-bold uppercase text-text">
                        {m.tipo} • {m.raza || '—'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Últimos pagos */}
            <View className="gap-3">
              <View className="flex-row items-center gap-2" style={{ opacity: 0.7 }}>
                <ShieldCheck size={16} color={tokens.text} />
                <Text
                  className="text-[11px] font-black uppercase text-text"
                  style={{ letterSpacing: TRACK_11 }}
                >
                  Últimos Pagos ({detalle.ultimosPagos.length})
                </Text>
              </View>
              {detalle.ultimosPagos.length === 0 ? (
                <View
                  className="items-center rounded-xl border border-dashed border-border bg-surface-2 p-4"
                >
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-text">
                    Sin pagos recientes
                  </Text>
                </View>
              ) : (
                detalle.ultimosPagos.map((p, i) => (
                  <View
                    key={i}
                    className="flex-row items-center justify-between rounded-xl border border-border bg-surface-2 p-3"
                  >
                    <View className="flex-1 pr-2">
                      <Text className="text-xs font-bold text-text">{p.concepto}</Text>
                      <Text className="text-[9px] text-text" style={{ opacity: 0.5 }}>
                        Vence: {new Date(p.fechaVencimiento).toLocaleDateString()}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-black text-text">
                        ${Number(p.monto).toLocaleString()}
                      </Text>
                      <View
                        className={`rounded-full border px-2 py-0.5 ${
                          p.estado === 'PAGADO'
                            ? 'border-success/30 bg-success/10'
                            : p.estado === 'VENCIDO'
                              ? 'border-danger/30 bg-danger/10'
                              : 'border-text/20 bg-text/10'
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-bold uppercase ${
                            p.estado === 'PAGADO'
                              ? 'text-success'
                              : p.estado === 'VENCIDO'
                                ? 'text-danger'
                                : 'text-text'
                          }`}
                        >
                          {p.estado}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Edit button */}
            <SubmitButton
              label="Editar Residente"
              icon={<Pencil size={18} color={tokens.onAccent} />}
              onPress={onEdit}
              shadowColor={tokens.success}
            />
          </View>
        ) : (
          <View className="items-center py-12">
            <View style={{ opacity: 0.4, marginBottom: 12 }}>
              <XCircle size={40} color={tokens.text} />
            </View>
            <Text className="text-text">No se pudo cargar el residente</Text>
          </View>
        )}
      </ScrollView>
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
// EDIT PANEL — nested inside the detail modal (web: z-70 over z-60)
// ---------------------------------------------------------------------------

function EditPanel({
  form,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: EditarResidenteRequest;
  saving: boolean;
  onChange: (next: EditarResidenteRequest) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  return (
    <SheetPanel onClose={onClose} dismissible={!saving}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24 }}
      >
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-text">Editar Residente</Text>
          <CloseButton onClose={onClose} color={tokens.text} />
        </View>

        <View className="gap-4">
          {/* Nombre */}
          <View className="gap-1.5">
            <FieldLabel>Nombre *</FieldLabel>
            <SheetInput
              value={form.nombre}
              onChangeText={(nombre) => onChange({ ...form, nombre })}
              placeholderColor={tokens.textMuted}
              accentColor={tokens.accent}
            />
          </View>

          {/* Teléfono */}
          <View className="gap-1.5">
            <FieldLabel>Teléfono</FieldLabel>
            <SheetInput
              value={form.telefono || ''}
              onChangeText={(telefono) => onChange({ ...form, telefono })}
              keyboardType="phone-pad"
              placeholderColor={tokens.textMuted}
              accentColor={tokens.accent}
            />
          </View>

          {/* Torre + Apto */}
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <FieldLabel>Torre</FieldLabel>
              <SheetInput
                value={form.torre || ''}
                onChangeText={(torre) => onChange({ ...form, torre })}
                placeholderColor={tokens.textMuted}
                accentColor={tokens.accent}
              />
            </View>
            <View className="flex-1 gap-1.5">
              <FieldLabel>Apto</FieldLabel>
              <SheetInput
                value={form.apto || ''}
                onChangeText={(apto) => onChange({ ...form, apto })}
                placeholderColor={tokens.textMuted}
                accentColor={tokens.accent}
              />
            </View>
          </View>

          {/* Rol */}
          <View className="gap-1.5">
            <FieldLabel>Rol</FieldLabel>
            <RolSelect
              value={form.rol}
              options={EDIT_ROL_OPTIONS}
              onChange={(rol) => onChange({ ...form, rol })}
              iconColor={tokens.text}
              accentColor={tokens.accent}
            />
          </View>

          {/* Activo toggle */}
          <View className="flex-row items-center justify-between rounded-xl border border-border bg-surface-2 p-3">
            <Text className="text-sm font-medium text-text">Estado de la cuenta</Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: form.activo }}
              accessibilityLabel="Estado de la cuenta"
              onPress={() => onChange({ ...form, activo: !form.activo })}
              className={`h-7 w-12 rounded-full ${form.activo ? 'bg-success' : 'bg-text/20'}`}
            >
              {/* Web uses a one-off `bg-white` knob for this exact element. */}
              <View
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 2,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#ffffff',
                  transform: [{ translateX: form.activo ? 20 : 0 }],
                  shadowColor: '#000000',
                  shadowOpacity: 0.15,
                  shadowRadius: 2,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: 2,
                }}
              />
            </Pressable>
          </View>

          {/* Save button — `Nombre` is `required` on web, so an empty name is
              not submittable. */}
          <SubmitButton
            label="Guardar Cambios"
            loadingLabel="Guardando..."
            loading={saving}
            disabled={!form.nombre.trim()}
            onPress={onSubmit}
            shadowColor={tokens.success}
          />
        </View>
      </ScrollView>
    </SheetPanel>
  );
}

// ---------------------------------------------------------------------------
// INVITE MODAL
// ---------------------------------------------------------------------------

function InviteModal({
  open,
  form,
  sending,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  form: InvitarResidenteRequest;
  sending: boolean;
  onChange: (next: InvitarResidenteRequest) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  return (
    <SheetModal open={open} onClose={onClose} dismissible={!sending}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24 }}
      >
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-text">Invitar Residente</Text>
          <CloseButton onClose={onClose} color={tokens.text} />
        </View>

        <View className="gap-4">
          {/* Email */}
          <View className="gap-1.5">
            <FieldLabel>Email *</FieldLabel>
            <SheetInput
              value={form.email}
              onChangeText={(email) => onChange({ ...form, email })}
              placeholder="residente@ejemplo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderColor={tokens.textMuted}
              accentColor={tokens.accent}
            />
          </View>

          {/* Nombre */}
          <View className="gap-1.5">
            <FieldLabel>Nombre *</FieldLabel>
            <SheetInput
              value={form.nombre}
              onChangeText={(nombre) => onChange({ ...form, nombre })}
              placeholder="Nombre completo"
              autoCapitalize="words"
              placeholderColor={tokens.textMuted}
              accentColor={tokens.accent}
            />
          </View>

          {/* Rol */}
          <View className="gap-1.5">
            <FieldLabel>Rol</FieldLabel>
            <RolSelect
              value={form.rol}
              options={INVITE_ROL_OPTIONS}
              onChange={(rol) => onChange({ ...form, rol })}
              iconColor={tokens.text}
              accentColor={tokens.accent}
            />
          </View>

          {/* Torre + Apto */}
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <FieldLabel>Torre</FieldLabel>
              <SheetInput
                value={form.torre || ''}
                onChangeText={(torre) => onChange({ ...form, torre })}
                placeholderColor={tokens.textMuted}
                accentColor={tokens.accent}
              />
            </View>
            <View className="flex-1 gap-1.5">
              <FieldLabel>Apto</FieldLabel>
              <SheetInput
                value={form.apto || ''}
                onChangeText={(apto) => onChange({ ...form, apto })}
                placeholderColor={tokens.textMuted}
                accentColor={tokens.accent}
              />
            </View>
          </View>

          {/* Send button */}
          <SubmitButton
            label="Enviar Invitación"
            loadingLabel="Enviando..."
            loading={sending}
            onPress={onSubmit}
            shadowColor={tokens.success}
          />
        </View>
      </ScrollView>
    </SheetModal>
  );
}
