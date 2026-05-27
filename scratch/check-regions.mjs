import pg from "pg";
const { Client } = pg;

const regions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "sa-east-1",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-southeast-1"
];

const pass = "Md5891129Ae#$1129";
const user = "postgres.zudntuczwfhmyqgzcvrc";
const dbName = "postgres";

async function testRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const client = new Client({
    host,
    port: 6543,
    user,
    password: pass,
    database: dbName,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000 // 5 seconds timeout
  });

  try {
    await client.connect();
    console.log(`✅ SUCCESS on region ${region}!`);
    await client.end();
    return true;
  } catch (err) {
    console.log(`❌ FAILED on region ${region} (${host}): ${err.message}`);
    try { await client.end(); } catch {}
    return false;
  }
}

async function run() {
  console.log("Testing regions...");
  for (const r of regions) {
    const ok = await testRegion(r);
    if (ok) {
      console.log(`Found correct region: ${r}`);
      break;
    }
  }
}

run();
