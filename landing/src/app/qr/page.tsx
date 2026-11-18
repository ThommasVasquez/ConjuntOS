"use client";

import { useEffect } from "react";

/**
 * Destino actual del QR Dinámico del banner físico (`https://conjuntos.app/qr`).
 * Para reprogramar (ej. a un enlace de Google Meet o a https://app.conjuntos.app),
 * actualiza esta constante y `landing/public/_redirects`.
 */
const QR_BANNER_TARGET_URL = "https://conjuntos.app";

export default function QrRedirectPage() {
  useEffect(() => {
    window.location.replace(QR_BANNER_TARGET_URL);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#08090d",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <meta httpEquiv="refresh" content={`0;url=${QR_BANNER_TARGET_URL}`} />
      <p style={{ opacity: 0.7, fontSize: "14px" }}>Redirigiendo a ConjuntOS®...</p>
    </div>
  );
}
