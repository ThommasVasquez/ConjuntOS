/**
 * HomeOperativo — dashboard real de mantenimiento y limpieza.
 *
 * Port of web `src/app/(app)/inicio/page.tsx:1127-1348` (the branch web renders
 * for MANTENIMIENTO_LOCATIVO / OPERARIO_LIMPIEZA at page.tsx:1382).
 *
 * Notes vs web:
 * - `<textarea>` → RN `TextInput multiline`; the bottom-sheet modal is an RN
 *   `Modal` with a tap-to-dismiss scrim (same shape web builds with fixed
 *   inset-0 + bg-black/60).
 * - Dates are formatted locally instead of `toLocaleDateString('es-CO')` so the
 *   output does not depend on the Hermes ICU build.
 */

import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react-native';

import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { RoleSwitcher } from '@/components/shell/RoleSwitcher';
import { toast } from '@/components/ui/toast';
import { withAlpha } from '@/components/visitas/colorAlpha';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api/client';
import { onSemantic, tokensFor, type ColorSchemeName } from '@/theme/tokens';

interface TicketTransicion {
  id: string;
  estadoAnterior: string;
  estadoNuevo: string;
  createdAt: string;
}

interface TicketAsignado {
  id: string;
  prioridad?: string;
  categoria?: string;
  estado: string;
  descripcion?: string;
  slaVencimiento?: string | null;
  transiciones?: TicketTransicion[];
}

