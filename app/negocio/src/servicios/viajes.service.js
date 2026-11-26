// SIGET-VÍA — CAPA NEGOCIO — VIAJES (RF7)
// Validaciones, estados, reglas de disponibilidad y coordinación transaccional.
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/viajes.repository.js';

const ESTADOS = [
  'PROGRAMADO',
  'EN_CURSO',
  'FINALIZADO',
  'CANCELADO'
];

const TRANSICIONES = {
  PROGRAMADO: ['EN_CURSO', 'CANCELADO'],
  EN_CURSO: ['PROGRAMADO', 'FINALIZADO'],
  FINALIZADO: [],
  CANCELADO: []
};

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), {
    statusCode
  });
}

const idSchema = z.coerce.number()
  .int()
  .positive()
  .safe();

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) {
    throw errorHttp('Identificador de viaje inválido.');
  }
  return resultado.data;
}

// =====================================================
// VALIDACIONES DE FECHAS
// =====================================================

function fechaHoraValida(valor) {
  if (
    typeof valor !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)
  ) {
    return false;
  }

  const fecha = new Date(`${valor}:00Z`);

  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 16) === valor
  );
}

const fechaSchema = z.string().refine(
  fechaHoraValida,
  'La fecha debe tener el formato AAAA-MM-DDTHH:mm y ser válida.'
);

const viajeSchema = z.object({
  rutaId: z.number().int().positive(),
  busId: z.number().int().positive(),
  conductorId: z.number().int().positive(),

  salida: fechaSchema,
  llegadaEstimada: fechaSchema,

  tarifa: z.number()
    .finite()
    .min(0)
    .max(9999999999.99)
    .refine(
      n =>
        Math.abs(
          n * 100 - Math.round(n * 100)
        ) < 0.00001,
      'La tarifa admite como máximo dos decimales.'
    ),

  estado: z.enum(ESTADOS)
}).refine(
  datos => datos.llegadaEstimada > datos.salida,
  {
    path: ['llegadaEstimada'],
    message:
      'La llegada estimada debe ser posterior a la salida.'
  }
);

function validarViaje(body) {
  const resultado = viajeSchema.safeParse(body);

  if (!resultado.success) {
    throw errorHttp(
      resultado.error.issues[0]?.message ||
      'Los datos del viaje son inválidos.'
    );
  }

  return resultado.data;
}

// =====================================================
// MANEJO DE FECHAS — HORARIO DE PERÚ
// =====================================================

function fechaAlmacenada(valor) {
  if (valor instanceof Date) {
    return valor.toISOString().slice(0, 19);
  }

  return String(valor)
    .replace(' ', 'T')
    .replace(/Z$/, '')
    .slice(0, 19);
}

function ahoraPeru() {
  const partes = new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }
  ).formatToParts(new Date());

  const valores = Object.fromEntries(
    partes.map(parte => [
      parte.type,
      parte.value
    ])
  );

  return (
    `${valores.year}-${valores.month}-${valores.day}T` +
    `${valores.hour}:${valores.minute}:${valores.second}`
  );
}

function salidaFutura(salida) {
  return fechaAlmacenada(salida) > ahoraPeru();
}

function sumarMinutos(fecha, minutos) {
  const valor = fechaAlmacenada(fecha);
  const instante = new Date(`${valor}Z`);

  if (Number.isNaN(instante.getTime())) {
    throw errorHttp(
      'La fecha del viaje es inválida.',
      409
    );
  }

  return new Date(
    instante.getTime() + minutos * 60000
  ).toISOString().slice(0, 19);
}

// =====================================================
// VALIDAR RUTA, BUS Y CONDUCTOR
// =====================================================

