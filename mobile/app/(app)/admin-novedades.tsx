/**
 * ADMIN NOVEDADES — CONJUNTOSAPP (mobile port)
 * Trámites (bandeja de aprobación) + gestión de anuncios / circulares.
 *
 * Ported 1:1 from web `src/app/(app)/admin-novedades/page.tsx`:
 *  - Roles ADMINISTRADOR / SUPER_ADMIN (toast + redirect a /inicio si no).
 *  - Tabs PENDIENTE | HISTORIAL | PUBLICAR_ANUNCIO.
 *  - GET /tramites(?estado=PENDIENTE), GET /parqueadero/mapa (celdas
 *    DISPONIBLE), GET /anuncios.
 *  - PUT /tramites/{id}/resolver {decision, observacion?, parqueaderoId?, meses?}
 *  - POST /parqueadero/celdas (crear celda al vuelo y auto-asignar).
 *  - POST /uploads/imagen (FileReader base64 del web → expo-image-picker
 *    base64:true), POST/PUT/DELETE /anuncios.
 *  - WS: useWsSubscription('tramite') + ('anuncio').
 *  - Descarga de documentos: el `<a download>` del web → expo-file-system
 *    (escritura en caché) + expo-sharing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { File, Paths } from 'expo-file-system';
import {
  AlertCircle,
  Briefcase,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Dog,
  FileText,
  Info,
  Map,
  Megaphone,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  User,
  X,
  XCircle,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import { safeHttpUrl } from '@/lib/safe-url';
import { useTheme } from '@/providers/ThemeProvider';
import { onSemantic, tokensFor } from '@/theme/tokens';
import type { AnuncioDto, CeldaMapaDto, TipoAnuncio } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Types (mirror the web page's local interfaces verbatim)
// ---------------------------------------------------------------------------

/**
 * Shape of a trámite as consumed by this admin view. The backend may return
 * either the new contract (payload object + documentos array) or the legacy
 * one (descripcion string JSON), and the listing endpoint also embeds the
 * requester under `solicitante`/`usuario`.
 */
interface AdminTramite {
  id: string;
  tipo: string;
  estado: string;
  payload?: Record<string, unknown>;
  documentos?: TramiteDocumento[];
  descripcion?: string;
  createdAt?: string;
  creadoEn?: string;
  solicitante?: SolicitanteRef;
  usuario?: SolicitanteRef;
  aprobadoPor?: { nombre?: string } | null;
  aprobadoPorId?: string | null;
}

interface SolicitanteRef {
  nombre?: string;
  torre?: string;
  apto?: string;
  unidad?: { torre?: string; numero?: string };
}

interface TramiteDocumento {
  nombre: string;
  base64: string;
  type?: string;
  mimeType?: string;
}

interface TramiteMeta {
  metadatos: Record<string, unknown>;
  documentos: TramiteDocumento[];
}

interface PreviewDoc {
  nombre: string;
  base64: string;
  mimeType?: string;
}

interface AnuncioForm {
  titulo: string;
  contenido: string;
  tipo: TipoAnuncio;
  fijado: boolean;
  imagenUrl: string;
}

type Tab = 'PENDIENTE' | 'HISTORIAL' | 'PUBLICAR_ANUNCIO';

const ALLOWED_ROLES = ['ADMINISTRADOR', 'SUPER_ADMIN'];

const EMPTY_ANUNCIO_FORM: AnuncioForm = {
  titulo: '',
  contenido: '',
  tipo: 'GENERAL',
  fijado: false,
  imagenUrl: '',
};

const TIPO_ANUNCIO_OPTIONS: TipoAnuncio[] = ['GENERAL', 'URGENTE', 'MANTENIMIENTO', 'EVENTO'];

const MESES_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '3', label: '3 meses' },
  { value: '6', label: '6 meses' },
  { value: '12', label: '12 meses (1 año)' },
  { value: '24', label: '24 meses (2 años)' },
  { value: '0', label: 'Sin vencimiento' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDesc(str: string): TramiteMeta {
  try {
    const parsed = JSON.parse(str) as {
      metadatos?: Record<string, unknown>;
      documentos?: TramiteDocumento[];
    } & Record<string, unknown>;
    // Manejar estructura de Stage 36: { metadatos, documentos }
    if (parsed.metadatos) {
      return { metadatos: parsed.metadatos, documentos: parsed.documentos || [] };
    }
    // Si no, intentar aplanar si es objeto directo
    return { metadatos: parsed, documentos: [] };
  } catch {
    return { metadatos: { nota: str }, documentos: [] };
  }
}

/**
 * Normaliza un trámite al shape { metadatos, documentos } sea cual sea el
 * contrato: nuevo backend (payload objeto + documentos array) o el viejo
 * (descripcion string JSON). Evita el crash cuando no hay 'descripcion'.
 */
function getMeta(t: AdminTramite | null): TramiteMeta {
  if (t && typeof t === 'object' && (t.payload !== undefined || t.documentos !== undefined)) {
    return { metadatos: t.payload || {}, documentos: t.documentos || [] };
  }
  return parseDesc(t?.descripcion ?? '');
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Pure-TS base64 → bytes. Hermes has no `atob`, and `File.write()` takes
 * `string | Uint8Array`, so the document bytes are decoded here before being
 * written to the cache for expo-sharing.
 */
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const byteLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_CHARS.indexOf(clean.charAt(i));
    const c1 = B64_CHARS.indexOf(clean.charAt(i + 1) || 'A');
    const c2 = B64_CHARS.indexOf(clean.charAt(i + 2) || 'A');
    const c3 = B64_CHARS.indexOf(clean.charAt(i + 3) || 'A');
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (p < byteLen) out[p++] = (n >> 16) & 0xff;
    if (p < byteLen) out[p++] = (n >> 8) & 0xff;
    if (p < byteLen) out[p++] = n & 0xff;
  }
  return out;
}

