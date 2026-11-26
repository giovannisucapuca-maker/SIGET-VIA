// SIGET-VÍA — CAPA DE LÓGICA — Consulta pública de viajes (RF3)
// Solo consulta: no registra reservas ni pagos.
import { z } from 'zod';
import { consultarViajesDisponibles } from 'siget-via-datos/repositorios/viajes-publicos.repository.js';
import { errorHttp } from '../utils/errores.js';

const filtrosSchema = z.object({
  origen: z.string().trim().max(120).default(''),
  destino: z.string().trim().max(120).default(''),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).strict();

function esFechaValida(fecha) {
  if (!fecha) return true;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

// Fecha y hora actual de Perú en formato YYYY-MM-DDTHH:mm:ss.
export function ahoraPeru() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}`;
}

// Mantener los nombres oficiales del catálogo; no inventar categorías.
function normalizarServicio(valor) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  return valor.trim();
}

export async function buscarViajesPublicos(query) {
  const validacion = filtrosSchema.safeParse(query);
  if (!validacion.success || !esFechaValida(validacion.data?.fecha)) {
    throw errorHttp('Filtros de búsqueda inválidos.');
  }
  const { origen, destino, fecha } = validacion.data;
  const ahora = ahoraPeru();

  // CU003 — 8b: no se aceptan fechas anteriores a hoy.
  if (fecha && fecha < ahora.slice(0, 10)) {
    throw errorHttp('La fecha de viaje no puede ser anterior a hoy.');
  }

  const registros = await consultarViajesDisponibles({ origen, destino, fecha, ahora });

  return registros.map(v => {
    const registrados = Number(v.AsientosRegistrados);
    const ocupados = Number(v.AsientosOcupados);
    return {
      ViajeID: v.ViajeID,
      Origen: v.Origen,
      Destino: v.Destino,
      TerminalOrigen: v.TerminalOrigen ?? null,
      DireccionOrigen: v.DireccionOrigen ?? null,
      TerminalDestino: v.TerminalDestino ?? null,
      DireccionDestino: v.DireccionDestino ?? null,
      Salida: v.Salida,
      LlegadaEstimada: v.LlegadaEstimada,
      Tarifa: v.Tarifa,
      BusID: v.BusID,
      Placa: v.Placa,
      Modelo: v.Modelo,
      Capacidad: v.Capacidad,
      TipoServicioID: v.TipoServicioID ?? null,
      TipoServicio: normalizarServicio(v.TipoServicio),
      AsientosRegistrados: registrados,
      AsientosOcupados: ocupados,
      AsientosDisponibles: Math.max(0, registrados - ocupados)
    };
  });
}
