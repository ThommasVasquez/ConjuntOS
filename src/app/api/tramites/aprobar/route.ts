import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const usuarioDelegate = await db.usuario;
    const dbAdmin = await usuarioDelegate.findUnique({
      where: { id: session.user.id },
      select: { id: true, rol: true, conjuntoId: true, nombre: true }
    });

    if (!dbAdmin || !['ADMINISTRADOR', 'SUPER_ADMIN'].includes(dbAdmin.rol)) {
      return NextResponse.json({ success: false, error: "Permisos insuficientes" }, { status: 403 });
    }

    const { tramiteId, accion, observacionAdmin, parqueaderoId } = await request.json();

    if (!tramiteId || !['APROBAR', 'RECHAZAR'].includes(accion)) {
      return NextResponse.json({ success: false, error: "Datos de acción inválidos" }, { status: 400 });
    }

    const tramiteDelegate = await db.tramite;
    const tramite = await tramiteDelegate.findUnique({
      where: { id: tramiteId },
      include: { usuario: { select: { nombre: true } } }
    });

    if (!tramite) {
      return NextResponse.json({ success: false, error: "Trámite no encontrado" }, { status: 404 });
    }
    
    if (tramite.estado !== 'PENDIENTE') {
      return NextResponse.json({ success: false, error: `El trámite ya fue procesado: ${tramite.estado}` }, { status: 400 });
    }

    const nuevoEstado = accion === 'APROBAR' ? 'APROBADO' : 'RECHAZADO';
    let data;
    try {
      data = JSON.parse(tramite.descripcion);
    } catch {
      data = {};
    }

    // --- ACCIONES MÁGICAS ---
    if (accion === 'APROBAR') {
      if (tramite.tipo === 'VEHICULO') {
        const vehiculoDelegate = await db.vehiculo;
        await vehiculoDelegate.create({
          data: {
            usuarioId: tramite.usuarioId,
            placa: data.placa,
            marca: data.marca,
            modelo: data.modelo,
            color: data.color,
            tipo: data.tipo
          }
        });

        // Asignación de Parqueadero si viene el ID
        if (parqueaderoId) {
            const parqueaderoDelegate = await db.parqueadero;
            await parqueaderoDelegate.update({
                where: { id: parqueaderoId },
                data: {
                    usuarioId: tramite.usuarioId,
                    estado: 'OCUPADO'
                }
            });
        }
      } 
      else if (tramite.tipo === 'MASCOTA') {
        const mascotaDelegate = await db.mascota;
        await mascotaDelegate.create({
          data: {
            usuarioId: tramite.usuarioId,
            nombre: data.nombre,
            tipo: data.tipo,
            raza: data.raza
          }
        });
      }
      else if (tramite.tipo === 'MUDANZA') {
        // ... (existing mudanza logic)
        if (data.crearCuentas && data.nuevosInquilinos && data.nuevosInquilinos.length > 0) {
            for (const inq of data.nuevosInquilinos) {
                await usuarioDelegate.upsert({
                    where: { email: inq.email },
                    update: { 
                        conjuntoId: tramite.conjuntoId, 
                        rol: 'ARRENDATARIO',
                        nombre: inq.nombre,
                        telefono: inq.telefono
                    },
                    create: {
                        conjuntoId: tramite.conjuntoId,
                        email: inq.email,
                        nombre: inq.nombre,
                        telefono: inq.telefono,
                        rol: 'ARRENDATARIO',
                        password: 'Md5891129Ae$',
                        activo: true
                    }
                });
            }
        }
      }

      // CREAR NOTIFICACIÓN DE APROBACIÓN
      const notifDelegate = await db.notificacion;
      await notifDelegate.create({
          data: {
              usuarioId: tramite.usuarioId,
              tipo: 'APROBACION',
              titulo: `Trámite Aprobado: ${tramite.tipo}`,
              mensaje: `Tu solicitud de ${tramite.tipo.toLowerCase()} ha sido aprobada${parqueaderoId ? '. Se te ha asignado un espacio de parqueo.' : '.'}`
          }
      });
    } else {
        // NOTIFICACIÓN DE RECHAZO
        const notifDelegate = await db.notificacion;
        await notifDelegate.create({
            data: {
                usuarioId: tramite.usuarioId,
                tipo: 'SISTEMA',
                titulo: `Trámite Rechazado: ${tramite.tipo}`,
                mensaje: `Tu solicitud ha sido rechazada. Motivo: ${observacionAdmin || 'No especificado'}`
            }
        });
    }

    // Actualizar el estado del Trámite
    const tramiteResuelto = await tramiteDelegate.update({
      where: { id: tramiteId },
      data: {
        estado: nuevoEstado,
        aprobadoPorId: dbAdmin.id,
        observacionAdmin: observacionAdmin || null,
        fechaRespuesta: new Date()
      }
    });

    return NextResponse.json({ success: true, data: tramiteResuelto, autoAction: accion === 'APROBAR' });

  } catch (error: any) {
    console.error("Error resolviendo trámite:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