/** Strips path separators so a server-provided name can't escape the cache dir. */
function safeFileName(nombre: string): string {
  const cleaned = nombre.replace(/[/\\:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : `documento-${Date.now()}`;
}

function isImageDoc(doc: PreviewDoc): boolean {
  return doc.base64.startsWith('data:image/') || !!doc.mimeType?.startsWith('image/');
}

/** True when the metadatos value should be hidden from the grid (web filter). */
function isFotoKey(k: string): boolean {
  const lower = k.toLowerCase();
  return lower === 'fotourl' || lower === 'foto_url';
}

// ---------------------------------------------------------------------------
// Local skeleton (web <SkeletonRows />)
// ---------------------------------------------------------------------------

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View className="w-full flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <LiquidGlass key={i} radius={24} className="rounded-3xl border border-border">
          <View className="flex-row items-center gap-3 p-5">
            <View className="h-10 w-10 shrink-0 rounded-xl bg-text/10" />
            <View className="min-w-0 flex-1 flex-col gap-2">
              <View className="h-3 w-1/2 rounded-lg bg-text/10" />
              <View className="h-2.5 w-1/3 rounded-lg bg-text/10" />
            </View>
            <View className="h-4 w-16 shrink-0 rounded-lg bg-text/10" />
          </View>
        </LiquidGlass>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Picker (RN equivalent of the web <select>; nests safely inside a Modal)
// ---------------------------------------------------------------------------

interface PickerOption {
  value: string;
  label: string;
}

interface PickerModalProps {
  open: boolean;
  title: string;
  options: PickerOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function PickerModal({ open, title, options, selected, onSelect, onClose }: PickerModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = tokensFor(theme);

  return (
    <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={onClose}
          className="absolute inset-0 bg-black/80"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(320)}
            className="max-h-[70%] overflow-hidden rounded-t-[32px] border border-border bg-primaryLight"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <View className="flex-row items-center justify-between px-5 py-4">
              <Text className="text-base font-bold text-text">{title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                onPress={onClose}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full bg-surface2"
              >
                <X size={18} color={t.text} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  accessibilityRole="button"
                  onPress={() => {
                    onSelect(o.value);
                    onClose();
                  }}
                  className="flex-row items-center justify-between border-b border-border py-3.5"
                >
                  <Text className="flex-1 pr-2 text-sm text-text" numberOfLines={1}>
                    {o.label}
                  </Text>
                  {o.value === selected ? <CheckCircle2 size={18} color={t.accent} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminNovedades() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;

  const { theme } = useTheme();
  const t = tokensFor(theme);
  const semanticInk = onSemantic(theme);

  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [tramites, setTramites] = useState<AdminTramite[]>([]);
  const [tab, setTab] = useState<Tab>('PENDIENTE');

  // State for announcements
  const [anuncios, setAnuncios] = useState<AnuncioDto[]>([]);
  const [loadingAnuncios, setLoadingAnuncios] = useState(false);
  const [anuncioForm, setAnuncioForm] = useState<AnuncioForm>(EMPTY_ANUNCIO_FORM);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmittingAnuncio, setIsSubmittingAnuncio] = useState(false);
  const [editingAnuncioId, setEditingAnuncioId] = useState<string | null>(null);
  const [anuncioToDelete, setAnuncioToDelete] = useState<string | null>(null);
  const [isDeletingAnuncio, setIsDeletingAnuncio] = useState(false);
  const [tipoPickerOpen, setTipoPickerOpen] = useState(false);

  // Modal State
  const [selectedTramite, setSelectedTramite] = useState<AdminTramite | null>(null);
  const [obs, setObs] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableCells, setAvailableCells] = useState<CeldaMapaDto[]>([]);
  const [selectedCellId, setSelectedCellId] = useState('');
  const [mesesAsignacion, setMesesAsignacion] = useState('12');
  const [nuevaCeldaNum, setNuevaCeldaNum] = useState('');
  const [nuevaCeldaTorre, setNuevaCeldaTorre] = useState('');
  const [creandoCelda, setCreandoCelda] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc | null>(null);
  const [celdaPickerOpen, setCeldaPickerOpen] = useState(false);
  const [mesesPickerOpen, setMesesPickerOpen] = useState(false);

  // -- data fetching --------------------------------------------------------

  const fetchTramites = useCallback(async () => {
    setLoading(true);
    try {
      const qs = tab === 'PENDIENTE' ? '?estado=PENDIENTE' : '';
      const items = await api.get<AdminTramite[]>(`/tramites${qs}`);
      if (tab === 'HISTORIAL') {
        setTramites(items.filter((x) => x.estado !== 'PENDIENTE'));
      } else {
        setTramites(items);
      }
    } catch {
      toast.error('Error al cargar trámites');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const fetchCells = useCallback(async () => {
    try {
      const data = await api.get<CeldaMapaDto[]>('/parqueadero/mapa');
      setAvailableCells(data.filter((c) => c.estado === 'DISPONIBLE'));
    } catch (e) {
      console.error('Error fetching cells', e);
    }
  }, []);

  const fetchAnuncios = useCallback(async () => {
    setLoadingAnuncios(true);
    try {
      const data = await api.get<AnuncioDto[]>('/anuncios');
      setAnuncios(data);
    } catch {
      toast.error('Error al cargar anuncios');
    } finally {
      setLoadingAnuncios(false);
    }
  }, []);

  // Real-time WebSocket subscriptions
  useWsSubscription('tramite', () => {
    void fetchTramites();
  });
  useWsSubscription('anuncio', () => {
    void fetchAnuncios();
  });

  // Auth + role gate, then the per-tab load (mirrors the web effect exactly).
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

    if (tab === 'PENDIENTE' || tab === 'HISTORIAL') {
      void fetchTramites();
      if (tab === 'PENDIENTE') void fetchCells();
    } else if (tab === 'PUBLICAR_ANUNCIO') {
      void fetchAnuncios();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user, authLoading, role, router]);

  // -- celda rápida ---------------------------------------------------------

  const crearCeldaRapida = useCallback(async () => {
    if (!nuevaCeldaNum.trim()) {
      toast.error('Indica el número de la celda');
      return;
    }
    setCreandoCelda(true);
    try {
      const creadas = await api.post<CeldaMapaDto[]>('/parqueadero/celdas', {
        numero: nuevaCeldaNum.trim(),
        torre: nuevaCeldaTorre.trim() || undefined,
        tipo: 'RESIDENTE',
      });
      toast.success(`Celda ${nuevaCeldaNum.trim()} creada.`);
      setNuevaCeldaNum('');
      setNuevaCeldaTorre('');
      await fetchCells();
      // Auto-selecciona la celda recién creada
      if (Array.isArray(creadas) && creadas[0]?.id) setSelectedCellId(creadas[0].id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la celda');
    } finally {
      setCreandoCelda(false);
    }
  }, [nuevaCeldaNum, nuevaCeldaTorre, fetchCells]);

  // -- anuncio image upload (web: <input type=file> + FileReader) -----------

  const handleImageUpload = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Permiso de galería denegado');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    if (asset.fileSize !== undefined && asset.fileSize > 5 * 1024 * 1024) {
      toast.error('El tamaño de la imagen supera el límite de 5MB');
      return;
    }

    setIsUploadingImage(true);
    try {
      // Read the asset as a base64 data URL, then offload it to object storage
      // (MinIO) via the backend. We persist only the returned short URL — never
      // the base64 blob — so the announcement payload stays small.
      const raw = asset.base64 ?? (await new File(asset.uri).base64());
      const mimeType = asset.mimeType || 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${raw}`;

      const res = await api.post<{ url: string }>('/uploads/imagen', {
        data: dataUrl,
        carpeta: 'anuncios',
      });
      setAnuncioForm((prev) => ({ ...prev, imagenUrl: res.url }));
      toast.success('Imagen cargada correctamente');
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Error al cargar imagen';
      toast.error('Error al cargar imagen: ' + msg);
    } finally {
      setIsUploadingImage(false);
    }
  }, []);

  // -- anuncio CRUD ---------------------------------------------------------

  const handleSubmitAnuncio = useCallback(async () => {
    if (!anuncioForm.titulo.trim() || !anuncioForm.contenido.trim()) {
      toast.error('Por favor completa los campos obligatorios');
      return;
    }

    setIsSubmittingAnuncio(true);
    try {
      if (editingAnuncioId) {
        await api.put(`/anuncios/${editingAnuncioId}`, anuncioForm);
        toast.success('Anuncio actualizado exitosamente');
      } else {
        await api.post('/anuncios', anuncioForm);
        toast.success('Anuncio publicado exitosamente');
      }
      setAnuncioForm(EMPTY_ANUNCIO_FORM);
      setEditingAnuncioId(null);
      void fetchAnuncios();
    } catch {
      toast.error(
        editingAnuncioId
          ? 'Error de conexión al actualizar anuncio'
          : 'Error de conexión al publicar anuncio',
      );
    } finally {
      setIsSubmittingAnuncio(false);
    }
  }, [anuncioForm, editingAnuncioId, fetchAnuncios]);

  const startEditAnuncio = useCallback((anuncio: AnuncioDto) => {
    setEditingAnuncioId(anuncio.id);
    setAnuncioForm({
      titulo: anuncio.titulo || '',
      contenido: anuncio.contenido || '',
      tipo: anuncio.tipo || 'GENERAL',
      fijado: !!anuncio.fijado,
      imagenUrl: anuncio.imagenUrl || '',
    });
    // Scroll to the form at the top of the panel.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const cancelEditAnuncio = useCallback(() => {
    setEditingAnuncioId(null);
    setAnuncioForm(EMPTY_ANUNCIO_FORM);
  }, []);

  const confirmDeleteAnuncio = useCallback(async () => {
    const id = anuncioToDelete;
    if (!id) return;
    setIsDeletingAnuncio(true);
    try {
      await api.delete(`/anuncios/${id}`);
      toast.success('Anuncio eliminado correctamente');
      void fetchAnuncios();
    } catch {
      toast.error('Error de conexión al eliminar anuncio');
    } finally {
      setIsDeletingAnuncio(false);
      setAnuncioToDelete(null);
    }
  }, [anuncioToDelete, fetchAnuncios]);

  // -- documento: descargar / abrir -----------------------------------------

  const downloadFile = useCallback(async (base64: string, filename: string) => {
    try {
      const httpUrl = safeHttpUrl(base64);
      if (httpUrl) {
        // Server-hosted document: hand it to the system browser.
        await WebBrowser.openBrowserAsync(httpUrl);
        toast.success(`Descargando ${filename}`);
        return;
      }
      const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(base64);
      if (!match) throw new Error('formato no soportado');
      const mimeType = match[1];
      const file = new File(Paths.cache, safeFileName(filename));
      file.create({ overwrite: true, intermediates: true });
      file.write(base64ToBytes(match[2]));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType,
          UTI: mimeType,
          dialogTitle: filename,
        });
      }
      toast.success(`Descargando ${filename}`);
    } catch {
      toast.error('Error al descargar archivo');
    }
  }, []);

  // -- resolver trámite -----------------------------------------------------

  const handleResolve = useCallback(
    async (accion: 'APROBAR' | 'RECHAZAR') => {
      if (!selectedTramite) return;
      if (accion === 'RECHAZAR' && !obs.trim()) {
        toast.error('Debes incluir una observación al rechazar.');
        return;
      }
      setIsProcessing(true);
      try {
        // Contrato real del backend: PUT /tramites/{id}/resolver
        // { decision: 'APROBADO'|'RECHAZADO', observacion?, parqueaderoId?, meses? }
        const asignaCelda =
          accion === 'APROBAR' && selectedTramite.tipo === 'VEHICULO' && !!selectedCellId;
        await api.put(`/tramites/${selectedTramite.id}/resolver`, {
          decision: accion === 'APROBAR' ? 'APROBADO' : 'RECHAZADO',
          observacion: obs || undefined,
          parqueaderoId: asignaCelda ? selectedCellId : undefined,
          meses: asignaCelda ? parseInt(mesesAsignacion, 10) || 0 : undefined,
        });
        toast.success(`Trámite ${accion === 'APROBAR' ? 'aprobado' : 'rechazado'} con éxito.`);
        setSelectedTramite(null);
        setObs('');
        setSelectedCellId('');
        setMesesAsignacion('12');
        void fetchTramites();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Error al procesar el trámite.');
      } finally {
        setIsProcessing(false);
      }
    },
    [selectedTramite, obs, selectedCellId, mesesAsignacion, fetchTramites],
  );

  // -- render helpers -------------------------------------------------------

  const getTipoIcon = (tipo: string): ReactElement => {
    switch (tipo) {
      case 'VEHICULO':
        return <Car size={16} color={t.text} />;
      case 'MASCOTA':
        return <Dog size={16} color={t.text} />;
      case 'ARRENDAMIENTO':
        return <Briefcase size={16} color={t.text} />;
      case 'MUDANZA':
        return <Info size={16} color={t.text} />;
      default:
        return <AlertCircle size={16} color={t.text} />;
    }
  };

  const celdaOptions: PickerOption[] = [
    { value: '', label: 'No asignar puesto...' },
    ...availableCells.map((c) => ({
      value: c.id,
      label: `Celda ${c.numero} (${c.torre || 'N/A'})`,
    })),
  ];

  const selectedCeldaLabel =
    celdaOptions.find((o) => o.value === selectedCellId)?.label ?? 'No asignar puesto...';
  const selectedMesesLabel =
    MESES_OPTIONS.find((o) => o.value === mesesAsignacion)?.label ?? mesesAsignacion;

  const selectedMeta = getMeta(selectedTramite);
  const selectedFoto = (() => {
    const meta = selectedMeta.metadatos || {};
    const foto = meta.fotoUrl ?? meta.foto_url;
    return typeof foto === 'string' && foto ? foto : null;
  })();

  return (
    <Screen scroll={false} className="bg-primary">
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 24 }}
      >
        <ProfileHeader />

        {/* Title + refresh */}
        <View className="flex-row items-center justify-between">
          <View>
            <Text
              className="text-2xl font-medium tracking-wide text-text"
              style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
            >
              Trámites
            </Text>
            <Text className="text-sm text-text">Solicitudes de residentes</Text>
          </View>
          {tab === 'PENDIENTE' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Actualizar"
              onPress={() => void fetchTramites()}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="rounded-full p-2"
            >
              <RefreshCw size={18} color={t.text} />
            </Pressable>
          ) : null}
        </View>

        {/* Tabs */}
        <View className="flex-row rounded-full border border-border bg-surface2 p-1">
          {(
            [
              { key: 'PENDIENTE', label: 'Pendientes' },
              { key: 'HISTORIAL', label: 'Historial' },
              { key: 'PUBLICAR_ANUNCIO', label: 'Publicar Anuncio' },
            ] as Array<{ key: Tab; label: string }>
          ).map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                onPress={() => setTab(item.key)}
                className={`flex-1 items-center justify-center rounded-full py-3 ${
                  active ? 'bg-info' : ''
                }`}
              >
                <Text
                  className={`text-[10px] font-bold uppercase tracking-widest ${
                    active ? 'text-on-accent' : 'text-text'
                  }`}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Listado */}
        {tab !== 'PUBLICAR_ANUNCIO' ? (
          <View className="flex-col gap-4">
            {loading ? (
              <View className="w-full py-12">
                <SkeletonRows />
              </View>
            ) : tramites.length === 0 ? (
              <LiquidGlass radius={24} className="rounded-3xl border border-border">
                <View className="items-center p-8">
                  <CheckCircle2 size={40} color={t.text} style={{ opacity: 0.5, marginBottom: 12 }} />
                  <Text className="font-medium text-text">Bandeja al día</Text>
                  <Text className="mt-1 text-xs text-text">No hay trámites en esta sección.</Text>
                </View>
              </LiquidGlass>
            ) : (
              tramites.map((item, i) => {
                const u = item.solicitante || item.usuario;
                const desc = getMeta(item);
                const md = desc.metadatos || {};
                const preview =
                  item.tipo === 'VEHICULO'
                    ? `${String(md.marca ?? '') || 'Vehículo'} - Placa: ${String(md.placa ?? '') || '?'}`
                    : item.tipo === 'MASCOTA'
                      ? `Mascota: ${String(md.nombre ?? '') || 'Pet'} (${String(md.tipo ?? '') || '?'})`
                      : item.tipo === 'MUDANZA'
                        ? `Fecha Mudanza: ${String(md.fecha ?? '') || '?'}`
                        : 'Solicitud pendiente...';
                return (
                  <Animated.View key={item.id} entering={FadeInDown.delay(i * 50).duration(400)}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={tab !== 'PENDIENTE'}
                      onPress={() => {
                        if (tab === 'PENDIENTE') setSelectedTramite(item);
                      }}
                      style={({ pressed }) => ({ opacity: pressed && tab === 'PENDIENTE' ? 0.9 : 1 })}
                    >
                      <LiquidGlass variant="card" radius={24} className="rounded-[24px] border border-border">
                        <View className="flex-col gap-3 p-5">
                          <View className="flex-row items-start justify-between">
                            <View className="flex-row items-center gap-2">
                              <View className="rounded-full border border-border bg-surface2 p-2">
                                {getTipoIcon(item.tipo)}
                              </View>
                              <View className="flex-col">
                                <Text className="text-xs font-bold uppercase tracking-wider text-text">
                                  {item.tipo}
                                </Text>
                                <Text className="text-[10px] text-text">
                                  {new Date(item.createdAt || item.creadoEn || '').toLocaleString()}
                                </Text>
                              </View>
                            </View>
                            {item.estado === 'PENDIENTE' ? (
                              <View className="flex-row items-center gap-1 rounded-full border border-text/30 bg-text/10 px-2 py-0.5">
                                <Clock size={10} color={t.text} />
                                <Text className="text-[10px] font-bold uppercase text-text">
                                  Pendiente
                                </Text>
                              </View>
                            ) : null}
                            {item.estado === 'APROBADO' ? (
                              <View className="flex-row items-center gap-1 rounded-full border border-text/30 bg-text/10 px-2 py-0.5">
                                <CheckCircle2 size={10} color={t.text} />
                                <Text className="text-[10px] font-bold uppercase text-text">
                                  Aprobado
                                </Text>
                              </View>
                            ) : null}
                            {item.estado === 'RECHAZADO' ? (
                              <View className="flex-row items-center gap-1 rounded-full border border-text/30 bg-text/10 px-2 py-0.5">
                                <XCircle size={10} color={t.text} />
                                <Text className="text-[10px] font-bold uppercase text-text">
                                  Rechazado
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <View className="flex-row items-center gap-3 rounded-xl bg-surface2 p-3">
                            <User size={16} color={t.text} />
                            <View className="flex-1 flex-col">
                              <View className="flex-row flex-wrap items-center gap-2">
                                <Text className="text-sm font-medium text-text">
                                  {u?.nombre || 'Solicitante'}
                                </Text>
                                <View className="rounded-md bg-accent/20 px-2 py-0.5">
                                  <Text className="text-[10px] font-black uppercase text-accent">
                                    T{u?.torre || u?.unidad?.torre || '?'} - A
                                    {u?.apto || u?.unidad?.numero || '?'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>

                          {/* Desc Preview */}
                          <Text numberOfLines={2} className="text-xs italic text-text">
                            &quot;{preview}&quot;
                          </Text>

                          {tab === 'HISTORIAL' && (item.aprobadoPor || item.aprobadoPorId) ? (
                            <View className="mt-1 border-t border-border pt-2">
                              <Text className="text-[10px] text-text">
                                Procesado
                                {item.aprobadoPor?.nombre ? `: ${item.aprobadoPor.nombre}` : ''}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </LiquidGlass>
                    </Pressable>
                  </Animated.View>
                );
              })
            )}
          </View>
        ) : (
          <View className="flex-col gap-8">
            {/* Formulario */}
            <LiquidGlass variant="card" radius={28} className="rounded-[28px] border border-border">
              <View className="flex-col gap-4 p-6">
                <View className="mb-2 flex-row items-center justify-between border-b border-border pb-2">
                  <Text className="flex-1 pr-2 text-base font-bold text-text">
                    {editingAnuncioId
                      ? 'Editar Publicación / Circular'
                      : 'Crear Publicación / Circular'}
                  </Text>
                  {editingAnuncioId ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={cancelEditAnuncio}
                      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                      className="flex-row items-center gap-1 rounded-full border border-border bg-surface2 px-3 py-1.5"
                    >
                      <X size={12} color={t.text} />
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                        Cancelar
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                <View className="flex-col gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                    Título del Anuncio *
                  </Text>
                  <TextInput
                    value={anuncioForm.titulo}
                    onChangeText={(titulo) => setAnuncioForm((prev) => ({ ...prev, titulo }))}
                    placeholder="Ej: Mantenimiento Preventivo de Ascensores"
                    placeholderTextColor={t.textMuted}
                    className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-xs text-text"
                  />
                </View>

                <View className="flex-row gap-4">
                  <View className="flex-1 flex-col gap-1.5">
                    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                      Categoría / Tipo *
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setTipoPickerOpen(true)}
                      className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface2 px-4 py-3"
                    >
                      <Text className="flex-1 text-xs text-text" numberOfLines={1}>
                        {anuncioForm.tipo}
                      </Text>
                      <ChevronDown size={16} color={t.text} />
                    </Pressable>
                  </View>
                  <View className="flex-1 flex-row items-center gap-3 pl-2 pt-6">
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: anuncioForm.fijado }}
                      onPress={() =>
                        setAnuncioForm((prev) => ({ ...prev, fijado: !prev.fijado }))
                      }
                      className="flex-1 flex-row items-center gap-3"
                    >
                      <View
                        className={`h-4 w-4 items-center justify-center rounded border ${
                          anuncioForm.fijado ? 'border-accent bg-accent' : 'border-border bg-surface2'
                        }`}
                      >
                        {anuncioForm.fijado ? <Check size={12} color={t.onAccent} /> : null}
                      </View>
                      <Text className="flex-1 text-[10px] font-black uppercase tracking-widest text-text">
                        Fijar Anuncio (Top)
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View className="flex-col gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                    Contenido / Circular *
                  </Text>
                  <TextInput
                    value={anuncioForm.contenido}
                    onChangeText={(contenido) => setAnuncioForm((prev) => ({ ...prev, contenido }))}
                    placeholder="Redacta la información detallada para los copropietarios..."
                    placeholderTextColor={t.textMuted}
                    multiline
                    textAlignVertical="top"
                    className="min-h-[120px] w-full rounded-xl border border-border bg-surface2 p-4 text-xs leading-relaxed text-text"
                  />
                </View>

                <View className="flex-col gap-2">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
                    Fotografía / Imagen (Opcional)
                  </Text>
                  {anuncioForm.imagenUrl ? (
                    <View className="relative h-40 overflow-hidden rounded-2xl border border-border">
                      <Image
                        alt="Vista previa del anuncio"
                        source={{ uri: anuncioForm.imagenUrl }}
                        contentFit="cover"
                        style={{ width: '100%', height: '100%' }}
                      />
                      <View className="absolute right-3 top-3 flex-row gap-2">
                        {/* Replace image */}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Reemplazar imagen"
                          disabled={isUploadingImage}
                          onPress={() => void handleImageUpload()}
                          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
                          className="rounded-full bg-accent p-2"
                        >
                          <Upload size={14} color={t.onAccent} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Quitar imagen"
                          onPress={() => setAnuncioForm((prev) => ({ ...prev, imagenUrl: '' }))}
                          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
                          className="rounded-full bg-accent p-2"
                        >
                          <XCircle size={16} color={t.onAccent} />
                        </Pressable>
                      </View>
                      {isUploadingImage ? (
                        <View className="absolute inset-0 items-center justify-center bg-black/60">
                          <ActivityIndicator color={t.accent} />
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isUploadingImage}
                      onPress={() => void handleImageUpload()}
                      className="items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-6"
                    >
                      <Upload size={24} color={t.text} />
                      <Text className="text-center text-[10px] font-bold uppercase tracking-wider text-text">
                        {isUploadingImage
                          ? 'Subiendo...'
                          : 'Seleccionar Archivo (PNG, JPG, max 5MB)'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: isSubmittingAnuncio || isUploadingImage,
                    busy: isSubmittingAnuncio,
                  }}
                  disabled={isSubmittingAnuncio || isUploadingImage}
                  onPress={() => void handleSubmitAnuncio()}
                  style={({ pressed }) => ({
                    opacity: isSubmittingAnuncio || isUploadingImage ? 0.5 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                  className="mt-2 w-full items-center justify-center rounded-2xl bg-accent py-4"
                >
                  <Text className="text-xs font-bold uppercase tracking-widest text-on-accent">
                    {isSubmittingAnuncio
                      ? editingAnuncioId
                        ? 'Guardando...'
                        : 'Publicando...'
                      : editingAnuncioId
                        ? 'Guardar Cambios'
                        : 'Publicar Anuncio'}
                  </Text>
                </Pressable>
              </View>
            </LiquidGlass>

            {/* Historial de Publicaciones */}
            <View className="flex-col gap-4">
              <Text className="px-1 text-xs font-black uppercase tracking-[2px] text-text">
                Anuncios Activos
              </Text>
              {loadingAnuncios ? (
                <View className="w-full items-center py-8">
                  <ActivityIndicator color={t.accent} />
                </View>
              ) : anuncios.length === 0 ? (
                <LiquidGlass radius={24} className="rounded-3xl border border-border">
                  <View className="items-center p-8">
                    <Text className="text-center text-xs italic text-text">
                      No hay anuncios publicados por ti en esta copropiedad.
                    </Text>
                  </View>
                </LiquidGlass>
              ) : (
                anuncios.map((anuncio) => (
                  <LiquidGlass
                    key={anuncio.id}
                    variant="card"
                    radius={16}
                    className="rounded-2xl border border-border"
                  >
                    <View className="flex-row items-center justify-between gap-4 p-4">
                      <View className="flex-1 flex-row items-center gap-3">
                        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
                          <Megaphone size={18} color={t.accent} />
                        </View>
                        <View className="min-w-0 flex-1 flex-col">
                          <Text numberOfLines={1} className="text-xs font-bold text-text">
                            {anuncio.titulo}
                          </Text>
                          <Text className="text-[9px] uppercase tracking-wider text-text">
                            {anuncio.tipo} •{' '}
                            {new Date(anuncio.publicadoEn).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>
                      <View className="shrink-0 flex-row items-center gap-2">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Editar anuncio"
                          onPress={() => startEditAnuncio(anuncio)}
                          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                          className={`h-10 w-10 items-center justify-center rounded-xl border ${
                            editingAnuncioId === anuncio.id
                              ? 'border-accent/40 bg-accent/20'
                              : 'border-accent/25 bg-accent/10'
                          }`}
                        >
                          <Pencil size={16} color={t.accent} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Eliminar anuncio"
                          onPress={() => setAnuncioToDelete(anuncio.id)}
                          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                          className="h-10 w-10 items-center justify-center rounded-xl border border-text/25 bg-text/10"
                        >
                          <Trash2 size={16} color={t.text} />
                        </Pressable>
                      </View>
                    </View>
                  </LiquidGlass>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Categoría / Tipo picker */}
      <PickerModal
        open={tipoPickerOpen}
        title="Categoría / Tipo *"
        options={TIPO_ANUNCIO_OPTIONS.map((v) => ({ value: v, label: v }))}
        selected={anuncioForm.tipo}
        onSelect={(v) => setAnuncioForm((prev) => ({ ...prev, tipo: v as TipoAnuncio }))}
        onClose={() => setTipoPickerOpen(false)}
      />

      {/* MODAL: RESOLVER TRÁMITE */}
      <Modal
        visible={!!selectedTramite && tab === 'PENDIENTE'}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setSelectedTramite(null)}
      >
        <View className="flex-1 items-center justify-center p-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={() => setSelectedTramite(null)}
            className="absolute inset-0 bg-black/80"
          />
          {selectedTramite ? (
            <Animated.View
              entering={FadeInDown.duration(200)}
              className="max-h-[88%] w-full max-w-[400px] overflow-hidden rounded-[32px] border border-border bg-primaryLight"
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 24, gap: 16 }}
              >
                <Text className="mb-2 border-b border-border pb-2 text-lg font-bold text-text">
                  Resolver Trámite
                </Text>

                <View className="flex-col gap-1.5 rounded-xl border border-border bg-surface2 p-3">
                  <Text className="text-xs font-bold uppercase tracking-widest text-text">
                    Solicitante
                  </Text>
                  <Text className="text-sm font-bold text-text">
                    {selectedTramite.solicitante?.nombre ||
                      selectedTramite.usuario?.nombre ||
                      'Solicitante'}
                  </Text>
                  <View className="mt-1 flex-row gap-4">
                    <Text className="text-xs text-text/60">
                      Torre:{' '}
                      <Text className="font-bold text-text">
                        {selectedTramite.solicitante?.torre || 'S/T'}
                      </Text>
                    </Text>
                    <Text className="text-xs text-text/60">
                      Apto:{' '}
                      <Text className="font-bold text-text">
                        {selectedTramite.solicitante?.apto || 'S/A'}
                      </Text>
                    </Text>
                  </View>
                </View>

                <View className="flex-col gap-3">
                  {/* Foto del activo (mascota/avatar) si aplica */}
                  {selectedFoto ? (
                    <View className="mb-1 items-center">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Ver foto en grande"
                        onPress={() =>
                          setPreviewDoc({
                            nombre: `Foto de ${String(selectedMeta.metadatos?.nombre ?? '') || 'Mascota'}`,
                            base64: selectedFoto,
                            mimeType: 'image/jpeg',
                          })
                        }
                        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                        className="h-24 w-24 overflow-hidden rounded-full border border-border bg-surface2 p-[2px]"
                      >
                        <Image
                          alt="Mascota"
                          source={{ uri: selectedFoto }}
                          contentFit="cover"
                          style={{ width: '100%', height: '100%', borderRadius: 999 }}
                        />
                      </Pressable>
                    </View>
                  ) : null}

                  {/* Metadatos */}
                  <View className="rounded-2xl border border-border bg-surface2 p-4">
                    <Text className="mb-3 text-[10px] font-black uppercase tracking-[2px] text-text">
                      {selectedTramite.tipo === 'MASCOTA'
                        ? 'detalles de la solicitud de registro de mascota'
                        : selectedTramite.tipo === 'VEHICULO'
                          ? 'detalles de la solicitud de registro de vehículo'
                          : 'detalles de la solicitud de registro'}
                    </Text>
                    <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
                      {Object.entries(selectedMeta.metadatos || {})
                        .filter(([k]) => !isFotoKey(k))
                        .map(([k, v]) => (
                          <View key={k} className="flex-col" style={{ width: '50%', paddingHorizontal: 6, paddingBottom: 12 }}>
                            <Text className="text-[9px] font-bold uppercase text-text">{k}</Text>
                            <Text
                              className="text-xs text-text"
                              style={{ fontFamily: 'JetBrainsMono_400Regular' }}
                            >
                              {String(v)}
                            </Text>
                          </View>
                        ))}
                    </View>
                  </View>

                  {/* Documentación Adjunta */}
                  {selectedMeta.documentos?.length > 0 ? (
                    <View className="rounded-2xl border border-border bg-surface2 p-4">
                      <Text className="mb-3 text-[10px] font-black uppercase tracking-[2px] text-text">
                        Documentación Adjunta
                      </Text>
                      <View className="flex-col gap-2">
                        {selectedMeta.documentos.map((doc, i) => (
                          <View
                            key={i}
                            className="flex-row items-center justify-between rounded-xl border border-border bg-surface2 p-2"
                          >
                            <View className="flex-1 flex-row items-center gap-2">
                              <FileText size={14} color={t.text} />
                              <Text numberOfLines={1} className="flex-1 text-[10px] text-text">
                                {doc.nombre}
                              </Text>
                            </View>
                            <View className="flex-row gap-3">
                              <Pressable
                                accessibilityRole="button"
                                onPress={() =>
                                  setPreviewDoc({
                                    nombre: doc.nombre,
                                    base64: doc.base64,
                                    mimeType: doc.mimeType,
                                  })
                                }
                                hitSlop={6}
                              >
                                <Text className="text-[10px] font-black uppercase tracking-widest text-accent">
                                  Ver
                                </Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => void downloadFile(doc.base64, doc.nombre)}
                                hitSlop={6}
                              >
                                <Text className="text-[10px] font-black uppercase tracking-widest text-text/40">
                                  Descargar
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>

                {selectedTramite.tipo === 'VEHICULO' ? (
                  <View className="flex-col gap-2.5 rounded-xl border border-accent/20 bg-accent/5 p-3.5">
                    <View className="mb-0.5 flex-row items-center justify-between">
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-accent">
                        Asignar Celda (Opcional)
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setSelectedTramite(null);
                          router.push('/(app)/mapa-parqueadero' as never);
                        }}
                        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                        className="flex-row items-center gap-1"
                      >
                        <Map size={11} color={t.accent} />
                        <Text className="text-[10px] font-bold text-accent">Ver Mapa</Text>
                      </Pressable>
                    </View>

                    {/* Listado de celdas disponibles si existen */}
                    {availableCells.length > 0 ? (
                      <View className="flex-col gap-1.5">
                        <Text className="text-[10px] font-semibold uppercase tracking-wider text-text/50">
                          Seleccionar celda disponible:
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setCeldaPickerOpen(true)}
                          className="w-full flex-row items-center justify-between rounded-lg border border-border bg-surface2 px-3 py-2"
                        >
                          <Text className="flex-1 text-xs text-text" numberOfLines={1}>
                            {selectedCeldaLabel}
                          </Text>
                          <ChevronDown size={14} color={t.text} />
                        </Pressable>
                      </View>
                    ) : null}

                    {/* Crear celda nueva sobre la marcha */}
                    <View className="mt-1 flex-col gap-2 rounded-lg border border-dashed border-border bg-text/5 p-3">
                      <Text className="text-[10px] font-black uppercase tracking-wider text-text/80">
                        ¿Crear celda nueva?
                      </Text>
                      <View className="flex-row gap-2">
                        <TextInput
                          value={nuevaCeldaNum}
                          onChangeText={setNuevaCeldaNum}
                          placeholder="N° celda (ej: A-101)"
                          placeholderTextColor={t.textMuted}
                          className="flex-1 rounded-lg border border-border bg-surface2 px-3 py-2 text-xs text-text"
                        />
                        <TextInput
                          value={nuevaCeldaTorre}
                          onChangeText={setNuevaCeldaTorre}
                          placeholder="Torre"
                          placeholderTextColor={t.textMuted}
                          className="w-20 rounded-lg border border-border bg-surface2 px-3 py-2 text-xs text-text"
                        />
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: creandoCelda, busy: creandoCelda }}
                        disabled={creandoCelda}
                        onPress={() => void crearCeldaRapida()}
                        style={({ pressed }) => ({
                          opacity: creandoCelda ? 0.5 : 1,
                          transform: [{ scale: pressed ? 0.95 : 1 }],
                        })}
                        className="w-full items-center justify-center rounded-lg bg-success py-2"
                      >
                        <Text
                          className="text-xs font-bold uppercase tracking-wide"
                          style={{ color: semanticInk }}
                        >
                          {creandoCelda ? 'Creando...' : '+ Crear y asignar celda'}
                        </Text>
                      </Pressable>
                    </View>

                    {selectedCellId ? (
                      <View className="mt-1 flex-col gap-1.5">
                        <Text className="text-[10px] font-bold uppercase tracking-widest text-accent">
                          Cláusula de tiempo (asignación permanente)
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setMesesPickerOpen(true)}
                          className="w-full flex-row items-center justify-between rounded-lg border border-border bg-surface2 px-3 py-2"
                        >
                          <Text className="flex-1 text-xs text-text" numberOfLines={1}>
                            {selectedMesesLabel}
                          </Text>
                          <ChevronDown size={14} color={t.text} />
                        </Pressable>
                        <Text className="text-[9px] text-text">
                          {mesesAsignacion === '0'
                            ? 'La celda quedará asignada indefinidamente.'
                            : `La asignación vencerá automáticamente en ${mesesAsignacion} meses. El vigilante verá la fecha.`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View className="mt-2 flex-col gap-2">
                  <Text className="text-xs font-bold uppercase tracking-widest text-text">
                    Observaciones (Opcional si aprueba)
                  </Text>
                  <TextInput
                    value={obs}
                    onChangeText={setObs}
                    placeholder="Explicación para el residente..."
                    placeholderTextColor={t.textMuted}
                    multiline
                    textAlignVertical="top"
                    className="h-24 w-full rounded-xl border border-border bg-surface2 p-3 text-sm text-text"
                  />
                </View>

                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isProcessing }}
                    disabled={isProcessing}
                    onPress={() => void handleResolve('RECHAZAR')}
                    style={({ pressed }) => ({
                      opacity: isProcessing ? 0.5 : pressed ? 0.85 : 1,
                    })}
                    className="flex-1 items-center justify-center rounded-full border border-text/50 py-3"
                  >
                    <Text className="text-sm font-bold tracking-wide text-text">Rechazar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isProcessing, busy: isProcessing }}
                    disabled={isProcessing}
                    onPress={() => void handleResolve('APROBAR')}
                    style={({ pressed }) => ({
                      opacity: isProcessing ? 0.5 : 1,
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    })}
                    className="flex-1 items-center justify-center rounded-full bg-success py-3"
                  >
                    <Text
                      className="text-sm font-bold tracking-wide"
                      style={{ color: semanticInk }}
                    >
                      {isProcessing
                        ? '...'
                        : selectedTramite.tipo === 'VEHICULO' && selectedCellId
                          ? 'Aprobar y asignar'
                          : 'Aprobar'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>

        {/* Celda + meses pickers live inside the resolve modal's tree */}
        <PickerModal
          open={celdaPickerOpen}
          title="Seleccionar celda disponible:"
          options={celdaOptions}
          selected={selectedCellId}
          onSelect={setSelectedCellId}
          onClose={() => setCeldaPickerOpen(false)}
        />
        <PickerModal
          open={mesesPickerOpen}
          title="Cláusula de tiempo (asignación permanente)"
          options={MESES_OPTIONS}
          selected={mesesAsignacion}
          onSelect={setMesesAsignacion}
          onClose={() => setMesesPickerOpen(false)}
        />

        {/* DOCUMENT PREVIEW MODAL — nested inside the resolve modal (like the
            pickers) because it is only ever opened from within it (the asset
            photo + a documento's "Ver"). Two SIBLING RN Modals visible at the
            same time never both present on iOS: the first one owns the
            presentation and the second is silently dropped. Web stacks them
            with z-[20000] over z-100; nesting is the RN equivalent. */}
        <Modal
          visible={!!previewDoc}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setPreviewDoc(null)}
        >
          <View className="flex-1 items-center justify-center p-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setPreviewDoc(null)}
              className="absolute inset-0 bg-black/90"
            />
            {previewDoc ? (
              <View className="h-[80%] w-full max-w-[800px] flex-col gap-4 rounded-[32px] border border-border bg-primaryLight p-6">
                <View className="flex-row items-center justify-between border-b border-border pb-2">
                  <View className="flex-1 overflow-hidden pr-2">
                    <Text numberOfLines={1} className="text-sm font-bold text-text">
                      {previewDoc.nombre}
                    </Text>
                    <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-[2px] text-accent">
                      Vista previa online
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar"
                    onPress={() => setPreviewDoc(null)}
                    className="h-10 w-10 items-center justify-center rounded-full bg-text/5"
                  >
                    <X size={18} color={t.text} />
                  </Pressable>
                </View>

                <View className="flex-1 w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-black/40">
                  {isImageDoc(previewDoc) ? (
                    <Image
                      alt={previewDoc.nombre}
                      source={{ uri: previewDoc.base64 }}
                      contentFit="contain"
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    // RN has no <iframe>; non-image documents are handed to the
                    // system viewer (browser for http(s), share sheet for base64).
                    <View className="items-center gap-4 p-6">
                      <FileText size={40} color={t.text} />
                      <Text numberOfLines={2} className="text-center text-xs text-text">
                        {previewDoc.nombre}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void downloadFile(previewDoc.base64, previewDoc.nombre)}
                        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                        className="rounded-full bg-accent px-5 py-3"
                      >
                        <Text className="text-[10px] font-black uppercase tracking-widest text-on-accent">
                          Abrir documento
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            ) : null}
          </View>
        </Modal>
      </Modal>

      {/* MODAL: CONFIRMAR ELIMINAR ANUNCIO */}
      <Modal
        visible={!!anuncioToDelete}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setAnuncioToDelete(null)}
      >
        <ConfirmDeleteAnuncio
          open={!!anuncioToDelete}
          isDeleting={isDeletingAnuncio}
          onCancel={() => setAnuncioToDelete(null)}
          onConfirm={() => void confirmDeleteAnuncio()}
        />
      </Modal>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation — web renders it as a bottom sheet on mobile widths
// (items-end + rounded-t-[32px] + slide-in-from-bottom-full).
// ---------------------------------------------------------------------------

interface ConfirmDeleteAnuncioProps {
  open: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDeleteAnuncio({
  open,
  isDeleting,
  onCancel,
  onConfirm,
}: ConfirmDeleteAnuncioProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const semanticInk = onSemantic(theme);

  return (
    <View className="flex-1 justify-end">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        onPress={onCancel}
        className="absolute inset-0 bg-black/80"
      />
      {open ? (
        <Animated.View
          entering={SlideInDown.duration(300)}
          className="w-full overflow-hidden rounded-t-[32px] border-t border-border bg-primaryLight px-8 pb-8 pt-8"
          style={{ paddingBottom: insets.bottom + 32 }}
        >
          <View className="flex-col items-center gap-4">
            <View className="h-16 w-16 items-center justify-center rounded-full border border-danger/40 bg-danger/15">
              <Trash2 size={28} color={t.danger} />
            </View>
            <View className="flex-col items-center gap-1">
              <Text className="text-[10px] font-bold uppercase tracking-[2px] text-accent">
                Eliminar Anuncio
              </Text>
              <Text
                className="text-2xl font-bold text-text"
                style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
              >
                ¿Estás seguro?
              </Text>
            </View>
            <Text className="text-center text-sm leading-relaxed text-text/80">
              Esta acción no se puede deshacer. El anuncio se eliminará permanentemente de la
              cartelera.
            </Text>
            <View className="mt-2 w-full flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                className="flex-1 items-center justify-center rounded-2xl border border-border bg-text/5 py-4"
              >
                <Text className="text-sm font-bold text-text">Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
                disabled={isDeleting}
                onPress={onConfirm}
                style={({ pressed }) => ({
                  opacity: isDeleting ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
                className="flex-1 items-center justify-center rounded-2xl bg-danger py-4"
              >
                <Text className="text-sm font-bold" style={{ color: semanticInk }}>
                  {isDeleting ? 'Eliminando...' : 'Eliminar'}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
