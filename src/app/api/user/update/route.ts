import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";

export const POST = auth(async (req) => {
  try {
    const cookies = req.headers.get("cookie") || "";
    console.log("🍪 [API-UPDATE] Cookie fragment:", cookies.substring(0, 30));

    let session = req.auth;
    if (!session) {
      console.log("⚠️ [API-UPDATE] req.auth missing, trying auth()...");
      session = await auth();
    }

    if (!session?.user?.id) {
      console.error("❌ [API-UPDATE] 401 Unauthorized");
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    const { name, phone, gender, avatar } = data;
    const userId = session.user.id;

    const updated = await (await db.usuario).update({
      where: { id: userId },
      data: { nombre: name, telefono: phone, genero: gender, avatar: avatar }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("❌ [API-UPDATE-FATAL]:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
});
