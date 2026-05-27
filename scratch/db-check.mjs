import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zudntuczwfhmyqgzcvrc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const { data: users, error } = await supabase.from("Usuario").select("nombre, email, password, rol");
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Users in Database:");
    users.forEach(u => {
      console.log(`- Name: ${u.nombre} | Email: ${u.email} | Pass: ${u.password} | Rol: ${u.rol}`);
    });
  }
}

check();
