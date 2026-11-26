// SIGET-VÍA — CAPA DE LÓGICA — Asientos públicos (RF3, RF4, RF10)
// No registra reservas, no modifica asientos y no procesa pagos.
import * as repo from 'siget-via-datos/repositorios/asientos-publicos.repository.js';
import { errorHttp } from '../utils/errores.js';

// Hora actual de Perú expresada como Date (mismo criterio que el módulo original).
function ahoraPeru() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const d = Object.fromEntries(partes.map(p => [p.type, p.value]));
  return new Date(`${d.year}-${d.month}-${d.day}T${d.hour}:${d.minute}:${d.second}Z`);
}

function validarViajeId(valor) {
  const texto = String(valor || '');
  if (!/^[1-9]\d*$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

function normalizarServicio(valor) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  return valor.trim();
}

export async function consultarAsientosPublicos(viajeIdRaw) {
  const viajeId = validarViajeId(viajeIdRaw);
  if (!viajeId) throw errorHttp('Identificador de viaje inválido.');

  const viaje = await repo.obtenerViajeDisponible(viajeId, ahoraPeru());
  if (!viaje) throw errorHttp('El viaje no existe o no está disponible.', 404);

  const asientos = (await repo.listarAsientosConOcupacion(viajeId, viaje.BusID)).map(a => ({
    AsientoID: Number(a.AsientoID),
    Numero: Number(a.Numero),
    Nivel: Number(a.Nivel),
    Ocupado: Boolean(a.Ocupado)
  }));

  const totalAsientos = asientos.length;
  const asientosOcupados = asientos.filter(a => a.Ocupado).length;

  const pisos = [...new Set(asientos.map(a => a.Nivel))]
    .sort((a, b) => a - b)
    .map(nivel => {
      const delPiso = asientos.filter(a => a.Nivel === nivel);
      return {
        Nivel: nivel,
        TotalAsientos: delPiso.length,
        AsientosDisponibles: delPiso.filter(a => !a.Ocupado).length,
        AsientosOcupados: delPiso.filter(a => a.Ocupado).length
      };
    });

  return {
    viaje: {
      ViajeID: Number(viaje.ViajeID),
      Origen: viaje.Origen,
      Destino: viaje.Destino,
      TerminalOrigen: viaje.TerminalOrigen ?? null,
      DireccionOrigen: viaje.DireccionOrigen ?? null,
      TerminalDestino: viaje.TerminalDestino ?? null,
      DireccionDestino: viaje.DireccionDestino ?? null,
      Salida: viaje.Salida,
      LlegadaEstimada: viaje.LlegadaEstimada,
      Tarifa: viaje.Tarifa,
      BusID: Number(viaje.BusID),
      Placa: viaje.Placa,
      Modelo: viaje.Modelo,
      Capacidad: Number(viaje.Capacidad),
      TipoServicioID: viaje.TipoServicioID == null ? null : Number(viaje.TipoServicioID),
      TipoServicio: normalizarServicio(viaje.TipoServicio),
      DescripcionServicio: viaje.DescripcionServicio ?? null
    },
    totalAsientos,
    asientosDisponibles: totalAsientos - asientosOcupados,
    asientosOcupados,
    pisos,
    asientos
  };
}
