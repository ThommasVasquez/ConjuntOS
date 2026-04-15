import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ConjuntOS - Tu comunidad sincronizada",
  description: "Plataforma de gestión residencial inteligente para copropiedades modernas.",
  // manifest: "/manifest.webmanifest", // Temporalmente desactivado hasta que configuremos PWA
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ConjuntOS",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1E3A5F",
};

import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";
import SplashScreen from "@/components/shell/SplashScreen";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased selection:bg-primary/20 bg-[#E2E8F0] min-h-screen">
        <Providers>
          <SplashScreen />
          {children}
          <Toaster 
            position="top-center" 
            theme="dark"
            toastOptions={{
              unstyled: true,
              classNames: {
                toast: "liquid-glass-toast",
                success: "toast-success",
                error: "toast-error",
              }
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
