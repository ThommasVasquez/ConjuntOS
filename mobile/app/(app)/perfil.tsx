import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { blurTargetRef } from '@/theme/blurTarget';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import QRCode from 'react-native-qrcode-svg';
import {
  ArrowRight,
  Calendar,
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock,
  CreditCard,
  Edit,
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
  ShieldCheck,
  Sun,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react-native';

import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import type {
  CorrespondenciaDto,
  PagosResponse,
  ProfileResponse,
  ReservaDto,
  TipoTramite,
  VisitaDto,
} from '@/lib/api/types';
import { PAYMENTS_ENABLED, PAYMENTS_DISABLED_MSG } from '@/lib/flags';
import { useTheme } from '@/providers/ThemeProvider';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { BrandedFooter } from '@/components/shell/BrandedFooter';
import { toast } from '@/components/ui/toast';
import { tokensFor, type ColorTokens } from '@/theme/tokens';

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
  id?: string;
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
  soatVence?: string | null;
  tecnomecanicaVence?: string | null;
}
interface Mascota {
  id?: string;
  nombre: string;
  tipo: string;
  raza?: string;
  fotoUrl?: string;
}
// TODO(types-consolidate): mirror of the web DocsVacunas `Vacuna` shape — not
// yet present in the synced '@/lib/api/types'.
interface Vacuna {
  id: string;
  mascotaId: string;
  vacuna: string;
  fechaAplicacion: string | null;
  proxima: string | null;
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
  id: string;
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

/** Resident-facing GET /comunicaciones payload (visitas + correspondencia). */
type ComunicacionesResidenteFetch = {
  visitas?: VisitaDto[];
  correspondencia?: CorrespondenciaDto[];
};

type ViewMode =
  | 'profile'
  | 'vehicles'
  | 'pets'
  | 'deuda'
  | 'requests'
  | 'reservas'
  | 'paquetes'
  | 'visitas'
  | 'correspondencia';

type RegType = 'VEHICULO' | 'MASCOTA' | 'OTRO';
type RegDoc = { nombre: string; base64: string; mimeType: string };

/** `#rrggbb` → `rgba(r, g, b, a)`; lets a token carry the `/NN` alpha web uses. */
function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* eslint-disable @typescript-eslint/no-require-imports --
   Metro asset modules have no TS declarations, so `require()` is the only way to
   reference a bundled image (same pattern as src/providers/CallProvider.tsx:94). */

/** Web initialises `profilePic` to the bundled `/placeholder.svg` (perfil/page.tsx:46). */
const DEFAULT_AVATAR = require('../../assets/images/placeholder.png') as number;

/**
 * Utility-bill logos web renders inside the correspondencia chip for
 * ENERGIA/AGUA/GAS (perfil/page.tsx:1165-1169) — same three assets, bundled.
 */
const TIPO_LOGO: Record<string, number> = {
  ENERGIA: require('../../assets/images/recibo-servicios-logo.jpg') as number,
  AGUA: require('../../assets/images/recibo-agua-logo.jpg') as number,
  GAS: require('../../assets/images/recibo-gas-logo.jpg') as number,
};
/* eslint-enable @typescript-eslint/no-require-imports */

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
const ES_MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const ES_WEEKDAYS_LONG = [
  'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function fmtDateDMY(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${ES_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** es-ES `{ weekday: 'short', day: 'numeric', month: 'short' }` → `mié, 5 ago`. */
function fmtDateShort(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${ES_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${ES_MONTHS[d.getMonth()]}`;
}
/** Bare `toLocaleDateString()` (no options), which web uses for `Vence: …`. */
function fmtDateNumeric(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
/** es-CO `{ weekday: 'long', day: 'numeric', month: 'long' }`. */
function fmtDateLong(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${ES_WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${ES_MONTHS_LONG[d.getMonth()]}`;
}
function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** es-ES `{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }`. */
function fmtArrived(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${ES_MONTHS[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** es-CO `{ day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }` —
 *  visitas use the padded day (web perfil/page.tsx:1268). */
function fmtVisita(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())} ${ES_MONTHS[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function money(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (Number.isNaN(n)) return '0';
  return Math.round(n).toLocaleString('es-CO');
}

/**
 * Color a future date by how close it is to lapsing (web DocsVacunas.tsx:24-30):
 * Vencido = danger/10 + danger/40 border, Vence en Nd = warning, Vigente =
 * success — all from the semantic tokens, per scheme.
 */
function docBadge(
  fecha: string | null | undefined,
  T: ColorTokens,
): { label: string; color?: string; bg?: string; border?: string } {
  if (!fecha) return { label: 'Sin registrar' };
  const dias = Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000);
  if (dias < 0) {
    return {
      label: 'Vencido',
      color: T.danger,
      bg: alpha(T.danger, 0.1),
      border: alpha(T.danger, 0.4),
    };
  }
  if (dias <= 30) {
    return {
      label: `Vence en ${dias}d`,
      color: T.warning,
      bg: alpha(T.warning, 0.1),
      border: alpha(T.warning, 0.4),
    };
  }
  return {
    label: 'Vigente',
    color: T.success,
    bg: alpha(T.success, 0.1),
    border: alpha(T.success, 0.4),
  };
}

// ---------------------------------------------------------------------------

export default function Perfil() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const { width: screenW, height: screenH } = useWindowDimensions();
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const logout = useAuth((s) => s.logout);
  const userId = user?.id;

  // Design-system tokens (NativeWind classes can't reach inline styles / icon
  // `color=` props, so the runtime token set backs both).
  const T = useMemo(() => tokensFor(theme), [theme]);

  // Named tints that mirror the alpha classes the web page uses at each spot.
  const C: Palette = useMemo(
    () => ({
      bg: T.primary,
      card: T.primaryLight,
      text: T.text,
      accent: T.accent,
      onAccent: T.onAccent,
      muted: T.textMuted,
      faint: T.surface2,
      border: T.border,
      info: T.info,
      success: T.success,
      danger: T.danger,
      warning: T.warning,
      text5: alpha(T.text, 0.05),
      text10: alpha(T.text, 0.1),
      text20: alpha(T.text, 0.2),
      accent10: alpha(T.accent, 0.1),
      accent20: alpha(T.accent, 0.2),
      info10: alpha(T.info, 0.1),
      info15: alpha(T.info, 0.15),
      info20: alpha(T.info, 0.2),
    }),
    [T],
  );

  // Web sizes the hero at 65vh and starts the content at pt-[45vh].
  const heroH = Math.round(screenH * 0.65);
  const contentTop = Math.round(screenH * 0.45);

  const [profilePic, setProfilePic] = useState<string | number>(DEFAULT_AVATAR);
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
  const [visitasHistorial, setVisitasHistorial] = useState<VisitaDto[]>([]);
  const [correspondenciaPendiente, setCorrespondenciaPendiente] = useState<
    CorrespondenciaDto[]
  >([]);

  const [viewMode, setViewMode] = useState<ViewMode>('profile');
  const [financialTab, setFinancialTab] = useState<'pendientes' | 'historial'>(
    'pendientes',
  );
  const [visitasTab, setVisitasTab] = useState<'pendientes' | 'historial'>(
    'pendientes',
  );
  const [paquetesTab, setPaquetesTab] = useState<'pendientes' | 'historial'>(
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

  // Reserva access QR modal (rendered locally; payload = reserva id)
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrReservaId, setQrReservaId] = useState('');
  const [qrReservaNombre, setQrReservaNombre] = useState('');
  const [qrReservaInicio, setQrReservaInicio] = useState('');
  const [qrReservaFin, setQrReservaFin] = useState('');
  const [qrReservaEstado, setQrReservaEstado] = useState('');

  // DocsVacunas (web src/components/docs/DocsVacunas.tsx parity)
  const [vacunas, setVacunas] = useState<Record<string, Vacuna[]>>({});
  const [nuevaVacuna, setNuevaVacuna] = useState<
    Record<string, { vacuna: string; proxima: string }>
  >({});

  // Registration / Tramite modal
  const [showRegModal, setShowRegModal] = useState(false);
  const [regType, setRegType] = useState<RegType>('VEHICULO');
  const [isRegSubmitting, setIsRegSubmitting] = useState(false);
  const [regForm, setRegForm] = useState({
    nombre: '',
    tipo: '',
    raza: '',
    fotoMascota: '',
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

  // -- shared profile mapper (initial load + WS-driven refetches) -----------
  const applyProfileData = useCallback(
    (u: ProfileFetch) => {
      const mapped: UserData = {
        name: u.nombre || user?.nombre || userData.name,
        apto: u.unidad?.numero || u.apto || 'S/N',
        torre: u.unidad?.torre || u.torre || 'S/T',
        phone: u.telefono || '',
        gender: u.genero || 'neutro',
        email: u.email || user?.email || '',
        bio: u.bio || userData.bio,
        numeroInterno: u.numeroInterno || '',
      };
      setUserData(mapped);
      setEditForm(mapped);
      setVehiculos(u.vehiculos || []);
      setMascotas(u.mascotas || []);
      setTramites(u.tramitesSolicitados || []);
      if (u.avatar) setProfilePic(u.avatar);
      // DocsVacunas: hydrate the vaccine list per pet (same GET as the web comp).
      for (const m of u.mascotas || []) {
        const mascotaId = m.id;
        if (!mascotaId) continue;
        api
          .get<Vacuna[]>(`/mascotas/${mascotaId}/vacunas`)
          .then((vs) => setVacunas((prev) => ({ ...prev, [mascotaId]: vs })))
          .catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.nombre, user?.email],
  );

  const refetchProfile = useCallback(async () => {
    const u = await api
      .get<ProfileFetch>('/usuarios/me/profile')
      .catch(() => null);
    if (u) applyProfileData(u);
  }, [applyProfileData]);

  // WS: tramite approvals / vehicle changes invalidate the profile's asset lists.
  useWsSubscription('tramite', () => {
    void refetchProfile();
  });
  useWsSubscription('vehiculo', () => {
    void refetchProfile();
  });

  // -- main data fetch (single consolidated effect; collapses the duplicate
  //    GET /paquetes/mios that the web page issued twice) --------------------
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      const [profileData, financeData, reservasData, paquetesData, comunicacionesData] =
        await Promise.all([
          api.get<ProfileFetch>('/usuarios/me/profile').catch(() => null),
          api.get<PagosResponse>('/pagos').catch(() => null),
          api
            .get<ReservaDto[]>('/reservas?filter=future')
            .catch(() => null),
          api.get<PaqueteActivo[]>('/paquetes/mios').catch(() => null),
          api
            .get<ComunicacionesResidenteFetch>('/comunicaciones')
            .catch(() => null),
        ]);

      if (cancelled) return;

      if (profileData) applyProfileData(profileData);

      if (comunicacionesData) {
        setVisitasHistorial(comunicacionesData.visitas || []);
        setCorrespondenciaPendiente(
          (comunicacionesData.correspondencia || []).filter(
            (c) => c.estado === 'EN_PORTERIA',
          ),
        );
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
            id: r.id,
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

    // Web rejects >5MB before reading the file (perfil/page.tsx:280-283).
    if (
      res.assets[0].fileSize != null &&
      res.assets[0].fileSize > 5 * 1024 * 1024
    ) {
      toast.error('Imagen demasiado grande (máx 5MB)');
      return;
    }

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
    // Web does `window.location.href = "/login"` with no toast (perfil/page.tsx:338-341).
    router.replace('/login');
  }, [logout, router, userId]);

  /** Web sets id/nombre/inicio/fin/estado before opening the modal (page.tsx:733-739, 796-801). */
  const openQrModal = useCallback(
    (res: ReservaActiva, fallbackNombre: string) => {
      setQrReservaId(res.id);
      setQrReservaNombre(res.area?.nombre || fallbackNombre);
      setQrReservaInicio(res.fechaInicio);
      setQrReservaFin(res.fechaFin);
      setQrReservaEstado(res.estado || '');
      setShowQrModal(true);
    },
    [],
  );

  // -- reserva cancellation (web perfil/page.tsx:343-353) -------------------
  const handleCancelarReserva = useCallback(
    (id: string) => {
      // `window.confirm` has no RN equivalent; Alert carries the same question.
      Alert.alert('¿Seguro que quieres cancelar esta reserva?', undefined, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await api.put(`/reservas/${id}/cancelar`, {});
                setActiveReservas((prev) => prev.filter((r) => r.id !== id));
                setShowQrModal(false);
                toast.success('Reserva cancelada');
              } catch {
                toast.error('No se pudo cancelar la reserva');
              }
            })();
          },
        },
      ]);
    },
    [],
  );

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
      // Same per-file 5MB rejection the web dropzone does (page.tsx:362-365).
      if (asset.fileSize != null && asset.fileSize > 5 * 1024 * 1024) {
        toast.error(`${asset.fileName || 'imagen'} es muy grande (máx 5MB)`);
        continue;
      }
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
      // Same per-file 5MB rejection the web dropzone does (page.tsx:362-365).
      if (asset.size != null && asset.size > 5 * 1024 * 1024) {
        toast.error(`${asset.name} es muy grande (máx 5MB)`);
        continue;
      }
      // backend `deny_unknown_fields` requires the real mimeType.
      const mimeType = asset.mimeType || 'application/pdf';
      // expo-document-picker's `base64` field is web-only; on iOS/Android read
      // the file content via expo-file-system (same pattern as chat.tsx).
      // Never fall back to asset.uri: a local file:// path stored as the
      // trámite document would be unreadable for the approving admin.
      let raw: string;
      try {
        raw = asset.base64 ?? (await new File(asset.uri).base64());
      } catch {
        toast.error('No se pudo procesar el documento');
        continue;
      }
      const b64 = `data:${mimeType};base64,${raw}`;
      setRegDocs((prev) => [
        ...prev,
        { nombre: asset.name, base64: b64, mimeType },
      ]);
    }
  }, []);

  // -- registration: mascota photo (web handlePetPhotoChange, page.tsx:388-408)
  const handlePetPhotoChange = useCallback(async () => {
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
    const asset = res.assets[0];
    if (asset.fileSize != null && asset.fileSize > 5 * 1024 * 1024) {
      toast.error('La imagen supera el límite de 5MB');
      return;
    }
    try {
      const compressed = await compressImage(asset.uri);
      setRegForm((prev) => ({ ...prev, fotoMascota: compressed }));
    } catch {
      toast.error('Error al procesar la imagen de la mascota');
    }
  }, [compressImage]);

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
          fotoUrl: regForm.fotoMascota || undefined,
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
        fotoMascota: '',
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

  // -- DocsVacunas handlers (web DocsVacunas.tsx parity; same payload shapes) -
  const setVehiculoCampo = useCallback(
    (id: string, campo: 'soatVence' | 'tecnomecanicaVence', valor: string) => {
      setVehiculos((prev) =>
        prev.map((v) => (v.id === id ? { ...v, [campo]: valor || null } : v)),
      );
    },
    [],
  );

  const guardarDocs = useCallback(
    async (id: string) => {
      const veh = vehiculos.find((v) => v.id === id);
      if (!veh) return;
      const soat = (veh.soatVence || '').trim();
      const tecno = (veh.tecnomecanicaVence || '').trim();
      if ((soat && !DATE_RE.test(soat)) || (tecno && !DATE_RE.test(tecno))) {
        toast.error('Formato de fecha: AAAA-MM-DD');
        return;
      }
      try {
        // Same body the web component PUTs (dates only, no files).
        await api.put(`/vehiculos/${id}/documentos`, {
          soatVence: soat || undefined,
          tecnomecanicaVence: tecno || undefined,
        });
        toast.success('Documentos actualizados');
      } catch {
        toast.error('No se pudo guardar');
      }
    },
    [vehiculos],
  );

  const agregarVacuna = useCallback(
    async (mascotaId: string) => {
      const form = nuevaVacuna[mascotaId];
      if (!form?.vacuna?.trim()) {
        toast.error('Nombre de la vacuna');
        return;
      }
      const proxima = (form.proxima || '').trim();
      if (proxima && !DATE_RE.test(proxima)) {
        toast.error('Formato de fecha: AAAA-MM-DD');
        return;
      }
      try {
        const v = await api.post<Vacuna>(`/mascotas/${mascotaId}/vacunas`, {
          vacuna: form.vacuna.trim(),
          proxima: proxima || undefined,
        });
        setVacunas((prev) => ({
          ...prev,
          [mascotaId]: [...(prev[mascotaId] ?? []), v],
        }));
        setNuevaVacuna((prev) => ({
          ...prev,
          [mascotaId]: { vacuna: '', proxima: '' },
        }));
        toast.success('Vacuna registrada');
      } catch {
        toast.error('No se pudo registrar');
      }
    },
    [nuevaVacuna],
  );

  const eliminarVacuna = useCallback(async (mascotaId: string, id: string) => {
    try {
      await api.delete(`/vacunas/${id}`);
      setVacunas((prev) => ({
        ...prev,
        [mascotaId]: (prev[mascotaId] ?? []).filter((v) => v.id !== id),
      }));
    } catch {
      toast.error('No se pudo eliminar');
    }
  }, []);

  const userRole = user?.rol || 'RESIDENTE';
  const isGuest = user?.rol === 'HUESPED_TEMPORAL';

  // Per-tile hues, verbatim from web perfil/page.tsx:517-526. Visitas ('#14b8a6')
  // and Corresp. ('#f43f5e') are hardcoded there too — no token exists for them.
  const TILE_TEAL = '#14b8a6'; // web perfil/page.tsx:523
  const TILE_ROSE = '#f43f5e'; // web perfil/page.tsx:525

  const allStatusIcons: {
    label: string;
    val: string;
    view: ViewMode;
    hex: string;
    icon: (color: string) => React.ReactNode;
  }[] = [
    {
      label: 'Deuda',
      val: `$${money(financialData.totalDebt)}`,
      view: 'deuda',
      hex: C.success,
      icon: (c) => <CreditCard size={18} color={c} />,
    },
    {
      label: 'Trámites',
      val: String(tramites.length),
      view: 'requests',
      hex: C.info,
      icon: (c) => <ClipboardList size={18} color={c} />,
    },
    {
      label: 'Mascotas',
      val: String(mascotas.length),
      view: 'pets',
      hex: C.warning,
      icon: (c) => <PawPrint size={18} color={c} />,
    },
    {
      label: 'Vehículos',
      val: String(vehiculos.length),
      view: 'vehicles',
      hex: C.info,
      icon: (c) => <Car size={18} color={c} />,
    },
    {
      label: 'Reservas',
      val: String(activeReservas.length),
      view: 'reservas',
      hex: C.info,
      icon: (c) => <Calendar size={18} color={c} />,
    },
    {
      label: 'Visitas',
      val: String(
        visitasHistorial.filter((v) => v.estado === 'PENDIENTE').length,
      ),
      view: 'visitas',
      hex: TILE_TEAL,
      icon: (c) => <UserIcon size={18} color={c} />,
    },
    {
      label: 'Paquetes',
      val: String(activePaquetes.length),
      view: 'paquetes',
      hex: C.warning,
      icon: (c) => <Package size={18} color={c} />,
    },
    {
      label: 'Corresp.',
      val: String(correspondenciaPendiente.length),
      view: 'correspondencia',
      hex: TILE_ROSE,
      icon: (c) => <Mail size={18} color={c} />,
    },
  ];

  // HUESPED_TEMPORAL only sees Reservas + Paquetes (web parity).
  const statusIcons = isGuest
    ? allStatusIcons.filter(
        (s) => s.view === 'reservas' || s.view === 'paquetes',
      )
    : allStatusIcons;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ---- HERO — cinematic stack, web perfil/page.tsx:594-630 ----
           65vh container, layer 1 = heavy-blur bokeh backdrop (blur 60 / opacity
           .6 / scale 1.25), layer 2 = the sharp copy at scale 1.05 faded out
           toward the bottom (RN has no mask-image, so a gradient scrim does the
           sharp→transparent fall-off), layer 2.1 = the progressive blur HUD over
           the bottom edge, layer 3 = the 550px contrast gradient to `primary`. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: heroH, overflow: 'hidden', backgroundColor: C.bg }}>
        {/* Layer 1: base ambient blur (bokeh backdrop) */}
        <Image
          source={avatarSource(profilePic)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: screenW,
            height: heroH,
            opacity: 0.6,
            transform: [{ scale: 1.25 }],
          }}
          contentFit="cover"
          contentPosition="top"
          blurRadius={Platform.OS === 'android' ? 25 : 60}
          transition={300}
        />
        {/* Layer 2: sharp copy, scale 1.05 */}
        <Image
          source={avatarSource(profilePic)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: screenW,
            height: heroH,
            transform: [{ scale: 1.05 }],
          }}
          contentFit="cover"
          contentPosition="top"
          transition={300}
        />
        {/* Layer 2 mask substitute: sharp 0-40%, fading to nothing by 100% */}
        <LinearGradient
          colors={['transparent', 'transparent', alpha(T.primary, 0.6), T.primary]}
          locations={[0, 0.4, 0.65, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: heroH }}
        />
        {/* Layer 2.1: progressive blur HUD over the bottom edge */}
        <BlurView
          intensity={20}
          tint={isLight ? 'light' : 'dark'}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: heroH * 0.4 }}
          // SDK 56 Android API: method + app-wide target (ignored on iOS).
          blurMethod="dimezisBlurView"
          blurTarget={blurTargetRef}
        />
        {/* Layer 3: HUD contrast gradient & base shadow */}
        <LinearGradient
          colors={['transparent', alpha(T.primary, 0.3), alpha(T.primary, 0.7), alpha(T.primary, 0.95), T.primary]}
          locations={[0, 0.35, 0.6, 0.82, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: heroH * 0.85 }}
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

        {/* Web's header carries exactly two controls (page.tsx:536-551). */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
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
                style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: C.info15 }}
              >
                {/* web: <Edit size={18} className="text-info"/> (page.tsx:574) */}
                <Edit size={18} color={C.info} />
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Editar Perfil</Text>
              </Pressable>
              <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: C.info15 }}>
                <ShieldCheck size={18} color={C.success} />
                <Text style={{ color: C.text, fontWeight: '500', fontSize: 15 }}>Privacidad</Text>
              </View>
              <Pressable
                onPress={() => {
                  setShowMenu(false);
                  void handleLogout();
                }}
                style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <LogOut size={18} color={C.danger} />
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Cerrar Sesión</Text>
              </Pressable>
            </LiquidGlass>
          </View>
        </>
      ) : null}

      {/* ---- SCROLL BODY ---- */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: contentTop, paddingHorizontal: 24, paddingBottom: 128 }}
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
            // web: info @10% fill, info @20% border, pulsing info dot, info label
            // (page.tsx:650-660).
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: C.info10, borderWidth: 1, borderColor: C.info20 }}>
              <PulseDot color={C.info} size={6} />
              <Text style={{ color: C.info, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                Citofonía N° {userData.numeroInterno}
              </Text>
            </View>
          ) : null}
        </View>

        {/* STATUS TILES — one grid, label INSIDE the card (web page.tsx:663-683).
            Each tile: p-2.5 rounded-[20px] bg-primary-light border-border, then a
            9x9 icon chip tinted `${hex}1a` with the hue as ink, the value, and the
            9px label. HUESPED_TEMPORAL sees only Reservas+Paquetes. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', marginHorizontal: -5, marginBottom: 40 }}>
          {statusIcons.map((stat) => (
            <View key={stat.view} style={{ width: isGuest ? '50%' : '25%', paddingHorizontal: 5, marginBottom: 10 }}>
              <Pressable
                onPress={() => setViewMode(stat.view)}
                style={({ pressed }) => ({
                  padding: 10,
                  borderRadius: 20,
                  backgroundColor: C.card,
                  borderWidth: 1,
                  borderColor: C.border,
                  alignItems: 'center',
                  gap: 6,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: alpha(stat.hex, 0.1),
                  }}
                >
                  {stat.icon(stat.hex)}
                </View>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                  {stat.val}
                </Text>
                <Text
                  style={{ fontSize: 9, color: alpha(T.text, 0.55), textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}
                  numberOfLines={1}
                >
                  {stat.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Dynamic view content */}
        <View style={{ marginBottom: 40 }}>
          {viewMode === 'profile' ? (
            <View style={{ gap: 12 }}>
              <GlassPanel C={C}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  {/* web: info @10% chip with info ink (page.tsx:691-696) */}
                  <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.info10, alignItems: 'center', justifyContent: 'center' }}>
                    <UserIcon size={22} color={C.info} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.3 }}>Información</Text>
                    <Text style={{ fontSize: 10, color: alpha(T.text, 0.55), textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '700' }}>Datos Personales</Text>
                  </View>
                </View>
                <Field label="Correo Electrónico" value={userData.email} C={C} />
                <Field label="Teléfono" value={userData.phone || 'No especificado'} C={C} />
              </GlassPanel>

              {/* ── PRÓXIMA RESERVA (web page.tsx:715-776) ── */}
              {(() => {
                const ahora = new Date();
                const futuras = activeReservas
                  .filter(
                    (r) =>
                      r.estado !== 'CANCELADA' &&
                      new Date(r.fechaInicio).getTime() > ahora.getTime(),
                  )
                  .sort(
                    (a, b) =>
                      new Date(a.fechaInicio).getTime() -
                      new Date(b.fechaInicio).getTime(),
                  );
                const proxima = futuras[0];
                if (!proxima) return null;
                const minutosPara = Math.round(
                  (new Date(proxima.fechaInicio).getTime() - ahora.getTime()) / 60000,
                );
                const countdown =
                  minutosPara <= 60
                    ? `⏰ En ${minutosPara} min`
                    : minutosPara < 1440
                      ? `En ${Math.round(minutosPara / 60)}h ${minutosPara % 60}m`
                      : fmtDateShort(proxima.fechaInicio);

                return (
                  <LiquidGlass variant="card" radius={32} style={{ padding: 0 }}>
                    <Pressable
                      onPress={() => openQrModal(proxima, 'Área común')}
                      style={{ flexDirection: 'row', alignItems: 'stretch', borderRadius: 32, borderWidth: 1, borderColor: alpha(T.accent, 0.3), overflow: 'hidden' }}
                    >
                      <View style={{ width: 112, height: 112 }}>
                        {proxima.area?.imagenUrl ? (
                          <Image source={{ uri: proxima.area.imagenUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        ) : (
                          <View style={{ width: '100%', height: '100%', backgroundColor: C.text5, alignItems: 'center', justifyContent: 'center' }}>
                            <Calendar size={32} color={alpha(T.accent, 0.4)} />
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1, padding: 16, justifyContent: 'space-between' }}>
                        <View>
                          <Text style={{ fontSize: 10, fontWeight: '900', color: C.accent, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                            Próxima Reserva
                          </Text>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }} numberOfLines={1}>
                            {proxima.area?.nombre || 'Área común'}
                          </Text>
                        </View>
                        <View style={{ gap: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: '900', textTransform: 'uppercase', color: minutosPara <= 30 ? C.warning : C.accent }}>
                            {countdown}
                          </Text>
                          <Text style={{ fontSize: 10, color: C.text, fontVariant: ['tabular-nums'] }}>
                            {fmtTime(proxima.fechaInicio)} → {fmtTime(proxima.fechaFin)}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'center', justifyContent: 'center', paddingRight: 12 }}>
                        <ArrowRight size={18} color={C.accent} />
                      </View>
                    </Pressable>
                  </LiquidGlass>
                );
              })()}
            </View>
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
                  <Pressable
                    key={i}
                    onPress={() => openQrModal(res, 'Área')}
                    style={({ pressed }) => ({ borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: C.border, flexDirection: 'row', backgroundColor: C.faint, transform: [{ scale: pressed ? 0.98 : 1 }] })}
                  >
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
                          {/* web: CONFIRMADA success/20, PENDIENTE warning/20,
                              CANCELADA danger/20, else text/20 (page.tsx:815-820) */}
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: estadoReservaTint(res.estado, C).bg }}>
                            <Text style={{ fontSize: 8, fontWeight: '900', color: estadoReservaTint(res.estado, C).color, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                              {res.estado === 'PENDIENTE' ? 'En Proceso' : res.estado}
                            </Text>
                          </View>
                        </View>
                        {/* web has no capitalize on this heading (page.tsx:824) */}
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{fmtDateShort(res.fechaInicio)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 10, color: C.text, fontVariant: ['tabular-nums'] }}>
                          {fmtTime(res.fechaInicio)} • {fmtTime(res.fechaFin)}
                        </Text>
                        {/* web: danger-tinted Trash2 "Cancelar reserva" (page.tsx:832-843) */}
                        {res.estado !== 'CANCELADA' ? (
                          <Pressable
                            onPress={() => handleCancelarReserva(res.id)}
                            accessibilityLabel="Cancelar reserva"
                            style={({ pressed }) => ({
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              backgroundColor: alpha(T.danger, pressed ? 0.2 : 0.1),
                              alignItems: 'center',
                              justifyContent: 'center',
                            })}
                          >
                            <Trash2 size={13} color={C.danger} />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
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
                actionVariant="pill"
                actionTone="accent"
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
                    {/* web: bg-accent/20 text-accent (page.tsx:874) */}
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent20, alignItems: 'center', justifyContent: 'center' }}>
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
                actionVariant="pill"
                actionTone="text"
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

          {/* DocsVacunas (web parity: shown under both pets and vehicles views) */}
          {viewMode === 'pets' || viewMode === 'vehicles' ? (
            <View style={{ gap: 16, marginTop: 8 }}>
              {vehiculos.some((v) => v.id) ? (
                <View style={{ gap: 12, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
                    <Car size={14} color={C.muted} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                      Documentos de vehículos
                    </Text>
                  </View>
                  {vehiculos.filter((v) => v.id).map((v) => (
                    <View key={v.id} style={{ borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.faint, gap: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: 2, textTransform: 'uppercase', fontVariant: ['tabular-nums'] }}>
                        {v.placa}
                      </Text>
                      {(
                        [
                          ['soatVence', 'SOAT'],
                          ['tecnomecanicaVence', 'Tecnomecánica'],
                        ] as const
                      ).map(([campo, label]) => {
                        const b = docBadge(v[campo], T);
                        return (
                          <View key={campo} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ width: 88, fontSize: 11, color: C.muted }}>{label}</Text>
                            <TextInput
                              value={v[campo] ?? ''}
                              onChangeText={(t) => setVehiculoCampo(v.id!, campo, t)}
                              onEndEditing={() => void guardarDocs(v.id!)}
                              placeholder="AAAA-MM-DD"
                              placeholderTextColor={C.muted}
                              autoCapitalize="none"
                              style={{ flex: 1, backgroundColor: C.faint, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, fontSize: 12, color: C.text }}
                            />
                            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: b.border ?? C.border, backgroundColor: b.bg ?? C.faint }}>
                              <Text style={{ fontSize: 9, fontWeight: '900', textTransform: 'uppercase', color: b.color ?? C.muted }}>{b.label}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ) : null}

              {mascotas.some((m) => m.id) ? (
                <View style={{ gap: 12, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
                    <PawPrint size={14} color={C.muted} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                      Vacunas de mascotas
                    </Text>
                  </View>
                  {mascotas.filter((m) => m.id).map((m) => (
                    <View key={m.id} style={{ borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.faint, gap: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{m.nombre}</Text>
                      {(vacunas[m.id!] ?? []).map((vac) => {
                        const b = docBadge(vac.proxima, T);
                        return (
                          <View key={vac.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ flex: 1, fontSize: 12, color: C.text }}>
                              {vac.vacuna}
                              {vac.proxima ? ` · refuerzo ${vac.proxima}` : ''}
                            </Text>
                            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: b.border ?? C.border, backgroundColor: b.bg ?? C.faint }}>
                              <Text style={{ fontSize: 9, fontWeight: '900', textTransform: 'uppercase', color: b.color ?? C.muted }}>{b.label}</Text>
                            </View>
                            <Pressable
                              onPress={() => void eliminarVacuna(m.id!, vac.id)}
                              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
                            >
                              <Trash2 size={13} color={C.muted} />
                            </Pressable>
                          </View>
                        );
                      })}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <TextInput
                          value={nuevaVacuna[m.id!]?.vacuna ?? ''}
                          onChangeText={(t) =>
                            setNuevaVacuna((p) => ({
                              ...p,
                              [m.id!]: { ...(p[m.id!] ?? { vacuna: '', proxima: '' }), vacuna: t },
                            }))
                          }
                          placeholder="Vacuna"
                          placeholderTextColor={C.muted}
                          style={{ flex: 1, backgroundColor: C.faint, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, fontSize: 12, color: C.text }}
                        />
                        <TextInput
                          value={nuevaVacuna[m.id!]?.proxima ?? ''}
                          onChangeText={(t) =>
                            setNuevaVacuna((p) => ({
                              ...p,
                              [m.id!]: { ...(p[m.id!] ?? { vacuna: '', proxima: '' }), proxima: t },
                            }))
                          }
                          placeholder="AAAA-MM-DD"
                          placeholderTextColor={C.muted}
                          autoCapitalize="none"
                          style={{ width: 110, backgroundColor: C.faint, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 8, fontSize: 12, color: C.text }}
                        />
                        <Pressable
                          onPress={() => void agregarVacuna(m.id!)}
                          style={({ pressed }) => ({ paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
                        >
                          <Plus size={14} color={C.onAccent} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
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
                    {/* web: bg-accent/20 text-accent (page.tsx:945) */}
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent20, alignItems: 'center', justifyContent: 'center' }}>
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
                    {/* web tints every trámite estado bg-text/20 text-text (page.tsx:964-968) */}
                    <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: C.text20 }}>
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
                      sub={`Vence: ${fmtDateNumeric(p.fechaVencimiento)}`}
                      amount={money(p.monto)}
                      actionLabel="Pagar"
                      onPay={() => handlePay(p.id)}
                      C={C}
                    />
                  ))}
                  {/* Recibos: accent-filled "Pagar Ahora" + border-text/20 card
                      (web page.tsx:1019,1027-1032) */}
                  {financialData.recibos.filter((r) => !r.pagado).map((r, i) => (
                    <ChargeRow
                      key={`recibo-${i}`}
                      tag="Servicios Públicos"
                      title={r.servicio}
                      sub={`Vence: ${fmtDateNumeric(r.vencimiento)}`}
                      amount={money(r.monto)}
                      actionLabel="Pagar Ahora"
                      onPay={() => handlePay(r.id)}
                      emphasis
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
                  <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>Paquetería</Text>
                  <Package size={18} color={C.accent} />
                </View>
                {/* Same pendientes/historial switcher as deuda & visitas (page.tsx:1079-1089) */}
                <View style={{ flexDirection: 'row', gap: 8, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.faint }}>
                  {(['pendientes', 'historial'] as const).map((tab) => (
                    <Pressable key={tab} onPress={() => setPaquetesTab(tab)} style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: paquetesTab === tab ? C.accent : 'transparent' }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, color: paquetesTab === tab ? C.onAccent : C.text }}>{tab}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {paquetesTab === 'historial' ? (
                <EmptyState icon={<Package size={40} color={C.text} />} text="El historial de paquetes retirados estará disponible próximamente." C={C} />
              ) : activePaquetes.length === 0 ? (
                <EmptyState icon={<Package size={40} color={C.text} />} text="No hay paquetes pendientes en portería." C={C} />
              ) : (
                activePaquetes.map((pkg, i) => (
                  <View key={i} style={{ borderRadius: 28, borderWidth: 1, borderColor: C.border, backgroundColor: C.faint, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    {/* web: bg-accent/20 text-accent (page.tsx:1105) */}
                    <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: C.accent20, alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={24} color={C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '900', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                          {pkg.remitente || 'Remitente Desconocido'}
                        </Text>
                        {/* web: text-accent bg-accent/10 ring-accent/20 (page.tsx:1111) */}
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: C.accent10, borderWidth: 1, borderColor: C.accent20 }}>
                          <Text style={{ fontSize: 8, fontWeight: '900', color: C.accent, textTransform: 'uppercase' }}>{pkg.origen || 'Nacional'}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 }}>Guía: {pkg.guia || 'S/G'}</Text>
                      <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>Recibido: {fmtArrived(pkg.fechaLlegada)}</Text>
                    </View>
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      {/* web: bg-text/10 animate-pulse (page.tsx:1117) */}
                      <PulseDot color={C.text10} size={8} />
                      <Text style={{ fontSize: 8, fontWeight: '900', color: C.text, textTransform: 'uppercase' }}>Listo</Text>
                    </View>
                  </View>
                ))
              )}
              {paquetesTab === 'pendientes' && activePaquetes.length > 0 ? (
                <View style={{ marginTop: 16, padding: 16, borderRadius: 24, backgroundColor: C.text5, borderWidth: 1, borderColor: C.text20, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Info size={16} color={C.text} />
                  <Text style={{ flex: 1, fontSize: 10, color: C.text, textTransform: 'uppercase', fontStyle: 'italic' }}>
                    Recuerda presentar tu identificación o el número de guía para retirar tus paquetes en la portería principal.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {viewMode === 'visitas' ? (
            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>Visitas</Text>
                  <UserIcon size={18} color={C.accent} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.faint }}>
                  {(['pendientes', 'historial'] as const).map((tab) => (
                    <Pressable key={tab} onPress={() => setVisitasTab(tab)} style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: visitasTab === tab ? C.accent : 'transparent' }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, color: visitasTab === tab ? C.onAccent : C.text }}>{tab}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {(() => {
                const filtered =
                  visitasTab === 'pendientes'
                    ? visitasHistorial.filter((v) => v.estado === 'PENDIENTE')
                    : visitasHistorial.filter((v) => v.estado !== 'PENDIENTE');

                if (filtered.length === 0) {
                  return (
                    <EmptyState
                      icon={<UserIcon size={40} color={C.text} />}
                      text={
                        visitasTab === 'pendientes'
                          ? 'No hay visitas pendientes de aprobación.'
                          : 'No hay visitas en el historial.'
                      }
                      C={C}
                    />
                  );
                }

                return filtered.map((v) => {
                  // web: PENDIENTE amber (warning), APROBADA emerald (success),
                  // RECHAZADA red (danger) — bg 15%, border 30% (page.tsx:1242-1258).
                  const estadoTint =
                    v.estado === 'PENDIENTE'
                      ? { color: C.warning, bg: alpha(T.warning, 0.15), border: alpha(T.warning, 0.3) }
                      : v.estado === 'APROBADA'
                        ? { color: C.success, bg: alpha(T.success, 0.15), border: alpha(T.success, 0.3) }
                        : v.estado === 'RECHAZADA'
                          ? { color: C.danger, bg: alpha(T.danger, 0.15), border: alpha(T.danger, 0.3) }
                          : { color: C.text, bg: C.text10, border: C.border };
                  return (
                    <View key={v.id} style={{ borderRadius: 28, borderWidth: 1, borderColor: C.border, backgroundColor: C.faint, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                      <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: estadoTint.bg, borderWidth: 1, borderColor: estadoTint.border }}>
                        <UserIcon size={22} color={estadoTint.color} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.text }} numberOfLines={1}>{v.nombre}</Text>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: estadoTint.bg, borderWidth: 1, borderColor: estadoTint.border }}>
                            <Text style={{ fontSize: 8, fontWeight: '900', textTransform: 'uppercase', color: estadoTint.color }}>{v.estado}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          {v.documento ? (
                            <Text style={{ fontSize: 10, color: C.muted, fontVariant: ['tabular-nums'] }}>{v.documento}</Text>
                          ) : null}
                          {/* web: bg-text/10 text-text border-text/20 (page.tsx:1264) */}
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: C.text10, borderWidth: 1, borderColor: C.text20 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: C.text }}>{v.tipo}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Clock size={10} color={C.muted} />
                            <Text style={{ fontSize: 10, color: C.muted }}>{fmtVisita(v.fecha)}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          ) : null}

          {viewMode === 'correspondencia' ? (
            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>Correspondencia</Text>
                  <Mail size={18} color={C.accent} />
                </View>
                {/* web: bg-surface-2 (page.tsx:1145) */}
                <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: C.faint }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                    {correspondenciaPendiente.length} en portería
                  </Text>
                </View>
              </View>

              {correspondenciaPendiente.length === 0 ? (
                <EmptyState icon={<Mail size={40} color={C.text} />} text="No tienes correspondencia pendiente en portería." C={C} />
              ) : (
                correspondenciaPendiente.map((corr) => {
                  const tipoLabel: Record<string, string> = {
                    CARTA: 'Carta',
                    DOCUMENTO: 'Documento',
                    REVISTA: 'Revista',
                    ENERGIA: 'Recibo Energía',
                    AGUA: 'Recibo Agua',
                    GAS: 'Recibo Gas',
                    OTRO: 'Otro',
                  };
                  const esRecibo = ['ENERGIA', 'AGUA', 'GAS'].includes(corr.tipo);
                  return (
                    // web: receipts get border-accent/40 + bg-accent/5 (page.tsx:1172)
                    <View key={corr.id} style={{ borderRadius: 28, borderWidth: 1, borderColor: esRecibo ? alpha(T.accent, 0.4) : C.border, backgroundColor: esRecibo ? alpha(T.accent, 0.05) : C.faint, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                      <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: esRecibo ? 'transparent' : C.text10 }}>
                        {esRecibo ? (
                          <Image
                            source={TIPO_LOGO[corr.tipo]}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                            accessibilityLabel={tipoLabel[corr.tipo]}
                          />
                        ) : (
                          <Mail size={24} color={C.text} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                          <Text style={{ fontSize: 10, fontWeight: '900', color: esRecibo ? C.accent : C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                            {tipoLabel[corr.tipo] || corr.tipo}
                          </Text>
                          {/* web: bg-surface-2 (page.tsx:1185) */}
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: C.faint }}>
                            <Text style={{ fontSize: 8, fontWeight: '900', color: C.text, textTransform: 'uppercase' }} numberOfLines={1}>{corr.remitente}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 }}>{corr.descripcion || 'Sin descripción'}</Text>
                        <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>Recibido: {fmtArrived(corr.fechaLlegada)}</Text>
                      </View>
                      <View style={{ alignItems: 'center', gap: 4 }}>
                        <PulseDot color={esRecibo ? C.accent : C.text10} size={8} />
                        <Text style={{ fontSize: 8, fontWeight: '900', color: C.text, textTransform: 'uppercase' }}>Portería</Text>
                      </View>
                    </View>
                  );
                })
              )}
              {/* web: bg-text/5 border-text/20 (page.tsx:1200) */}
              <View style={{ marginTop: 16, padding: 16, borderRadius: 24, backgroundColor: C.text5, borderWidth: 1, borderColor: C.text20, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Info size={16} color={C.text} />
                <Text style={{ flex: 1, fontSize: 10, color: C.text, textTransform: 'uppercase', fontStyle: 'italic' }}>
                  Presenta tu identificación en la portería para reclamar tu correspondencia.
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
                {/* web: bg-accent/10 text-accent (page.tsx:1288) */}
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent10, alignItems: 'center', justifyContent: 'center' }}>
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
                {/* web: bg-text/10 text-text/60 (page.tsx:1305) */}
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.text10, alignItems: 'center', justifyContent: 'center' }}>
                  <LogOut size={20} color={alpha(T.text, 0.6)} />
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

        {/* GLOBAL BRANDING — web renders <BrandedFooter /> last (page.tsx:1699) */}
        <BrandedFooter isInternal />
      </ScrollView>

      {/* ---- EDIT MODAL ---- */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          {/* web backdrop: bg-black/40 (page.tsx:1324) — literal black there too */}
          <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setShowEditModal(false)} />
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 40, borderTopRightRadius: 40, borderTopWidth: 1, borderColor: C.border, maxHeight: '90%' }}>
            <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
              <ModalHeader title="Editar Perfil" subtitle="Configuración personal" onClose={() => setShowEditModal(false)} C={C} />
              {/* Avatar */}
              <View style={{ alignItems: 'center', marginBottom: 28 }}>
                <View>
                  <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
                    <Image source={avatarSource(profilePic)} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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
                    style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: editForm.gender === g.v ? C.accent : C.border, backgroundColor: editForm.gender === g.v ? C.accent20 : C.faint }}
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
          {/* web backdrop: bg-black/60 (page.tsx:1433) */}
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
                        style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: regForm.tipoVehiculo === t ? C.accent : C.border, backgroundColor: regForm.tipoVehiculo === t ? C.accent20 : C.faint }}
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
                  {/* FOTO DE LA MASCOTA (web page.tsx:1497-1526) */}
                  <View style={{ alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '900' }}>Foto de la Mascota</Text>
                    <View>
                      <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
                        {regForm.fotoMascota ? (
                          <Image source={{ uri: regForm.fotoMascota }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        ) : (
                          <PawPrint size={40} color={alpha(T.text, 0.4)} />
                        )}
                      </View>
                      <Pressable
                        onPress={() => void handlePetPhotoChange()}
                        style={{ position: 'absolute', bottom: -4, right: -4, width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg }}
                      >
                        <Camera size={18} color={C.onAccent} />
                      </Pressable>
                    </View>
                  </View>

                  <LabeledInput label="Nombre de la Mascota" placeholder="Ej: Toby" value={regForm.nombre} onChangeText={(t) => setRegForm({ ...regForm, nombre: t })} C={C} />
                  <Text style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '900', marginLeft: 4, marginBottom: 6, marginTop: 4 }}>Tipo</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    {['PERRO', 'GATO', 'OTRO'].map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setRegForm({ ...regForm, tipo: t })}
                        style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: regForm.tipo === t ? C.accent : C.border, backgroundColor: regForm.tipo === t ? C.accent20 : C.faint }}
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
                    {/* web: bg-accent text-on-accent (page.tsx:1585) */}
                    <Pressable onPress={() => setRegDocs((prev) => prev.filter((_, i) => i !== idx))} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <X size={12} color={C.onAccent} />
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

              {/* Coexistence notice — web bg-text/5 border-text/20 (page.tsx:1604) */}
              <View style={{ padding: 20, borderRadius: 24, backgroundColor: C.text5, borderWidth: 1, borderColor: C.text20, flexDirection: 'row', gap: 16, marginTop: 16 }}>
                <Info size={20} color={C.text} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>Aviso de Reglas y Convivencia</Text>
                  {/* Web wraps two phrases in `**…**` and the ⚠️ line in
                      `font-bold` (page.tsx:1609-1611); the emphasis is
                      reproduced as bold spans rather than literal asterisks. */}
                  <Text style={{ fontSize: 10, color: C.text, lineHeight: 16 }}>
                    La vinculación está sujeta a{' '}
                    <Text style={{ fontWeight: '700' }}>aprobación administrativa y disponibilidad</Text>
                    . Es indispensable estar{' '}
                    <Text style={{ fontWeight: '700' }}>a paz y salvo</Text>
                    . Queda prohibido el lavado o reparaciones de vehículos en áreas comunes.
                    {'\n'}
                    <Text style={{ fontWeight: '700' }}>
                      ⚠️ El incumplimiento de las normas de convivencia puede generar multas pecuniarias.
                    </Text>
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

      {/* ---- QR MODAL — Código de acceso a la reserva (rendered locally) ---- */}
      <Modal visible={showQrModal} transparent animationType="fade" onRequestClose={() => setShowQrModal(false)}>
        <Pressable
          onPress={() => setShowQrModal(false)}
          // web backdrop: bg-black/80 (page.tsx:1651)
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 384, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 32, padding: 24, alignItems: 'center', gap: 16 }}>
            <Pressable onPress={() => setShowQrModal(false)} style={{ alignSelf: 'flex-end' }}>
              <X size={20} color={C.muted} />
            </Pressable>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>{qrReservaNombre}</Text>
            {/* Estado badge — web page.tsx:1665-1672 */}
            <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: estadoReservaTint(qrReservaEstado, C).bg }}>
              <Text style={{ fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, color: estadoReservaTint(qrReservaEstado, C).color }}>
                {qrReservaEstado === 'CONFIRMADA'
                  ? 'Activa'
                  : qrReservaEstado === 'PENDIENTE'
                    ? 'Pendiente'
                    : qrReservaEstado}
              </Text>
            </View>
            <View style={{ width: '100%', gap: 8, paddingHorizontal: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Calendar size={14} color={C.accent} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.text }}>{fmtDateLong(qrReservaInicio)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock size={14} color={C.accent} />
                <Text style={{ fontSize: 12, color: C.text, fontVariant: ['tabular-nums'] }}>
                  {fmtTime(qrReservaInicio)} → {fmtTime(qrReservaFin)}
                </Text>
              </View>
            </View>
            {/* Web wraps the code in a hardcoded `bg-white` box (page.tsx:1689) —
                a QR must stay black-on-white to stay scannable in both schemes. */}
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16 }}>
              {qrReservaId ? (
                <QRCode value={qrReservaId} size={220} backgroundColor="#FFFFFF" color="#000000" />
              ) : null}
            </View>
            <Text style={{ fontSize: 10, color: alpha(T.text, 0.4), textAlign: 'center' }}>
              Muestra este código al ingreso del área para acceder.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ---- PSE PROCESSING OVERLAY (web page.tsx:1628-1646; dead while
             PAYMENTS_ENABLED is false, kept for parity) ---- */}
      {isPaying ? (
        // web backdrop: bg-black/80 backdrop-blur-3xl (page.tsx:1630)
        <View style={{ position: 'absolute', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 380, backgroundColor: C.card, borderRadius: 40, padding: 40, alignItems: 'center' }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.text10, alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
              <PulseRing color={C.text10} size={80} />
              <ShieldCheck size={40} color={C.accent} />
            </View>
            <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 12 }}>Procesando Pago</Text>
            <Text style={{ color: C.text, fontSize: 14, textAlign: 'center', marginBottom: 32 }}>
              Estamos conectando de forma segura con tu entidad financiera a través de PSE. Por favor, no cierres esta ventana.
            </Text>
            {/* 1.5px track whose bar animates to 100% over 2500ms (page.tsx:1640-1642) */}
            <View style={{ width: '100%', height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: C.text10 }}>
              <ProgressBar color={C.accent} />
            </View>
            <Text style={{ color: C.text, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '700', marginTop: 16 }}>Transacción Encriptada 256-bit</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers + small sub-components
// ---------------------------------------------------------------------------

/**
 * Runtime mirror of the token classes the web page uses. Every field maps to a
 * `tokens.ts` token (or a documented alpha of one) — no raw hexes.
 */
type Palette = {
  bg: string;
  card: string;
  text: string;
  accent: string;
  onAccent: string;
  muted: string;
  faint: string;
  border: string;
  info: string;
  success: string;
  danger: string;
  warning: string;
  text5: string;
  text10: string;
  text20: string;
  accent10: string;
  accent20: string;
  info10: string;
  info15: string;
  info20: string;
};

/** expo-image source for either a bundled asset module or a remote/base64 URI. */
function avatarSource(pic: string | number) {
  return typeof pic === 'string' ? { uri: pic } : pic;
}

/**
 * Reserva estado badge tint — web pairs CONFIRMADA with bg-success/20
 * text-success, PENDIENTE with warning, CANCELADA with red-500/20 text-red-400
 * (the danger token) and anything else with bg-text/20 (page.tsx:815-820).
 */
function estadoReservaTint(
  estado: string | undefined,
  C: Palette,
): { bg: string; color: string } {
  if (estado === 'CONFIRMADA') return { bg: alpha(C.success, 0.2), color: C.success };
  if (estado === 'PENDIENTE') return { bg: alpha(C.warning, 0.2), color: C.warning };
  if (estado === 'CANCELADA') return { bg: alpha(C.danger, 0.2), color: C.danger };
  return { bg: C.text20, color: C.text };
}

/** `animate-pulse` dot — opacity breathes 1 → 0.35 → 1. */
function PulseDot({ color, size }: { color: string; size: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.35, { duration: 1000 }), -1, true);
    return () => cancelAnimation(o);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/** `animate-pulse` ring behind the PSE shield (web page.tsx:1633). */
function PulseRing({ color, size }: { color: string; size: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.2, { duration: 1000 }), -1, true);
    return () => cancelAnimation(o);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** Bar that fills to 100% over 2500ms, matching the web transition duration. */
function ProgressBar({ color }: { color: string }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(100, { duration: 2500 });
    return () => cancelAnimation(w);
  }, [w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return <Animated.View style={[{ height: '100%', backgroundColor: color }, style]} />;
}

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

/** `bg-primary-light border-border` pill with an info-colored dot (page.tsx:642-649). */
function Pill({ text, C }: { text: string; C: Palette }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.info }} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, textTransform: 'uppercase', letterSpacing: 1.5 }}>{text}</Text>
    </View>
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
      {/* web: text-[10px] text-text/55 uppercase tracking-wider font-bold (page.tsx:705) */}
      <Text style={{ fontSize: 10, color: alpha(C.text, 0.55), textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '700', marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '500', color: C.text }}>{value}</Text>
    </View>
  );
}

