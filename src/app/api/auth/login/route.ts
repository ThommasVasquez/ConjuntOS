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
    let envUrl = "";
    try {
      const ctx = getRequestContext();
      envUrl = (ctx?.env as { DATABASE_URL?: string })?.DATABASE_URL || "";
      if (envUrl) {
        (globalThis as { DATABASE_URL?: string }).DATABASE_URL = envUrl;
        process.env.DATABASE_URL = envUrl;
      }
    } catch {
      console.warn("⚠️ No se pudo acceder al context de Cloudflare en /api/auth/login");
    }

    if (!envUrl) {
      envUrl = (process.env.DATABASE_URL || "").trim();
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
      dbUrl: envUrl, // Pasamos la URL directamente para evitar aislamiento de hilos
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
