"use client";

/**
 * Global error boundary. Catches errors thrown in the root layout / Providers
 * that the route-segment error.tsx cannot — without this, such an error renders
 * a blank white screen. It replaces the root layout when active, so it must ship
 * its own <html>/<body> and cannot rely on globals.css (hence inline styles).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 12px" }}>
            Algo salió mal
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.7, margin: "0 0 24px" }}>
            Ocurrió un error inesperado. Puedes reintentar; si el problema
            persiste, vuelve a iniciar sesión.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => reset()}
              style={{
                padding: "12px 24px",
                borderRadius: 16,
                border: "none",
                background: "#fafafa",
                color: "#0a0a0a",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <button
              onClick={() => {
                window.location.href = "/inicio";
              }}
              style={{
                padding: "12px 24px",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "transparent",
                color: "#fafafa",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Ir al inicio
            </button>
          </div>
          {error?.digest && (
            <p style={{ fontSize: 11, opacity: 0.4, marginTop: 20 }}>
              Ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
