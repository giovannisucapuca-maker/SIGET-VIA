import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/conductores.repository.js';

function limpiarTexto(valor) {
  return valor.trim().replace(/\s+/g, ' ');
}
function normalizarCodigo(valor) {
  return valor.trim().toUpperCase().replace(/\s+/g, '');
}
function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), { statusCode });
}
function validarDocumento(tipo, numero) {
  switch (tipo) {
    case 'DNI': return /^\d{8}$/.test(numero);
    case 'CE': return /^[A-Z0-9]{9,12}$/.test(numero);
    case 'PASAPORTE': return /^[A-Z0-9]{6,20}$/.test(numero);
    default: return false;
  }
}
function mensajeDocumento(tipo) {
  if (tipo === 'DNI') return 'El DNI debe contener exactamente 8 dígitos.';
  if (tipo === 'CE') return 'El carné de extranjería debe contener entre 9 y 12 caracteres alfanuméricos.';
  if (tipo === 'PASAPORTE') return 'El pasaporte debe contener entre 6 y 20 caracteres alfanuméricos.';
  return 'Tipo de documento no permitido.';
}
const idSchema = z.coerce.number().int().positive().max(2147483647);
const nombreSchema = z.string().trim().transform(limpiarTexto).pipe(
  z.string().min(2, 'Ingresa nombres válidos.').max(100, 'Los nombres superan 100 caracteres.')
    .regex(/^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u, 'Los nombres solo permiten letras.')
);
const apellidoSchema = z.string().trim().transform(limpiarTexto).pipe(
  z.string().min(2, 'Ingresa apellidos válidos.').max(120, 'Los apellidos superan 120 caracteres.')
    .regex(/^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u, 'Los apellidos solo permiten letras.')
);
const conductorSchema = z.object({
  tipoDocumento: z.enum(['DNI', 'CE', 'PASAPORTE']),
  numeroDocumento: z.string().trim().transform(normalizarCodigo).pipe(
    z.string().min(1, 'Ingresa el documento.').max(20, 'El documento es demasiado largo.')
  ),
  nombres: nombreSchema,
  apellidos: apellidoSchema,
  numeroLicencia: z.string().trim().transform(normalizarCodigo).pipe(
    z.string().min(4, 'La licencia debe tener al menos 4 caracteres.')
      .max(30, 'La licencia no debe superar 30 caracteres.')
      .regex(/^[A-Z0-9-]+$/, 'La licencia solo permite letras, números y guiones.')
  ),
  // Vigencia de la licencia de conducir (CU009). Opcional para registros antiguos.
  fechaVencimientoLicencia: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de vencimiento de la licencia no es válida.')
      .refine(v => !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()) &&
        new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v,
        'La fecha de vencimiento de la licencia no es válida.'),
    z.literal(''),
    z.null()
  ]).optional().transform(v => v || null),
  estado: z.enum(['ACTIVO', 'INACTIVO'])
}).superRefine((datos, contexto) => {
  if (!validarDocumento(datos.tipoDocumento, datos.numeroDocumento)) {
    contexto.addIssue({ code: 'custom', path: ['numeroDocumento'], message: mensajeDocumento(datos.tipoDocumento) });
  }
});
function validarDatos(body) {
  const resultado = conductorSchema.safeParse(body);
  if (!resultado.success) throw errorHttp(resultado.error.issues[0]?.message || 'Los datos del conductor no son válidos.');
  return resultado.data;
}
function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) throw errorHttp('Identificador de conductor inválido.');
  return resultado.data;
}

export async function listarConductores(q) {
  return repo.listar(String(q || '').trim().slice(0, 100));
}
export async function obtenerConductor(idRaw) {
  const id = obtenerId(idRaw);
  const conductor = await repo.obtener(id);
  if (!conductor) throw errorHttp('Conductor no encontrado', 404);
  return conductor;
}
export async function registrarConductor(body) {
  const datos = validarDatos(body);
  return repo.enTransaccion(async tx => {
    if (await repo.buscarDuplicado(tx, datos)) {
      throw errorHttp('El documento o la licencia ya están registrados.', 409);
    }
    const id = await repo.insertar(tx, datos);
    return { ConductorID: id, mensaje: 'Conductor registrado correctamente' };
  });
}
export async function actualizarConductor(idRaw, body) {
  const id = obtenerId(idRaw);
  const datos = validarDatos(body);
  return repo.enTransaccion(async tx => {
    if (!await repo.existeBloqueado(tx, id)) throw errorHttp('Conductor no encontrado', 404);
    if (await repo.buscarDuplicado(tx, datos, id)) {
      throw errorHttp('El documento o la licencia pertenecen a otro conductor.', 409);
    }
    const afectados = await repo.actualizar(tx, id, datos);
    if (!afectados) throw errorHttp('Conductor no encontrado', 404);
    return { ConductorID: id, mensaje: 'Conductor actualizado correctamente' };
  });
}
export async function cambiarEstadoConductor(idRaw, body) {
  const id = obtenerId(idRaw);
  const validacion = z.object({ estado: z.enum(['ACTIVO', 'INACTIVO']) }).safeParse(body);
  if (!validacion.success) throw errorHttp('El estado debe ser ACTIVO o INACTIVO.');
  const estado = validacion.data.estado;
  const afectados = await repo.cambiarEstado(id, estado);
  if (!afectados) throw errorHttp('Conductor no encontrado', 404);
  return { ConductorID: id, Estado: estado, mensaje: 'Estado del conductor actualizado correctamente' };
}
