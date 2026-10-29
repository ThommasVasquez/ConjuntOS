"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * PwaAutoRedirect
 * If the application is opened in standalone mode (installed PWA on iOS Home Screen
 * or Android/Desktop), instantly redirects to the app home (`/inicio`), which will
 * either show the resident dashboard or redirect to `/login` if not authenticated.
 */
export default function PwaAutoRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      router.replace("/inicio");
    }
  }, [router]);

  return null;
}
