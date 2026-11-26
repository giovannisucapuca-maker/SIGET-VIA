import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/rutas.repository.js';

function limpiarTexto(valor) {
  return valor.trim().replace(/\s+/g, ' ');
}
function normalizarCiudad(valor) {
  return limpiarTexto(valor).toLocaleUpperCase('es-PE');
}
function compararCiudad(valor) {
  return normalizarCiudad(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), { statusCode });
}
export const estadoSchema = z.enum(['ACTIVA', 'INACTIVA']);
const ciudadSchema = z.string().trim().transform(normalizarCiudad).pipe(
  z.string().min(2, 'La ciudad debe tener al menos 2 caracteres.')
    .max(120, 'La ciudad no puede superar 120 caracteres.')
    .regex(/^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 .,'’()/-]*$/u,
      'El nombre de la ciudad contiene caracteres no permitidos.')
);
const rutaSchema = z.object({
  origen: ciudadSchema,
  destino: ciudadSchema,
  distanciaKm: z.number().positive('La distancia debe ser mayor que cero.')
    .max(99999999, 'La distancia supera el límite permitido.').nullable(),
  // Terminales terrestres de embarque y llegada (opcionales).
  terminalOrigenId: z.number().int().positive().nullable().optional().transform(v => v ?? null),
  terminalDestinoId: z.number().int().positive().nullable().optional().transform(v => v ?? null),
  estado: estadoSchema
}).superRefine((datos, ctx) => {
  if (compararCiudad(datos.origen) === compararCiudad(datos.destino)) {
    ctx.addIssue({ code: 'custom', path: ['destino'], message: 'El origen y el destino deben ser diferentes.' });
  }
  if (datos.distanciaKm !== null &&
      Math.abs(datos.distanciaKm * 100 - Math.round(datos.distanciaKm * 100)) > 0.00001) {
    ctx.addIssue({ code: 'custom', path: ['distanciaKm'],
      message: 'La distancia debe tener como máximo dos decimales.' });
  }
});
const idSchema = z.coerce.number().int().positive().max(2147483647);

export function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) throw errorHttp('El identificador de la ruta es inválido.');
  return resultado.data;
}
export function validarDatos(body) {
  const resultado = rutaSchema.safeParse(body);
  if (!resultado.success) {
    throw errorHttp(resultado.error.issues[0]?.message || 'Los datos de la ruta son inválidos.');
  }
  return resultado.data;
}
function duplicada(registros, datos) {
  return registros.find(r =>
    compararCiudad(r.Origen) === compararCiudad(datos.origen) &&
    compararCiudad(r.Destino) === compararCiudad(datos.destino)) || null;
}
// Cada terminal debe existir, estar ACTIVO (o ser el que ya tenía la ruta)
// y pertenecer a la ciudad de origen o destino correspondiente.
async function validarTerminales(tx, datos, actual = null) {
  const terminales = await repo.obtenerTerminales(tx, [datos.terminalOrigenId, datos.terminalDestinoId]);
  const revisar = (id, ciudad, campo, anterior) => {
    if (!id) return;
    const t = terminales.find(x => Number(x.TerminalID) === id);
    if (!t) throw errorHttp(`El terminal de ${campo} no existe.`);
    if (t.Estado !== 'ACTIVO' && Number(anterior) !== id) {
      throw errorHttp(`El terminal de ${campo} está INACTIVO.`, 409);
    }
    if (compararCiudad(t.Ciudad) !== compararCiudad(ciudad)) {
      throw errorHttp(`El terminal de ${campo} (${t.Nombre}) no está en ${ciudad}.`);
    }
  };
  revisar(datos.terminalOrigenId, datos.origen, 'origen', actual?.TerminalOrigenID);
  revisar(datos.terminalDestinoId, datos.destino, 'destino', actual?.TerminalDestinoID);
}

export async function listarRutas(q) {
  return repo.listar(String(q || '').trim().slice(0, 120));
}
export async function detalleRuta(idRaw) {
  const id = obtenerId(idRaw);
  const ruta = await repo.detalle(id);
  if (!ruta) throw errorHttp('Ruta no encontrada.', 404);
  return ruta;
}
export async function crearRuta(body) {
  const datos = validarDatos(body);
  return repo.enTransaccion(async tx => {
    const existentes = await repo.buscarDuplicadosBloqueados(tx, null);
    if (duplicada(existentes, datos)) {
      throw errorHttp('Ya existe una ruta registrada con ese origen y destino.', 409);
    }
    await validarTerminales(tx, datos);
    return {
      RutaID: await repo.insertar(tx, datos),
      mensaje: 'Ruta registrada correctamente.'
    };
  });
}
export async function editarRuta(idRaw, body) {
  const id = obtenerId(idRaw);
  const datos = validarDatos(body);
  return repo.enTransaccion(async tx => {
    const actual = await repo.detalleBloqueado(tx, id);
    if (!actual) throw errorHttp('Ruta no encontrada.', 404);
    const existentes = await repo.buscarDuplicadosBloqueados(tx, id);
    if (duplicada(existentes, datos)) {
      throw errorHttp('Otra ruta ya tiene ese origen y destino.', 409);
    }
    await validarTerminales(tx, datos, actual);
    const afectadas = await repo.actualizar(tx, id, datos);
    if (!afectadas) throw errorHttp('Ruta no encontrada.', 404);
    return { RutaID: id, mensaje: 'Ruta actualizada correctamente.' };
  });
}
export async function cambiarEstadoRuta(idRaw, body) {
  const id = obtenerId(idRaw);
  const validacion = z.object({ estado: estadoSchema }).safeParse(body);
  if (!validacion.success) {
    throw errorHttp('El estado debe ser ACTIVA o INACTIVA.');
  }
  const estado = validacion.data.estado;
  // CU006 — 3b: no desactivar una ruta con viajes programados pendientes.
  if (estado === 'INACTIVA') {
    const pendientes = await repo.contarViajesProgramados(id);
    if (pendientes > 0) {
      throw errorHttp(
        `No se puede desactivar: la ruta tiene ${pendientes} viaje(s) programado(s). ` +
        'Cancélalos o reprográmalos primero.', 409);
    }
  }
  const afectadas = await repo.cambiarEstado(id, estado);
  if (!afectadas) throw errorHttp('Ruta no encontrada.', 404);
  return { RutaID: id, Estado: estado, mensaje: 'Estado de la ruta actualizado correctamente.' };
}
