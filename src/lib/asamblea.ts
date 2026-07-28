/**
 * Assembly session-state helpers, shared by the admin panel and the home cards.
 *
 * `asambleas.activa` means "this is the conjunto's current assembly" — the row
 * `GET /asambleas/activa/session` returns — not "the session is running".
 * The live phase lives in `sessionState`, which the backend seeds as
 * "PROGRAMADA" on creation and the admin panel flips to "INICIADA" /
 * "FINALIZADA".
 */

/**
 * `sessionState` is opaque jsonb: the admin panel writes plain strings, and
 * rows carried over by the data migration may hold an object instead. Read
 * whichever shape shows up.
 */
export function sessionEstado(state: unknown): string | null {
  if (typeof state === "string") return state;
  if (state && typeof state === "object" && "estado" in state) {
    const estado = (state as { estado?: unknown }).estado;
    return typeof estado === "string" ? estado : null;
  }
  return null;
}

/**
 * True once the admin has started the assembly. Anything that is not
 * explicitly scheduled counts as in session, so migrated rows with an
 * unrecognised state keep behaving as they did before.
 */
export function estaEnSesion(a: { activa: boolean; sessionState?: unknown }): boolean {
  return a.activa && sessionEstado(a.sessionState) !== "PROGRAMADA";
}

/**
 * When the moderator started the session, if recorded.
 *
 * `sessionState` is opaque jsonb, so starting a session writes an object
 * `{ estado: "INICIADA", iniciadaEn: <iso> }`. Older rows hold a bare string
 * and return null — callers fall back to the scheduled date.
 */
export function sessionIniciadaEn(state: unknown): string | null {
  if (state && typeof state === "object" && "iniciadaEn" in state) {
    const v = (state as { iniciadaEn?: unknown }).iniciadaEn;
    return typeof v === "string" ? v : null;
  }
  return null;
}
