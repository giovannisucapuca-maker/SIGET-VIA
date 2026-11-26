// SIGET-VÍA — CAPA DE LÓGICA — Reservas (RF4, RF10, RF18)
// Reglas: políticas obligatorias, disponibilidad de asientos, pasajeros,
// importes, cancelación, edición y reprogramación.
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/reservas.repository.js';
import { errorHttp } from '../utils/errores.js';

const idSchema = z.coerce.number()
  .int().positive().safe();
const patronNombre =
  /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;
const nombre = maximo =>
  z.string().trim()
    .transform(valor => valor.replace(/\s+/g, ' '))
    .pipe(
      z.string()
        .min(2, 'El nombre debe tener al menos 2 caracteres.')
        .max(maximo)
        .regex(
          patronNombre,
          'Solo se permiten letras y separadores válidos.'
        )
    );
function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) {
    throw errorHttp('Identificador inválido.');
  }
  return resultado.data;
}
function fechaValida(valor) {
  if (valor == null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(
    Date.UTC(anio, mes - 1, dia, 12)
  );
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia &&
    fecha <= new Date()
  );
}
// =====================================================
// VALIDACIÓN DE DOCUMENTOS
// =====================================================
const reglasDocumento = {
  DNI: /^\d{8}$/,
  CE: /^[A-Z0-9]{9,12}$/,
  PASAPORTE: /^[A-Z0-9]{6,20}$/
};
const mensajesDocumento = {
  DNI: 'El DNI debe tener exactamente 8 números.',
  CE: 'El CE debe tener entre 9 y 12 caracteres alfanuméricos.',
  PASAPORTE: 'El pasaporte debe tener entre 6 y 20 caracteres alfanuméricos.'
};
function normalizarDocumento(tipo, numero) {
  const tipoNormalizado = String(tipo || 'DNI')
    .trim()
    .toUpperCase();
  const numeroNormalizado = String(numero || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!reglasDocumento[tipoNormalizado]) {
    throw errorHttp('Tipo de documento no permitido.');
  }
  if (!reglasDocumento[tipoNormalizado].test(numeroNormalizado)) {
    throw errorHttp(
      mensajesDocumento[tipoNormalizado]
    );
  }
  return {
    tipoDocumento: tipoNormalizado,
    numeroDocumento: numeroNormalizado
  };
}
// =====================================================
// ESQUEMAS ZOD
// =====================================================
const itemBaseSchema = z.object({
  asientoId: z.number()
    .int()
    .positive()
    .max(2147483647),
  tipoDocumento: z.enum([
    'DNI',
    'CE',
    'PASAPORTE'
  ]).optional().default('DNI'),
  numeroDocumento: z.string()
    .trim()
    .max(20)
    .optional(),
  // Compatibilidad con el frontend anterior.
  dni: z.string()
    .trim()
    .optional(),
  nombres: nombre(100),
  apellidos: nombre(120),
  fechaNacimiento: z.string()
    .nullable()
    .optional()
    .refine(
      fechaValida,
      'La fecha de nacimiento no es válida.'
    )
});
function normalizarItem(item) {
  const documento = normalizarDocumento(
    item.tipoDocumento,
    item.numeroDocumento || item.dni
  );
  return {
    ...item,
    ...documento
  };
}
const itemSchema = itemBaseSchema.transform(
  normalizarItem
);
function validarUnicos(items, contexto) {
  const asientos = items.map(
    item => item.asientoId
  );
  const documentos = items.map(
    item =>
      `${item.tipoDocumento}:${item.numeroDocumento}`
  );
  if (
    new Set(asientos).size !== asientos.length
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'No se permiten asientos repetidos.'
    });
  }
  if (
    new Set(documentos).size !== documentos.length
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'No se permiten documentos repetidos.'
    });
  }
}
const reservaSchema = z.object({
  viajeId: z.number()
    .int()
    .positive()
    .safe(),
  politicaIds: z.array(
    z.number().int().positive()
  ).length(5),
  aceptacionConfirmada: z.literal(true),
  items: z.array(itemSchema)
    .min(1)
    .max(200)
}).superRefine((datos, contexto) => {
  validarUnicos(datos.items, contexto);
});
const edicionSchema = z.object({
  items: z.array(
    itemBaseSchema.extend({
      reservaAsientoId: z.number()
        .int()
        .positive()
        .safe()
    })
  ).min(1).max(200)
}).superRefine((datos, contexto) => {
  try {
    validarUnicos(
      datos.items.map(normalizarItem),
      contexto
    );
  } catch (error) {
    contexto.addIssue({
      code: 'custom',
      message: error.message
    });
  }
  const ids = datos.items.map(
    item => item.reservaAsientoId
  );
  if (new Set(ids).size !== ids.length) {
    contexto.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'El detalle de reserva está duplicado.'
    });
  }
});
const reprogramacionSchema = z.object({
  viajeNuevoId: z.number()
    .int()
    .positive()
    .safe(),
  items: z.array(
    z.object({
      reservaAsientoId: z.number()
        .int()
        .positive()
        .safe(),
      asientoId: z.number()
        .int()
        .positive()
        .max(2147483647)
    }).strict()
  ).min(1).max(200)
}).strict().superRefine((datos, contexto) => {
  for (const campo of [
    'reservaAsientoId',
    'asientoId'
  ]) {
    const valores = datos.items.map(
      item => item[campo]
    );
    if (
      new Set(valores).size !== valores.length
    ) {
      contexto.addIssue({
        code: 'custom',
        path: ['items'],
        message: `No se permiten ${campo} repetidos.`
      });
    }
  }
});
function validarEsquema(esquema, body) {
  const resultado = esquema.safeParse(body);
  if (!resultado.success) {
    throw errorHttp(
      resultado.error.issues[0]?.message ||
      'La información enviada es inválida.'
    );
  }
  if (esquema === edicionSchema) {
    return {
      ...resultado.data,
      items: resultado.data.items.map(
        normalizarItem
      )
    };
  }
  return resultado.data;
}


