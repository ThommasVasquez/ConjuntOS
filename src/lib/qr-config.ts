/**
 * Destino actual del QR Dinámico del banner físico (`https://conjuntos.app/qr`).
 *
 * Para reprogramar hacia dónde dirige el QR impreso en portería:
 * 1. Actualiza `QR_BANNER_TARGET_URL` aquí y en `landing/public/_redirects` / `landing/src/app/qr/page.tsx`.
 * 2. Ejemplos de destino:
 *    - Capacitación Google Meet: "https://meet.google.com/xxx-xxxx-xxx"
 *    - Instalación PWA / App:    "https://app.conjuntos.app"
 *    - Página principal:         "https://conjuntos.app"
 */
export const QR_BANNER_TARGET_URL = "https://conjuntos.app";
