"use client";

import { useEffect } from "react";
import { QR_BANNER_TARGET_URL } from "@/lib/qr-config";

export default function QrRedirectPage() {
  useEffect(() => {
    window.location.replace(QR_BANNER_TARGET_URL);
  }, []);

  return (
    <div className="min-h-screen bg-[#08090d] text-white flex flex-col items-center justify-center p-6 text-center">
      <meta httpEquiv="refresh" content={`0;url=${QR_BANNER_TARGET_URL}`} />
      <p className="text-sm text-white/60">Redirigiendo a ConjuntOS®...</p>
    </div>
  );
}
