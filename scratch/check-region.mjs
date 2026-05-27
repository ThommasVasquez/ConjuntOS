import dns from "dns";
import { promisify } from "util";

const resolveCw = promisify(dns.resolveCname);
const resolveAny = promisify(dns.resolveAny);

async function check() {
  const domain = "zudntuczwfhmyqgzcvrc.supabase.co";
  
  try {
    const cnames = await resolveCw(domain);
    console.log("CNAMEs:", cnames);
  } catch (err) {
    console.log("No CNAME found:", err.message);
  }

  try {
    const any = await resolveAny(domain);
    console.log("DNS Records:", any);
  } catch (err) {
    console.log("Failed to resolve DNS:", err.message);
  }

  try {
    const res = await fetch(`https://${domain}/rest/v1/`, { method: "HEAD" });
    console.log("HTTP Headers:");
    for (const [key, value] of res.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }
  } catch (err) {
    console.log("Failed to fetch headers:", err.message);
  }
}

check();
