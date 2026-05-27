import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zudntuczwfhmyqgzcvrc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b";

async function check() {
  const url = `${SUPABASE_URL}/rest/v1/`;
  try {
    const res = await fetch(url, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    const data = await res.json();
    console.log("Exposed Tables & Views:", Object.keys(data.paths).filter(p => !p.startsWith("/rpc/")));
    console.log("Exposed RPCs:", Object.keys(data.paths).filter(p => p.startsWith("/rpc/")));
  } catch (err) {
    console.error("Failed to fetch PostgREST spec:", err);
  }
}

check();
