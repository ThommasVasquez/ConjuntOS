const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zudntuczwfhmyqgzcvrc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupBucket() {
  console.log("🚀 Iniciando configuración de Storage...");
  
  // 1. Voice Bucket
  const { error: voiceErr } = await supabase.storage.createBucket('chat-voice', {
    public: true,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']
  });

  if (voiceErr) {
    if (voiceErr.message.includes('already exists')) {
      console.log("✅ El bucket 'chat-voice' ya existe.");
    } else {
      console.error("❌ Error al crear el bucket 'chat-voice':", voiceErr.message);
    }
  } else {
    console.log("✅ Bucket 'chat-voice' creado exitosamente.");
  }

  // 2. Logos Bucket
  const { error: logoErr } = await supabase.storage.createBucket('logos', {
    public: true,
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
  });

  if (logoErr) {
    if (logoErr.message.includes('already exists')) {
      console.log("✅ El bucket 'logos' ya existe.");
    } else {
      console.error("❌ Error al crear el bucket 'logos':", logoErr.message);
    }
  } else {
    console.log("✅ Bucket 'logos' creado exitosamente.");
  }

  console.log("📝 Nota: Recuerde verificar las políticas RLS en el panel de Supabase si la subida falla.");
}

setupBucket();