/** `toLocaleDateString('es-CO')` → d/m/aaaa, without depending on ICU. */
function fechaCO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** `toLocaleString('es-CO')` → d/m/aaaa, hh:mm. */
function fechaHoraCO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${fechaCO(iso)}, ${hh}:${mm}`;
}

export function HomeOperativo() {
  const user = useAuth((s) => s.user);
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme: ColorSchemeName = colorScheme === 'light' ? 'light' : 'dark';
  const t = tokensFor(scheme);

  const [tickets, setTickets] = useState<TicketAsignado[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<TicketAsignado | null>(null);
  const [notas, setNotas] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isMantenimiento = user?.rol === 'MANTENIMIENTO_LOCATIVO';
  const roleLabel = isMantenimiento ? '🔧 Mantenimiento Locativo' : '🧹 Operario de Limpieza';

  const fetchTickets = useCallback(async () => {
    try {
      const data = await api.get<TicketAsignado[]>('/solicitudes/mis-asignadas');
      setTickets(data || []);
    } catch {
      /* sin permiso / sin datos */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  const handleAction = async (ticketId: string, estado: string, notasOpt?: string) => {
    setActionLoading(ticketId);
    try {
      await api.put(`/solicitudes/${ticketId}/estado`, {
        estado,
        notas: notasOpt || undefined,
      });
      toast.success(
        estado === 'EN_PROGRESO'
          ? 'Ticket aceptado. Ya puedes trabajar en él.'
          : 'Ticket completado exitosamente.',
      );
      setSelectedTicket(null);
      setNotas('');
      void fetchTickets();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : '') || 'Error al actualizar ticket');
    } finally {
      setActionLoading(null);
    }
  };

  // Tickets activos
  const activos = tickets.filter((x) => x.estado === 'ASIGNADA' || x.estado === 'EN_PROGRESO');

  if (loading) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: 128,
          paddingHorizontal: 24,
          gap: 24,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', gap: 24 }}>
          <ProfileHeader />
          <RoleSwitcher />
        </View>
        <Clock size={32} color={t.accent} />
        <Text style={{ color: t.textMuted, fontSize: 14 }}>Cargando tickets asignados...</Text>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: 128,
          paddingHorizontal: 16,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeader />
        <RoleSwitcher />

        {/* Header */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>{roleLabel}</Text>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>
              {activos.length} ticket{activos.length !== 1 ? 's' : ''} pendiente
              {activos.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => void fetchTickets()}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: t.surface2,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: t.textMuted, fontSize: 12 }}>Actualizar</Text>
          </Pressable>
        </View>

        {/* Tickets list */}
        {activos.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 48 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: withAlpha(t.accent, 0.1),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle size={32} color={t.accent} />
            </View>
            <Text style={{ color: t.text, fontSize: 14, fontWeight: '500' }}>
              Sin tickets pendientes
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 12, textAlign: 'center', maxWidth: 280 }}>
              No tienes tickets de mantenimiento asignados. Cuando un administrador te asigne uno,
              aparecerá aquí.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {activos.map((ticket) => {
              const urgente = ticket.prioridad === 'URGENTE';
              const alta = ticket.prioridad === 'ALTA';
              const enProgreso = ticket.estado === 'EN_PROGRESO';
              return (
                <View
                  key={ticket.id}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: t.border,
                    backgroundColor: t.surface,
                    padding: 16,
                    gap: 12,
                  }}
                >
                  {/* Priority badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: urgente
                          ? withAlpha(t.danger, 0.2)
                          : alta
                            ? withAlpha(t.warning, 0.2)
                            : withAlpha(t.text, 0.1),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          color: urgente ? t.danger : alta ? t.warning : t.textMuted,
                        }}
                      >
                        {ticket.prioridad}
                      </Text>
                    </View>
                    <Text
                      style={{ color: t.textMuted, fontSize: 10, textTransform: 'uppercase' }}
                      numberOfLines={1}
                    >
                      {ticket.categoria}
                    </Text>
                    <View
                      style={{
                        marginLeft: 'auto',
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: enProgreso
                          ? withAlpha(t.info, 0.2)
                          : withAlpha(t.warning, 0.2),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          color: enProgreso ? t.info : t.warning,
                        }}
                      >
                        {enProgreso ? 'En progreso' : 'Asignada'}
                      </Text>
                    </View>
                  </View>

                  {/* Description */}
                  <Text style={{ color: t.text, fontSize: 14, lineHeight: 20 }}>
                    {ticket.descripcion}
                  </Text>

                  {/* SLA */}
                  {ticket.slaVencimiento ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={10} color={t.textMuted} />
                      <Text style={{ color: t.textMuted, fontSize: 10 }}>
                        Vence: {fechaCO(ticket.slaVencimiento)}
                      </Text>
                    </View>
                  ) : null}

                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
                    {ticket.estado === 'ASIGNADA' ? (
                      <Pressable
                        onPress={() => void handleAction(ticket.id, 'EN_PROGRESO')}
                        disabled={actionLoading === ticket.id}
                        style={({ pressed }) => ({
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 12,
                          alignItems: 'center',
                          backgroundColor: t.accent,
                          opacity: actionLoading === ticket.id ? 0.5 : pressed ? 0.85 : 1,
                        })}
                      >
                        <Text style={{ color: t.onAccent, fontSize: 12, fontWeight: '700' }}>
                          {actionLoading === ticket.id ? 'Aceptando...' : '✅ Aceptar y empezar'}
                        </Text>
                      </Pressable>
                    ) : null}
                    {enProgreso ? (
                      <Pressable
                        onPress={() => setSelectedTicket(ticket)}
                        style={({ pressed }) => ({
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 12,
                          alignItems: 'center',
                          backgroundColor: withAlpha(t.success, 0.2),
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Text style={{ color: t.success, fontSize: 12, fontWeight: '700' }}>
                          ✅ Marcar como completado
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => setSelectedTicket(ticket)}
                      style={({ pressed }) => ({
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 12,
                        backgroundColor: t.surface2,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ color: t.textMuted, fontSize: 12 }}>Ver detalle</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal: completar ticket */}
      <Modal
        visible={selectedTicket !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSelectedTicket(null);
          setNotas('');
        }}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: withAlpha(t.primary, 0.6),
            }}
            onPress={() => {
              setSelectedTicket(null);
              setNotas('');
            }}
          />
          {selectedTicket ? (
            <View
              style={{
                backgroundColor: t.primary,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                borderWidth: 1,
                borderColor: t.border,
                maxHeight: '80%',
                overflow: 'hidden',
              }}
            >
              <ScrollView
                contentContainerStyle={{ padding: 24, gap: 16 }}
                showsVerticalScrollIndicator={false}
              >
                <View
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    alignSelf: 'center',
                    backgroundColor: withAlpha(t.text, 0.2),
                  }}
                />

                <View>
                  <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>
                    {selectedTicket.estado === 'EN_PROGRESO' ? 'Completar ticket' : 'Ticket'}
                  </Text>
                  <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 4 }}>
                    {selectedTicket.categoria} · {selectedTicket.prioridad}
                  </Text>
                </View>

                <Text
                  style={{
                    color: t.text,
                    fontSize: 14,
                    backgroundColor: t.surface2,
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  {selectedTicket.descripcion}
                </Text>

                {selectedTicket.estado === 'EN_PROGRESO' ? (
                  <>
                    <View style={{ gap: 6 }}>
                      <Text
                        style={{
                          color: t.textMuted,
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'uppercase',
                        }}
                      >
                        Notas de resolución
                      </Text>
                      <TextInput
                        value={notas}
                        onChangeText={setNotas}
                        placeholder="Describe brevemente qué hiciste..."
                        placeholderTextColor={withAlpha(t.text, 0.3)}
                        multiline
                        numberOfLines={3}
                        style={{
                          backgroundColor: t.surface2,
                          borderWidth: 1,
                          borderColor: t.border,
                          borderRadius: 12,
                          padding: 12,
                          fontSize: 14,
                          color: t.text,
                          minHeight: 80,
                          textAlignVertical: 'top',
                        }}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => {
                          setSelectedTicket(null);
                          setNotas('');
                        }}
                        style={({ pressed }) => ({
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 12,
                          alignItems: 'center',
                          backgroundColor: t.surface2,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700' }}>
                          Cancelar
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleAction(selectedTicket.id, 'RESUELTA', notas)}
                        disabled={actionLoading === selectedTicket.id}
                        style={({ pressed }) => ({
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 12,
                          alignItems: 'center',
                          backgroundColor: t.success,
                          opacity: actionLoading === selectedTicket.id ? 0.5 : pressed ? 0.85 : 1,
                        })}
                      >
                        <Text
                          style={{ color: onSemantic(scheme), fontSize: 12, fontWeight: '700' }}
                        >
                          {actionLoading === selectedTicket.id
                            ? 'Completando...'
                            : '✅ Marcar completado'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}

                {/* Transitions timeline */}
                {selectedTicket.transiciones && selectedTicket.transiciones.length > 0 ? (
                  <View
                    style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border }}
                  >
                    <Text
                      style={{
                        color: t.textMuted,
                        fontSize: 10,
                        fontWeight: '700',
                        textTransform: 'uppercase',
                      }}
                    >
                      Historial
                    </Text>
                    {selectedTicket.transiciones.map((tr) => (
                      <View
                        key={tr.id}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                      >
                        <Clock size={10} color={t.textMuted} />
                        <Text style={{ color: t.textMuted, fontSize: 12 }}>
                          {tr.estadoAnterior} → {tr.estadoNuevo}
                        </Text>
                        <Text style={{ color: withAlpha(t.text, 0.3), fontSize: 12 }}>·</Text>
                        <Text style={{ color: t.textMuted, fontSize: 12 }}>
                          {fechaHoraCO(tr.createdAt)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

export default HomeOperativo;
