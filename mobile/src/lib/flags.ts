/**
 * Feature flags (build-time, public).
 *
 * PAYMENTS_ENABLED gates the online-payment / paid-contract flows. They are
 * OFF by default because there is no real payment gateway wired yet (the UI
 * would otherwise mark charges PAID with no settlement). Set
 * EXPO_PUBLIC_PAYMENTS_ENABLED=true only once a real gateway is integrated.
 */
export const PAYMENTS_ENABLED =
  process.env.EXPO_PUBLIC_PAYMENTS_ENABLED === "true";

/** User-facing message shown when a payment flow is triggered while disabled. */
export const PAYMENTS_DISABLED_MSG =
  "Los pagos en línea estarán disponibles próximamente.";
