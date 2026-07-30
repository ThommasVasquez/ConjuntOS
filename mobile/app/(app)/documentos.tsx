/**
 * DOCUMENTOS — CONJUNTOSAPP (mobile port)
 * Listado de documentos de la copropiedad visibles para el residente.
 *
 * Ported 1:1 from web `src/app/(app)/documentos/page.tsx`:
 *  - GET /documentos en el montaje; error → toast "Error al cargar documentos".
 *  - Buscador (nombre + descripción) con el mismo placeholder.
 *  - Chips de categoría derivados de los documentos cargados
 *    (`["TODOS", ...new Set(docs.map(d => d.categoria))]`), no de la lista fija.
 *  - Emoji por categoría (CAT_ICONS), etiqueta (CAT_LABELS) y chip de color
 *    (CAT_COLORS) con la misma paleta one-off del web.
 *  - Estados: "Cargando documentos...", "No se encontraron documentos con esos
 *    filtros" / "No hay documentos disponibles" con icono FolderOpen.
 *  - Fecha `toLocaleDateString("es-CO", { year, month: "short", day })`.
 *  - GSAP stagger de `.doc-card` → Reanimated FadeInDown escalonado.
 *  - `<a href={doc.url} target="_blank">` (botón "Ver") → expo-file-system
 *    (descarga a caché) + expo-sharing, con expo-web-browser como respaldo.
 *
 * Sin guard de roles: la página web no restringe por `user.rol` (el backend
 * filtra por `visibleResidentes`), y `app/(app)/_layout.tsx` ya exige sesión.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { File, Paths } from 'expo-file-system';
import { Calendar, Download, FolderOpen, Search, User } from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import type { DocumentoDto } from '@/lib/api/types';
import { safeHttpUrl } from '@/lib/safe-url';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Config — copied verbatim from the web page
// ---------------------------------------------------------------------------

const CAT_LABELS: Record<string, string> = {
  REGLAMENTO: 'Reglamento',
  CONVIVENCIA: 'Convivencia',
  MASCOTAS: 'Mascotas',
  PARQUEADERO: 'Parqueadero',
  INFORME_EMPRESA: 'Informe de Empresa',
  ACTA: 'Acta',
  CONTRATO: 'Contrato',
  CUENTA_COBRO: 'Cuenta de Cobro',
  CIRCULAR: 'Circular',
  OTRO: 'Otro',
};

/**
 * Per-category chip palette. The web page uses one-off Tailwind palette classes
 * for this exact element (`bg-blue-100 text-blue-700`, …) instead of design
 * tokens, so they are reproduced verbatim — only split into background (View)
 * and foreground (Text) because RN cannot inherit text color. Same treatment as
 * `admin-documentos.tsx`.
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

const CAT_ICONS: Record<string, string> = {
  REGLAMENTO: '📋',
  CONVIVENCIA: '🤝',
  MASCOTAS: '🐾',
  PARQUEADERO: '🚗',
  INFORME_EMPRESA: '📊',
  ACTA: '📝',
  CONTRATO: '📄',
  CUENTA_COBRO: '💰',
  CIRCULAR: '📢',
  OTRO: '📁',
};

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

/**
 * Web: `new Date(doc.fechaPublicacion).toLocaleDateString("es-CO", { year:
 * "numeric", month: "short", day: "numeric" })`. Same options, same locale.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Documentos() {
  const { theme } = useTheme();
  const t = tokensFor(theme);

  const [docs, setDocs] = useState<DocumentoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('TODOS');

  // -- data -----------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    async function loadDocs() {
      try {
        setIsLoading(true);
        const data = await api.get<DocumentoDto[]>('/documentos');
        if (!cancelled) setDocs(data);
      } catch {
        if (!cancelled) toast.error('Error al cargar documentos');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadDocs();
    return () => {
      cancelled = true;
    };
  }, []);

  // -- open / download (web: <a href={doc.url} target="_blank">) ------------

  const handleOpen = useCallback(async (doc: DocumentoDto) => {
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

  // -- derived --------------------------------------------------------------

  // Web derives the chips from the loaded documents, NOT from the fixed
  // category list: ["TODOS", ...new Set(docs.map(d => d.categoria))].
  const categories = useMemo(
    () => ['TODOS', ...Array.from(new Set(docs.map((d) => d.categoria)))],
    [docs],
  );

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

  return (
    <Screen className="bg-primary">
      <View className="gap-4 px-4 pt-4">
        <ProfileHeader />

        {/* Search */}
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

        {/* Category filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4, paddingRight: 8 }}
        >
          {categories.map((cat) => {
            const active = filterCat === cat;
            return (
              <Pressable
                key={cat}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilterCat(cat)}
                // Web chips carry a hover affordance (`hover:bg-gray-50`); the
                // native equivalent is the pressed feedback.
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                className={`rounded-full px-3 py-1.5 ${
                  active ? 'bg-accent' : 'border border-border bg-surface2'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${active ? 'text-on-accent' : 'text-textMuted'}`}
                >
                  {cat === 'TODOS' ? 'Todos' : CAT_LABELS[cat] || cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Documents */}
        {isLoading ? (
          // Web sets no size class here, so the copy renders at the 16px body
          // base (`text-base`), not at RN's 14px default.
          <Text className="py-16 text-center text-base text-textMuted">Cargando documentos...</Text>
        ) : filtered.length === 0 ? (
          <View className="items-center py-16">
            <FolderOpen size={48} color={t.textMuted} style={{ opacity: 0.5, marginBottom: 12 }} />
            <Text className="text-center text-sm text-textMuted">
              {search || filterCat !== 'TODOS'
                ? 'No se encontraron documentos con esos filtros'
                : 'No hay documentos disponibles'}
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {filtered.map((doc, i) => {
              const cat = CAT_COLORS[doc.categoria] || CAT_COLOR_FALLBACK;
              return (
                <Animated.View key={doc.id} entering={FadeInDown.delay(i * 50).duration(400)}>
                  <LiquidGlass
                    variant="card"
                    radius={12}
                    className="rounded-xl border border-border"
                  >
                    <View className="flex-row items-start gap-3 p-4">
                      <Text className="text-2xl">{CAT_ICONS[doc.categoria] || '📁'}</Text>

                      <View className="min-w-0 flex-1">
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text className="text-sm font-semibold text-text">{doc.nombre}</Text>
                          <View className={`rounded-full px-2 py-0.5 ${cat.chip}`}>
                            <Text className={`text-[10px] font-medium ${cat.label}`}>
                              {CAT_LABELS[doc.categoria] || doc.categoria}
                            </Text>
                          </View>
                          {doc.version ? (
                            <Text className="text-[10px] text-textMuted">v{doc.version}</Text>
                          ) : null}
                        </View>

                        {doc.descripcion ? (
                          <Text className="mt-1 text-xs text-textMuted">{doc.descripcion}</Text>
                        ) : null}

                        <View className="mt-2 flex-row flex-wrap items-center gap-3">
                          <View className="flex-row items-center gap-1">
                            <Calendar size={12} color={t.textMuted} />
                            <Text className="text-[10px] text-textMuted">
                              {formatDate(doc.fechaPublicacion)}
                            </Text>
                          </View>
                          {doc.subidoPorNombre ? (
                            <View className="flex-row items-center gap-1">
                              <User size={12} color={t.textMuted} />
                              <Text className="text-[10px] text-textMuted">
                                {doc.subidoPorNombre}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Ver ${doc.nombre}`}
                        onPress={() => void handleOpen(doc)}
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        className="flex-row items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5"
                      >
                        <Download size={14} color={t.accent} />
                        <Text className="text-xs font-medium text-accent">Ver</Text>
                      </Pressable>
                    </View>
                  </LiquidGlass>
                </Animated.View>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}
