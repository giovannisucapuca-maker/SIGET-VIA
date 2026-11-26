// SIGET-VÍA — CAPA DE LÓGICA — Estado del sistema
import { probarConexion } from 'siget-via-datos/repositorios/sistema.repository.js';

export function verificarConexion() {
  return probarConexion();
}
