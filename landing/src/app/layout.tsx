import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono, Montserrat, Tinos, Pinyon_Script } from "next/font/google";
import { LandingProviders } from "@/components/LandingProviders";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const plusJakartaSans = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"] });
const tinos = Tinos({ variable: "--font-serif", weight: ["400", "700"], style: ["normal", "italic"], subsets: ["latin"] });
const pinyonScript = Pinyon_Script({ variable: "--font-script", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ConjuntOS - Gestión Residencial Inteligente",
  description: "Plataforma de gestión residencial que transforma lo cotidiano en algo extraordinario. Inteligencia, comunidad y tecnología.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`light ${inter.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable} ${montserrat.variable} ${tinos.variable} ${pinyonScript.variable}`}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/solo-light.svg" media="(prefers-color-scheme: light)" />
        <link rel="icon" type="image/svg+xml" href="/solo-dark.svg" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" href="/solo-light.svg" />
      </head>
      <body className="antialiased selection:bg-primary/20 min-h-dvh">
        <LandingProviders>
          {children}
        </LandingProviders>
      </body>
    </html>
  );
}
