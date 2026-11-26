import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/auditoria.repository.js';

export const accionesPermitidas = [
  'INSERT', 'UPDATE', 'DELETE', 'CAMBIO_ESTADO', 'LOGIN', 'OTRO'
];

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), { statusCode });
}

const idSchema = z.coerce.number().int().positive().safe();

export function obtenerIdAuditoria(valor) {
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) {
    throw errorHttp('El identificador de auditoría no es válido.');
  }
  return resultado.data;
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

export function validarFiltrosAuditoria(query) {
  const esquema = z.object({
    q: z.string().trim().max(100).optional().default(''),
    accion: z.string().trim().optional().default(''),
    entidad: z.string().trim().max(70).optional().default(''),
    usuarioId: z.string().trim().optional().default(''),
    desde: z.string().trim().optional().default(''),
    hasta: z.string().trim().optional().default('')
  });

  const resultado = esquema.safeParse(query);
  if (!resultado.success) {
    throw errorHttp('Los filtros de auditoría son inválidos.');
  }
  const filtros = resultado.data;
  if (filtros.accion && !accionesPermitidas.includes(filtros.accion)) {
    throw errorHttp('La acción seleccionada no es válida.');
  }
  if (!fechaValida(filtros.desde) || !fechaValida(filtros.hasta)) {
    throw errorHttp('El rango de fechas no es válido.');
  }
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    throw errorHttp('La fecha inicial no puede superar la final.');
  }

  let usuarioId = null;
  if (filtros.usuarioId) {
    const usuario = idSchema.safeParse(filtros.usuarioId);
    if (!usuario.success) {
      throw errorHttp('El usuario seleccionado no es válido.');
    }
    usuarioId = usuario.data;
  }
  return { ...filtros, usuarioId };
}

// =====================================================
// CASOS DE USO (consultas de solo lectura)
// =====================================================

export async function catalogos() {
  return { acciones: accionesPermitidas, ...(await repo.consultarCatalogosAuditoria()) };
}

export const resumen = () => repo.consultarResumenAuditoria();

export function listar(query) {
  return repo.consultarListadoAuditoria(validarFiltrosAuditoria(query));
}

export async function detalle(idRaw) {
  const registro = await repo.consultarDetalleAuditoria(obtenerIdAuditoria(idRaw));
  if (!registro) throw errorHttp('Registro de auditoría no encontrado.', 404);
  return registro;
}
