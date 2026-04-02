import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "thommas.vz@gmail.com";
  console.log(`🔍 Buscando usuario: ${email}...`);
  
  const user = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, conjuntoId: true, unidadId: true }
  });

  if (!user || !user.unidadId) {
    console.error("❌ Usuario no encontrado o no tiene unidad asignada.");
    return;
  }

  console.log(`✅ Usuario encontrado (ID: ${user.id}). Insertando pagos de ejemplo...`);

  const seedData = [
    { concepto: "Administración Marzo 2026", monto: 250000, estado: "PENDIENTE", fechaVencimiento: new Date("2026-03-31T23:59:59Z") },
    { concepto: "Energía Eléctrica Feb 2026", monto: 88500, estado: "PAGADO", fechaVencimiento: new Date("2026-02-15T23:59:59Z"), fechaPago: new Date("2026-02-10T14:30:00Z") },
    { concepto: "Consumo de Gas Natural Ene 2026", monto: 32400, estado: "PAGADO", fechaVencimiento: new Date("2026-01-20T23:59:59Z"), fechaPago: new Date("2026-01-18T09:15:00Z") },
    { concepto: "Agua y Alcantarillado Dic 2025", monto: 45200, estado: "PAGADO", fechaVencimiento: new Date("2025-12-25T23:59:59Z"), fechaPago: new Date("2025-12-20T16:45:00Z") },
    { concepto: "Alquiler Salón Comunal", monto: 120000, estado: "PAGADO", fechaVencimiento: new Date("2025-11-15T23:59:59Z"), fechaPago: new Date("2025-11-12T10:00:00Z") },
    { concepto: "Administración Febrero 2026", monto: 250000, estado: "PAGADO", fechaVencimiento: new Date("2026-02-28T23:59:59Z"), fechaPago: new Date("2026-02-25T10:00:00Z") },
    { concepto: "Administración Enero 2026", monto: 250000, estado: "PAGADO", fechaVencimiento: new Date("2026-01-31T23:59:59Z"), fechaPago: new Date("2026-01-28T15:30:00Z") },
    { concepto: "Administración Diciembre 2025", monto: 250000, estado: "VENCIDO", fechaVencimiento: new Date("2025-12-31T23:59:59Z") },
  ];

  for (const data of seedData) {
    await (prisma.pago as any).create({
      data: {
        conjuntoId: user.conjuntoId,
        unidadId: user.unidadId,
        usuarioId: user.id,
        concepto: data.concepto,
        monto: data.monto,
        estado: data.estado,
        fechaVencimiento: data.fechaVencimiento,
        fechaPago: data.fechaPago || null,
      }
    });
  }

  console.log("🏁 ¡Listo! 8 pagos de ejemplo insertados con éxito.");
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