async function validarReferencias(tx, datos) {
  const referencias = await repo.consultarReferencias(tx, datos);

  if (!referencias) {
    throw errorHttp(
      'No se pudieron comprobar los catálogos.'
    );
  }

  if (referencias.EstadoRuta == null) {
    throw errorHttp(
      'La ruta seleccionada no existe.'
    );
  }

  if (referencias.EstadoBus == null) {
    throw errorHttp(
      'El bus seleccionado no existe.'
    );
  }

  if (referencias.EstadoConductor == null) {
    throw errorHttp(
      'El conductor seleccionado no existe.'
    );
  }

  if (referencias.EstadoRuta !== 'ACTIVA') {
    throw errorHttp(
      'La ruta debe estar ACTIVA.',
      409
    );
  }

  if (referencias.EstadoBus !== 'OPERATIVO') {
    throw errorHttp(
      'El bus debe estar OPERATIVO.',
      409
    );
  }

  if (referencias.EstadoConductor !== 'ACTIVO') {
    throw errorHttp(
      'El conductor debe estar ACTIVO.',
      409
    );
  }

  // CU009 — 15a: la licencia debe estar vigente el día de la salida.
  const vence = referencias.VenceLicencia;
  if (vence && vence < String(datos.salida).slice(0, 10)) {
    throw errorHttp(
      `La licencia del conductor venció o vence el ${vence.split('-').reverse().join('/')}, ` +
      'antes de la salida del viaje. Actualiza su habilitación o elige otro conductor.',
      409
    );
  }
}

// =====================================================
// VALIDAR CRUCES DE HORARIOS
// =====================================================

async function validarDisponibilidad(
  tx,
  datos,
  excluirId = null
) {
  if (
    datos.estado === 'CANCELADO' ||
    datos.estado === 'FINALIZADO'
  ) {
    return;
  }

  const conflicto = await repo.buscarCruceHorario(tx, datos, excluirId);

  if (conflicto) {

    const recurso =
      Number(conflicto.BusID) === datos.busId
        ? 'bus'
        : 'conductor';

    throw errorHttp(
      `El ${recurso} ya está asignado al viaje ` +
      `#${conflicto.ViajeID} en ese horario.`,
      409
    );
  }
}

// =====================================================
// CONSULTAR VIAJE CON BLOQUEO
// =====================================================

async function obtenerViajeBloqueado(tx, id) {
  const viaje = await repo.buscarViajeBloqueado(tx, id);

  if (!viaje) {
    throw errorHttp(
      'Viaje no encontrado.',
      404
    );
  }

  return viaje;
}

// =====================================================
// CONTAR RESERVAS VIGENTES
// =====================================================

async function contarReservasVigentes(
  tx,
  viajeId
) {
  return repo.contarReservas(tx, viajeId);
}

async function verificarCancelacion(
  tx,
  viajeId
) {
  const cantidad =
    await contarReservasVigentes(
      tx,
      viajeId
    );

  if (cantidad > 0) {
    throw errorHttp(
      'Este viaje tiene reservas vigentes. ' +
      'Primero debes gestionar las reservas ' +
      'antes de cancelar el viaje.',
      409
    );
  }
}

// =====================================================
// VALIDAR CAMBIO DE ESTADO
// =====================================================

function validarTransicion(
  viaje,
  nuevoEstado
) {
  const estadoActual = viaje.Estado;

  const permitidos =
    TRANSICIONES[estadoActual] || [];

  if (!permitidos.includes(nuevoEstado)) {
    throw errorHttp(
      `No se permite cambiar el viaje de ` +
      `${estadoActual} a ${nuevoEstado}.`,
      409
    );
  }

  const ahora = ahoraPeru();

  const salida =
    fechaAlmacenada(viaje.Salida);

  // Regresar a PROGRAMADO
  if (
    estadoActual === 'EN_CURSO' &&
    nuevoEstado === 'PROGRAMADO'
  ) {
    if (ahora >= salida) {
      throw errorHttp(
        'No puedes regresar a PROGRAMADO porque ' +
        'ya llegó la fecha y hora de salida.',
        409
      );
    }
  }

  // Finalizar después de la llegada + 15 min
  if (nuevoEstado === 'FINALIZADO') {
    const limite = sumarMinutos(
      viaje.LlegadaEstimada,
      15
    );

    if (ahora < limite) {
      const fecha = limite.slice(0, 10);
      const hora = limite.slice(11, 16);

      throw errorHttp(
        'Todavía no puedes finalizar el viaje. ' +
        'El estado FINALIZADO estará disponible ' +
        `desde ${fecha} a las ${hora}, ` +
        '15 minutos después de la llegada estimada.',
        409
      );
    }
  }

  // Cancelar antes de la salida
  if (nuevoEstado === 'CANCELADO') {
    if (ahora >= salida) {
      throw errorHttp(
        'No se permite cancelar el viaje ' +
        'después de la hora de salida.',
        409
      );
    }
  }

  // EN_CURSO se inicia manualmente.
}


// =====================================================
// OPERACIONES DEL SERVICIO — SIN SQL EMBEBIDO
// =====================================================

