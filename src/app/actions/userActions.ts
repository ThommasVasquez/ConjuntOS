"use server";

import db from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getUserProfile(userId: string = "current-user") {
  try {
    let user = await (await db.usuario).findUnique({
      where: { id: userId },
      include: {
        unidad: true
      }
    });

    if (!user) {
      // Intentar buscar por el email fallback
      user = await (await db.usuario).findFirst({
        where: { email: "thommy@example.com" },
        include: { unidad: true }
      });
    }

    // Si sigue sin existir, creamos uno base
    if (!user) {
      let conjunto = await (await db.conjunto).findFirst();
      if (!conjunto) {
        conjunto = await (await db.conjunto).create({
          data: {
            nombre: "Conjunto Residencial",
            subdominio: "demo",
            direccion: "Calle Falsa 123",
            ciudad: "Bogotá"
          }
        });
      }

      user = await (await db.usuario).create({
        data: {
          id: userId,
          nombre: "ThommyEnergy",
          email: "thommy@example.com",
          rol: "PROPIETARIO",
          conjuntoId: conjunto.id,
          genero: "femenino"
        },
        include: {
          unidad: true
        }
      });
    }

    return { success: true, data: user as any };
  } catch (error) {
    console.error("Error fetching user:", error);
    return { success: false, error: "No se pudo cargar el perfil" };
  }
}

export async function updateUserProfile(userId: string, data: {
  name: string;
  phone: string;
  gender: string;
  avatar?: string;
}) {
  try {
    const updated = await (await db.usuario).update({
      where: { id: userId },
      data: {
        nombre: data.name,
        telefono: data.phone,
        genero: data.gender,
        avatar: data.avatar
      }
    });

    revalidatePath("/perfil");
    revalidatePath("/inicio");
    
    return { success: true, data: updated as any };
  } catch (error) {
    console.error("Error updating user:", error);
    return { success: false, error: "Error al guardar los cambios" };
  }
}
