import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { sendPushNotification } from "@mmmike/web-push/send";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const vapidKeys = {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  privateKey: process.env.VAPID_PRIVATE_KEY || "",
  subject: process.env.VAPID_SUBJECT || "mailto:soporte@conjuntos.app",
};

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { targetPeerId, callerName, callerPeerId } = await req.json();

    if (!targetPeerId) {
      return NextResponse.json({ success: false, error: "targetPeerId requerido" }, { status: 400 });
    }

    console.log(`[call-push]: Iniciando push para peer ID ${targetPeerId} de parte de ${callerName} (${callerPeerId})`);

    const callerId = session.user.id;
    let callerRole: string | null = null;
    try {
      const callerUser = await db.usuario.findUnique({
        where: { id: callerId },
        select: { rol: true }
      });
      callerRole = callerUser?.rol || null;
    } catch (e) {
      const { supabase } = await import("@/lib/db");
      const { data } = await supabase.from("Usuario").select("rol").eq("id", callerId).maybeSingle();
      callerRole = data?.rol || null;
    }

    let targetUsers: { id: string; notifPush: string | null }[] = [];

    // Parse targetPeerId:
    // Case 1: user-userId
    if (targetPeerId.startsWith("user-")) {
      const targetUserId = targetPeerId.replace("user-", "");
      let targetUser: { id: string; notifPush: string | null; rol: string; activoLlamadas?: boolean } | null = null;
      try {
        const usuarioDelegate = await db.usuario;
        const user = await usuarioDelegate.findUnique({
          where: { id: targetUserId },
          select: { id: true, notifPush: true, rol: true, activoLlamadas: true }
        });
        if (user) targetUser = user as any;
      } catch (e) {
        const { supabase } = await import("@/lib/db");
        const { data } = await supabase.from("Usuario").select("id, notifPush, rol, activoLlamadas").eq("id", targetUserId).maybeSingle();
        if (data) targetUser = data as any;
      }

      if (targetUser) {
        if (targetUser.rol === "SUPER_ADMIN" && callerRole !== "ADMINISTRADOR" && callerRole !== "SUPER_ADMIN") {
          return NextResponse.json({ success: false, error: "Solo los administradores de conjuntos pueden llamar a un SuperAdmin" }, { status: 403 });
        }
        if (targetUser.rol === "ADMINISTRADOR" && targetUser.activoLlamadas === false) {
          return NextResponse.json({ success: false, error: "El administrador no está disponible para recibir llamadas en este momento." }, { status: 403 });
        }
        targetUsers.push(targetUser);
      }
    }
    // Case 2: conjuntoId-VIGILANTE
    else if (targetPeerId.endsWith("-VIGILANTE")) {
      const conjuntoId = targetPeerId.split("-VIGILANTE")[0];
      try {
        const usuarioDelegate = await db.usuario;
        targetUsers = await usuarioDelegate.findMany({
          where: { conjuntoId, rol: "VIGILANTE" },
          select: { id: true, notifPush: true }
        });
      } catch (e) {
        const { supabase } = await import("@/lib/db");
        const { data } = await supabase.from("Usuario").select("id, notifPush").eq("conjuntoId", conjuntoId).eq("rol", "VIGILANTE");
        if (data) targetUsers = data;
      }
    }
    // Case 3: conjuntoId-ADMINISTRADOR
    else if (targetPeerId.endsWith("-ADMINISTRADOR")) {
      const conjuntoId = targetPeerId.split("-ADMINISTRADOR")[0];
      try {
        const usuarioDelegate = await db.usuario;
        targetUsers = await usuarioDelegate.findMany({
          where: { conjuntoId, rol: "ADMINISTRADOR" },
          select: { id: true, notifPush: true, activoLlamadas: true }
        });
      } catch (e) {
        const { supabase } = await import("@/lib/db");
        const { data } = await supabase.from("Usuario").select("id, notifPush, activoLlamadas").eq("conjuntoId", conjuntoId).eq("rol", "ADMINISTRADOR");
        if (data) targetUsers = data;
      }

      // Check if all admins have calls disabled
      const inactiveAdminsCount = targetUsers.filter((u: any) => u.activoLlamadas === false).length;
      if (targetUsers.length > 0 && inactiveAdminsCount === targetUsers.length) {
        return NextResponse.json({ success: false, error: "El administrador no está disponible para recibir llamadas en este momento." }, { status: 403 });
      }

      // Filter out unavailable admins
      targetUsers = targetUsers.filter((u: any) => u.activoLlamadas !== false);
    }
    // Case 4: conjuntoId-APTO-torre-numero o conjuntoId-APTO-numero
    else if (targetPeerId.includes("-APTO-")) {
      const parts = targetPeerId.split("-APTO-");
      const conjuntoId = parts[0];
      const aptoStr = parts[1];
      let torre = "";
      let numero = aptoStr;
      if (aptoStr.includes("-")) {
        const aptoParts = aptoStr.split("-");
        torre = aptoParts[0];
        numero = aptoParts[1];
      }

      // Map sanitized "_" back to "/" for database unit matching
      let dbTorre = torre;
      let dbNumero = numero;
      if (torre.includes("_")) {
        dbTorre = torre.replace(/_/g, "/");
      }
      if (numero.includes("_")) {
        dbNumero = numero.replace(/_/g, "/");
      }

      try {
        const usuarioDelegate = await db.usuario;
        targetUsers = await usuarioDelegate.findMany({
          where: {
            conjuntoId,
            unidad: {
              numero: dbNumero,
              torre: dbTorre || undefined
            }
          },
          select: { id: true, notifPush: true }
        });
      } catch (e) {
        const { supabase } = await import("@/lib/db");
        let query = supabase
          .from("Usuario")
          .select("id, notifPush, unidad:Unidad!inner(numero, torre)")
          .eq("conjuntoId", conjuntoId)
          .eq("unidad.numero", dbNumero);
        if (dbTorre) {
          query = query.eq("unidad.torre", dbTorre);
        }
        const { data } = await query;
        if (data) targetUsers = data as any;
      }
    }

    const subscriptions = targetUsers
      .map(u => u.notifPush)
      .filter((s): s is string => !!s);

    if (subscriptions.length === 0) {
      console.log(`[call-push]: No se encontraron suscripciones push para el destinatario ${targetPeerId}`);
      return NextResponse.json({ success: true, sent: 0, reason: "No subscriptions found" });
    }

    console.log(`[call-push]: Enviando notificación push a ${subscriptions.length} dispositivo(s)`);

    const results = await Promise.allSettled(
      subscriptions.map(async (subStr) => {
        const subscription = JSON.parse(subStr);
        
        const payload = {
          title: "Llamada Entrante",
          body: `Llamada de citofonía desde ${callerName}`,
          data: {
            url: "/citofonia",
            callerName,
            callerPeerId,
          }
        };

        const res = await sendPushNotification(
          subscription,
          payload,
          vapidKeys
        );

        if (!res) {
          throw new Error("Push notification delivery failed (sendPushNotification returned false)");
        }
        return res;
      })
    );

    const successCount = results.filter(r => r.status === "fulfilled").length;
    console.log(`[call-push]: Éxito enviando ${successCount}/${results.length} notificaciones`);

    return NextResponse.json({ success: true, sent: successCount });
  } catch (fatalError: any) {
    console.error(`[call-push-fatal]:`, fatalError);
    return NextResponse.json({ success: false, error: fatalError.message }, { status: 500 });
  }
}
