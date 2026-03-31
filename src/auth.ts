import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import db from "@/lib/db";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { z } from "zod";

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          
          // Buscar usuario en la base de datos
          const user = await db.usuario.findUnique({ where: { email } });
          
          if (!user) return null;

          // Si el usuario tiene password (creado por registro), comparamos.
          // Si no tiene password (creado por sync inicial), permitimos entrar con 123456 por ahora.
          if (user.password && user.password !== password) return null;
          if (!user.password && password !== "123456") return null;

          return {
            id: user.id,
            name: user.nombre,
            email: user.email,
            image: user.avatar,
          };
        }

        return null;
      },
    }),
  ],
});
