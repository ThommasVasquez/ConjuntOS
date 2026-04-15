import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zudntuczwfhmyqgzcvrc.supabase.co";
const SUPABASE_KEY = "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const email = "raulmontaño@conjuntos.com";
  const password = "Md5891129Ae$";
  const name = "Raúl Montaño";
  const id = `usr_${Math.random().toString(36).substring(7)}`;

  console.log("🔍 Buscando conjunto para asignar...");
  
  let { data: conjunto } = await supabase
    .from("Conjunto")
    .select("id, nombre")
    .limit(1)
    .maybeSingle();

  if (!conjunto) {
    console.log("🏗️ Creando conjunto...");
    const { data: newConjunto } = await supabase
      .from("Conjunto")
      .insert({
        id: "demo_id",
        nombre: "Residencial Horizonte",
        subdominio: "demo",
        direccion: "Calle Falsa 123",
        ciudad: "Bogotá",
        nit: "800.123.456-1"
      })
      .select()
      .single();
    conjunto = newConjunto;
  }

  console.log(`✅ Conjunto: ${conjunto?.nombre}`);

  try {
    const { data: user, error: uError } = await supabase
      .from("Usuario")
      .insert({
        id, // ID MANUAL REQUERIDO POR EL SCHEMA
        email,
        password: password,
        nombre: name,
        rol: "PROPIETARIO",
        conjuntoId: conjunto?.id,
        activo: true,
        creadoEn: new Date().toISOString()
      })
      .select()
      .single();

    if (uError) throw uError;
    console.log(`✨ Usuario ${user.email} (Rol: ${user.rol}) registrado con éxito!`);
  } catch (error: any) {
    if (error.code === '23505') {
       console.log(`ℹ️ El usuario ${email} ya existe. Actualizando datos...`);
       const { data: updated } = await supabase
         .from("Usuario")
         .update({ password, nombre: name })
         .eq("email", email)
         .select()
         .single();
       console.log(`✅ Usuario ${updated.email} actualizado.`);
    } else {
       console.error("❌ Error al crear usuario:", error);
    }
  }
}

main();
