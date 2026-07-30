/**
 * ACCOUNT SWITCHER (testers only) — port of web `src/components/shell/RoleSwitcher.tsx`.
 *
 * Lets whitelisted tester accounts swap between the real demo accounts without
 * logging out. Each entry performs a full `login(email, DEMO_PASSWORD)` (a
 * different user id, session and data), so every role is a fully real profile.
 * Visible only when `user.isTester` is true.
 *
 * Notes vs web:
 * - Web reloads the window after the swap; on native the auth store update
 *   re-renders the role router and every screen refetches from its own mount
 *   effect, so no reload is needed.
 * - The dropdown renders INLINE (not absolutely positioned): an absolute panel
 *   inside the screen's ScrollView would be clipped by the scroll container.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { Check, ChevronDown, FlaskConical, Plus } from 'lucide-react-native';

import { toast } from '@/components/ui/toast';
import { withAlpha } from '@/components/visitas/colorAlpha';
import { useAuth } from '@/hooks/useAuth';
import { tokensFor, type ColorSchemeName } from '@/theme/tokens';

const DEMO_PASSWORD = '123456789';

const ACCOUNTS: { email: string; label: string; icon: string }[] = [
  { email: 'superadmin@demo.conjuntos.app', label: 'Super Admin', icon: '👑' },
  { email: 'admin@demo.conjuntos.app', label: 'Administrador', icon: '🏢' },
  { email: 'concejo@demo.conjuntos.app', label: 'Concejo', icon: '🏛️' },
  { email: 'residente@demo.conjuntos.app', label: 'Propietario', icon: '🏠' },
  { email: 'arrendatario@demo.conjuntos.app', label: 'Arrendatario', icon: '🔑' },
  { email: 'vigilante@demo.conjuntos.app', label: 'Vigilante', icon: '🛡️' },
  { email: 'supervisor@demo.conjuntos.app', label: 'Supervisor Vigilancia', icon: '📋' },
  { email: 'parqueadero@demo.conjuntos.app', label: 'Encargado Parqueadero', icon: '🅿️' },
  { email: 'huesped@demo.conjuntos.app', label: 'Huésped', icon: '👤' },
  { email: 'piscina@demo.conjuntos.app', label: 'Admin. Piscina', icon: '🏊' },
  { email: 'gym@demo.conjuntos.app', label: 'Admin. Gym', icon: '💪' },
  { email: 'mantenimiento@demo.conjuntos.app', label: 'Mantenimiento', icon: '🔧' },
  { email: 'limpieza@demo.conjuntos.app', label: 'Limpieza', icon: '🧹' },
];

export function RoleSwitcher() {
  const user = useAuth((s) => s.user);
  const login = useAuth((s) => s.login);
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const scheme: ColorSchemeName = colorScheme === 'light' ? 'light' : 'dark';
  const t = tokensFor(scheme);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Only testers see this control.
  if (!user) return null;
  if (!user.isTester) return null;

  const currentAccount = ACCOUNTS.find((a) => a.email === user.email);
  const currentLabel = currentAccount?.label ?? user.rol;

  const handleSelect = async (email: string) => {
    if (email === user.email) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await login(email, DEMO_PASSWORD);
      toast.success(`Cambiado a ${ACCOUNTS.find((a) => a.email === email)?.label ?? email}`);
      setOpen(false);
    } catch {
      toast.error('No se pudo cambiar de cuenta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ zIndex: 60 }}>
      <Pressable
        disabled={busy}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: t.primaryLight,
          borderWidth: 1,
          borderColor: t.border,
          opacity: busy ? 0.6 : pressed ? 0.9 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              // Web: `bg-blue-500/15 border-blue-500/20 text-blue-500` → info token.
              backgroundColor: withAlpha(t.info, 0.15),
              borderWidth: 1,
              borderColor: withAlpha(t.info, 0.2),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FlaskConical size={18} color={t.info} />
          </View>
          <View>
            <Text
              style={{
                color: t.textMuted,
                fontSize: 9,
                fontWeight: '900',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              Modo Tester · Cuenta activa
            </Text>
            <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{currentLabel}</Text>
          </View>
        </View>
        <ChevronDown
          size={18}
          color={t.info}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>

      {open ? (
        <View
          style={{
            marginTop: 8,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.primaryLight,
            overflow: 'hidden',
          }}
        >
          {ACCOUNTS.map((a) => {
            const active = a.email === user.email;
            return (
              <Pressable
                key={a.email}
                disabled={busy}
                onPress={() => handleSelect(a.email)}
                style={({ pressed }) => ({
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottomWidth: 1,
                  borderBottomColor: t.border,
                  opacity: busy ? 0.5 : pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16 }}>{a.icon}</Text>
                  <View>
                    <Text
                      style={{ color: t.text, fontSize: 14, fontWeight: active ? '700' : '400' }}
                    >
                      {a.label}
                    </Text>
                    <Text style={{ color: t.textMuted, fontSize: 10 }}>{a.email}</Text>
                  </View>
                </View>
                {active ? <Check size={16} color={t.text} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            disabled={busy}
            onPress={() => {
              setOpen(false);
              router.push('/login');
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              opacity: busy ? 0.5 : pressed ? 0.8 : 1,
            })}
          >
            <Plus size={16} color={t.info} />
            <Text style={{ color: t.info, fontSize: 14, fontWeight: '600' }}>Añadir cuenta</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default RoleSwitcher;
