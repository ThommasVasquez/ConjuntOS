import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;
    const { subscription } = await req.json();

    if (!subscription) {
      return NextResponse.json({ success: false, error: "Suscripción requerida" }, { status: 400 });
    }

    const subString = typeof subscription === "string" ? subscription : JSON.stringify(subscription);

    // Save to DB via Prisma
    try {
      const usuarioDelegate = await db.usuario;
      await usuarioDelegate.update({
        where: { id: userId },
        data: { notifPush: subString }
      });
      console.log(`✅ [push-subscribe]: Suscripción guardada para usuario ${userId}`);
      return NextResponse.json({ success: true });
    } catch (prismaErr: unknown) {
      console.warn(`⚠️ [push-subscribe]: Prisma falló, intentando Supabase Directo...`, prismaErr);
    }

    // Fallback: update via Supabase Direct
    try {
      const { supabase } = await import("@/lib/db");
      const { error } = await supabase
        .from("Usuario")
        .update({ notifPush: subString })
        .eq("id", userId);
      
      if (error) throw error;
      console.log(`✅ [push-subscribe]: Supabase Directo actualizó suscripción para ${userId}`);
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      console.error(`❌ [push-subscribe]: Error al guardar suscripción:`, err);
      return NextResponse.json({ success: false, error: "Error de base de datos" }, { status: 500 });
    }
  } catch (fatalError: any) {
    return NextResponse.json({ success: false, error: fatalError.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;

    // Remove subscription via Prisma
    try {
      const usuarioDelegate = await db.usuario;
      await usuarioDelegate.update({
        where: { id: userId },
        data: { notifPush: null }
      });
      return NextResponse.json({ success: true });
    } catch (prismaErr: unknown) {
      console.warn(`⚠️ [push-subscribe]: Prisma falló al eliminar, intentando Supabase...`, prismaErr);
    }

    // Fallback via Supabase
    try {
      const { supabase } = await import("@/lib/db");
      const { error } = await supabase
        .from("Usuario")
        .update({ notifPush: null })
        .eq("id", userId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      console.error(`❌ [push-subscribe]: Error al eliminar suscripción:`, err);
      return NextResponse.json({ success: false, error: "Error de base de datos" }, { status: 500 });
    }
  } catch (fatalError: any) {
    return NextResponse.json({ success: false, error: fatalError.message }, { status: 500 });
  }
}
