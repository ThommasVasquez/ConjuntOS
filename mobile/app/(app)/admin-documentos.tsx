/**
 * ADMIN DOCUMENTOS — CONJUNTOSAPP (mobile port)
 * Gestión documental: publicar, editar y eliminar documentos de la copropiedad.
 *
 * Ported 1:1 from web `src/app/(app)/admin-documentos/page.tsx`:
 *  - GET /documentos (carga inicial), POST /documentos, PUT /documentos/{id},
 *    DELETE /documentos/{id}.
 *  - Buscador (nombre + descripción) + filtro por categoría (TODOS + 10 cats).
 *  - Modal crear/editar con nombre*, descripción, categoría*, versión, URL* y
 *    checkbox "Visible para residentes".
 *  - Chips de categoría con la misma paleta one-off del web (bg-blue-100 /
 *    text-blue-700, …) y badge Visible/Oculto con Eye / EyeOff.
 *  - GSAP stagger de `.doc-card` → Reanimated FadeInDown escalonado.
 *  - `confirm("¿Eliminar este documento?")` → Alert nativo (Cancelar/Aceptar).
 *  - `<a href={doc.url} target="_blank">` (Download) → expo-file-system
 *    (descarga a caché) + expo-sharing, con expo-web-browser como respaldo.
 *  - Añadido propio de móvil: el web pide pegar la URL a mano ("Sube el archivo
 *    a S3/MinIO y pega la URL aqui"); en móvil se ofrece además un selector de
 *    archivos (expo-document-picker) que sube por POST /uploads/archivo y
 *    rellena la URL. El campo URL manual se conserva intacto.
 *  - Guard de roles ADMINISTRADOR / SUPER_ADMIN (mismo copy y destino que el
 *    resto de pantallas admin: toast + redirect a /inicio).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { File, Paths } from 'expo-file-system';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api/client';
import { safeHttpUrl } from '@/lib/safe-url';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Types — mirror web `@/lib/api/types` (CatDoc / DocumentoDto /
// CreateDocumentoRequest). They do not exist yet in mobile's types.ts, so they
// live here until hoisted (reported to the orchestrator).
// ---------------------------------------------------------------------------

type CatDoc =
  | 'REGLAMENTO'
  | 'CONVIVENCIA'
  | 'MASCOTAS'
  | 'PARQUEADERO'
  | 'INFORME_EMPRESA'
  | 'ACTA'
  | 'CONTRATO'
  | 'CUENTA_COBRO'
  | 'CIRCULAR'
  | 'OTRO';

interface DocumentoDto {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: CatDoc;
  url: string;
  version?: string | null;
  subidoPor?: string | null;
  subidoPorNombre?: string | null;
  visibleResidentes: boolean;
  fechaPublicacion: string;
  createdAt: string;
}

interface CreateDocumentoRequest {
  nombre: string;
  descripcion?: string;
  categoria: CatDoc;
  url: string;
  version?: string;
  visibleResidentes?: boolean;
}

/** Response of `POST /uploads/archivo` (backend `UploadArchivoResponse`). */
interface UploadArchivoResponse {
  url: string;
  contentType: string;
}

// ---------------------------------------------------------------------------
// Config — copied verbatim from the web page
// ---------------------------------------------------------------------------

const CAT_DOC_OPTIONS: { value: CatDoc; label: string }[] = [
  { value: 'REGLAMENTO', label: 'Reglamento' },
  { value: 'CONVIVENCIA', label: 'Convivencia' },
  { value: 'MASCOTAS', label: 'Mascotas' },
  { value: 'PARQUEADERO', label: 'Parqueadero' },
  { value: 'INFORME_EMPRESA', label: 'Informe de Empresa' },
  { value: 'ACTA', label: 'Acta' },
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'CUENTA_COBRO', label: 'Cuenta de Cobro' },
  { value: 'CIRCULAR', label: 'Circular' },
  { value: 'OTRO', label: 'Otro' },
];

