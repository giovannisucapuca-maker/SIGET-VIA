// SIGET-VÍA — CAPA DE LÓGICA — Ventas y pagos simulados (RF5)
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/ventas.repository.js';
import { errorHttp as fallo } from '../utils/errores.js';

const idSchema = z.coerce.number().int().positive().safe();

const pagoSchema = z.object({
  reservaId: z.number().int().positive().safe(),
  metodo: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO']),
  referenciaSimulada: z.string().trim().max(100).nullable().optional(),
  // Resultado de la pasarela SIMULADA (CU005 — 10c). No hay pagos reales.
  resultadoSimulado: z.enum(['APROBADO', 'RECHAZADO'], {
    errorMap: () => ({ message: 'El resultado de la simulación debe ser APROBADO o RECHAZADO.' })
  }).optional().default('APROBADO')
});

const ESTADOS_RESERVA_VENDIBLES = ['COMPLETADA', 'CONFIRMADA', 'REPROGRAMADA'];
const ACCIONES_AUDITORIA = ['INSERT', 'UPDATE', 'DELETE', 'CAMBIO_ESTADO', 'LOGIN', 'OTRO'];

export function obtenerId(valor) {
  const r = idSchema.safeParse(valor);
  if (!r.success) throw fallo('Identificador inválido.');
  return r.data;
}

export function validarPago(body) {
  const r = pagoSchema.safeParse(body);
  if (!r.success) {
    throw fallo(r.error.issues[0]?.message || 'Los datos del pago son inválidos.');
  }
  return r.data;
}

// Traduce errores de integridad de SQL Server a mensajes de negocio.
function errorDeBase(err) {
  const numero = repo.numeroErrorSql(err);
  if (numero === 2601 || numero === 2627) {
    return fallo('Esta reserva ya tiene una venta o existe un registro duplicado.', 409);
  }
  if (numero === 547) {
    return fallo('SQL Server rechazó la operación por una restricción de integridad. ' +
      'Verifica los datos relacionados.', 409);
  }
  return err;
}

async function auditar(tx, datos) {
  if (!ACCIONES_AUDITORIA.includes(datos.accion)) {
    throw new Error('La acción de auditoría no está permitida.');
  }
  if (!datos.usuarioId || !datos.entidad || !datos.registroId) {
    throw new Error('Faltan datos obligatorios para auditar.');
  }
  await repo.registrarAuditoria(tx, datos);
}

async function enTransaccionVenta(operacion) {
  try {
    return await repo.enTransaccion(operacion, repo.NIVEL.SERIALIZABLE);
  } catch (err) {
    throw errorDeBase(err);
  }
}

// ---------- Consultas ----------

export async function catalogos() {
  return { reservas: await repo.listarReservasVendibles() };
}

export function listar(q) {
  return repo.listar(String(q || '').trim().slice(0, 100));
}

export async function detalle(idRaw) {
  const id = obtenerId(idRaw);
  const cabecera = await repo.obtenerCabecera(id);
  if (!cabecera) throw fallo('Venta no encontrada.', 404);
  return {
    ...cabecera,
    pagos: await repo.listarPagos(id),
    pasajeros: await repo.listarPasajerosActivos(cabecera.ReservaID)
  };
}

// ---------- Registrar venta + pago simulado + auditoría ----------

