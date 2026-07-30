/**
 * FormatTurno — rich renderer for the assistant's answer.
 *
 * RN port of web `src/app/(app)/asistente/page.tsx:19-73`. The answer is split
 * on `**token**`; a token whose lowercase form is in MODULE_PATH_MAP becomes a
 * tappable pill that navigates to that module, anything else becomes bold accent
 * text. MODULE_PATH_MAP is copied verbatim from the web page (lines 19-44).
 *
 * Web paints the pill with the retired `#57bf00` literal + `text-white`; per the
 * token rule that is the `success` token, with `onSemantic()` ink so it stays
 * readable in both schemes.
 *
 * Layout note: RN cannot put a rounded, padded Pressable *inside* a <Text> on
 * both platforms, so a line that contains at least one pill is laid out as a
 * wrapping row of word-level <Text>s with the pills as siblings (align-middle in
 * web). Lines with no pill keep a single <Text> so natural text wrapping and
 * `leading-relaxed` are preserved. `\n` in the model's answer is honored by
 * splitting into lines first (web relies on the browser's default whitespace
 * handling, which collapses them; a chat bubble reads better with them kept).
 */

import { Pressable, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';

import { glassFor, onSemantic, type ColorSchemeName } from '@/theme/tokens';

export interface ModuleTarget {
  path: string;
  label: string;
}

/** Verbatim from web page.tsx:19-44. */
export const MODULE_PATH_MAP: Record<string, ModuleTarget> = {
  pagos: { path: '/pagos', label: 'Pagos' },
  pago: { path: '/pagos', label: 'Pagos' },
  cuotas: { path: '/pagos', label: 'Pagos' },
  reservas: { path: '/reservas', label: 'Reservas' },
  reserva: { path: '/reservas', label: 'Reservas' },
  parqueadero: { path: '/parqueadero', label: 'Parqueadero' },
  parqueaderos: { path: '/parqueadero', label: 'Parqueadero' },
  vehículo: { path: '/parqueadero', label: 'Parqueadero' },
  vehiculo: { path: '/parqueadero', label: 'Parqueadero' },
  paquetería: { path: '/paqueteria', label: 'Paquetería' },
  paqueteria: { path: '/paqueteria', label: 'Paquetería' },
  pqrs: { path: '/pqrs', label: 'PQRS' },
  pqr: { path: '/pqrs', label: 'PQRS' },
  visitantes: { path: '/visitantes', label: 'Visitantes' },
  visitas: { path: '/visitantes', label: 'Visitantes' },
  cartelera: { path: '/cartelera', label: 'Cartelera' },
  inmobiliaria: { path: '/inmobiliaria', label: 'Inmobiliaria' },
  citofonía: { path: '/citofonia', label: 'Citofonía' },
  citofonia: { path: '/citofonia', label: 'Citofonía' },
  asamblea: { path: '/asamblea', label: 'Asamblea' },
  encuestas: { path: '/encuestas', label: 'Encuestas' },
  multas: { path: '/pqrs', label: 'Multas' },
  mascotas: { path: '/perfil', label: 'Mascotas' },
  perfil: { path: '/perfil', label: 'Perfil' },
};

const BODY_CLASS = 'text-sm leading-relaxed text-text';
const BOLD_CLASS = 'text-sm font-bold leading-relaxed text-accent';

function isToken(part: string): boolean {
  return part.startsWith('**') && part.endsWith('**') && part.length > 4;
}

/** `**Pagos**` → `Pagos` (web: `part.slice(2, -2).trim()`). */
function tokenLabel(part: string): string {
  return part.slice(2, -2).trim();
}

function mappedFor(part: string): ModuleTarget | undefined {
  return MODULE_PATH_MAP[tokenLabel(part).toLowerCase()];
}

/** Word-level split that keeps the whitespace runs, so a wrapping row spaces
 *  words the way inline text would. */
function chunks(text: string): string[] {
  return text.split(/(\s+)/).filter((c) => c.length > 0);
}

function ModulePill({
  label,
  scheme,
  onPress,
}: {
  label: string;
  scheme: ColorSchemeName;
  onPress: () => void;
}) {
  // Web: `bg-[#57bf00] text-white` → success token + readable ink.
  const ink = onSemantic(scheme);
  const g = glassFor(scheme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ir a ${label}`}
      // Web: `shadow-md` + `active:scale-95`.
      style={({ pressed }) => [
        {
          shadowColor: g.shadowColor,
          shadowOpacity: scheme === 'light' ? 0.12 : 0.3,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        },
        pressed ? { transform: [{ scale: 0.95 }] } : null,
      ]}
      className="mx-1 my-0.5 flex-row items-center gap-1.5 rounded-full border border-success/40 bg-success px-3 py-1"
    >
      <Text className="text-xs font-bold" style={{ color: ink }}>
        {label}
      </Text>
      <ArrowRight size={11} color={ink} />
    </Pressable>
  );
}

function Words({ text, className }: { text: string; className: string }) {
  return (
    <>
      {chunks(text).map((c, i) => (
        <Text key={i} className={className}>
          {c}
        </Text>
      ))}
    </>
  );
}

function FormatLine({
  line,
  scheme,
  onNavigate,
}: {
  line: string;
  scheme: ColorSchemeName;
  onNavigate: (path: string) => void;
}) {
  // Web: `text.split(/(\*\*[^*]+\*\*)/g)`.
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  const hasPill = parts.some((p) => isToken(p) && mappedFor(p) !== undefined);

  if (!hasPill) {
    return (
      <Text className={BODY_CLASS}>
        {parts.map((p, i) =>
          isToken(p) ? (
            <Text key={i} className="font-bold text-accent">
              {tokenLabel(p)}
            </Text>
          ) : (
            p
          ),
        )}
      </Text>
    );
  }

  return (
    <View className="flex-row flex-wrap items-center">
      {parts.map((p, i) => {
        if (isToken(p)) {
          const raw = tokenLabel(p);
          const mapped = mappedFor(p);
          if (mapped) {
            return (
              <ModulePill
                key={i}
                label={raw}
                scheme={scheme}
                onPress={() => onNavigate(mapped.path)}
              />
            );
          }
          return <Words key={i} text={raw} className={BOLD_CLASS} />;
        }
        return <Words key={i} text={p} className={BODY_CLASS} />;
      })}
    </View>
  );
}

export function FormatTurno({
  text,
  scheme,
  onNavigate,
}: {
  text: string;
  scheme: ColorSchemeName;
  onNavigate: (path: string) => void;
}) {
  const lines = text.split('\n');

  return (
    <View>
      {lines.map((line, i) =>
        line.trim().length === 0 ? (
          <View key={i} className="h-2" />
        ) : (
          <FormatLine key={i} line={line} scheme={scheme} onNavigate={onNavigate} />
        ),
      )}
    </View>
  );
}