/**
 * Per-category chip palette. The web page uses one-off Tailwind palette classes
 * for this exact element (`bg-blue-100 text-blue-700`, …) rather than design
 * tokens, so they are reproduced verbatim — only split into background (View)
 * and foreground (Text) because RN cannot inherit text color.
 */
const CAT_COLORS: Record<string, { chip: string; label: string }> = {
  REGLAMENTO: { chip: 'bg-blue-100', label: 'text-blue-700' },
  CONVIVENCIA: { chip: 'bg-green-100', label: 'text-green-700' },
  MASCOTAS: { chip: 'bg-amber-100', label: 'text-amber-700' },
  PARQUEADERO: { chip: 'bg-purple-100', label: 'text-purple-700' },
  INFORME_EMPRESA: { chip: 'bg-rose-100', label: 'text-rose-700' },
  ACTA: { chip: 'bg-indigo-100', label: 'text-indigo-700' },
  CONTRATO: { chip: 'bg-cyan-100', label: 'text-cyan-700' },
  CUENTA_COBRO: { chip: 'bg-orange-100', label: 'text-orange-700' },
  CIRCULAR: { chip: 'bg-teal-100', label: 'text-teal-700' },
  OTRO: { chip: 'bg-gray-100', label: 'text-gray-700' },
};

/** Web fallback when `CAT_COLORS[doc.categoria]` misses: bg-gray-100 text-gray-600. */
const CAT_COLOR_FALLBACK = { chip: 'bg-gray-100', label: 'text-gray-600' };

interface FormData {
  nombre: string;
  descripcion: string;
  categoria: CatDoc;
  url: string;
  version: string;
  visibleResidentes: boolean;
}

const EMPTY_FORM: FormData = {
  nombre: '',
  descripcion: '',
  categoria: 'INFORME_EMPRESA',
  url: '',
  version: '',
  visibleResidentes: true,
};

const ALLOWED_ROLES = ['ADMINISTRADOR', 'SUPER_ADMIN'];

