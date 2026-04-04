const { Pool } = require('@neondatabase/serverless');

async function seed() {
  const connectionString = "postgresql://neondb_owner:Md5891129Ae%23%241129@ep-small-night-a5qgq9x4.us-east-2.aws.neon.tech/neondb?sslmode=require";
  const pool = new Pool({ connectionString });
  
  try {
    console.log("Conectando a la base de datos de Neon...");
    
    // Obtener conjunto demo_id
    const conjuntoRes = await pool.query("SELECT id FROM \"Conjunto\" LIMIT 1");
    let conjuntoId = conjuntoRes.rows[0]?.id;
    
    if (!conjuntoId) {
      console.log("Creando conjunto demo...");
      const insertConjunto = await pool.query(
        "INSERT INTO \"Conjunto\" (id, nombre, subdominio, direccion, ciudad) VALUES ('demo_id', 'Residencial Horizonte', 'demo', 'Digital', 'Nube') RETURNING id"
      );
      conjuntoId = insertConjunto.rows[0].id;
    }

    const demoUsers = [
      { email: "thommyadmin@example.com", rol: "ADMINISTRADOR", nombre: "Thommy Admin" },
      { email: "thommyvigilante@example.com", rol: "VIGILANTE", nombre: "Thommy Vigilante" },
      { email: "thommyestacionamientos@example.com", rol: "ENCARGADO_PARQUEADERO", nombre: "Thommy Parqueadero" },
      { email: "thommyresidente@example.com", rol: "PROPIETARIO", nombre: "Thommy Residente" },
    ];

    for (const u of demoUsers) {
      const existing = await pool.query("SELECT id FROM \"Usuario\" WHERE email = $1", [u.email]);
      
      if (existing.rows.length > 0) {
        await pool.query(
          "UPDATE \"Usuario\" SET password = $1, rol = $2 WHERE email = $3",
          ["Md5891129Ae$", u.rol, u.email]
        );
        console.log(`Usuario actualizado: ${u.email}`);
      } else {
        await pool.query(
          "INSERT INTO \"Usuario\" (id, email, password, rol, nombre, \"conjuntoId\", plan) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [crypto.randomUUID ? crypto.randomUUID() : `u_${Math.random().toString(36).substring(2,11)}`, u.email, "Md5891129Ae$", u.rol, u.nombre, conjuntoId, "BASICO"]
        );
        console.log(`Usuario creado: ${u.email}`);
      }
    }
    
    console.log("¡Todos los usuarios han sido insertados exitosamente!");
  } catch (err) {
    console.error("Error en el seeding:", err);
  } finally {
    await pool.end();
  }
}

seed();