// =====================================================
// REGLAS COMPARTIDAS
// =====================================================
const TIPOS_OBLIGATORIOS = ['RESERVA', 'CANCELACION', 'REPROGRAMACION', 'CONTRATACION', 'PRIVACIDAD'];
const ESTADOS_MODIFICABLES = ['COMPLETADA', 'CONFIRMADA', 'REPROGRAMADA'];
export const ROLES_QUE_RESERVAN = ['CLIENTE', 'ADMINISTRADOR', 'VENTAS'];

// Ejecuta un caso de uso en transacción SERIALIZABLE.
// Registra el error y traduce violaciones de unicidad / FK a 409.
async function enTransaccionReserva(operacion, nombre) {
  try {
    return await repo.enTransaccion(operacion, repo.NIVEL.SERIALIZABLE);
  } catch (error) {
    const numero = error.number ?? error.originalError?.info?.number;
    console.error(`ERROR AL ${nombre}:`, { mensaje: error.message, numero });
    if (numero === 2601 || numero === 2627) {
      throw errorHttp('Existe un documento, asiento o pasajero duplicado.', 409);
    }
    if (numero === 547) {
      throw errorHttp('La operación incumple una restricción de SQL Server.', 409);
    }
    throw error;
  }
}

// Una política activa y vigente por cada tipo obligatorio.
async function obtenerPoliticasObligatorias(tx = null) {
  const registros = await repo.listarPoliticasObligatoriasVigentes(tx);
  const politicas = TIPOS_OBLIGATORIOS.map(tipo => registros.find(p => p.Tipo === tipo));
  if (politicas.some(p => !p)) {
    throw errorHttp('Faltan políticas obligatorias activas y vigentes.', 409);
  }
  return politicas;
}

async function comprobarAsientos(tx, viajeId, busId, asientoIds, excluirReservaId = null) {
  if ((await repo.contarAsientosDelBus(tx, busId, asientoIds)) !== asientoIds.length) {
    throw errorHttp('Uno o más asientos no pertenecen al bus.');
  }
  if ((await repo.listarAsientosOcupados(tx, viajeId, asientoIds, excluirReservaId)).length) {
    throw errorHttp('Uno o más asientos ya están reservados.', 409);
  }
}

