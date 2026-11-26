// SIGET-VÍA — CAPA DE LÓGICA — Manifiesto de pasajeros (RF16)
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/manifiestos.repository.js';
import { errorHttp } from '../utils/errores.js';

const idSchema = z.coerce.number().int().positive().safe();

export const ROLES_MANIFIESTO = ['ADMINISTRADOR', 'OPERADOR'];

export function puedeConsultarManifiestos(usuario) {
  return ROLES_MANIFIESTO.includes(usuario?.Rol);
}

function fechaValida(valor) {
  if (!valor) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
}

export async function listarViajes(query) {
  const q = String(query.q || '').trim().slice(0, 100);
  const fecha = String(query.fecha || '').trim();
  if (!fechaValida(fecha)) throw errorHttp('La fecha de consulta no es válida.');
  return repo.listarViajes(q, fecha);
}

export async function obtenerManifiesto(idRaw) {
  const parsed = idSchema.safeParse(idRaw);
  if (!parsed.success) throw errorHttp('El identificador del viaje no es válido.');

  const { viaje, pasajeros } = await repo.obtenerManifiesto(parsed.data);
  if (!viaje) throw errorHttp('El viaje no existe.', 404);

  const capacidad = Number(viaje.Capacidad || 0);
  return {
    viaje,
    pasajeros,
    resumen: {
      totalPasajeros: pasajeros.length,
      totalAsientos: capacidad,
      asientosDisponibles: Math.max(0, capacidad - pasajeros.length)
    }
  };
}
