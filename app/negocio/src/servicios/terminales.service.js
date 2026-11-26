// SIGET-VÍA — CAPA DE LÓGICA — Terminales terrestres
// Reglas: nombre único por ciudad, datos obligatorios y no desactivar
// un terminal usado por rutas activas.
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/terminales.repository.js';
import { errorHttp } from '../utils/errores.js';

const limpiar = v => v.trim().replace(/\s+/g, ' ');
export const normalizarCiudad = v => limpiar(v).toLocaleUpperCase('es-PE');
export const compararTexto = v => normalizarCiudad(v).normalize('NFD').replace(/[̀-ͯ]/g, '');

const texto = (min, max, mensaje) =>
  z.string().trim().transform(limpiar).pipe(z.string().min(min, mensaje).max(max, `Máximo ${max} caracteres.`));

const terminalSchema = z.object({
  nombre: texto(3, 120, 'El nombre del terminal debe tener al menos 3 caracteres.'),
  ciudad: z.string().trim().transform(normalizarCiudad).pipe(
    z.string().min(2, 'Ingresa la ciudad.').max(120)
      .regex(/^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 .,'’()/-]*$/u, 'La ciudad contiene caracteres no permitidos.')
  ),
  direccion: texto(5, 250, 'Ingresa la dirección del terminal.'),
  referencia: z.union([z.string().trim().max(250), z.null()]).optional().transform(v => v || null),
  telefono: z.union([
    z.string().trim().regex(/^[0-9+()\s-]{6,20}$/, 'El teléfono no tiene un formato válido.'),
    z.literal(''), z.null()
  ]).optional().transform(v => v || null),
  estado: z.enum(['ACTIVO', 'INACTIVO']).default('ACTIVO')
});

const idSchema = z.coerce.number().int().positive().max(2147483647);

function obtenerId(valor) {
  const r = idSchema.safeParse(valor);
  if (!r.success) throw errorHttp('Identificador de terminal inválido.');
  return r.data;
}

function validar(body) {
  const r = terminalSchema.safeParse(body);
  if (!r.success) throw errorHttp(r.error.issues[0]?.message || 'Los datos del terminal son inválidos.');
  return r.data;
}

async function comprobarDuplicado(tx, d, excluirId = null) {
  const existentes = await repo.listarParaDuplicado(tx, excluirId);
  const repetido = existentes.find(t =>
    compararTexto(t.Nombre) === compararTexto(d.nombre) &&
    compararTexto(t.Ciudad) === compararTexto(d.ciudad));
  if (repetido) throw errorHttp('Ya existe un terminal con ese nombre en esa ciudad.', 409);
}

export function listar(q) {
  return repo.listar(String(q || '').trim().slice(0, 120));
}

export async function detalle(idRaw) {
  const t = await repo.obtener(obtenerId(idRaw));
  if (!t) throw errorHttp('Terminal no encontrado.', 404);
  return t;
}

export async function crear(body) {
  const d = validar(body);
  return repo.enTransaccion(async tx => {
    await comprobarDuplicado(tx, d);
    const id = await repo.insertar(tx, d);
    return { TerminalID: id, mensaje: 'Terminal registrado correctamente.' };
  }, repo.NIVEL.SERIALIZABLE);
}

export async function editar(idRaw, body) {
  const id = obtenerId(idRaw);
  const d = validar(body);
  return repo.enTransaccion(async tx => {
    const actual = await repo.obtenerBloqueado(tx, id);
    if (!actual) throw errorHttp('Terminal no encontrado.', 404);
    await comprobarDuplicado(tx, d, id);
    if (compararTexto(actual.Ciudad) !== compararTexto(d.ciudad) &&
        (await repo.contarRutasConTerminalEnOtraCiudad(tx, id, d.ciudad)) > 0) {
      throw errorHttp('No se puede cambiar la ciudad: hay rutas que usan este terminal.', 409);
    }
    if (d.estado === 'INACTIVO' && actual.Estado === 'ACTIVO' &&
        (await repo.contarRutasActivas(tx, id)) > 0) {
      throw errorHttp('No se puede desactivar: hay rutas activas que usan este terminal.', 409);
    }
    await repo.actualizar(tx, id, d);
    return { TerminalID: id, mensaje: 'Terminal actualizado correctamente.' };
  }, repo.NIVEL.SERIALIZABLE);
}

export async function cambiarEstado(idRaw, body) {
  const id = obtenerId(idRaw);
  const r = z.object({ estado: z.enum(['ACTIVO', 'INACTIVO']) }).safeParse(body);
  if (!r.success) throw errorHttp('El estado debe ser ACTIVO o INACTIVO.');
  const estado = r.data.estado;
  return repo.enTransaccion(async tx => {
    const actual = await repo.obtenerBloqueado(tx, id);
    if (!actual) throw errorHttp('Terminal no encontrado.', 404);
    if (estado === 'INACTIVO' && (await repo.contarRutasActivas(tx, id)) > 0) {
      throw errorHttp('No se puede desactivar: hay rutas activas que usan este terminal.', 409);
    }
    await repo.cambiarEstado(tx, id, estado);
    return { TerminalID: id, Estado: estado, mensaje: 'Estado del terminal actualizado.' };
  }, repo.NIVEL.SERIALIZABLE);
}
