import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const activeUrl = process.env.DATABASE_URL || "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae%23%241129@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
console.log("Original DATABASE_URL:", activeUrl);

const urlParts = activeUrl.match(/^(postgresql:\/\/)([^:]+):(.+)(@.+)$/);
if (!urlParts) {
  console.error("Could not parse DATABASE_URL");
  process.exit(1);
}
const [ , protocol, user, oldPass, rest] = urlParts;

// Test variants
const variants = [
  { id: "V1-DIRECT", pass: "Md5891129Ae%23%241129", user: "postgres" }, 
  { id: "V2-SEED", pass: "Md5891129Ae%23%24", user: "postgres" },      
  { id: "V4-SIMPLE", pass: "Md5891129Ae", user: "postgres" },
  { id: "V1-DIRECT-TENANT", pass: "Md5891129Ae%23%241129", user: "postgres.zudntuczwfhmyqgzcvrc" },
  { id: "V2-SEED-TENANT", pass: "Md5891129Ae%23%24", user: "postgres.zudntuczwfhmyqgzcvrc" }
];

async function run() {
  for (const v of variants) {
    try {
      const hosts = [
        { name: "Direct Supabase", url: `${protocol}${v.user}:${v.pass}@db.zudntuczwfhmyqgzcvrc.supabase.co:5432/postgres?sslmode=require` },
        { name: "Pooler Supabase", url: `${protocol}${v.user}:${v.pass}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require` }
      ];

      for (const h of hosts) {
        try {
          const sql = neon(h.url);
          const start = Date.now();
          // Use tagged-template literal syntax
          const res = await sql`SELECT COUNT(*) as count FROM "Usuario"`;
          console.log(`✅ [${v.id}] on [${h.name}] SUCCESS (${Date.now() - start}ms) - Count: ${res[0].count}`);
        } catch (err) {
          console.log(`❌ [${v.id}] on [${h.name}] FAILED:`, err.message);
        }
      }
    } catch (e) {
      console.log(`❌ Error testing variant ${v.id}:`, e.message);
    }
  }
}

run();
