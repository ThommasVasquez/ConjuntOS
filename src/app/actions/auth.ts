"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

/**
 * Server Action para manejar el inicio de sesión.
 * Esto asegura que NextAuth se ejecute íntegramente en el servidor,
 * evitando problemas de Cookies/CSRF en el Edge de Cloudflare.
 */
export async function loginAction(formData: { email: string; password: string }) {
  try {
    // Intentamos iniciar sesión con el proveedor de credenciales
    // redirect: false permite manejar la respuesta en el cliente
    await signIn("credentials", {
      email: formData.email,
      password: formData.password,
      redirect: false,
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { ok: false, error: "Credenciales inválidas. Verifica tu email y contraseña." };
        default:
          return { ok: false, error: "Algo salió mal: " + error.message };
      }
    }

    // Errores inesperados
    console.error("🔥 Error en loginAction:", error);
    return { ok: false, error: "Error interno del servidor al autenticar." };
  }
}