export async function catalogos() {
  return repo.consultarCatalogos();
}

export async function listar(q) {
  return repo.listarViajes(String(q || '').trim().slice(0, 100));
}

export async function detalle(valorId) {
  const id = obtenerId(valorId);
  const viaje = await repo.consultarViaje(id);
  if (!viaje) throw errorHttp('Viaje no encontrado.', 404);
  return viaje;
}

export async function crear(body) {
  const datos = validarViaje(body);
  if (datos.estado !== 'PROGRAMADO') {
    throw errorHttp('Todo viaje nuevo debe registrarse en estado PROGRAMADO.');
  }
  if (datos.salida + ':00' <= ahoraPeru()) {
    throw errorHttp('La salida del nuevo viaje debe ser futura.');
  }
  const id = await repo.enTransaccion(async tx => {
    await validarReferencias(tx, datos);
    await validarDisponibilidad(tx, datos);
    return repo.insertarViaje(tx, datos);
  });
  return { ViajeID: id, mensaje: 'Viaje programado correctamente.' };
}

export async function editar(valorId, body) {
  const id = obtenerId(valorId);
  const datos = validarViaje(body);
  return repo.enTransaccion(async tx => {
    const actual = await obtenerViajeBloqueado(tx, id);
    if (actual.Estado === 'FINALIZADO' || actual.Estado === 'CANCELADO') {
      throw errorHttp('No se puede editar un viaje finalizado o cancelado.', 409);
    }
    if (!salidaFutura(actual.Salida)) {
      throw errorHttp('La fecha y hora de salida ya llegó. No se pueden modificar los datos programados del viaje.', 409);
    }
    if (datos.estado !== actual.Estado) {
      throw errorHttp('Para modificar el estado utiliza el botón Cambiar estado.', 409);
    }
    if (datos.salida + ':00' <= ahoraPeru()) {
      throw errorHttp('La nueva fecha de salida debe ser futura.');
    }
    const reservas = await contarReservasVigentes(tx, id);
    if (reservas > 0) {
      const cambioRuta = Number(actual.RutaID) !== datos.rutaId;
      const cambioBus = Number(actual.BusID) !== datos.busId;
      const cambioTarifa = Math.abs(Number(actual.Tarifa) - datos.tarifa) > 0.001;
      if (cambioRuta || cambioBus || cambioTarifa) {
        throw errorHttp('El viaje tiene reservas vigentes. No se puede cambiar ruta, bus ni tarifa.', 409);
      }
    }
    await validarReferencias(tx, datos);
    await validarDisponibilidad(tx, datos, id);
    await repo.actualizarViaje(tx, id, datos);
    return { ViajeID: id, Estado: actual.Estado, mensaje: 'Datos del viaje actualizados correctamente.' };
  });
}

export async function cambiarEstado(valorId, body, usuarioId) {
  const id = obtenerId(valorId);
  const validacion = z.object({ estado: z.enum(ESTADOS) }).safeParse(body);
  if (!validacion.success) throw errorHttp('El estado enviado no es válido.');
  const nuevoEstado = validacion.data.estado;
  return repo.enTransaccion(async tx => {
    const viaje = await obtenerViajeBloqueado(tx, id);
    validarTransicion(viaje, nuevoEstado);
    if (nuevoEstado === 'CANCELADO') {
      await verificarCancelacion(tx, id);
    }
    if (nuevoEstado === 'EN_CURSO') {
      const datos = {
        rutaId: Number(viaje.RutaID),
        busId: Number(viaje.BusID),
        conductorId: Number(viaje.ConductorID),
        salida: fechaAlmacenada(viaje.Salida).slice(0, 16),
        llegadaEstimada: fechaAlmacenada(viaje.LlegadaEstimada).slice(0, 16),
        estado: 'EN_CURSO'
      };
      await validarReferencias(tx, datos);
      await validarDisponibilidad(tx, datos, id);
    }
    const filas = await repo.actualizarEstado(tx, id, nuevoEstado, viaje.Estado);
    if (filas !== 1) {
      throw errorHttp('El estado del viaje cambió durante la operación. Actualiza el listado.', 409);
    }
    await repo.auditarEstado(tx, usuarioId, id, viaje.Estado, nuevoEstado);
    return { ViajeID: id, Estado: nuevoEstado, mensaje: `El viaje cambió correctamente a ${nuevoEstado}.` };
  });
}
