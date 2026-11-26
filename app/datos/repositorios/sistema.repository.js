// SIGET-VÍA — CAPA DE ACCESO A DATOS — Comprobación de conexión
import { getPool } from '../config/db.js';

export async function probarConexion() {
  await getPool();
  return true;
}