/**
 * Section heading + optional action. Web ships two action shapes:
 *  - `pill` — the "Solicitar Vinculación" button, `px-4 py-1.5 rounded-full`
 *    with a 20% fill and 20% border, tinted accent for Vehículos
 *    (page.tsx:860) and `text` for Mascotas (page.tsx:889).
 *  - `text` — reservas' bare "Solicitar Nueva" link in accent/80 (page.tsx:784).
 */
function SectionHeader({
  title,
  icon,
  actionLabel,
  actionIcon,
  onAction,
  actionVariant = 'text',
  actionTone = 'accent',
  C,
}: {
  title: string;
  icon: React.ReactNode;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  actionVariant?: 'text' | 'pill';
  actionTone?: 'accent' | 'text';
  C: Palette;
}) {
  const tone = actionTone === 'accent' ? C.accent : C.text;
  const isPill = actionVariant === 'pill';
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>{title}</Text>
        {icon}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            ...(isPill
              ? {
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: alpha(tone, 0.2),
                  backgroundColor: alpha(tone, 0.2),
                }
              : null),
          })}
        >
          {actionIcon}
          <Text
            style={{
              fontSize: isPill ? 11 : 10,
              fontWeight: isPill ? '700' : '900',
              color: isPill ? tone : alpha(tone, 0.8),
              textTransform: 'uppercase',
              letterSpacing: isPill ? 1 : 0.5,
            }}
          >
            {actionLabel}
          </Text>
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

/**
 * Charge row. `emphasis` is the recibos (Servicios Públicos) variant web gives a
 * border-text/20 card, a plain `text-text` tag and a filled `bg-accent`
 * "Pagar Ahora" button; the default is the pagos (Administración) variant with
 * an `text-accent/60` tag and a `bg-text/10` button (page.tsx:999-1035).
 */
function ChargeRow({
  tag,
  title,
  sub,
  amount,
  actionLabel,
  onPay,
  emphasis = false,
  C,
}: {
  tag: string;
  title: string;
  sub: string;
  amount: string;
  actionLabel: string;
  onPay: () => void;
  emphasis?: boolean;
  C: Palette;
}) {
  return (
    <View style={{ borderRadius: 16, padding: 20, borderWidth: 1, borderColor: emphasis ? C.text20 : C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.faint }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, color: emphasis ? C.text : alpha(C.accent, 0.6), textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '900', marginBottom: 4 }}>{tag}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', marginTop: 4 }}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: C.text }}>${amount}</Text>
        <Pressable onPress={onPay} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: emphasis ? C.accent : C.text10, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontSize: 10, fontWeight: '900', color: emphasis ? C.onAccent : C.text, textTransform: 'uppercase' }}>{actionLabel}</Text>
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