/** Backend cap for POST /uploads/archivo (16 MiB). */
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strips path separators so a server-provided name can't escape the cache dir. */
function safeFileName(nombre: string): string {
  const cleaned = nombre.replace(/[/\\:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : `documento-${Date.now()}`;
}

/**
 * Filename for the cached download. Prefers the extension found in the URL so
 * the OS share sheet can pick the right viewer (the document's `nombre` is a
 * human title like "Informe mensual de aseo" and usually has none).
 */
function downloadFileName(nombre: string, url: string): string {
  const base = safeFileName(nombre);
  if (/\.[A-Za-z0-9]{1,5}$/.test(base)) return base;
  const path = url.split('?')[0].split('#')[0];
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(path);
  return match ? `${base}.${match[1]}` : base;
}

/** Web: `new Date(doc.fechaPublicacion).toLocaleDateString("es-CO")`. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO');
}

// ---------------------------------------------------------------------------
// Picker (RN equivalent of the web <select>; nests inside the form Modal)
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
          className="absolute inset-0 bg-black/50"
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
// Card icon action — web resting color is text-gray-400 for all three buttons
// and only the CSS :hover tints them (indigo / amber / red). RN has no hover,
// so the tint is applied on press.
// ---------------------------------------------------------------------------

interface IconActionProps {
  label: string;
  activeColor: string;
  idleColor: string;
  activeBgClass: string;
  onPress: () => void;
  icon: (color: string) => ReactElement;
}

function IconAction({
  label,
  activeColor,
  idleColor,
  activeBgClass,
  onPress,
  icon,
}: IconActionProps) {
  const [active, setActive] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
      className={`rounded-lg p-2 ${active ? activeBgClass : ''}`}
    >
      {icon(active ? activeColor : idleColor)}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminDocumentos() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;

  const { theme } = useTheme();
  const t = tokensFor(theme);

  const [docs, setDocs] = useState<DocumentoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('TODOS');
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // -- data -----------------------------------------------------------------

  const loadDocs = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.get<DocumentoDto[]>('/documentos');
      setDocs(data);
    } catch {
      toast.error('Error al cargar documentos');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auth + role gate, then the initial load (web mounts loadDocs() directly;
  // the gate mirrors every other admin screen since the route is deep-linkable).
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
    void loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role, router]);

  // -- form open/close ------------------------------------------------------

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((doc: DocumentoDto) => {
    setEditingId(doc.id);
    setForm({
      nombre: doc.nombre,
      descripcion: doc.descripcion || '',
      categoria: doc.categoria as CatDoc,
      url: doc.url,
      version: doc.version || '',
      visibleResidentes: doc.visibleResidentes,
    });
    setShowForm(true);
  }, []);

  // -- submit ---------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!form.nombre.trim() || !form.url.trim()) {
      toast.error('Nombre y URL son obligatorios');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/documentos/${editingId}`, {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          categoria: form.categoria,
          url: form.url.trim(),
          version: form.version.trim() || null,
          visibleResidentes: form.visibleResidentes,
        });
        toast.success('Documento actualizado');
      } else {
        const payload: CreateDocumentoRequest = {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          categoria: form.categoria,
          url: form.url.trim(),
          version: form.version.trim() || undefined,
          visibleResidentes: form.visibleResidentes,
        };
        await api.post('/documentos', payload);
        toast.success('Documento publicado');
      }
      setShowForm(false);
      void loadDocs();
    } catch (err: unknown) {
      // Web: `err?.detail || "Error al guardar"` — an empty `detail` (RN fetch
      // often leaves `statusText` blank, so ApiError.detail can be '') must
      // still fall back to the copy, not show an empty toast.
      const detail = err instanceof ApiError ? err.detail : '';
      toast.error(detail || 'Error al guardar');
    } finally {
      setIsSubmitting(false);
    }
  }, [form, editingId, loadDocs]);

  // -- delete ---------------------------------------------------------------

  const deleteDoc = useCallback(async (id: string) => {
    try {
      await api.delete(`/documentos/${id}`);
      toast.success('Documento eliminado');
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error('Error al eliminar');
    }
  }, []);

  // Web `confirm("¿Eliminar este documento?")` → native confirm dialog with the
  // same two choices a browser confirm offers.
  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert('¿Eliminar este documento?', undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aceptar', style: 'destructive', onPress: () => void deleteDoc(id) },
      ]);
    },
    [deleteDoc],
  );

  // -- download (web: <a href={doc.url} target="_blank">) -------------------

  const handleDownload = useCallback(async (doc: DocumentoDto) => {
    const url = safeHttpUrl(doc.url);
    if (!url) {
      toast.error('Error al descargar archivo');
      return;
    }
    try {
      const target = new File(Paths.cache, downloadFileName(doc.nombre, url));
      if (target.exists) target.delete();
      // `idempotent` so a leftover cached file (a delete that raced or failed)
      // overwrites instead of rejecting with DestinationAlreadyExists.
      const downloaded = await File.downloadFileAsync(url, target, { idempotent: true });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, { dialogTitle: doc.nombre });
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch {
      // Fall back to the system browser, which is what the web anchor did.
      try {
        await WebBrowser.openBrowserAsync(url);
      } catch {
        toast.error('Error al descargar archivo');
      }
    }
  }, []);

  // -- upload (mobile-only convenience for the manual URL field) ------------

  const pickAndUpload = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    if (asset.size !== undefined && asset.size > MAX_UPLOAD_BYTES) {
      toast.error('El archivo supera el límite de 16MB');
      return;
    }

    setIsUploading(true);
    try {
      const raw = await new File(asset.uri).base64();
      const mimeType = asset.mimeType || 'application/octet-stream';
      const res = await api.post<UploadArchivoResponse>('/uploads/archivo', {
        data: `data:${mimeType};base64,${raw}`,
        nombre: asset.name,
      });
      setForm((prev) => ({
        ...prev,
        url: res.url,
        // Pre-fills the required title only when it is still empty.
        nombre: prev.nombre.trim() ? prev.nombre : asset.name,
      }));
      toast.success('Archivo cargado correctamente');
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Error al cargar archivo';
      toast.error('Error al cargar archivo: ' + msg);
    } finally {
      setIsUploading(false);
    }
  }, []);

  // -- derived --------------------------------------------------------------

  const filtered = useMemo(
    () =>
      docs.filter((d) => {
        const matchSearch =
          !search ||
          d.nombre.toLowerCase().includes(search.toLowerCase()) ||
          (d.descripcion && d.descripcion.toLowerCase().includes(search.toLowerCase()));
        const matchCat = filterCat === 'TODOS' || d.categoria === filterCat;
        return matchSearch && matchCat;
      }),
    [docs, search, filterCat],
  );

  const filterChips: string[] = ['TODOS', ...CAT_DOC_OPTIONS.map((c) => c.value)];

  const selectedCatLabel =
    CAT_DOC_OPTIONS.find((c) => c.value === form.categoria)?.label ?? form.categoria;

  return (
    <Screen className="bg-primary">
      <View className="gap-6 px-6 pt-4">
        <ProfileHeader />

        {/* Header actions — search + Nuevo Documento */}
        <View className="gap-3">
          <View className="w-full flex-row items-center gap-2 rounded-xl border border-border bg-surface2 px-3 py-2.5">
            <Search size={16} color={t.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar documentos..."
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 text-sm text-text"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={openCreate}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            className="w-full flex-row items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5"
          >
            <Upload size={16} color={t.onAccent} />
            <Text className="text-sm font-medium text-on-accent">Nuevo Documento</Text>
          </Pressable>
        </View>

        {/* Category filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4, paddingRight: 8 }}
        >
          {filterChips.map((cat) => {
            const active = filterCat === cat;
            return (
              <Pressable
                key={cat}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilterCat(cat)}
                className={`rounded-full px-3 py-1.5 ${
                  active ? 'bg-accent' : 'border border-border bg-surface2'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${active ? 'text-on-accent' : 'text-textMuted'}`}
                >
                  {cat === 'TODOS'
                    ? 'Todos'
                    : (CAT_DOC_OPTIONS.find((c) => c.value === cat)?.label || cat)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Documents list */}
        {isLoading ? (
          <Text className="py-16 text-center text-textMuted">Cargando...</Text>
        ) : filtered.length === 0 ? (
          <View className="items-center py-16">
            <FolderOpen size={48} color={t.textMuted} style={{ opacity: 0.5, marginBottom: 12 }} />
            <Text className="text-textMuted">No hay documentos</Text>
          </View>
        ) : (
          <View className="gap-3">
            {filtered.map((doc, i) => {
              const cat = CAT_COLORS[doc.categoria] || CAT_COLOR_FALLBACK;
              return (
                <Animated.View key={doc.id} entering={FadeInDown.delay(i * 50).duration(400)}>
                  <LiquidGlass variant="card" radius={12} className="rounded-xl border border-border">
                    <View className="flex-row items-start gap-3 p-4">
                      <View className="rounded-lg bg-accent/10 p-2">
                        <FileText size={20} color={t.accent} />
                      </View>

                      <View className="min-w-0 flex-1">
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text className="text-sm font-semibold text-text">{doc.nombre}</Text>
                          <View className={`rounded-full px-2 py-0.5 ${cat.chip}`}>
                            <Text className={`text-[10px] font-medium ${cat.label}`}>
                              {CAT_DOC_OPTIONS.find((c) => c.value === doc.categoria)?.label ||
                                doc.categoria}
                            </Text>
                          </View>
                          {doc.version ? (
                            <Text className="text-[10px] text-textMuted">v{doc.version}</Text>
                          ) : null}
                          <View className="flex-row items-center gap-1">
                            {doc.visibleResidentes ? (
                              <Eye size={12} color={t.textMuted} />
                            ) : (
                              <EyeOff size={12} color={t.textMuted} />
                            )}
                            <Text className="text-[10px] text-textMuted">
                              {doc.visibleResidentes ? 'Visible' : 'Oculto'}
                            </Text>
                          </View>
                        </View>

                        {doc.descripcion ? (
                          <Text numberOfLines={2} className="mt-1 text-xs text-textMuted">
                            {doc.descripcion}
                          </Text>
                        ) : null}

                        <View className="mt-2 flex-row items-center gap-3">
                          {doc.subidoPorNombre ? (
                            <Text className="text-[10px] text-textMuted">
                              Por: {doc.subidoPorNombre}
                            </Text>
                          ) : null}
                          <Text className="text-[10px] text-textMuted">
                            {formatDate(doc.fechaPublicacion)}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row items-center gap-1">
                        <IconAction
                          label="Descargar documento"
                          idleColor={t.textMuted}
                          activeColor={t.accent}
                          activeBgClass="bg-accent/10"
                          onPress={() => void handleDownload(doc)}
                          icon={(color) => <Download size={16} color={color} />}
                        />
                        <IconAction
                          label="Editar documento"
                          idleColor={t.textMuted}
                          activeColor={t.warning}
                          activeBgClass="bg-warning/10"
                          onPress={() => openEdit(doc)}
                          icon={(color) => <Edit3 size={16} color={color} />}
                        />
                        <IconAction
                          label="Eliminar documento"
                          idleColor={t.textMuted}
                          activeColor={t.danger}
                          activeBgClass="bg-danger/10"
                          onPress={() => handleDelete(doc.id)}
                          icon={(color) => <Trash2 size={16} color={color} />}
                        />
                      </View>
                    </View>
                  </LiquidGlass>
                </Animated.View>
              );
            })}
          </View>
        )}
      </View>

      {/* Create/Edit Modal */}
      <Modal
        visible={showForm}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setShowForm(false)}
      >
        {/* Keyboard avoidance: the dialog is vertically centered, so without it
            the URL field and the Publicar/Actualizar row sit under the keyboard
            (same pattern as cartelera.tsx / login.tsx). */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 items-center justify-center p-4"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={() => setShowForm(false)}
            className="absolute inset-0 bg-black/50"
          />
          {showForm ? (
            <Animated.View
              entering={FadeInDown.duration(200)}
              className="max-h-[90%] w-full max-w-[512px] overflow-hidden rounded-2xl border border-border bg-primaryLight"
            >
              <View className="flex-row items-center justify-between border-b border-border p-4">
                <Text className="font-semibold text-text">
                  {editingId ? 'Editar Documento' : 'Nuevo Documento'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  onPress={() => setShowForm(false)}
                  hitSlop={8}
                  className="rounded-lg p-1"
                >
                  <X size={20} color={t.text} />
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 16, gap: 16 }}
              >
                {/* Nombre */}
                <View>
                  <Text className="mb-1 text-xs font-medium text-textMuted">
                    Nombre del documento *
                  </Text>
                  <TextInput
                    value={form.nombre}
                    onChangeText={(nombre) => setForm((prev) => ({ ...prev, nombre }))}
                    placeholder="Ej: Informe mensual de aseo - Julio 2026"
                    placeholderTextColor={t.textMuted}
                    className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text"
                  />
                </View>

                {/* Descripcion */}
                <View>
                  <Text className="mb-1 text-xs font-medium text-textMuted">Descripcion</Text>
                  <TextInput
                    value={form.descripcion}
                    onChangeText={(descripcion) => setForm((prev) => ({ ...prev, descripcion }))}
                    placeholder="Descripcion breve del documento..."
                    placeholderTextColor={t.textMuted}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                    className="min-h-[64px] w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text"
                  />
                </View>

                {/* Categoria + Version */}
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="mb-1 text-xs font-medium text-textMuted">Categoria *</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCatPickerOpen(true)}
                      className="w-full flex-row items-center justify-between rounded-lg border border-border bg-surface2 px-3 py-2"
                    >
                      <Text className="flex-1 pr-1 text-sm text-text" numberOfLines={1}>
                        {selectedCatLabel}
                      </Text>
                      <ChevronDown size={14} color={t.text} />
                    </Pressable>
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1 text-xs font-medium text-textMuted">Version</Text>
                    <TextInput
                      value={form.version}
                      onChangeText={(version) => setForm((prev) => ({ ...prev, version }))}
                      placeholder="Ej: v1.0"
                      placeholderTextColor={t.textMuted}
                      autoCapitalize="none"
                      className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text"
                    />
                  </View>
                </View>

                {/* URL */}
                <View>
                  <Text className="mb-1 text-xs font-medium text-textMuted">
                    URL del documento *
                  </Text>
                  <TextInput
                    value={form.url}
                    onChangeText={(url) => setForm((prev) => ({ ...prev, url }))}
                    placeholder="https://..."
                    placeholderTextColor={t.textMuted}
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text"
                  />
                  <Text className="mt-1 text-[10px] text-textMuted">
                    Sube el archivo a S3/MinIO y pega la URL aqui
                  </Text>
                  {/* Mobile-only helper: pick a file and upload it, filling the URL. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isUploading, busy: isUploading }}
                    disabled={isUploading}
                    onPress={() => void pickAndUpload()}
                    style={({ pressed }) => ({
                      opacity: isUploading ? 0.6 : pressed ? 0.85 : 1,
                    })}
                    className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5"
                  >
                    {isUploading ? (
                      <ActivityIndicator color={t.accent} size="small" />
                    ) : (
                      <Upload size={14} color={t.text} />
                    )}
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                      {isUploading ? 'Subiendo...' : 'Seleccionar archivo (máx 16MB)'}
                    </Text>
                  </Pressable>
                </View>

                {/* Visible para residentes */}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: form.visibleResidentes }}
                  onPress={() =>
                    setForm((prev) => ({ ...prev, visibleResidentes: !prev.visibleResidentes }))
                  }
                  className="flex-row items-center gap-2"
                >
                  <View
                    className={`h-4 w-4 items-center justify-center rounded border ${
                      form.visibleResidentes
                        ? 'border-accent bg-accent'
                        : 'border-border bg-surface2'
                    }`}
                  >
                    {form.visibleResidentes ? <Check size={12} color={t.onAccent} /> : null}
                  </View>
                  <Text className="text-xs text-textMuted">Visible para residentes</Text>
                </Pressable>

                {/* Actions */}
                <View className="flex-row gap-2 pt-2">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowForm(false)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                    className="flex-1 items-center justify-center rounded-xl border border-border px-4 py-2.5"
                  >
                    <Text className="text-sm text-textMuted">Cancelar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                    disabled={isSubmitting}
                    onPress={() => void handleSubmit()}
                    style={({ pressed }) => ({
                      opacity: isSubmitting ? 0.5 : pressed ? 0.85 : 1,
                    })}
                    className="flex-1 items-center justify-center rounded-xl bg-accent px-4 py-2.5"
                  >
                    <Text className="text-sm font-medium text-on-accent">
                      {isSubmitting ? 'Guardando...' : editingId ? 'Actualizar' : 'Publicar'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Animated.View>
          ) : null}

          {/* Categoria picker lives inside the form modal's tree: two sibling RN
              Modals never both present on iOS. */}
          <PickerModal
            open={catPickerOpen}
            title="Categoria *"
            options={CAT_DOC_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
            selected={form.categoria}
            onSelect={(v) => setForm((prev) => ({ ...prev, categoria: v as CatDoc }))}
            onClose={() => setCatPickerOpen(false)}
          />
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
