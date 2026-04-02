import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

/**
 * Endpoint de fallback para el inicio de sesión en Cloudflare Pages.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Detección e inyección de DATABASE_URL desde el contexto de Cloudflare
    // Esto es crucial para que Prisma encuentre la URL en el worker de Auth.js
    try {
      const ctx = getRequestContext();
      const envUrl = ctx?.env?.DATABASE_URL as string | undefined;
      if (envUrl) {
        (globalThis as { DATABASE_URL?: string }).DATABASE_URL = envUrl;
        process.env.DATABASE_URL = envUrl;
      }
    } catch {
      console.warn("⚠️ No se pudo acceder al context de Cloudflare en /api/auth/login");
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email y contraseña son requeridos" }, { status: 400 });
    }

    // Llamamos al signIn de Auth.js (servidor)
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return NextResponse.json({ ok: false, error: "Email o contraseña incorrectos" }, { status: 401 });
        default:
          return NextResponse.json({ ok: false, error: "Error de autenticación: " + error.type }, { status: 500 });
      }
    }

    console.error("🔥 Error crítico en /api/auth/login:", error);
    return NextResponse.json({ ok: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
