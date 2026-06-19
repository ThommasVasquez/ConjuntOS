import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import "./view-transitions.css";

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

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ConjuntOS - Tu comunidad sincronizada",
  description: "Plataforma de gestión residencial inteligente para copropiedades modernas.",
  // icons se manejan manualmente en el <head> con <link media>
  // para que el favicon cambie automáticamente con modo oscuro/claro
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
  themeColor: "#000000",
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
    <html lang="es" className={`${inter.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable} ${montserrat.variable}`}>
      <head>
        {/* Favicon con detección automática de modo oscuro/claro */}
        <link rel="icon" type="image/svg+xml" href="/solo-light.svg" media="(prefers-color-scheme: light)" />
        <link rel="icon" type="image/svg+xml" href="/solo-dark.svg"  media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" href="/solo-light.svg" />
      </head>
      <body className="antialiased selection:bg-primary/20 min-h-screen">
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
