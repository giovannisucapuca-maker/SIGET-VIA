// SIGET-VÍA / RF8 — Reglas del negocio de buses.
// Sin dependencias directas de SQL Server.
import { z } from 'zod';
import * as datos from 'siget-via-datos/repositorios/buses.repository.js';

const estadoSchema = z.enum(['OPERATIVO', 'MANTENIMIENTO', 'INACTIVO']);
const tipoServicioSchema = z.number().int('El tipo de servicio debe ser un entero')
  .positive('Selecciona un tipo de servicio válido').max(2147483647).nullable().optional();
const busSchema = z.object({
  placa: z.string().trim().min(5, 'La placa debe tener al menos 5 caracteres')
    .max(12, 'La placa no puede superar 12 caracteres')
    .regex(/^[A-Za-z0-9-]+$/, 'La placa solo admite letras, números y guiones')
    .transform(v => v.toUpperCase()),
  modelo: z.string().trim().min(2, 'El modelo debe tener al menos 2 caracteres')
    .max(100, 'El modelo no puede superar 100 caracteres'),
  capacidad: z.number().int('La capacidad debe ser un número entero')
    .min(1, 'La capacidad mínima es 1').max(200, 'La capacidad máxima es 200'),
  asientosPrimerPiso: z.number().int()
    .min(1, 'Debe existir al menos un asiento en el primer nivel').max(200),
  asientosSegundoPiso: z.number().int().min(0).max(200),
  estado: estadoSchema,
  tipoServicioId: tipoServicioSchema
}).refine(d => d.asientosPrimerPiso + d.asientosSegundoPiso === d.capacidad, {
  path: ['capacidad'],
  message: 'La suma de asientos por nivel debe ser igual a la capacidad'
});
const idSchema = z.coerce.number().int().positive().max(2147483647);

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), { statusCode });
}
function validarBus(body) {
  const r = busSchema.safeParse(body);
  if (!r.success) throw errorHttp(r.error.issues[0]?.message || 'Los datos del bus no son válidos');
  return r.data;
}
function obtenerId(valor) {
  const r = idSchema.safeParse(valor);
  if (!r.success) throw errorHttp('El identificador del bus es inválido');
  return r.data;
}
async function validarTipoServicio(tx, tipoServicioId, anterior = null) {
  if (tipoServicioId == null) return;
  const servicio = await datos.buscarServicioEnTransaccion(tx, tipoServicioId);
  if (!servicio) throw errorHttp('El tipo de servicio seleccionado no existe');
  if (servicio.Estado !== 'ACTIVO' && Number(anterior) !== Number(tipoServicioId)) {
    throw errorHttp('El tipo de servicio seleccionado no está activo');
  }
}

export const listarTiposServicio = () => datos.listarTiposServicio();
export const listarBuses = (q) => datos.listarBuses(String(q || '').trim().slice(0, 100));
export async function obtenerBus(valor) {
  const bus = await datos.buscarBus(obtenerId(valor));
  if (!bus) throw errorHttp('Bus no encontrado', 404);
  return bus;
}
export async function obtenerAsientosBus(valor) {
  const id = obtenerId(valor);
  const bus = await datos.buscarBus(id);
  if (!bus) throw errorHttp('Bus no encontrado', 404);
  return { bus, asientos: await datos.obtenerAsientos(id) };
}

// La reserva de un nuevo bus y la numeración de asientos son una sola transacción.
export async function registrarBus(body) {
  const bus = validarBus(body);
  const tx = await datos.comenzarTransaccion();
  try {
    if (await datos.buscarPlacaEnTransaccion(tx, bus.placa)) {
      throw errorHttp('La placa ya está registrada', 409);
    }
    await validarTipoServicio(tx, bus.tipoServicioId ?? null);
    const busId = await datos.registrarBusEnTransaccion(tx, bus);
    const cantidad = await datos.generarAsientosEnTransaccion(
      tx, busId, bus.asientosPrimerPiso, bus.asientosSegundoPiso
    );
    if (cantidad !== bus.capacidad) {
      throw errorHttp('No se generó la cantidad esperada de asientos');
    }
    await datos.confirmar(tx);
    return { BusID: busId, TipoServicioID: bus.tipoServicioId ?? null,
      mensaje: 'Bus y asientos registrados correctamente' };
  } catch (e) {
    await datos.revertir(tx);
    throw e;
  }
}

export async function actualizarBus(valor, body) {
  const id = obtenerId(valor);
  const bus = validarBus(body);
  const tx = await datos.comenzarTransaccion();
  try {
    const actual = await datos.obtenerBusBloqueado(tx, id);
    if (!actual) throw errorHttp('Bus no encontrado', 404);
    if (await datos.buscarPlacaEnTransaccion(tx, bus.placa, id)) {
      throw errorHttp('La placa pertenece a otro bus', 409);
    }
    const anteriorServicio = actual.TipoServicioID ?? null;
    const tipoServicioId = bus.tipoServicioId === undefined
      ? anteriorServicio : bus.tipoServicioId;
    await validarTipoServicio(tx, tipoServicioId, anteriorServicio);

    const anterior = await datos.distribucionEnTransaccion(tx, id);
    const cambioDistribucion = Number(actual.Capacidad) !== bus.capacidad ||
      Number(anterior.Total) !== bus.capacidad ||
      Number(anterior.PrimerPiso) !== bus.asientosPrimerPiso ||
      Number(anterior.SegundoPiso) !== bus.asientosSegundoPiso;

    if (cambioDistribucion) {
      const deps = await datos.dependenciasEnTransaccion(tx, id);
      if (Number(deps.TotalViajes) > 0 || Number(deps.TotalReservas) > 0) {
        throw errorHttp(
          'No se puede cambiar la capacidad ni la distribución de asientos porque ' +
          'este bus tiene viajes o reservas relacionados. Puedes editar la placa, ' +
          'el modelo, el estado operativo y el tipo de servicio.', 409
        );
      }
    }

    await datos.actualizarBusEnTransaccion(tx, id, { ...bus, tipoServicioId });
    if (cambioDistribucion) {
      await datos.borrarAsientosEnTransaccion(tx, id);
      const cantidad = await datos.generarAsientosEnTransaccion(
        tx, id, bus.asientosPrimerPiso, bus.asientosSegundoPiso
      );
      if (cantidad !== bus.capacidad) {
        throw errorHttp('No se generó la cantidad esperada de asientos');
      }
    }
    await datos.confirmar(tx);
    return { BusID: id, TipoServicioID: tipoServicioId,
      mensaje: cambioDistribucion
        ? 'Bus y distribución actualizados correctamente'
        : 'Datos generales del bus actualizados correctamente' };
  } catch (e) {
    await datos.revertir(tx);
    throw e;
  }
}

export async function cambiarEstadoBus(valor, body) {
  const id = obtenerId(valor);
  const r = z.object({ estado: estadoSchema }).safeParse(body);
  if (!r.success) throw errorHttp('Selecciona OPERATIVO, MANTENIMIENTO o INACTIVO.');
  const { estado } = r.data;
  if (!(await datos.cambiarEstadoBus(id, estado))) throw errorHttp('Bus no encontrado', 404);
  return { BusID: id, Estado: estado, mensaje: 'Estado del bus actualizado correctamente' };
}
