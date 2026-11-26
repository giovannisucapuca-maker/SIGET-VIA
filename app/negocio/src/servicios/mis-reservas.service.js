// SIGET-VÍA — CAPA DE LÓGICA — Mis reservas (solo las del cliente autenticado)
import * as repo from 'siget-via-datos/repositorios/mis-reservas.repository.js';
import { errorHttp } from '../utils/errores.js';

export function listarMisReservas(usuarioId) {
  return repo.listarPorUsuario(usuarioId);
}

export async function obtenerMiReserva(usuarioId, idRaw) {
  const id = Number(idRaw);
  if (!Number.isSafeInteger(id) || id <= 0) throw errorHttp('Identificador inválido.');
  const cabecera = await repo.obtenerCabecera(usuarioId, id);
  if (!cabecera) throw errorHttp('Reserva no encontrada.', 404);
  return { ...cabecera, items: await repo.listarItems(id) };
}
