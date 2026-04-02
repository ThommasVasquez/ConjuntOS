import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export const runtime = "edge";

/**
 * Endpoint de fallback para el inicio de sesión en Cloudflare Pages.
 * Las API Routes en /api/* son tratadas como Functions nativas, 
 * evitando el error 405 Method Not Allowed que a veces ocurre con Server Actions.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email y contraseña son requeridos" }, { status: 400 });
    }

    // Llamamos al signIn de Auth.js (servidor)
    // redirect: false es vital para capturar el resultado sin que lance un error de redirección
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    // Si llegamos aquí sin que se lance un error, la sesión se ha creado (Cookies seteadas)
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return NextResponse.json({ ok: false, error: "Email o contraseña incorrectos" }, { status: 401 });
        default:
          return NextResponse.json({ ok: false, error: "Error de autenticación: " + error.message }, { status: 500 });
      }
    }

    console.error("🔥 Error crítico en /api/auth/login:", error);
    return NextResponse.json({ ok: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
