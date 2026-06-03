import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * API: TRAMITES POST (Registro de Activos)
 * Permite a los residentes crear una solicitud de vinculación (Mascota/Vehículo)
 * con documentación adjunta en Base64.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await req.json();
    
    const { tipo, data, documentos } = body;

    if (!tipo || !data) {
        return NextResponse.json({ success: false, error: "Datos incompletos" }, { status: 400 });
    }

    // 🏗️ Buscar conjuntoId y nombre del usuario
    const user = await db.usuario.findUnique({
        where: { id: userId },
        select: { conjuntoId: true, nombre: true }
    });

    if (!user) {
        return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    // 🧱 Preparar el JSON para descripción
    const payload = {
        metadatos: data,
        documentos: documentos || [] // Array de { nombre: string, base64: string, tipo: 'pdf' | 'image' }
    };

    // 📝 Crear Trámite
    const nuevoTramite = await db.tramite.create({
        data: {
            conjuntoId: user.conjuntoId,
            usuarioId: userId,
            tipo: tipo, // "VEHICULO" | "MASCOTA"
            descripcion: JSON.stringify(payload),
            estado: "PENDIENTE"
        }
    });

    // 🔔 Crear Notificaciones Reales para Administradores de la Copropiedad
    try {
      const admins = await db.usuario.findMany({
        where: {
          conjuntoId: user.conjuntoId,
          rol: { in: ['ADMINISTRADOR', 'SUPER_ADMIN'] }
        },
        select: { id: true }
      });

      const typeLabel = tipo === 'MASCOTA' ? 'Mascota' : tipo === 'VEHICULO' ? 'Vehículo' : tipo === 'MUDANZA' ? 'Mudanza' : 'Trámite';
      const senderName = user.nombre || "Un residente";

      if (admins.length > 0) {
        await Promise.all(
          admins.map(admin => 
            db.notificacion.create({
              data: {
                usuarioId: admin.id,
                tipo: 'INFO',
                titulo: `Nueva solicitud: ${typeLabel}`,
                mensaje: `${senderName} ha enviado una solicitud de ${typeLabel.toLowerCase()} para revisión.`
              }
            })
          )
        );
      }
    } catch (notifErr: any) {
      console.warn("⚠️ Error al notificar a administradores sobre trámite:", notifErr.message);
    }

    return NextResponse.json({ 
        success: true, 
        message: "Solicitud enviada con éxito. Sujeta a aprobación.",
        id: nuevoTramite.id 
    });

  } catch (err: any) {
    console.error("❌ [API-TRAMITE-POST]:", err.message);
    return NextResponse.json({ success: false, error: "Error al procesar la solicitud" }, { status: 500 });
  }
}