async function comprobarPasajeros(tx, viajeId, pasajeroIds, excluirReservaId = null) {
  if (new Set(pasajeroIds.map(Number)).size !== pasajeroIds.length) {
    throw errorHttp('Un pasajero no puede ocupar dos asientos.', 409);
  }
  if ((await repo.listarPasajerosConAsiento(tx, viajeId, pasajeroIds, excluirReservaId)).length) {
    throw errorHttp('Un pasajero ya tiene un asiento en este viaje.', 409);
  }
}

// Recupera un pasajero existente (debe estar ACTIVO) o registra uno nuevo.
async function obtenerORegistrarPasajero(tx, item) {
  const pasajero = await repo.buscarPasajeroBloqueado(tx, item.tipoDocumento, item.numeroDocumento);
  if (pasajero) {
    if (pasajero.Estado !== 'ACTIVO') {
      throw errorHttp('El pasajero consultado está INACTIVO.', 409);
    }
    return pasajero.PasajeroID;
  }
  if (!item.fechaNacimiento) {
    throw errorHttp('Ingresa la fecha de nacimiento del pasajero nuevo.');
  }
  return repo.insertarPasajero(tx, item);
}

// =====================================================
// CASOS DE USO
// =====================================================
export const politicasVigentes = () => obtenerPoliticasObligatorias();

export async function crearReserva(body, usuario) {
  const rol = String(usuario?.Rol || '').toUpperCase();
  if (!ROLES_QUE_RESERVAN.includes(rol)) {
    throw errorHttp('Tu cuenta no puede crear reservas.', 403);
  }
  const datos = validarEsquema(reservaSchema, body);

  return enTransaccionReserva(async tx => {
    // Las políticas aceptadas deben coincidir con las vigentes.
    const politicas = await obtenerPoliticasObligatorias(tx);
    const solicitadas = [...new Set(datos.politicaIds)].sort((a, b) => a - b);
    const esperadas = politicas.map(p => Number(p.PoliticaID)).sort((a, b) => a - b);
    if (solicitadas.length !== esperadas.length ||
        solicitadas.some((id, i) => id !== esperadas[i])) {
      throw errorHttp('Las políticas cambiaron. Revísalas y confirma nuevamente.', 409);
    }

    const viaje = await repo.obtenerViajeBloqueado(tx, datos.viajeId);
    if (!viaje) throw errorHttp('Viaje no encontrado.', 404);
    if (viaje.Estado !== 'PROGRAMADO') throw errorHttp('El viaje no admite nuevas reservas.', 409);
    if (!(await repo.salidaEsFutura(tx, datos.viajeId))) {
      throw errorHttp('La fecha de salida del viaje ya venció.', 409);
    }

    await comprobarAsientos(tx, datos.viajeId, viaje.BusID, datos.items.map(i => i.asientoId));

    const resueltos = [];
    for (const item of datos.items) {
      resueltos.push({ asientoId: item.asientoId, pasajeroId: await obtenerORegistrarPasajero(tx, item) });
    }
    await comprobarPasajeros(tx, datos.viajeId, resueltos.map(i => i.pasajeroId));

    // Importe = tarifa del viaje × cantidad de asientos.
    const precio = Number(viaje.Tarifa);
    const total = Number((precio * resueltos.length).toFixed(2));
    if (!Number.isFinite(precio) || precio < 0 || !Number.isFinite(total) ||
        total < 0 || total > 9999999999.99) {
      throw errorHttp('El importe total de la reserva es inválido.');
    }

    const politicaReserva = politicas.find(p => p.Tipo === 'RESERVA');
    const reservaId = await repo.insertarReserva(tx, {
      usuarioId: usuario.UsuarioID, viajeId: datos.viajeId, estado: 'COMPLETADA',
      total, politicaId: politicaReserva.PoliticaID
    });

    for (const item of resueltos) {
      await repo.insertarReservaAsiento(tx, {
        reservaId, viajeId: datos.viajeId, busId: viaje.BusID,
        asientoId: item.asientoId, pasajeroId: item.pasajeroId, precio, estado: 'ACTIVA'
      });
    }

    const codigo = await repo.obtenerCodigo(tx, reservaId);
    if (!codigo) throw new Error('No se pudo recuperar el código de reserva.');

    await repo.registrarHistorial(tx, {
      reservaId, usuarioResponsableId: usuario.UsuarioID, accion: 'CREACION',
      viajeAnteriorId: null, viajeNuevoId: datos.viajeId,
      detalle: `Reserva ${codigo} creada con ${resueltos.length} asiento(s).`
    });

    for (const politica of politicas) {
      await repo.registrarAceptacion(tx, reservaId, usuario.UsuarioID, politica);
    }

    return {
      ReservaID: reservaId,
      Codigo: codigo,
      Total: total,
      CantidadAsientos: resueltos.length,
      PoliticaID: politicaReserva.PoliticaID,
      TotalAceptaciones: politicas.length,
      mensaje: 'Reserva registrada correctamente.'
    };
  }, 'REGISTRAR RESERVA');
}

