"use server";

import db from "@/lib/db";
import { TipoAnuncio, Prisma } from "@prisma/client";

/**
 * Obtiene los anuncios de un conjunto específico.
 * Soporta filtros por tipo y asegura que no se muestren anuncios vencidos.
 */
export async function getAnuncios(conjuntoId: string, tipo?: TipoAnuncio) {
  try {
    const whereClause: Prisma.AnuncioWhereInput = {
      conjuntoId: conjuntoId,
    };

    if (tipo) {
      whereClause.tipo = tipo;
    }

    // Nota: Aunque el schema actual no tiene explicitamente 'activo',
    // podemos filtrar por fecha de expiración si existe.
    const now = new Date();
    whereClause.OR = [
      { expiresEn: null },
      { expiresEn: { gte: now } }
    ];
    
    const anuncios = await db.anuncio.findMany({
      where: whereClause,
      orderBy: [
        { fijado: 'desc' },
        { publicadoEn: 'desc' }
      ]
    });

    return { success: true, data: anuncios };
  } catch (error) {
    console.error("❌ Error al obtener anuncios:", error);
    return { success: false, error: "No se pudieron cargar los anuncios de la cartelera." };
  }
}

/**
 * Crea un anuncio de prueba si la base de datos está vacía (Solo para Thommy/Admin).
 */
export async function seedInitialAnuncios(conjuntoId: string) {
  try {
    const count = await db.anuncio.count({ where: { conjuntoId } });
    if (count > 0) return { success: true, message: "Ya existen anuncios." };

    await db.anuncio.create({
      data: {
        conjuntoId,
        titulo: "¡Bienvenidos a la Nueva Cartelera!",
        contenido: "Esta es la primera publicación oficial en tiempo real desde la base de datos de ConjuntoApp. Aquí encontrarás noticias, mantenimientos y eventos importantes.",
        tipo: 'GENERAL',
        archivosUrl: "",
        fijado: true
      }
    });

    return { success: true, message: "Anuncio de bienvenida creado." };
  } catch (error) {
    console.error("❌ Error al crear anuncio semilla:", error);
    return { success: false, error: "Error al inicializar la cartelera." };
  }
}