export async function registrarVenta(body, usuarioId) {
  const datos = validarPago(body);

  // CU005 — 10c: si la simulación rechaza el pago, la venta no se registra.
  if (datos.resultadoSimulado === 'RECHAZADO') {
    throw fallo('El pago simulado fue rechazado. La venta no se registró; ' +
      'puedes intentar con otro método de pago.', 402);
  }

  return enTransaccionVenta(async tx => {
    const reserva = await repo.obtenerReservaBloqueada(tx, datos.reservaId);
    if (!reserva) throw fallo('Reserva no encontrada.', 404);
    if (!ESTADOS_RESERVA_VENDIBLES.includes(reserva.Estado)) {
      throw fallo('El estado de la reserva no permite registrar ventas.', 409);
    }
    if (reserva.EstadoViaje !== 'PROGRAMADO') {
      throw fallo('Solo se venden pasajes de viajes PROGRAMADOS.', 409);
    }
    if (Number(reserva.SalidaFutura) !== 1) {
      throw fallo('La hora de salida ya llegó. No se puede vender esta reserva.', 409);
    }
    if (await repo.existeVentaDeReserva(tx, datos.reservaId)) {
      throw fallo('Esta reserva ya tiene una venta registrada o anulada.', 409);
    }

    const asientos = await repo.resumirAsientosActivos(tx, datos.reservaId);
    if (asientos.cantidad < 1) throw fallo('La reserva no tiene asientos activos.', 409);

    const total = Number(reserva.Total);
    if (!Number.isFinite(total) || total <= 0 || total > 9999999999.99) {
      throw fallo('El total de la reserva es inválido para el cobro.', 409);
    }
    if (!Number.isFinite(asientos.total) ||
        Math.round(total * 100) !== Math.round(asientos.total * 100)) {
      throw fallo('El importe de la reserva no coincide con los asientos activos.', 409);
    }

    const ventaId = await repo.insertarVenta(tx, { reservaId: datos.reservaId, vendedorId: usuarioId, total });
    const pagoId = await repo.insertarPagoSimulado(tx, {
      ventaId, metodo: datos.metodo, referencia: datos.referenciaSimulada, monto: total
    });
    const codigoComprobante = await repo.obtenerCodigoComprobante(tx, ventaId);

    await auditar(tx, {
      usuarioId, entidad: 'Venta', registroId: ventaId, accion: 'INSERT',
      detalle: `Registro de venta simulada ${codigoComprobante || `#${ventaId}`}. ` +
        `Reserva ${reserva.Codigo}. Monto S/ ${total.toFixed(2)}. Estado REGISTRADA.`
    });
    await auditar(tx, {
      usuarioId, entidad: 'Pago', registroId: pagoId, accion: 'INSERT',
      detalle: `Registro de pago simulado #${pagoId}. Venta #${ventaId}. ` +
        `Método ${datos.metodo}. Monto S/ ${total.toFixed(2)}. Estado REGISTRADO.`
    });

    return {
      VentaID: ventaId,
      PagoID: pagoId,
      CodigoComprobante: codigoComprobante,
      Total: total,
      mensaje: 'Venta, pago simulado y auditoría registrados correctamente.'
    };
  });
}

// ---------- Anular venta + pago (reserva y asientos sin cambios) ----------

export async function anularVenta(idRaw, usuarioId) {
  const id = obtenerId(idRaw);

  return enTransaccionVenta(async tx => {
    const venta = await repo.obtenerVentaBloqueada(tx, id);
    if (!venta) throw fallo('Venta no encontrada.', 404);
    if (venta.Estado !== 'REGISTRADA') throw fallo('Solo se pueden anular ventas REGISTRADAS.', 409);

    const pagos = await repo.listarPagosBloqueados(tx, id);
    if (pagos.length !== 1) {
      throw fallo('La venta debe tener exactamente un pago simulado para anularse.', 409);
    }
    const pago = pagos[0];
    if (!pago.EsSimulado || pago.Estado !== 'REGISTRADO') {
      throw fallo('El pago simulado de esta venta no tiene un estado válido.', 409);
    }

    const totalVenta = Number(venta.Total);
    const montoPago = Number(pago.Monto);
    if (!Number.isFinite(totalVenta) || !Number.isFinite(montoPago) ||
        Math.round(totalVenta * 100) !== Math.round(montoPago * 100)) {
      throw fallo('El importe del pago no coincide con la venta. Revisa la conciliación.', 409);
    }

    if ((await repo.anularPago(tx, pago.PagoID)) !== 1) throw fallo('No se pudo actualizar el pago.', 409);
    if ((await repo.anularVenta(tx, id)) !== 1) throw fallo('No se pudo actualizar la venta.', 409);

    await auditar(tx, {
      usuarioId, entidad: 'Venta', registroId: id, accion: 'CAMBIO_ESTADO',
      detalle: `Anulación de venta ${venta.CodigoComprobante || `#${id}`}. ` +
        `Estado REGISTRADA -> ANULADA. Monto S/ ${totalVenta.toFixed(2)}. ReservaID ${venta.ReservaID}.`
    });
    await auditar(tx, {
      usuarioId, entidad: 'Pago', registroId: pago.PagoID, accion: 'CAMBIO_ESTADO',
      detalle: `Anulación de pago simulado #${pago.PagoID}. Venta #${id}. ` +
        `Estado REGISTRADO -> ANULADO. Método ${pago.Metodo}. Monto S/ ${montoPago.toFixed(2)}.`
    });

    return {
      VentaID: id,
      PagoID: pago.PagoID,
      Estado: 'ANULADA',
      EstadoPago: 'ANULADO',
      mensaje: 'Venta y pago simulados anulados correctamente. ' +
        'La auditoría fue registrada. Reserva y asientos sin cambios.'
    };
  });
}
