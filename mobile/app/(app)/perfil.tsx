import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'nativewind';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  ArrowRight,
  Calendar,
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  FileText,
  HelpCircle,
  Info,
  Lock,
  LogOut,
  Mail,
  MoreHorizontal,
  Moon,
  Package,
  PawPrint,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react-native';

import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api/client';
import type {
  PagosResponse,
  ProfileResponse,
  ReservaDto,
  TipoTramite,
} from '@/lib/api/types';
import { PAYMENTS_ENABLED, PAYMENTS_DISABLED_MSG } from '@/lib/flags';
import { useTheme } from '@/providers/ThemeProvider';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';

// ---------------------------------------------------------------------------
// Local types (mirror the web page's loose `ProfileFetch`/finance shapes — the
// backend `/usuarios/me/profile` response carries these nested asset lists even
// though the strict `ProfileResponse` DTO does not enumerate them).
// ---------------------------------------------------------------------------

interface UserData {
  name: string;
  apto: string;
  torre: string;
  phone: string;
  gender: string;
  email: string;
  avatar?: string;
  bio: string;
  numeroInterno?: string;
}
interface Vehiculo {
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
}
interface Mascota {
  nombre: string;
  tipo: string;
  raza?: string;
  fotoUrl?: string;
}
interface Tramite {
  id: string;
  tipo: string;
  estado: string;
  createdAt: string;
}
interface Pago {
  id: string;
  concepto: string;
  monto: string;
  estado: string;
  fechaVencimiento: string;
  fechaPago?: string;
  createdAt?: string;
}
interface Recibo {
  id: string;
  servicio: string;
  monto: string;
  pagado: boolean;
  vencimiento: string;
  fechaPago?: string;
  createdAt?: string;
}
interface ReservaActiva {
  estado?: string;
  fechaInicio: string;
  fechaFin: string;
  area?: { nombre?: string; imagenUrl?: string };
}
interface PaqueteActivo {
  remitente?: string;
  origen?: string;
  guia?: string;
  fechaLlegada: string;
}
/** Loose superset of ProfileResponse covering the nested asset lists. */
type ProfileFetch = ProfileResponse & {
  bio?: string;
  numeroInterno?: string;
  vehiculos?: Vehiculo[];
  mascotas?: Mascota[];
  tramitesSolicitados?: Tramite[];
};

type ViewMode =
  | 'profile'
  | 'vehicles'
  | 'pets'
  | 'deuda'
  | 'requests'
  | 'reservas'
  | 'paquetes';

type RegType = 'VEHICULO' | 'MASCOTA' | 'OTRO';
type RegDoc = { nombre: string; base64: string; mimeType: string };

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1000';

const picKey = (id: string) => `conjuntos_profile_pic_${id}`;
const dataKey = (id: string) => `conjuntos_profile_data_${id}`;

// ---------------------------------------------------------------------------
// Locale-safe date helpers (Hermes may lack full Intl es-ES data; fall back to
// a manual Spanish formatter so copy never breaks).
// ---------------------------------------------------------------------------