export const catalogos = () => repo.listarCatalogos();

export async function asientosDeViaje(viajeIdRaw) {
  const viajeId = obtenerId(viajeIdRaw);
  const viaje = await repo.obtenerViajeConBus(viajeId);
  if (!viaje) throw errorHttp('Viaje no encontrado.', 404);
  return { viaje, asientos: await repo.listarAsientosDeViaje(viajeId, viaje.BusID) };
}

export function listar(q) {
  return repo.listar(String(q || '').trim().slice(0, 100));
}

export async function historial(idRaw) {
  const reservaId = obtenerId(idRaw);
  const reserva = await repo.obtenerResumenReserva(reservaId);
  if (!reserva) throw errorHttp('Reserva no encontrada.', 404);
  const movimientos = (await repo.listarHistorial(reservaId)).map(m => ({
    ReservaID: m.ReservaID,
    Accion: m.Accion,
    FechaCambio: m.FechaCambio,
    ViajeAnteriorID: m.ViajeAnteriorID,
    ViajeNuevoID: m.ViajeNuevoID,
    Detalle: m.Detalle,
    UsuarioResponsableID: m.UsuarioResponsableID,
    Responsable: [m.ResponsableNombres, m.ResponsableApellidos].filter(Boolean).join(' ') ||
      `Usuario ${m.UsuarioResponsableID}`
  }));
  return {
    ReservaID: reserva.ReservaID,
    Codigo: reserva.Codigo,
    Estado: reserva.Estado,
    TotalMovimientos: movimientos.length,
    historial: movimientos
  };
}

export async function detalle(idRaw) {
  const id = obtenerId(idRaw);
  const reserva = await repo.obtenerCabecera(id);
  if (!reserva) throw errorHttp('Reserva no encontrada.', 404);
  return { ...reserva, items: await repo.listarItems(id) };
}

export async function cancelar(idRaw, usuario) {
  const id = obtenerId(idRaw);

  return enTransaccionReserva(async tx => {
    const reserva = await repo.obtenerReservaBloqueada(tx, id);
    if (!reserva) throw errorHttp('Reserva no encontrada.', 404);
    if (reserva.Estado === 'CANCELADA') throw errorHttp('Esta reserva ya está cancelada.', 409);
    if (!ESTADOS_MODIFICABLES.includes(reserva.Estado)) {
      throw errorHttp('El estado no permite cancelar esta reserva.', 409);
    }
    // Cancelación ordinaria solo antes de la salida.
    if (reserva.EstadoViaje !== 'PROGRAMADO' || Number(reserva.SalidaFutura) !== 1) {
      throw errorHttp('El viaje ya salió o no está programado. Requiere revisión administrativa.', 409);
    }

    const ventas = await repo.listarVentasConPagosBloqueadas(tx, id);
    if (ventas.some(f => f.EstadoVenta !== 'ANULADA')) {
      throw errorHttp('La reserva tiene una venta vigente. Anúlala primero desde Ventas.', 409);
    }
    if (ventas.some(f => f.PagoID == null || f.EstadoPago !== 'ANULADO' || Number(f.EsSimulado) !== 1)) {
      throw errorHttp('La venta anulada tiene pagos pendientes o inconsistentes.', 409);
    }

    await repo.listarAsignacionesBloqueadas(tx, id); // bloquea los asientos
    const liberados = await repo.liberarAsientos(tx, id);
    if ((await repo.marcarCancelada(tx, id)) !== 1) {
      throw errorHttp('No se pudo cancelar la reserva.', 409);
    }

    await repo.registrarHistorial(tx, {
      reservaId: id, usuarioResponsableId: usuario.UsuarioID, accion: 'CANCELACION',
      viajeAnteriorId: reserva.ViajeID, viajeNuevoId: null,
      detalle: `Reserva ${id} cancelada; ${liberados} asiento(s) liberado(s).`
    });

    return {
      ReservaID: id,
      Estado: 'CANCELADA',
      AsientosLiberados: liberados,
      mensaje: 'Reserva cancelada correctamente.'
    };
  }, 'CANCELAR RESERVA');
}

