import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { neon } from "@neondatabase/serverless";
import db, { discoverUrl } from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface DiagnosticResult {
  state: string;
  cloudflare: { context: string };
  version: string;
  dbTest: { 
    connection: string; 
    write: string;
    probes: Record<string, string>;
  };
  lastDbError: any;
  setup: { status: string; logs: string[] };
}

export async function GET(request: Request) {
  const diagnostics: DiagnosticResult = {
    state: "Iniciando Sonda v31...",
    cloudflare: { context: "Pendiente" },
    version: "31.0-auth-probe",
    dbTest: { 
      connection: "Pendiente", 
      write: "Pendiente",
      probes: {} 
    },
    lastDbError: (db as any).getLastError ? (db as any).getLastError() : null,
    setup: { status: "No ejecutado", logs: [] },
  };

  try {
    const activeUrl = await discoverUrl();
    const urlParts = activeUrl.match(/^(postgresql:\/\/)([^:]+):(.+)(@.+)$/);
    
    if (!urlParts) throw new Error("URL base no parseable");
    const [ , protocol, user, oldPass, rest] = urlParts;

    // VARIANTES A PROBAR (v31)
    const variants = [
      { id: "V1-DIRECT", pass: "Md5891129Ae%23%241129" }, // Original con %
      { id: "V2-SEED", pass: "Md5891129Ae%23%24" },      // Variante de semilla
      { id: "V3-RAW", pass: "Md5891129Ae#$" },           // RAW (con #$)
      { id: "V4-SIMPLE", pass: "Md5891129Ae" }           // Muy simplificada
    ];

    for (const v of variants) {
      try {
        const testUrl = `${protocol}${user}:${v.pass}${rest}`;
        const sql = neon(testUrl);
        const start = Date.now();
        await sql.query("SELECT 1");
        diagnostics.dbTest.probes[v.id] = `✅ ÉXITO (${Date.now() - start}ms)`;
        
        // Si una funciona, la usamos para el resto de la prueba
        if (diagnostics.dbTest.connection === "Pendiente") {
           diagnostics.dbTest.connection = `✅ GANADORA: ${v.id}`;
           
           // Listar tablas con la ganadora
           const rows = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
           diagnostics.setup.logs.push(`Acceso Total con ${v.id}. Tablas: ${rows.length}`);
        }
      } catch (e: any) {
        diagnostics.dbTest.probes[v.id] = `❌ ERROR: ${e.message}`;
      }
    }

    try {
      const ctx = getRequestContext();
      diagnostics.cloudflare.context = ctx ? "✅ OK" : "⚠️ Simulado";
    } catch { diagnostics.cloudflare.context = "⚠️ Error Context"; }

    diagnostics.state = "Completado";
    return NextResponse.json(diagnostics);

  } catch (err: any) {
    diagnostics.state = "❌ Error crítico sonda";
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
