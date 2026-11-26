// SIGET-VÍA — CAPA DE LÓGICA — Políticas del servicio (RF17)
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/politicas.repository.js';
import { errorHttp } from '../utils/errores.js';

export const TIPOS = ['RESERVA', 'CANCELACION', 'REPROGRAMACION', 'CONTRATACION', 'PRIVACIDAD', 'OTRA'];

const idSchema = z.coerce.number().int().positive().safe();

function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
}

const fechaSchema = z.string().refine(fechaValida, 'La fecha debe tener formato AAAA-MM-DD.');

const politicaSchema = z.object({
  tipo: z.enum(TIPOS),
  titulo: z.string().trim().min(5).max(150),
  contenido: z.string().trim().min(20).max(30000),
  version: z.string().trim().min(1).max(20),
  vigenteDesde: fechaSchema,
  vigenteHasta: z.union([fechaSchema, z.null()]).optional(),
  activa: z.boolean().default(true)
}).refine(
  d => !d.vigenteHasta || d.vigenteHasta >= d.vigenteDesde,
  { message: 'La fecha final no puede ser anterior a la inicial.', path: ['vigenteHasta'] }
);

export const catalogos = () => ({ tipos: TIPOS });

export const listarVigentes = () => repo.listarVigentes();

export function listar(q) {
  return repo.listar(String(q || '').trim().slice(0, 100));
}

export async function registrar(body, usuarioId) {
  const d = politicaSchema.parse(body);
  return repo.enTransaccion(async tx => {
    const politicaId = await repo.insertar(tx, d);
    await repo.registrarAuditoria(tx, usuarioId, politicaId, 'INSERT',
      `Registro de política #${politicaId}. Tipo: ${d.tipo}. Versión: ${d.version}.`);
    return { PoliticaID: politicaId, mensaje: 'Política registrada correctamente.' };
  });
}

export async function editar(idRaw, body, usuarioId) {
  const id = idSchema.parse(idRaw);
  const d = politicaSchema.parse(body);
  return repo.enTransaccion(async tx => {
    if ((await repo.actualizar(tx, id, d)) !== 1) throw errorHttp('Política no encontrada.', 404);
    await repo.registrarAuditoria(tx, usuarioId, id, 'UPDATE',
      `Actualización de política #${id}. Tipo: ${d.tipo}. Versión: ${d.version}.`);
    return { ok: true, mensaje: 'Política actualizada correctamente.' };
  });
}

export async function cambiarEstado(idRaw, body, usuarioId) {
  const id = idSchema.parse(idRaw);
  const { activa } = z.object({ activa: z.boolean() }).parse(body);
  return repo.enTransaccion(async tx => {
    const anterior = await repo.obtenerActivaBloqueada(tx, id);
    if (anterior === null) throw errorHttp('Política no encontrada.', 404);
    if (anterior === activa) throw errorHttp('La política ya tiene ese estado.');
    await repo.cambiarActiva(tx, id, activa);
    await repo.registrarAuditoria(tx, usuarioId, id, 'CAMBIO_ESTADO',
      `Política #${id}: ${anterior ? 'ACTIVA' : 'INACTIVA'} a ${activa ? 'ACTIVA' : 'INACTIVA'}.`);
    return { ok: true, mensaje: 'Estado de política actualizado.' };
  });
}