const ES_MONTHS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];
const ES_WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function fmtDateDMY(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${ES_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateShort(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${ES_WEEKDAYS[d.getDay()]} ${d.getDate()} ${ES_MONTHS[d.getMonth()]}`;
}
function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtArrived(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${ES_MONTHS[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function money(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (Number.isNaN(n)) return '0';
  return Math.round(n).toLocaleString('es-CO');
}

// ---------------------------------------------------------------------------

export default function Perfil() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isLight = colorScheme === 'light';
  const { theme, toggleTheme } = useTheme();
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const logout = useAuth((s) => s.logout);
  const userId = user?.id;

  // Theme-derived palette (NativeWind `dark:` can't reach inline styles).
  const C = useMemo(
    () => ({
      bg: isLight ? '#FFFFFF' : '#000000',
      text: isLight ? '#000000' : '#FFFFFF',
      accent: isLight ? '#000000' : '#FFFFFF',
      onAccent: isLight ? '#FFFFFF' : '#000000',
      muted: isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)',
      faint: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
      border: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.14)',
    }),
    [isLight],
  );

  const [profilePic, setProfilePic] = useState<string>(DEFAULT_AVATAR);
  const [hasMounted, setHasMounted] = useState(false);

  const [userData, setUserData] = useState<UserData>({
    name: 'Residente',
    apto: 'S/N',
    torre: 'S/T',
    phone: '',
    gender: 'neutro',
    email: '',
    bio: '¡Hola! Soy residente de este ConjuntOS.',
  });
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [activeReservas, setActiveReservas] = useState<ReservaActiva[]>([]);
  const [activePaquetes, setActivePaquetes] = useState<PaqueteActivo[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('profile');
  const [financialTab, setFinancialTab] = useState<'pendientes' | 'historial'>(
    'pendientes',
  );
  const [financialData, setFinancialData] = useState<{
    pagos: Pago[];
    recibos: Recibo[];
    totalDebt: number;
  }>({ pagos: [], recibos: [], totalDebt: 0 });

  const [isPaying, setIsPaying] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState<UserData>(userData);

  // Registration / Tramite modal
  const [showRegModal, setShowRegModal] = useState(false);
  const [regType, setRegType] = useState<RegType>('VEHICULO');
  const [isRegSubmitting, setIsRegSubmitting] = useState(false);
  const [regForm, setRegForm] = useState({
    nombre: '',
    tipo: '',
    raza: '',
    placa: '',
    marca: '',
    modelo: '',
    ano: '',
    color: '',
    tipoVehiculo: '',
  });
  const [regDocs, setRegDocs] = useState<RegDoc[]>([]);

  // ?modal=edit deep-link
  const { modal: modalParam } = useLocalSearchParams<{ modal?: string }>();

  // -- mount sync + cached PII hydrate -------------------------------------
  useEffect(() => {
    setHasMounted(true);
    if (user) {
      setUserData((prev) => ({
        ...prev,
        name: user.nombre || prev.name,
        email: user.email || prev.email,
      }));
    }
  }, [user]);

  useEffect(() => {
    if (!userId || !hasMounted) return;
    (async () => {
      try {
        const savedPic = await SecureStore.getItemAsync(picKey(userId));
        if (savedPic) setProfilePic(savedPic);
        const savedData = await SecureStore.getItemAsync(dataKey(userId));
        if (savedData) {
          const parsed = JSON.parse(savedData) as Partial<UserData>;
          setUserData((prev) => ({ ...prev, ...parsed }));
          setEditForm((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // ignore corrupt local data
      }
    })();
  }, [userId, hasMounted]);

  // ?modal=edit auto-opens the editor
  useEffect(() => {
    if (modalParam === 'edit') {
      setEditForm({ ...userData });
      setShowEditModal(true);
      toast.info('Editor sincronizado');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalParam]);

  // -- main data fetch (single consolidated effect; collapses the duplicate
  //    GET /paquetes/mios that the web page issued twice) --------------------
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      const [profileData, financeData, reservasData, paquetesData] =
        await Promise.all([
          api.get<ProfileFetch>('/usuarios/me/profile').catch(() => null),
          api.get<PagosResponse>('/pagos').catch(() => null),
          api
            .get<ReservaDto[]>('/reservas?filter=future')
            .catch(() => null),
          api.get<PaqueteActivo[]>('/paquetes/mios').catch(() => null),
        ]);

      if (cancelled) return;

      if (profileData) {
        const u = profileData;
        const mapped: UserData = {
          name: u.nombre || user.nombre || userData.name,
          apto: u.unidad?.numero || u.apto || 'S/N',
          torre: u.unidad?.torre || u.torre || 'S/T',
          phone: u.telefono || '',
          gender: u.genero || 'neutro',
          email: u.email || user.email || '',
          bio: u.bio || userData.bio,
          numeroInterno: u.numeroInterno || '',
        };
        setUserData(mapped);
        setEditForm(mapped);
        setVehiculos(u.vehiculos || []);
        setMascotas(u.mascotas || []);
        setTramites(u.tramitesSolicitados || []);
        if (u.avatar) setProfilePic(u.avatar);
      }

      if (financeData) {
        const pagos = (financeData.pagos || []) as unknown as Pago[];
        const recibos = (financeData.recibos || []) as unknown as Recibo[];
        const totalDebt = computeDebt(pagos, recibos);
        setFinancialData({ pagos, recibos, totalDebt });
      }

      if (reservasData) {
        setActiveReservas(
          reservasData.map((r) => ({
            estado: r.estado,
            fechaInicio: r.fechaInicio,
            fechaFin: r.fechaFin,
            area: { nombre: r.areaNombre, imagenUrl: r.areaImagenUrl ?? undefined },
          })),
        );
      }

      setActivePaquetes(paquetesData || []);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId]);

  // -- image compression (expo-image-manipulator: resize 400, jpeg q0.8) ----
  const compressImage = useCallback(async (uri: string): Promise<string> => {
    const ctx = ImageManipulator.manipulate(uri).resize({ width: 400 });
    const ref = await ctx.renderAsync();
    const result = await ref.saveAsync({
      compress: 0.8,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return `data:image/jpeg;base64,${result.base64 ?? ''}`;
  }, []);

  // -- avatar change --------------------------------------------------------
  const handlePhotoChange = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Permiso de galería denegado');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return;

    try {
      const compressed = await compressImage(res.assets[0].uri);
      setProfilePic(compressed);
      if (userId) {
        await SecureStore.setItemAsync(picKey(userId), compressed).catch(
          () => {},
        );
      }
      try {
        await api.put('/usuarios/me/profile', { avatar: compressed });
        toast.success('Foto de perfil actualizada');
      } catch {
        toast.success('Foto cargada localmente');
      }
    } catch {
      toast.error('Error al procesar la imagen');
    }
  }, [compressImage, userId]);

  // -- profile update -------------------------------------------------------
  const handleUpdateProfile = useCallback(async () => {
    setIsSubmitting(true);
    try {
      // Remap the local english keys to the Spanish API keys.
      await api.put('/usuarios/me/profile', {
        nombre: editForm.name,
        telefono: editForm.phone,
        genero: editForm.gender,
        torre: editForm.torre,
        apto: editForm.apto,
      });
      setUserData(editForm);
      if (userId) {
        await SecureStore.setItemAsync(
          dataKey(userId),
          JSON.stringify(editForm),
        ).catch(() => {});
      }
      setShowEditModal(false);
      toast.success('Perfil actualizado con éxito');
    } catch {
      toast.error('Fallo de conexión');
    } finally {
      setIsSubmitting(false);
    }
  }, [editForm, userId]);

  // -- logout ---------------------------------------------------------------
  const handleLogout = useCallback(async () => {
    // SecureStore has no getAllKeys, so useAuth's clearCachedProfilePii sweep
    // (AsyncStorage-only) can't reach the avatar/profile PII this screen
    // persisted under picKey/dataKey. Delete those keys explicitly here before
    // logout so cached personal data never survives sign-out (spec #9).
    if (userId) {
      await Promise.all([
        SecureStore.deleteItemAsync(picKey(userId)).catch(() => {}),
        SecureStore.deleteItemAsync(dataKey(userId)).catch(() => {}),
      ]);
    }
    await logout();
    router.replace('/login');
    toast.success('Sesión cerrada');
  }, [logout, router, userId]);

  // -- registration: file pickers ------------------------------------------
  const addImageDocs = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      base64: true,
      quality: 1,
    });
    if (res.canceled || !res.assets) return;
    for (const asset of res.assets) {
      try {
        // Compress images to keep the base64 payload edge-friendly.
        const finalBase = await compressImage(asset.uri);
        setRegDocs((prev) => [
          ...prev,
          {
            nombre: asset.fileName || `imagen-${prev.length + 1}.jpg`,
            base64: finalBase,
            mimeType: 'image/jpeg',
          },
        ]);
      } catch {
        toast.error('No se pudo procesar la imagen');
      }
    }
  }, [compressImage]);

  const addPdfDocs = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: true,
      copyToCacheDirectory: true,
      base64: true,
    });
    if (res.canceled || !res.assets) return;
    for (const asset of res.assets) {
      // backend `deny_unknown_fields` requires the real mimeType.
      const mimeType = asset.mimeType || 'application/pdf';
      const b64 = asset.base64
        ? `data:${mimeType};base64,${asset.base64}`
        : asset.uri;
      setRegDocs((prev) => [
        ...prev,
        { nombre: asset.name, base64: b64, mimeType },
      ]);
    }
  }, []);

  // -- registration submit (POST /tramites) --------------------------------
  const handleRegisterAsset = useCallback(async () => {
    if (regDocs.length === 0) {
      toast.error('Debes adjuntar al menos un documento');
      return;
    }
    setIsRegSubmitting(true);
    try {
      let payload: Record<string, unknown> = { ...regForm };
      if (regType === 'VEHICULO') {
        if (!regForm.tipoVehiculo) {
          toast.error('Selecciona la clase de vehículo');
          setIsRegSubmitting(false);
          return;
        }
        payload = {
          placa: regForm.placa.trim().toUpperCase(),
          marca: regForm.marca || undefined,
          modelo: regForm.modelo || undefined,
          color: regForm.color || undefined,
          tipo: regForm.tipoVehiculo,
        };
      } else if (regType === 'MASCOTA') {
        payload = {
          nombre: regForm.nombre,
          tipo: regForm.tipo,
          raza: regForm.raza || undefined,
        };
      }

      await api.post('/tramites', {
        tipo: regType as TipoTramite,
        payload,
        documentos: regDocs,
      });
      toast.success('Solicitud enviada. Sujeta a aprobación administrativa.');
      setShowRegModal(false);
      setRegDocs([]);
      setRegForm({
        nombre: '',
        tipo: '',
        raza: '',
        placa: '',
        marca: '',
        modelo: '',
        ano: '',
        color: '',
        tipoVehiculo: '',
      });
      const refreshed = await api
        .get<ProfileFetch>('/usuarios/me/profile')
        .catch(() => null);
      if (refreshed) setTramites(refreshed.tramitesSolicitados || []);
    } catch {
      toast.error('Error de conexión');
    } finally {
      setIsRegSubmitting(false);
    }
  }, [regDocs, regForm, regType]);

  // -- pay (gated OFF) ------------------------------------------------------
  const handlePay = useCallback(
    async (id: string) => {
      if (!PAYMENTS_ENABLED) {
        toast.error(PAYMENTS_DISABLED_MSG);
        return;
      }
      // Payments are disabled in this build; the PSE/optimistic path below is
      // dead code until a real gateway is wired (kept for parity).
      setIsPaying(true);
      try {
        await api.put(`/pagos/${id}/pagar`, { metodo: 'PSE' });
        toast.success('¡Pago confirmado por la entidad financiera!');
        setFinancialData((prev) => {
          const updatedPagos = prev.pagos.map((p) =>
            p.id === id
              ? { ...p, estado: 'PAGADO', fechaPago: new Date().toISOString() }
              : p,
          );
          const updatedRecibos = prev.recibos.map((r) =>
            r.id === id
              ? { ...r, pagado: true, fechaPago: new Date().toISOString() }
              : r,
          );
          return {
            ...prev,
            pagos: updatedPagos,
            recibos: updatedRecibos,
            totalDebt: computeDebt(updatedPagos, updatedRecibos),
          };
        });
        api.get<PagosResponse>('/pagos').then((d) => {
          const pagos = (d.pagos || []) as unknown as Pago[];
          const recibos = (d.recibos || []) as unknown as Recibo[];
          setFinancialData({
            pagos,
            recibos,
            totalDebt: computeDebt(pagos, recibos),
          });
        });
      } catch {
        toast.error('Fallo de conexión con la pasarela');
      } finally {
        setIsPaying(false);
      }
    },
    [],
  );

  const userRole = user?.rol || 'RESIDENTE';

  const statusIcons: {
    label: string;
    val: string;
    view: ViewMode;
    icon: React.ReactNode;
    deuda?: boolean;
  }[] = [
    {
      label: 'Deuda',
      val: `$${money(financialData.totalDebt)}`,
      view: 'deuda',
      icon: <CreditCard size={12} color={C.onAccent} />,
      deuda: true,
    },
    {
      label: 'Trámites',
      val: String(tramites.length),
      view: 'requests',
      icon: <ClipboardList size={12} color={C.text} />,
    },
    {
      label: 'Mascotas',
      val: String(mascotas.length),
      view: 'pets',
      icon: <PawPrint size={12} color={C.text} />,
    },
    {
      label: 'Vehículos',
      val: String(vehiculos.length),
      view: 'vehicles',
      icon: <Car size={12} color={C.text} />,
    },
    {
      label: 'Reservas',
      val: String(activeReservas.length),
      view: 'reservas',
      icon: <Calendar size={12} color={C.text} />,
    },
    {
      label: 'Paquetes',
      val: String(activePaquetes.length),
      view: 'paquetes',
      icon: <Package size={12} color={C.text} />,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ---- HERO (simplified: one blurred bg image + gradient fade) ---- */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420, overflow: 'hidden' }}>
        <Image
          source={{ uri: profilePic }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          contentPosition="top"
          blurRadius={Platform.OS === 'android' ? 12 : 24}
          transition={300}
        />
        <BlurView
          intensity={20}
          tint={isLight ? 'light' : 'dark'}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 180 }}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        />
        <LinearGradient
          colors={['transparent', isLight ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', C.bg]}
          locations={[0, 0.55, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 360 }}
        />
      </View>

      {/* ---- TOP NAV (fixed overlay) ---- */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 0,
          right: 0,
          paddingHorizontal: 24,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 50,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
        >
          <LiquidGlass className="rounded-full" radius={24} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={24} color={C.text} />
          </LiquidGlass>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <LiquidGlass className="rounded-full" radius={24} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Search size={20} color={C.text} />
          </LiquidGlass>
          <Pressable
            onPress={() => setShowMenu((s) => !s)}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
          >
            <LiquidGlass className="rounded-full" radius={24} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <MoreHorizontal size={20} color={C.text} />
            </LiquidGlass>
          </Pressable>
        </View>
      </View>

      {/* ---- DROPDOWN MENU ---- */}
      {showMenu && hasMounted ? (
        <>
          <Pressable
            onPress={() => setShowMenu(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 90 }}
          />
          <View
            style={{
              position: 'absolute',
              top: insets.top + 64,
              right: 24,
              width: 208,
              zIndex: 100,
            }}
          >
            <LiquidGlass radius={24} style={{ overflow: 'hidden' }}>
              <Pressable
                onPress={() => {
                  setEditForm({ ...userData });
                  setShowEditModal(true);
                  setShowMenu(false);
                }}
                style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: C.border }}
              >
                <UserIcon size={18} color={C.accent} />
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Editar Perfil</Text>
              </Pressable>
              <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <ShieldCheck size={18} color={C.text} />
                <Text style={{ color: C.text, fontWeight: '500', fontSize: 15 }}>Privacidad</Text>
              </View>
              <Pressable
                onPress={() => {
                  setShowMenu(false);
                  void handleLogout();
                }}
                style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <LogOut size={18} color={C.text} />
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Cerrar Sesión</Text>
              </Pressable>
            </LiquidGlass>
          </View>
        </>
      ) : null}

      {/* ---- SCROLL BODY ---- */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 280, paddingHorizontal: 24, paddingBottom: 128 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ color: C.text, fontSize: 34, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: -0.5 }}>
            {userData.name}
          </Text>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '300', textTransform: 'capitalize', letterSpacing: 0.5 }}>
            {userRole.toLowerCase()}
          </Text>
        </View>

        {/* Pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginBottom: 40 }}>
          <Pill text={`Torre ${userData.torre}`} C={C} />
          <Pill text={`Apto ${userData.apto}`} C={C} />
          {userData.numeroInterno ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: C.border }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} />
              <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                Citofonía N° {userData.numeroInterno}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 6-button status grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 40 }}>
          {statusIcons.map((stat) => {
            const wide = stat.label === 'Reservas' || stat.label === 'Paquetes';
            return (
              <Pressable
                key={stat.label}
                onPress={() => setViewMode(stat.view)}
                style={({ pressed }) => ({
                  width: wide ? '32%' : '23%',
                  marginBottom: 10,
                  alignItems: 'center',
                  gap: 8,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '900' }}>
                  {stat.label}
                </Text>
                <View
                  style={{
                    width: '100%',
                    height: 62,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: C.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: stat.deuda ? C.accent : C.faint,
                  }}
                >
                  {!stat.deuda ? <View style={{ opacity: 0.6 }}>{stat.icon}</View> : null}
                  <Text
                    style={{
                      color: stat.deuda ? C.onAccent : C.text,
                      fontWeight: '900',
                      fontSize: stat.label === 'Vehículos' ? 14 : 12,
                      textTransform: 'uppercase',
                    }}
                    numberOfLines={1}
                  >
                    {stat.val}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Dynamic view content */}
        <View style={{ marginBottom: 40 }}>
          {viewMode === 'profile' ? (
            <GlassPanel C={C}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <UserIcon size={24} color={C.accent} />
                </View>
                <View>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.3 }}>Información</Text>
                  <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '900' }}>Datos Personales</Text>
                </View>
              </View>
              <Field label="Correo Electrónico" value={userData.email} C={C} />
              <Field label="Teléfono" value={userData.phone || 'No especificado'} C={C} />
            </GlassPanel>
          ) : null}

          {viewMode === 'reservas' ? (
            <View style={{ gap: 16 }}>
              <SectionHeader
                title="Mis Reservas Activas"
                icon={<Calendar size={18} color={C.accent} />}
                actionLabel="Solicitar Nueva"
                onAction={() => router.push('/(app)/reservas' as never)}
                C={C}
              />
              {activeReservas.length === 0 ? (
                <EmptyState icon={<Calendar size={40} color={C.text} />} text="No tienes reservas activas en este momento." C={C} />
              ) : (
                activeReservas.map((res, i) => (
                  <View key={i} style={{ borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: C.border, flexDirection: 'row', backgroundColor: C.faint }}>
                    <View style={{ width: 96, height: 96 }}>
                      {res.area?.imagenUrl ? (
                        <Image source={{ uri: res.area.imagenUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : (
                        <View style={{ width: '100%', height: '100%', backgroundColor: C.faint, alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
                          <Calendar size={24} color={C.text} />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, padding: 16, justifyContent: 'space-between' }}>
                      <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '900', color: C.accent, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                            {res.area?.nombre || 'Cargando...'}
                          </Text>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)' }}>
                            <Text style={{ fontSize: 8, fontWeight: '900', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                              {res.estado === 'PENDIENTE' ? 'En Proceso' : res.estado}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, textTransform: 'capitalize' }}>{fmtDateShort(res.fechaInicio)}</Text>
                      </View>
                      <Text style={{ fontSize: 10, color: C.text, fontVariant: ['tabular-nums'] }}>
                        {fmtTime(res.fechaInicio)} • {fmtTime(res.fechaFin)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {viewMode === 'vehicles' ? (
            <View style={{ gap: 16 }}>
              <SectionHeader
                title="Mis Vehículos"
                icon={<Car size={18} color={C.accent} />}
                actionLabel="Solicitar Vinculación"
                actionIcon={<Plus size={14} color={C.accent} />}
                onAction={() => {
                  setRegType('VEHICULO');
                  setShowRegModal(true);
                }}
                C={C}
              />
              {vehiculos.length === 0 ? (
                <Text style={{ color: C.muted, fontSize: 14, fontStyle: 'italic', paddingHorizontal: 8 }}>No tienes vehículos registrados.</Text>
              ) : (
                vehiculos.map((v, i) => (
                  <View key={i} style={{ borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.faint }}>
                    <View>
                      <Text style={{ fontSize: 24, fontWeight: '900', color: C.text, letterSpacing: 2, fontVariant: ['tabular-nums'], textTransform: 'uppercase' }}>{v.placa}</Text>
                      <Text style={{ fontSize: 12, color: C.muted }}>{v.marca} {v.modelo} • {v.color}</Text>
                    </View>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={18} color={C.accent} />
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {viewMode === 'pets' ? (
            <View style={{ gap: 16 }}>
              <SectionHeader
                title="Mis Mascotas"
                icon={<PawPrint size={18} color={C.text} />}
                actionLabel="Solicitar Vinculación"
                actionIcon={<Plus size={14} color={C.text} />}
                onAction={() => {
                  setRegType('MASCOTA');
                  setShowRegModal(true);
                }}
                C={C}
              />
              {mascotas.length === 0 ? (
                <Text style={{ color: C.muted, fontSize: 14, fontStyle: 'italic', paddingHorizontal: 8 }}>No tienes mascotas registradas.</Text>
              ) : (
                mascotas.map((m, i) => (
                  <View key={i} style={{ borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, flexDirection: 'row', gap: 16, alignItems: 'center', backgroundColor: C.faint }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, overflow: 'hidden', borderWidth: 2, borderColor: C.border }}>
                      {m.fotoUrl ? (
                        <Image source={{ uri: m.fotoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : (
                        <View style={{ width: '100%', height: '100%', backgroundColor: C.faint, alignItems: 'center', justifyContent: 'center' }}>
                          <PawPrint color={C.text} />
                        </View>
                      )}
                    </View>
                    <View>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: C.text, textTransform: 'capitalize' }}>{m.nombre}</Text>
                      <Text style={{ fontSize: 12, color: C.muted }}>{m.tipo} • {m.raza || 'Cruce'}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {viewMode === 'requests' ? (
            <View style={{ gap: 16 }}>
              <SectionHeader title="Trámites y Solicitudes" icon={<ClipboardList size={18} color={C.accent} />} C={C} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 }}>
                {[
                  { label: 'Cambiar Celular', type: 'CELULAR', icon: <Phone size={16} color={C.accent} /> },
                  { label: 'Cambiar Correo', type: 'EMAIL', icon: <Mail size={16} color={C.accent} /> },
                  { label: 'Cambiar Clave', type: 'PASSWORD', icon: <Lock size={16} color={C.accent} /> },
                  { label: 'Otro Trámite', type: 'OTRO', icon: <HelpCircle size={16} color={C.accent} /> },
                ].map((btn, i) => (
                  <Pressable
                    key={i}
                    onPress={() => {
                      if (btn.type === 'OTRO') {
                        setRegType('VEHICULO');
                        setShowRegModal(true);
                      } else {
                        toast.info(`Iniciando solicitud de: ${btn.label}`);
                        setRegType('OTRO');
                        setRegForm((prev) => ({ ...prev, tipo: btn.type }));
                        setShowRegModal(true);
                      }
                    }}
                    style={({ pressed }) => ({
                      width: '48%',
                      marginBottom: 12,
                      borderRadius: 16,
                      padding: 16,
                      alignItems: 'center',
                      gap: 12,
                      borderWidth: 1,
                      borderColor: C.border,
                      backgroundColor: C.faint,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      {btn.icon}
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center' }}>{btn.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '900', marginLeft: 8, marginBottom: 8 }}>Solicitudes Recientes</Text>
              {tramites.length === 0 ? (
                <Text style={{ color: C.muted, fontSize: 12, fontStyle: 'italic', marginLeft: 8 }}>No hay trámites pendientes.</Text>
              ) : (
                tramites.map((t, i) => (
                  <View key={i} style={{ borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.faint }}>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, textTransform: 'capitalize' }}>{t.tipo.toLowerCase()}</Text>
                      {/* fix: use createdAt for tramite date */}
                      <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>{fmtDateDMY(t.createdAt)}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)' }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>{t.estado}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {viewMode === 'deuda' ? (
            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>Estado de Cuenta</Text>
                <View style={{ flexDirection: 'row', gap: 8, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.faint }}>
                  {(['pendientes', 'historial'] as const).map((tab) => (
                    <Pressable key={tab} onPress={() => setFinancialTab(tab)} style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: financialTab === tab ? C.accent : 'transparent' }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, color: financialTab === tab ? C.onAccent : C.text }}>{tab}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {financialTab === 'pendientes' ? (
                <>
                  {financialData.pagos.filter((p) => p.estado !== 'PAGADO').map((p, i) => (
                    <ChargeRow
                      key={`pago-${i}`}
                      tag="Administración"
                      title={p.concepto}
                      sub={`Vence: ${fmtDateDMY(p.fechaVencimiento)}`}
                      amount={money(p.monto)}
                      actionLabel="Pagar"
                      onPay={() => handlePay(p.id)}
                      C={C}
                    />
                  ))}
                  {financialData.recibos.filter((r) => !r.pagado).map((r, i) => (
                    <ChargeRow
                      key={`recibo-${i}`}
                      tag="Servicios Públicos"
                      title={r.servicio}
                      sub={`Vence: ${fmtDateDMY(r.vencimiento)}`}
                      amount={money(r.monto)}
                      actionLabel="Pagar Ahora"
                      onPay={() => handlePay(r.id)}
                      C={C}
                    />
                  ))}
                  {financialData.pagos.filter((p) => p.estado !== 'PAGADO').length === 0 &&
                  financialData.recibos.filter((r) => !r.pagado).length === 0 ? (
                    <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                      <Text style={{ color: C.muted, fontSize: 14, fontStyle: 'italic' }}>No tienes deudas pendientes.</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  {(() => {
                    const history = [
                      ...financialData.pagos.filter((p) => p.estado === 'PAGADO'),
                      ...financialData.recibos.filter((r) => r.pagado),
                    ] as Array<Pago | Recibo>;
                    if (history.length === 0) {
                      return <Text style={{ color: C.muted, fontSize: 12, fontStyle: 'italic', marginLeft: 8 }}>No hay registros de pagos anteriores.</Text>;
                    }
                    return history
                      .sort(
                        (a, b) =>
                          new Date(b.fechaPago || b.createdAt || '').getTime() -
                          new Date(a.fechaPago || a.createdAt || '').getTime(),
                      )
                      .map((item, i) => (
                        <View key={i} style={{ borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.faint }}>
                          <View>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
                              {(item as Pago).concepto || (item as Recibo).servicio}
                            </Text>
                            <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>
                              Pagado el: {fmtDateDMY(item.fechaPago || item.createdAt)}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: C.text }}>${money(item.monto)}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={10} color={C.text} />
                              <Text style={{ fontSize: 8, color: C.text, textTransform: 'uppercase', fontWeight: '900' }}>Conciliado</Text>
                            </View>
                          </View>
                        </View>
                      ));
                  })()}
                </>
              )}
            </View>
          ) : null}

          {viewMode === 'paquetes' ? (
            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>Paquetes en Portería</Text>
                  <Package size={18} color={C.accent} />
                </View>
                <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: C.accent, textTransform: 'uppercase' }}>
                    {activePaquetes.length} {activePaquetes.length === 1 ? 'Pendiente' : 'Pendientes'}
                  </Text>
                </View>
              </View>
              {activePaquetes.length === 0 ? (
                <EmptyState icon={<Package size={40} color={C.text} />} text="No hay paquetes registrados a tu nombre en este momento." C={C} />
              ) : (
                activePaquetes.map((pkg, i) => (
                  <View key={i} style={{ borderRadius: 28, borderWidth: 1, borderColor: C.border, backgroundColor: C.faint, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={24} color={C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '900', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                          {pkg.remitente || 'Remitente Desconocido'}
                        </Text>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }}>
                          <Text style={{ fontSize: 8, fontWeight: '900', color: C.accent, textTransform: 'uppercase' }}>{pkg.origen || 'Nacional'}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 }}>Guía: {pkg.guia || 'S/G'}</Text>
                      <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>Recibido: {fmtArrived(pkg.fechaLlegada)}</Text>
                    </View>
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)' }} />
                      <Text style={{ fontSize: 8, fontWeight: '900', color: C.text, textTransform: 'uppercase' }}>Listo</Text>
                    </View>
                  </View>
                ))
              )}
              <View style={{ marginTop: 16, padding: 16, borderRadius: 24, backgroundColor: C.faint, borderWidth: 1, borderColor: C.border, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Info size={16} color={C.text} />
                <Text style={{ flex: 1, fontSize: 10, color: C.text, textTransform: 'uppercase', fontStyle: 'italic' }}>
                  Recuerda presentar tu identificación o el número de guía para retirar tus paquetes en la portería principal.
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Theme + Logout */}
        <View style={{ gap: 12, marginBottom: 32 }}>
          <Pressable onPress={toggleTheme} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <LiquidGlass radius={32} style={{ padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  {theme === 'dark' ? <Sun size={20} color={C.accent} /> : <Moon size={20} color={C.accent} />}
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</Text>
                  <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '900', marginTop: 4 }}>
                    {theme === 'dark' ? 'Cambiar a visualización clara' : 'Cambiar a visualización oscura'}
                  </Text>
                </View>
              </View>
              <ArrowRight size={18} color={C.muted} />
            </LiquidGlass>
          </Pressable>

          <Pressable onPress={() => void handleLogout()} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <LiquidGlass radius={32} style={{ padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  <LogOut size={20} color={C.muted} />
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Cerrar Sesión</Text>
                  <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '900', marginTop: 4 }}>Desvincular dispositivo</Text>
                </View>
              </View>
              <ArrowRight size={18} color={C.muted} />
            </LiquidGlass>
          </Pressable>
        </View>
      </ScrollView>

      {/* ---- EDIT MODAL ---- */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowEditModal(false)} />
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 40, borderTopRightRadius: 40, borderTopWidth: 1, borderColor: C.border, maxHeight: '90%' }}>
            <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
              <ModalHeader title="Editar Perfil" subtitle="Configuración personal" onClose={() => setShowEditModal(false)} C={C} />
              {/* Avatar */}
              <View style={{ alignItems: 'center', marginBottom: 28 }}>
                <View>
                  <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
                    <Image source={{ uri: profilePic }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  </View>
                  <Pressable
                    onPress={() => void handlePhotoChange()}
                    style={{ position: 'absolute', bottom: -4, right: -4, width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg }}
                  >
                    <Camera size={18} color={C.onAccent} />
                  </Pressable>
                </View>
              </View>

              <LabeledInput label="Nombre Completo" value={editForm.name} onChangeText={(t) => setEditForm({ ...editForm, name: t })} C={C} />
              <LabeledInput label="Torre" value={editForm.torre} editable={false} C={C} />
              <LabeledInput label="Apto" value={editForm.apto} editable={false} C={C} />
              <LabeledInput label="Teléfono Móvil" value={editForm.phone} onChangeText={(t) => setEditForm({ ...editForm, phone: t })} keyboardType="phone-pad" C={C} />

              {/* Género selector (action-style buttons in place of <select>) */}
              <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700', marginLeft: 4, marginBottom: 8, marginTop: 16 }}>Género</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {[
                  { v: 'masculino', l: 'Masculino' },
                  { v: 'femenino', l: 'Femenino' },
                  { v: 'otro', l: 'Otro' },
                  { v: 'neutro', l: 'Prefiero no decir' },
                ].map((g) => (
                  <Pressable
                    key={g.v}
                    onPress={() => setEditForm({ ...editForm, gender: g.v })}
                    style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: editForm.gender === g.v ? C.accent : C.border, backgroundColor: editForm.gender === g.v ? (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)') : C.faint }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: editForm.gender === g.v ? C.accent : C.text }}>{g.l}</Text>
                  </Pressable>
                ))}
              </View>

              <SubmitButton label={isSubmitting ? 'Guardando...' : 'Guardar Cambios'} loading={isSubmitting} onPress={() => void handleUpdateProfile()} C={C} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---- REGISTRATION / TRAMITE MODAL ---- */}
      <Modal visible={showRegModal} transparent animationType="slide" onRequestClose={() => setShowRegModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowRegModal(false)} />
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 40, borderTopRightRadius: 40, borderTopWidth: 1, borderColor: C.border, maxHeight: '92%' }}>
            <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
              <ModalHeader
                title={regType === 'VEHICULO' ? 'Registrar Vehículo' : regType === 'MASCOTA' ? 'Registrar Mascota' : 'Solicitud de Trámite'}
                subtitle={regType === 'OTRO' ? 'Actualización de Datos Sensibles' : 'Solicitud de Vinculación Oficial'}
                onClose={() => setShowRegModal(false)}
                C={C}
              />

              {regType === 'VEHICULO' ? (
                <>
                  <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '900', marginLeft: 4, marginBottom: 6 }}>Clase de Vehículo</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    {['CARRO', 'MOTO'].map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setRegForm({ ...regForm, tipoVehiculo: t })}
                        style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: regForm.tipoVehiculo === t ? C.accent : C.border, backgroundColor: regForm.tipoVehiculo === t ? (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)') : C.faint }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: regForm.tipoVehiculo === t ? C.accent : C.text }}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <LabeledInput label="Marca" placeholder="Ej: Toyota" value={regForm.marca} onChangeText={(t) => setRegForm({ ...regForm, marca: t })} C={C} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <LabeledInput label="Modelo" placeholder="Ej: Corolla" value={regForm.modelo} onChangeText={(t) => setRegForm({ ...regForm, modelo: t })} C={C} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <LabeledInput label="Año" placeholder="2024" value={regForm.ano} onChangeText={(t) => setRegForm({ ...regForm, ano: t })} keyboardType="number-pad" C={C} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <LabeledInput label="Color" placeholder="Blanco" value={regForm.color} onChangeText={(t) => setRegForm({ ...regForm, color: t })} C={C} />
                    </View>
                  </View>
                  <LabeledInput label="Placa" placeholder="ABC-123" value={regForm.placa} onChangeText={(t) => setRegForm({ ...regForm, placa: t })} autoCapitalize="characters" C={C} />
                </>
              ) : regType === 'MASCOTA' ? (
                <>
                  <LabeledInput label="Nombre de la Mascota" placeholder="Ej: Toby" value={regForm.nombre} onChangeText={(t) => setRegForm({ ...regForm, nombre: t })} C={C} />
                  <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '900', marginLeft: 4, marginBottom: 6, marginTop: 4 }}>Tipo</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    {['PERRO', 'GATO', 'OTRO'].map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setRegForm({ ...regForm, tipo: t })}
                        style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: regForm.tipo === t ? C.accent : C.border, backgroundColor: regForm.tipo === t ? (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)') : C.faint }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: regForm.tipo === t ? C.accent : C.text }}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <LabeledInput label="Raza" placeholder="Ej: Criollo" value={regForm.raza} onChangeText={(t) => setRegForm({ ...regForm, raza: t })} C={C} />
                </>
              ) : (
                <>
                  <LabeledInput
                    label={regForm.tipo === 'CELULAR' ? 'Nuevo Número Celular' : regForm.tipo === 'EMAIL' ? 'Nuevo Correo Electrónico' : regForm.tipo === 'PASSWORD' ? 'Nueva Contraseña' : 'Descripción del Trámite'}
                    placeholder={regForm.tipo === 'CELULAR' ? 'Ej: 3001234567' : regForm.tipo === 'EMAIL' ? 'Ej: nuevo@correo.com' : 'Escribe aquí...'}
                    value={regForm.nombre}
                    onChangeText={(t) => setRegForm({ ...regForm, nombre: t })}
                    secureTextEntry={regForm.tipo === 'PASSWORD'}
                    C={C}
                  />
                  <View style={{ padding: 16, borderRadius: 16, backgroundColor: C.faint, borderWidth: 1, borderColor: C.border, marginBottom: 4 }}>
                    <Text style={{ fontSize: 10, color: C.text, fontStyle: 'italic' }}>
                      * Al solicitar este cambio, recibirás una notificación una vez el administrador haya verificado y aprobado la actualización.
                    </Text>
                  </View>
                </>
              )}

              {/* Documentation dropzone */}
              <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '900', marginLeft: 4, marginBottom: 12, marginTop: 16 }}>Documentación Requerida (PDF/IMG)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {regDocs.map((doc, idx) => (
                  <View key={idx} style={{ width: '31%', aspectRatio: 1, borderRadius: 16, backgroundColor: C.faint, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', padding: 8, overflow: 'hidden' }}>
                    {doc.mimeType === 'application/pdf' ? (
                      <FileText size={20} color={C.text} />
                    ) : (
                      <Image source={{ uri: doc.base64 }} style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.6 }} contentFit="cover" />
                    )}
                    <Text style={{ fontSize: 8, color: C.text, textAlign: 'center', marginTop: 4 }} numberOfLines={1}>{doc.nombre}</Text>
                    <Pressable onPress={() => setRegDocs((prev) => prev.filter((_, i) => i !== idx))} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => void addImageDocs()} style={{ width: '31%', aspectRatio: 1, borderRadius: 16, borderWidth: 2, borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={20} color={C.text} />
                  <Text style={{ fontSize: 8, color: C.text, marginTop: 4, textTransform: 'uppercase', fontWeight: '700' }}>Imagen</Text>
                </Pressable>
                <Pressable onPress={() => void addPdfDocs()} style={{ width: '31%', aspectRatio: 1, borderRadius: 16, borderWidth: 2, borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={20} color={C.text} />
                  <Text style={{ fontSize: 8, color: C.text, marginTop: 4, textTransform: 'uppercase', fontWeight: '700' }}>PDF</Text>
                </Pressable>
              </View>
              <Text style={{ fontSize: 9, color: C.muted, fontStyle: 'italic', paddingHorizontal: 4, marginTop: 8 }}>
                {regType === 'VEHICULO'
                  ? 'Adjuntar: SOAT, Técnico-Mecánica, Licencia y Matrícula.'
                  : regType === 'MASCOTA'
                    ? 'Adjuntar: Certificado de Vacunación actualizado.'
                    : 'Adjuntar: Copia de Cédula o Documento que soporte el cambio.'}
              </Text>

              {/* Coexistence notice */}
              <View style={{ padding: 20, borderRadius: 24, backgroundColor: C.faint, borderWidth: 1, borderColor: C.border, flexDirection: 'row', gap: 16, marginTop: 16 }}>
                <Info size={20} color={C.text} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>Aviso de Reglas y Convivencia</Text>
                  <Text style={{ fontSize: 10, color: C.text, lineHeight: 16 }}>
                    La vinculación está sujeta a aprobación administrativa y disponibilidad. Es indispensable estar a paz y salvo. Queda prohibido el lavado o reparaciones de vehículos en áreas comunes.
                    {'\n'}⚠️ El incumplimiento de las normas de convivencia puede generar multas pecuniarias.
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 20 }}>
                <SubmitButton label={isRegSubmitting ? 'Enviando...' : 'Enviar Solicitud'} loading={isRegSubmitting} onPress={() => void handleRegisterAsset()} C={C} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---- PSE PROCESSING OVERLAY (stub; dead while payments are OFF) ---- */}
      {isPaying ? (
        <View style={{ position: 'absolute', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 40, padding: 40, alignItems: 'center' }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
              <ShieldCheck size={40} color="#000" />
            </View>
            <Text style={{ color: '#000', fontSize: 22, fontWeight: '900', marginBottom: 12 }}>Procesando Pago</Text>
            <Text style={{ color: '#444', fontSize: 14, textAlign: 'center', marginBottom: 32 }}>
              Estamos conectando de forma segura con tu entidad financiera a través de PSE. Por favor, no cierres esta ventana.
            </Text>
            <Text style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '700' }}>Transacción Encriptada 256-bit</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers + small sub-components
// ---------------------------------------------------------------------------

type Palette = {
  bg: string;
  text: string;
  accent: string;
  onAccent: string;
  muted: string;
  faint: string;
  border: string;
};

function computeDebt(pagos: Pago[], recibos: Recibo[]): number {
  const items: Array<Pago | Recibo> = [...pagos, ...recibos];
  return items
    .filter((p) => {
      const estado = (p as Pago).estado;
      const pagado = (p as Recibo).pagado;
      return estado === 'PENDIENTE' || estado === 'VENCIDO' || pagado === false;
    })
    .reduce((acc, p) => acc + parseFloat(String(p.monto) || '0'), 0);
}

function Pill({ text, C }: { text: string; C: Palette }) {
  return (
    <LiquidGlass className="rounded-full" radius={999} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.muted }} />
        <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>{text}</Text>
      </View>
    </LiquidGlass>
  );
}

function GlassPanel({ children, C }: { children: React.ReactNode; C: Palette }) {
  return (
    <LiquidGlass variant="card" radius={32} style={{ padding: 24 }}>
      <View style={{ borderWidth: 0, borderColor: C.border }}>{children}</View>
    </LiquidGlass>
  );
}

function Field({ label, value, C }: { label: string; value: string; C: Palette }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '900', marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '500', color: C.text }}>{value}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  icon,
  actionLabel,
  actionIcon,
  onAction,
  C,
}: {
  title: string;
  icon: React.ReactNode;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  C: Palette;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>{title}</Text>
        {icon}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
          {actionIcon}
          <Text style={{ fontSize: 10, fontWeight: '900', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyState({ icon, text, C }: { icon: React.ReactNode; text: string; C: Palette }) {
  return (
    <View style={{ paddingVertical: 48, paddingHorizontal: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: C.border, borderRadius: 32, alignItems: 'center' }}>
      <View style={{ marginBottom: 12, opacity: 0.5 }}>{icon}</View>
      <Text style={{ color: C.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function ChargeRow({
  tag,
  title,
  sub,
  amount,
  actionLabel,
  onPay,
  C,
}: {
  tag: string;
  title: string;
  sub: string;
  amount: string;
  actionLabel: string;
  onPay: () => void;
  C: Palette;
}) {
  return (
    <View style={{ borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.faint }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '900', marginBottom: 4 }}>{tag}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', marginTop: 4 }}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: C.text }}>${amount}</Text>
        <Pressable onPress={onPay} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: C.faint, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontSize: 10, fontWeight: '900', color: C.text, textTransform: 'uppercase' }}>{actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ModalHeader({ title, subtitle, onClose, C }: { title: string; subtitle: string; onClose: () => void; C: Palette }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
      <View>
        <Text style={{ fontSize: 24, fontWeight: '700', color: C.text, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: -0.3 }}>{title}</Text>
        <Text style={{ fontSize: 10, color: C.accent, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '900', marginTop: 4 }}>{subtitle}</Text>
      </View>
      <Pressable onPress={onClose} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.faint, alignItems: 'center', justifyContent: 'center' }}>
        <X size={20} color={C.text} />
      </Pressable>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  C,
}: {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  placeholder?: string;
  editable?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  C: Palette;
}) {
  return (
    <View style={{ marginBottom: 16, opacity: editable ? 1 : 0.5 }}>
      <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700', marginLeft: 4, marginBottom: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        editable={editable}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        style={{
          backgroundColor: C.faint,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 20,
          padding: 16,
          fontSize: 15,
          color: C.text,
        }}
      />
    </View>
  );
}

function SubmitButton({ label, loading, onPress, C }: { label: string; loading: boolean; onPress: () => void; C: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        backgroundColor: C.accent,
        borderRadius: 24,
        paddingVertical: 20,
        alignItems: 'center',
        opacity: loading ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: C.onAccent, fontSize: 16, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