export async function editar(idRaw, body) {
  const id = obtenerId(idRaw);
  const datos = validarEsquema(edicionSchema, body);

  return enTransaccionReserva(async tx => {
    const reserva = await repo.obtenerReservaBloqueada(tx, id);
    if (!reserva) throw errorHttp('Reserva no encontrada.', 404);
    if (!ESTADOS_MODIFICABLES.includes(reserva.Estado)) {
      throw errorHttp('La reserva no admite edición.', 409);
    }
    if (reserva.EstadoViaje !== 'PROGRAMADO') throw errorHttp('El viaje no admite modificaciones.', 409);
    if (Number(reserva.SalidaFutura) !== 1) throw errorHttp('La fecha de salida del viaje ya venció.', 409);
    if (await repo.tieneVentaBloqueada(tx, id)) {
      throw errorHttp('Esta reserva tiene una venta asociada.', 409);
    }

    const activos = (await repo.listarAsignacionesBloqueadas(tx, id)).filter(i => i.Estado === 'ACTIVA');
    if (activos.length !== datos.items.length) {
      throw errorHttp('Debe conservarse la cantidad original de asientos.', 409);
    }
    const originales = new Map(activos.map(i => [Number(i.ReservaAsientoID), i]));
    if (datos.items.some(i => !originales.has(i.reservaAsientoId))) {
      throw errorHttp('Un detalle no pertenece a esta reserva.', 409);
    }
    // Evitar intercambios entre asientos ocupados por la misma reserva.
    for (const item of datos.items) {
      const propio = originales.get(item.reservaAsientoId);
      if (Number(propio.AsientoID) !== item.asientoId &&
          activos.some(o => Number(o.AsientoID) === item.asientoId)) {
        throw errorHttp('Selecciona un asiento libre.', 409);
      }
    }

    await comprobarAsientos(tx, reserva.ViajeID, reserva.BusID, datos.items.map(i => i.asientoId), id);

    const resueltos = [];
    for (const item of datos.items) {
      resueltos.push({ ...item, pasajeroId: await obtenerORegistrarPasajero(tx, item) });
    }
    await comprobarPasajeros(tx, reserva.ViajeID, resueltos.map(i => i.pasajeroId), id);

    for (const item of resueltos) {
      const filas = await repo.actualizarAsignacion(tx, {
        reservaAsientoId: item.reservaAsientoId, reservaId: id,
        asientoId: item.asientoId, pasajeroId: item.pasajeroId
      });
      if (filas !== 1) throw errorHttp('No se pudo actualizar un asiento.', 409);
    }

    return { ReservaID: id, mensaje: 'Reserva actualizada correctamente.' };
  }, 'EDITAR RESERVA');
}

