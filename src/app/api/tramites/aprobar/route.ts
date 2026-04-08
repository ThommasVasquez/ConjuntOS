import { safeJsonStringify } from "@/lib/safe-json";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * PROCESAMIENTO DE TRÁMITES (APROBAR/RECHAZAR)
 * Versión estabilizada para Cloudflare Edge.
 */
export async function PUT(request: Request) {
  const t0 = Date.now();
  let step = "BOOT";
  const APP_VERSION = "1.2.0-STABLE";
  
  const createRes = (data: any, status: number = 200, currentStep: string = "COMPLETED") => {
    return new Response(safeJsonStringify({ ...data, version: APP_VERSION, step: currentStep }), {
      status,
      headers: { 
          "Content-Type": "application/json",
          "X-App-Version": APP_VERSION,
          "X-Execution-Step": currentStep,
          "X-Response-Time": `${Date.now() - t0}ms`
      }
    });
  };

  try {
    // 1. Carga de módulos bajo demanda (Optimización para Edge)
    step = "IMPORT_MODULES";
    const { auth } = await import("@/auth");
    const db = (await import("@/lib/db")).default;

    step = "READ_BODY";
    const rawText = await request.text();
    if (!rawText || rawText.trim() === "") {
        return createRes({ success: false, error: "Cuerpo de solicitud vacío" }, 400, step);
    }

    step = "PARSE_JSON";
    let body: any;
    try {
        body = JSON.parse(rawText);
    } catch (e: any) {
        return createRes({ success: false, error: "JSON malformado", msg: e.message }, 400, step);
    }

    // Bypass de diagnóstico (mantenido para salud del sistema)
    if (body.test_only) {
        return createRes({ success: true, msg: "API is healthy" }, 200, "HEALTH_CHECK");
    }
    
    const { tramiteId, accion, observacionAdmin, parqueaderoId } = body;
    
    if (!tramiteId || !accion) {
      return createRes({ success: false, error: "ID de trámite y acción son obligatorios" }, 400, step);
    }

    // 2. Seguridad y Sesión
    step = "AUTH_VALIDATION";
    const session = await auth();
    if (!session?.user?.id) {
      return createRes({ success: false, error: "Sesión no válida o expirada" }, 401, step);
    }

    // 3. Verificación de permisos Administrativos
    step = "ROLE_CHECK";
    const userId = (session.user as any)?.id;
    const userRole = (session.user as any)?.role;

    const allowedRoles = ['ADMINISTRADOR', 'SUPER_ADMIN', 'CONCEJO'];
    if (!allowedRoles.includes(userRole)) {
      const dbUser = await db.usuario.findUnique({
        where: { id: userId },
        select: { rol: true }
      });
      if (!dbUser || !allowedRoles.includes(dbUser.rol)) {
        return createRes({ success: false, error: "No tienes permisos para realizar esta acción" }, 403, step);
      }
    }

    // 4. Recuperación del Trámite
    step = "FETCH_TRAMITE";
    const tramite = await db.tramite.findUnique({
      where: { id: tramiteId }
    });

    if (!tramite) return createRes({ success: false, error: "El trámite solicitado no existe" }, 404, step);
    if (tramite.estado !== 'PENDIENTE') return createRes({ success: false, error: "Este trámite ya ha sido procesado anteriormente" }, 400, step);

    const nuevoEstado = accion === 'APROBAR' ? 'APROBADO' : 'RECHAZADO';
    
    // 5. Procesamiento de Payload
    step = "PREPARE_PAYLOAD";
    let payload: any = {};
    try {
      const rawDesc = tramite.descripcion || "{}";
      payload = typeof rawDesc === 'string' ? JSON.parse(rawDesc.trim() || "{}") : rawDesc;
    } catch (e) { 
      payload = {};
    }

    // 6. Lógica de Negocio según el tipo de trámite
    if (accion === 'APROBAR') {
      step = "PROCESS_APPROVAL";
      if (tramite.tipo === 'VEHICULO') {
        const meta = payload.metadatos || payload; // Fallback if no metadatos
        await db.vehiculo.create({
          data: {
            usuarioId: tramite.usuarioId,
            placa: String(meta.placa || "SIN_PLACA").toUpperCase(),
            marca: meta.marca || "No especificada",
            modelo: meta.modelo || "N/A",
            color: meta.color || "N/A",
            tipo: meta.tipoVehiculo || meta.tipo || "CARRO"
          }
        });

        if (parqueaderoId) {
            step = "DB_ASSIGN_PARKING";
            await db.parqueadero.update({
                where: { id: parqueaderoId },
                data: { usuarioId: tramite.usuarioId, estado: 'OCUPADO' }
            });
        }
      } else if (tramite.tipo === 'MASCOTA') {
        const meta = payload.metadatos || payload;
        await db.mascota.create({
          data: {
            usuarioId: tramite.usuarioId,
            nombre: meta.nombre || "Mascota",
            tipo: meta.tipo || "OTRO",
            raza: meta.raza || "N/A"
          }
        });
      }

      step = "NOTIFY_SUCCESS";
      await db.notificacion.create({
          data: {
              usuarioId: tramite.usuarioId,
              tipo: 'APROBACION',
              titulo: "Tu solicitud ha sido aprobada",
              mensaje: `Felicidades, tu trámite de ${tramite.tipo} ha sido procesado exitosamente.`
          }
      });
    } else {
        step = "NOTIFY_REJECTION";
        await db.notificacion.create({
            data: {
                usuarioId: tramite.usuarioId,
                tipo: 'SISTEMA',
                titulo: "Trámite rechazado",
                mensaje: `Importante: Tu solicitud ha sido negada por la administración. Motivo: ${observacionAdmin || 'Ver detalles con portería'}`
            }
        });
    }

    // 7. Cierre de Trámite en DB
    step = "FINAL_DB_SYNC";
    const res = await db.tramite.update({
      where: { id: tramiteId },
      data: {
        estado: nuevoEstado,
        aprobadoPorId: userId,
        observacionAdmin: observacionAdmin || null,
        fechaRespuesta: new Date().toISOString()
      }
    });

    console.log(`✨ [SUCCESS] Trámite ${tramiteId} finalizado correctamente.`);
    return createRes({ success: true, data: { id: res.id, estado: res.estado } }, 200, "COMPLETED");

  } catch (err: any) {
    console.error(`🔥 [API-ERROR] Failure at ${step}:`, err.message);
    
    // Respuesta de emergencia robusta
    const finalError = err.message || "Internal Server Error";
    return new Response(safeJsonStringify({ 
        success: false, 
        error: finalError,
        step,
        diag: "CRITICAL_FAILURE"
    }), { 
        status: 500, 
        headers: { 
            "Content-Type": "application/json",
            "X-Execution-Step": step,
            "X-Detailed-Error": finalError.substring(0, 50)
        } 
    });
  }
}
