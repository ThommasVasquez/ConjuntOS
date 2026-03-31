import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Configuración del middleware para proteger rutas específicas
  // Exceptuamos archivos estáticos y la ruta de login
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|$).*)"],
};
