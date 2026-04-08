const SUPABASE_URL = "https://zudntuczwfhmyqgzcvrc.supabase.co";
const SUPABASE_KEY = "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b";

async function run() {
  const email = "fofi@conjuntos.com";
  console.log(`🚀 Iniciando registro vía REST: ${email}...`);

  try {
    // 1. Verificar/Crear Conjunto
    console.log("Checking Conjunto...");
    const conjRes = await fetch(`${SUPABASE_URL}/rest/v1/Conjunto?id=eq.demo_id`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    const conjData = await conjRes.json();

    if (conjData.length === 0) {
      console.log("Creating Conjunto demo_id...");
      await fetch(`${SUPABASE_URL}/rest/v1/Conjunto`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          id: "demo_id",
          nombre: "Residencial Horizonte (Demo)",
          subdominio: "demo",
          direccion: "Calle Falsa 123",
          ciudad: "Nube Digital",
          creadoEn: new Date().toISOString()
        })
      });
    }

    // 2. Upsert Usuario
    console.log("Upserting Usuario fofi@conjuntos.com...");
    const userPayload = {
      email: email,
      password: "FofiFoforro*",
      nombre: "Foforro Residente",
      rol: "PROPIETARIO",
      conjuntoId: "demo_id",
      apto: "402",
      torre: "B",
      activo: true,
      creadoEn: new Date().toISOString()
    };

    const userRes = await fetch(`${SUPABASE_URL}/rest/v1/Usuario?email=eq.${email}`, {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(userPayload)
    });
    
    const patchData = await userRes.json();
    
    if (patchData.length === 0) {
      // User doesn't exist, POST it
      console.log("User not found, creating new...");
      await fetch(`${SUPABASE_URL}/rest/v1/Usuario`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...userPayload,
          id: `cl${Math.random().toString(36).substring(2, 11)}`
        })
      });
    }

    console.log("✨ Usuario FOFI registrado exitosamente vía REST API!");

  } catch (e) {
    console.error("❌ Error en el registro:", e);
  }
}

run();
