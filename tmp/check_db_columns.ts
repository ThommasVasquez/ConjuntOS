
import { Pool } from "@neondatabase/serverless";
import { discoverUrl } from "./src/lib/db";

async function checkSchema() {
  const url = await discoverUrl();
  console.log("🔗 Connecting to:", url.split("@")[1]); // Hide password
  
  const pool = new Pool({ connectionString: url });
  try {
    const res = await pool.query({
      text: "SELECT column_name FROM information_schema.columns WHERE table_name = 'Usuario'"
    });
    console.log("✅ Columns in 'Usuario':", res.rows.map(r => r.column_name).join(", "));
  } catch (err) {
    console.error("❌ SQL Error:", err);
  } finally {
    await pool.end();
  }
}

checkSchema();
