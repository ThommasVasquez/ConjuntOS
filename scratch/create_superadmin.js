import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zudntuczwfhmyqgzcvrc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const email = "sergio@energysoftmedia.com";
  const password = "Md5891129Ae%ThommyEnergy%";
  const name = "Sergio SuperAdmin";
  const id = "usr_superadmin_sergio";

  console.log("🔍 Buscando conjunto default...");
  let { data: conjunto } = await supabase
    .from("Conjunto")
    .select("id")
    .eq("id", "demo_id")
    .maybeSingle();

  if (!conjunto) {
    console.log("🏗️ Creando conjunto default 'demo_id'...");
    const { data: newConjunto, error: cErr } = await supabase
      .from("Conjunto")
      .insert({
        id: "demo_id",
        nombre: "Administración Central",
        subdominio: "demo",
        direccion: "Edificio Central",
        ciudad: "Bogotá",
        nit: "900000000-1"
      })
      .select()
      .single();
    if (cErr) {
      console.error("❌ Error al crear conjunto default:", cErr);
      return;
    }
    conjunto = newConjunto;
  }

  console.log("🔍 Registrando / actualizando SuperAdmin...");
  const { data: existingUser } = await supabase
    .from("Usuario")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingUser) {
    const { error: uErr } = await supabase
      .from("Usuario")
      .update({
        password,
        nombre: name,
        rol: "SUPER_ADMIN",
        conjuntoId: "demo_id"
      })
      .eq("email", email);

    if (uErr) {
      console.error("❌ Error al actualizar superadmin:", uErr);
    } else {
      console.log(`✅ SuperAdmin ${email} actualizado con éxito.`);
    }
  } else {
    const { error: iErr } = await supabase
      .from("Usuario")
      .insert({
        id,
        email,
        password,
        nombre: name,
        rol: "SUPER_ADMIN",
        conjuntoId: "demo_id",
        activo: true,
        creadoEn: new Date().toISOString()
      });

    if (iErr) {
      console.error("❌ Error al crear superadmin:", iErr);
    } else {
      console.log(`✨ SuperAdmin ${email} creado con éxito.`);
    }
  }
}

main();
