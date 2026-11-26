// SIGET-VÍA — CAPA DE ACCESO A DATOS
// Ejecuta una operación dentro de una transacción SQL Server.
// Si la operación lanza un error se hace rollback y el error se propaga.
// La capa de negocio solo recibe el objeto `tx` para pasarlo a los repositorios;
// nunca escribe SQL.
import { getPool, sql } from './db.js';

export const NIVEL = {
  READ_COMMITTED: sql.ISOLATION_LEVEL.READ_COMMITTED,
  SERIALIZABLE: sql.ISOLATION_LEVEL.SERIALIZABLE
};

export async function enTransaccion(operacion, nivel) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  if (nivel === undefined) await tx.begin();
  else await tx.begin(nivel);
  try {
    const resultado = await operacion(tx);
    await tx.commit();
    return resultado;
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

// Número de error SQL Server (2627/2601 = clave única, 547 = clave foránea).
export function numeroErrorSql(error) {
  return error?.number ?? error?.originalError?.info?.number;
}

export function esDuplicado(error) {
  const n = numeroErrorSql(error);
  return n === 2627 || n === 2601;
}
