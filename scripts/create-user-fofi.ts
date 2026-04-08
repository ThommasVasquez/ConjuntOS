import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "fofi@conjuntos.com";
  console.log(`🚀 Iniciando registro de usuario: ${email}...`);

  try {
    // 1. Asegurar que el conjunto demo existe
    const conjunto = await prisma.conjunto.upsert({
      where: { id: "demo_id" },
      update: {},
      create: {
        id: "demo_id",
        nombre: "Residencial Horizonte (Demo)",
        subdominio: "demo",
        direccion: "Calle Falsa 123",
        ciudad: "Nube Digital",
        nit: "900.123.456-1"
      }
    });

    console.log("✅ Conjunto verificado:", conjunto.nombre);

    // 2. Crear o Actualizar el usuario Fofi
    const user = await prisma.usuario.upsert({
      where: { email },
      update: {
        nombre: "Foforro Residente",
        password: "FofiFoforro*",
        rol: "PROPIETARIO",
        conjuntoId: "demo_id",
        apto: "402",
        torre: "B",
        activo: true
      },
      create: {
        email,
        password: "FofiFoforro*",
        nombre: "Foforro Residente",
        rol: "PROPIETARIO",
        conjuntoId: "demo_id",
        apto: "402",
        torre: "B",
        activo: true
      }
    });

    console.log("✨ Usuario FOFI registrado exitosamente!");
    console.log("📧 Email:", user.email);
    console.log("🔑 Password:", user.password);
    console.log("🏢 Apto:", user.apto, "Torre:", user.torre);

  } catch (error) {
    console.error("❌ Error al registrar usuario:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
