import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zudntuczwfhmyqgzcvrc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log("--- Checking Unidades ---");
  const { data: units, error: uError } = await supabase.from("Unidad").select("*").limit(5);
  if (uError) console.error("Unidad Error:", uError.message);
  else console.log("Unidades:", units);

  console.log("\n--- Checking Usuario ---");
  const { data: users, error: usError } = await supabase.from("Usuario").select("id, nombre, email, unidadId, torre, apto").limit(5);
  if (usError) console.error("Usuario Error:", usError.message);
  else console.log("Usuarios:", users);
}

run();
