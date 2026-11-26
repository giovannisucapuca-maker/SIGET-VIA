import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/pagos.repository.js';

const idSchema = z.coerce.number().int().positive().safe();
const ESTADOS = ['REGISTRADO', 'ANULADO'];
const METODOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO'];

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), { statusCode });
}

export function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) {
    throw errorHttp('Identificador de pago inválido.');
  }
  return resultado.data;
}

function fechaValida(valor) {
  if (valor === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
}

export function obtenerFiltros(query) {
  const esquema = z.object({
    q: z.string().trim().max(100).optional(),
    estado: z.string().optional(),
    metodo: z.string().optional(),
    desde: z.string().optional(),
    hasta: z.string().optional()
  });
  const resultado = esquema.safeParse(query);
  if (!resultado.success) throw errorHttp('Los filtros enviados no son válidos.');
  const datos = resultado.data;
  const filtros = {
    q: (datos.q || '').trim(),
    estado: (datos.estado || '').trim(),
    metodo: (datos.metodo || '').trim(),
    desde: (datos.desde || '').trim(),
    hasta: (datos.hasta || '').trim()
  };
  if (filtros.estado && !ESTADOS.includes(filtros.estado)) {
    throw errorHttp('El estado del pago no es válido.');
  }
  if (filtros.metodo && !METODOS.includes(filtros.metodo)) {
    throw errorHttp('El método de pago no es válido.');
  }
  if (!fechaValida(filtros.desde) || !fechaValida(filtros.hasta)) {
    throw errorHttp('El rango de fechas no es válido.');
  }
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    throw errorHttp('La fecha inicial no puede ser posterior a la final.');
  }
  return filtros;
}

// =====================================================
// CASOS DE USO (consultas). Altas y anulaciones se hacen desde Ventas.
// =====================================================

export const resumen = () => repo.obtenerResumenPagos();

export function listar(query) {
  return repo.listarPagos(obtenerFiltros(query));
}

export async function detalle(idRaw) {
  const pago = await repo.obtenerDetallePago(obtenerId(idRaw));
  if (!pago) throw errorHttp('Pago no encontrado.', 404);
  return pago;
}
