// =====================================================
// SIGET-VÍA — CAPA DE ACCESO A DATOS — Respaldo de la base (RNF8)
// Uso: npm run respaldo
//
// Genera un respaldo completo (.bak) de la base configurada en
// config/.env (DB_SERVER, DB_DATABASE) usando la misma conexión
// de Windows que la API.
//
// Carpeta de destino:
//   1) RESPALDO_DIR en config/.env, si existe
//      (debe ser una carpeta en la que el servicio de SQL Server
//       pueda escribir, p. ej. C:\SIGET-respaldos).
//   2) Si no, la carpeta de respaldos por defecto de la instancia.
//
// Restauración: ver database/RESPALDO.md
// =====================================================
import { getPool, sql } from '../config/db.js';

function marcaDeTiempo() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');

  return (
    `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}_` +
    `${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`
  );
}

async function carpetaDestino(pool) {
  const configurada = process.env.RESPALDO_DIR?.trim();

  if (configurada) {
    return configurada.replace(/[\\/]+$/, '');
  }

  const r = await pool.request().query(`
    SELECT CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(400)) AS Ruta
  `);

  const ruta = r.recordset[0]?.Ruta;

  if (!ruta) {
    throw new Error(
      'No se pudo obtener la carpeta de respaldos de SQL Server. ' +
      'Define RESPALDO_DIR en config/.env.'
    );
  }

  return ruta.replace(/[\\/]+$/, '');
}

async function respaldar() {
  let pool;

  try {
    const base = process.env.DB_DATABASE;

    if (!/^[A-Za-z0-9_]+$/.test(base || '')) {
      throw new Error('DB_DATABASE no es un nombre de base válido.');
    }

    pool = await getPool();

    const carpeta = await carpetaDestino(pool);
    const archivo = `${carpeta}\\${base}_${marcaDeTiempo()}.bak`;

    console.log(`Respaldando ${base} en:\n  ${archivo}`);

    // BACKUP no admite parámetros para el nombre de la base,
    // por eso se valida arriba con una expresión estricta.
    await pool.request()
      .input('archivo', sql.NVarChar(500), archivo)
      .query(`
        BACKUP DATABASE [${base}]
        TO DISK = @archivo
        WITH INIT, CHECKSUM,
             NAME = N'SIGET-VIA respaldo completo';
      `);

    await pool.request()
      .input('archivo', sql.NVarChar(500), archivo)
      .query('RESTORE VERIFYONLY FROM DISK = @archivo WITH CHECKSUM;');

    console.log('Respaldo completado y verificado.');
  } catch (error) {
    console.error('No se pudo generar el respaldo:', error.message);
    process.exitCode = 1;
  } finally {
    await pool?.close();
  }
}

respaldar();
