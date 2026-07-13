"use client";

import { useEffect, useState } from "react";

const KEY = "enconjunto_cookie_consent";

/**
 * Minimal cookie-consent banner. Persists the choice in localStorage so it only
 * shows once. No third-party library — just a stored "accepted"/"rejected" flag.
 */
export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* localStorage unavailable (private mode) — skip the banner */
    }
  }, []);

  function decide(value: "accepted" | "rejected") {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] p-4 sm:p-6"
    >
      <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:p-6">
        <p className="flex-1 text-sm leading-relaxed text-text-muted">
          Usamos cookies propias y de terceros para el funcionamiento, la seguridad y la mejora de la
          plataforma. Consulta nuestra{" "}
          <a href="/privacidad" className="underline transition-colors hover:text-text">
            Política de Privacidad
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide("rejected")}
            className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-2"
          >
            Rechazar
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-on-accent transition-opacity hover:opacity-90"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
