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
  title: "ConjuntoApp",
  description: "Plataforma de gestión de conjuntos residenciales",
  // manifest: "/manifest.webmanifest", // Temporalmente desactivado hasta que configuremos PWA
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ConjuntoApp",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased selection:bg-primary/20 bg-[#E2E8F0] min-h-screen">
        <Providers>
          {children}
          <Toaster 
            position="top-center" 
            theme="dark" 
            toastOptions={{
              className: "liquid-glass rounded-2xl p-4 flex gap-3 items-center min-w-[300px]",
              style: {
                borderRadius: '1.25rem',
              },
              classNames: {
                toast: "liquid-glass backdrop-blur-2xl border-white/10",
                success: "bg-green-500/15 border-green-500/30 text-green-400!",
                error: "bg-red-500/15 border-red-500/30 text-red-400!",
                info: "bg-blue-500/15 border-blue-500/30 text-blue-400!",
                warning: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400!",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
