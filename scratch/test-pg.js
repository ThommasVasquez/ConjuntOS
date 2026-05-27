import pg from "pg";
const { Client } = pg;

const passwords = [
  "Md5891129Ae#$1129",
  "Md5891129Ae%23%241129",
  "Md5891129Ae#$",
  "Md5891129Ae%23%24",
  "Md5891129Ae"
];

async function test(host, port, user, password, database) {
  const client = new Client({
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log(`✅ SUCCESS! host=${host} port=${port} user=${user} pass=${password}`);
    const res = await client.query("SELECT COUNT(*) as count FROM \"Usuario\"");
    console.log("Count:", res.rows[0].count);
    return true;
  } catch (err) {
    console.log(`❌ FAIL! host=${host} port=${port} user=${user} pass=${password} -> ${err.message}`);
    return false;
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

async function run() {
  console.log("Starting PG tests...");
  
  for (const pass of passwords) {
    // 1. Direct connection
    await test("db.zudntuczwfhmyqgzcvrc.supabase.co", 5432, "postgres", pass, "postgres");
    
    // 2. Pooler session mode
    await test("aws-0-us-east-1.pooler.supabase.com", 5432, "postgres.zudntuczwfhmyqgzcvrc", pass, "postgres");
    
    // 3. Pooler transaction mode
    await test("aws-0-us-east-1.pooler.supabase.com", 6543, "postgres.zudntuczwfhmyqgzcvrc", pass, "postgres");
  }
}

run();
