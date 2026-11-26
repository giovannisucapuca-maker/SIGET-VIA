import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/reportes.repository.js';

const TIPOS = [

  'reservas',

  'ventas',

  'viajes',

  'ocupacion',

  'reclamaciones'

];

// =====================================================

// VALIDACIONES

// =====================================================

function errorHttp(

  mensaje,

  statusCode = 400

) {

  return Object.assign(

    new Error(mensaje),

    { statusCode }

  );

}

function fechaValida(valor) {

  if (!valor) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {

    return false;

  }

  const [anio, mes, dia] = valor

    .split('-')

    .map(Number);

  const fecha = new Date(

    Date.UTC(anio, mes - 1, dia)

  );

  return (

    fecha.getUTCFullYear() === anio &&

    fecha.getUTCMonth() === mes - 1 &&

    fecha.getUTCDate() === dia

  );

}

const filtrosSchema = z.object({

  desde: z.string()

    .trim()

    .optional()

    .default(''),

  hasta: z.string()

    .trim()

    .optional()

    .default(''),

  q: z.string()

    .trim()

    .max(100)

    .optional()

    .default('')

});

function obtenerFiltros(query) {

  const resultado = filtrosSchema.safeParse(query);

  if (!resultado.success) {

    throw errorHttp(

      'Los filtros de reportes no son válidos.'

    );

  }

  const filtros = resultado.data;

  if (

    !fechaValida(filtros.desde) ||

    !fechaValida(filtros.hasta)

  ) {

    throw errorHttp(

      'Utiliza fechas válidas en formato AAAA-MM-DD.'

    );

  }

  if (

    filtros.desde &&

    filtros.hasta &&

    filtros.desde > filtros.hasta

  ) {

    throw errorHttp(

      'La fecha inicial no puede superar la final.'

    );

  }

  return {

    desde: filtros.desde || null,

    hasta: filtros.hasta || null,

    q: filtros.q

  };

}

export function validarTipoReporte(valor) {
  const tipo = String(valor || '').trim().toLowerCase();
  if (!TIPOS.includes(tipo)) throw errorHttp('El tipo de reporte no existe.', 404);
  return tipo;
}

export { obtenerFiltros };

export function obtenerCatalogosReportes() {
  return { tipos: [
    { valor: 'reservas', nombre: 'Reservas' },
    { valor: 'ventas', nombre: 'Ventas' },
    { valor: 'viajes', nombre: 'Viajes' },
    { valor: 'ocupacion', nombre: 'Ocupación de buses' },
    { valor: 'reclamaciones', nombre: 'Reclamaciones' }
  ] };
}

// =====================================================
// CASOS DE USO
// =====================================================

export async function resumen(query) {
  const filtros = obtenerFiltros(query);
  const datos = await repo.consultarResumenReportes(filtros);
  return { ...datos, filtros: { desde: filtros.desde, hasta: filtros.hasta } };
}

export const dashboardExtra = () => repo.consultarDashboardExtra();

export async function reportePorTipo(tipoRaw, query) {
  const tipo = validarTipoReporte(tipoRaw);
  const filtros = obtenerFiltros(query);
  const registros = await repo.consultarReportePorTipo(tipo, filtros);
  return { tipo, registros, totalMostrado: registros.length, limite: 500, filtros };
}
