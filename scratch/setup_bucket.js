const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zudntuczwfhmyqgzcvrc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupBucket() {
  console.log("🚀 Iniciando configuración de Storage...");
  
  const { data, error } = await supabase.storage.createBucket('chat-voice', {
    public: true,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']
  });

  if (error) {
    if (error.message.includes('already exists')) {
      console.log("✅ El bucket 'chat-voice' ya existe.");
    } else {
      console.error("❌ Error al crear el bucket:", error.message);
      process.exit(1);
    }
  } else {
    console.log("✅ Bucket 'chat-voice' creado exitosamente.");
  }

  // Intentar configurar políticas (Opcional, pero recomendado)
  console.log("📝 Nota: Recuerde verificar las políticas RLS en el panel de Supabase si la subida falla.");
}

setupBucket();
