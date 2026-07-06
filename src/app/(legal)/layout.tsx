import Link from "next/link";
import type { ReactNode } from "react";

/** Shared shell for the public legal pages (/privacidad, /proteccion-datos). */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-primary text-text">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="font-bold tracking-tight">
            EN-CONJUNTO
          </Link>
          <Link
            href="/"
            className="text-sm text-text-muted transition-colors hover:text-text"
          >
            ← Volver al inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 md:py-16">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-col justify-between gap-2 px-6 py-8 text-xs text-text-muted sm:flex-row">
          <span>© 2026 ENERGYSOFTmedia — EN-CONJUNTO</span>
          <span className="flex gap-4">
            <Link href="/privacidad" className="transition-colors hover:text-text">
              Política de Privacidad
            </Link>
            <Link href="/proteccion-datos" className="transition-colors hover:text-text">
              Protección de Datos
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