export async function reprogramar(idRaw, body, usuario) {
  const reservaId = obtenerId(idRaw);
  const datos = validarEsquema(reprogramacionSchema, body);

  return enTransaccionReserva(async tx => {
    const actual = await repo.obtenerReservaBloqueada(tx, reservaId);
    if (!actual) throw errorHttp('Reserva no encontrada.', 404);
    if (!ESTADOS_MODIFICABLES.includes(actual.Estado)) {
      throw errorHttp('La reserva no admite reprogramación.', 409);
    }
    if (Number(actual.ViajeID) === datos.viajeNuevoId) {
      throw errorHttp('Selecciona un viaje diferente.', 409);
    }
    if (actual.EstadoViaje !== 'PROGRAMADO' || Number(actual.SalidaFutura) !== 1) {
      throw errorHttp('El viaje original debe tener salida futura.', 409);
    }
    if (await repo.tieneVentaBloqueada(tx, reservaId)) {
      throw errorHttp('La reserva tiene una venta asociada.', 409);
    }

    const destino = await repo.obtenerViajeBloqueado(tx, datos.viajeNuevoId);
    if (!destino) throw errorHttp('Viaje destino no encontrado.', 404);
    if (destino.Estado !== 'PROGRAMADO' || Number(destino.SalidaFutura) !== 1) {
      throw errorHttp('El viaje destino no está disponible.', 409);
    }
    if (Number(destino.RutaID) !== Number(actual.RutaID)) {
      throw errorHttp('La reprogramación requiere la misma ruta.', 409);
    }
    if (Math.round(Number(destino.Tarifa) * 100) !== Math.round(Number(actual.Tarifa) * 100)) {
      throw errorHttp('La tarifa del viaje debe ser igual.', 409);
    }

    const activos = (await repo.listarAsignacionesBloqueadas(tx, reservaId)).filter(i => i.Estado === 'ACTIVA');
    if (!activos.length || activos.length !== datos.items.length) {
      throw errorHttp('La cantidad de asientos no coincide.', 409);
    }
    const mapa = new Map(activos.map(i => [Number(i.ReservaAsientoID), i]));
    if (datos.items.some(i => !mapa.has(i.reservaAsientoId))) {
      throw errorHttp('Un detalle no pertenece a la reserva.', 409);
    }

    await comprobarAsientos(tx, datos.viajeNuevoId, destino.BusID, datos.items.map(i => i.asientoId));
    await comprobarPasajeros(tx, datos.viajeNuevoId, activos.map(i => i.PasajeroID));

    // Evitar eliminar asientos con referencias en otras tablas.
    if ((await repo.contarReferenciasAReservaAsiento(tx)) > 0) {
      throw errorHttp('Existen referencias a ReservaAsiento. Se requiere revisar sus vínculos.', 409);
    }
    if ((await repo.eliminarAsignacionesActivas(tx, reservaId)) !== activos.length) {
      throw errorHttp('No se pudieron trasladar todos los asientos.', 409);
    }
    if ((await repo.cambiarViaje(tx, reservaId, datos.viajeNuevoId)) !== 1) {
      throw errorHttp('No se pudo actualizar el viaje de la reserva.', 409);
    }

    // Nuevas asignaciones conservando los pasajeros.
    for (const item of datos.items) {
      await repo.insertarReservaAsiento(tx, {
        reservaId, viajeId: datos.viajeNuevoId, busId: destino.BusID,
        asientoId: item.asientoId, pasajeroId: mapa.get(item.reservaAsientoId).PasajeroID,
        precio: Number(destino.Tarifa), estado: 'ACTIVA'
      });
    }

    await repo.registrarHistorial(tx, {
      reservaId, usuarioResponsableId: usuario.UsuarioID, accion: 'REPROGRAMACION',
      viajeAnteriorId: actual.ViajeID, viajeNuevoId: datos.viajeNuevoId,
      detalle: `Reserva ${actual.Codigo} reprogramada del viaje ${actual.ViajeID} al ` +
        `${datos.viajeNuevoId}; ${activos.length} asiento(s).`
    });

    return {
      ReservaID: reservaId,
      Codigo: actual.Codigo,
      ViajeAnteriorID: actual.ViajeID,
      ViajeNuevoID: datos.viajeNuevoId,
      Estado: 'REPROGRAMADA',
      CantidadAsientos: activos.length,
      mensaje: 'Reserva reprogramada correctamente.'
    };
  }, 'REPROGRAMAR RESERVA');
}
