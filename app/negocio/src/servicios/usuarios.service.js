// SIGET-VÍA — CAPA DE LÓGICA — Gestión de usuarios (RF2)
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/usuarios.repository.js';
import { errorHttp } from '../utils/errores.js';

const clean = z.string().trim().min(1);

const userSchema = z.object({
  nombres: clean.max(100),
  apellidos: clean.max(120),
  correo: z.string().trim().email().max(254),
  telefono: z.string().trim().max(20).nullable().optional(),
  rolId: z.number().int().positive(),
  contrasena: z.string().min(8).max(72),
  estado: z.enum(['ACTIVO', 'INACTIVO']).default('ACTIVO')
});

const editSchema = userSchema.omit({ contrasena: true }).extend({
  contrasena: z.union([z.string().min(8).max(72), z.literal('')]).optional()
});

const estadoSchema = z.object({ estado: z.enum(['ACTIVO', 'INACTIVO']) });
const idSchema = z.coerce.number().int().positive();

const ACCIONES_AUDITORIA = ['INSERT', 'UPDATE', 'DELETE', 'CAMBIO_ESTADO', 'LOGIN', 'OTRO'];

async function auditar(tx, userId, accion, recordId, detalle) {
  if (!ACCIONES_AUDITORIA.includes(accion)) {
    throw new Error(`Acción de auditoría no permitida: ${accion}`);
  }
  await repo.registrarAuditoria(tx, userId, accion, recordId, detalle);
}

export const listarRoles = () => repo.listarRoles();

export function listarUsuarios(q) {
  return repo.listarUsuarios(String(q || '').trim().slice(0, 100));
}

export async function registrarUsuario(body, usuarioActual) {
  const d = userSchema.parse(body);
  const hash = await bcrypt.hash(d.contrasena, 12);

  return repo.enTransaccion(async tx => {
    if (!(await repo.existeRol(tx, d.rolId))) throw errorHttp('Rol no válido');
    const id = await repo.insertarUsuario(tx, d, hash);
    await auditar(tx, usuarioActual.UsuarioID, 'INSERT', id,
      `Registro de usuario #${id}. Correo: ${d.correo}. ` +
      `RolID: ${d.rolId}. Estado: ${d.estado}.`);
    return { UsuarioID: id, mensaje: 'Usuario registrado correctamente' };
  });
}

export async function editarUsuario(idRaw, body, usuarioActual) {
  const id = idSchema.parse(idRaw);
  const d = editSchema.parse(body);

  if (id === Number(usuarioActual.UsuarioID) &&
      (d.estado !== 'ACTIVO' || d.rolId !== usuarioActual.RolID)) {
    throw errorHttp('No puedes desactivar tu cuenta ni cambiar tu rol');
  }

  const cambiarClave = Boolean(d.contrasena);
  return repo.enTransaccion(async tx => {
    if (!(await repo.existeRol(tx, d.rolId))) throw errorHttp('Rol no válido');
    const hash = cambiarClave ? await bcrypt.hash(d.contrasena, 12) : null;
    const filas = await repo.actualizarUsuario(tx, id, d, hash);
    if (!filas) throw errorHttp('Usuario no encontrado', 404);
    await auditar(tx, usuarioActual.UsuarioID, 'UPDATE', id,
      `Actualización del usuario #${id}. Correo: ${d.correo}. RolID: ${d.rolId}. ` +
      `Estado: ${d.estado}. Contraseña modificada: ${cambiarClave ? 'Sí' : 'No'}.`);
    return { ok: true, mensaje: 'Usuario actualizado correctamente' };
  });
}

export async function cambiarEstadoUsuario(idRaw, body, usuarioActual) {
  const id = idSchema.parse(idRaw);
  const { estado } = estadoSchema.parse(body);

  if (id === Number(usuarioActual.UsuarioID)) {
    throw errorHttp('No puedes cambiar el estado de tu propia cuenta');
  }

  return repo.enTransaccion(async tx => {
    const estadoAnterior = await repo.obtenerEstadoBloqueado(tx, id);
    if (estadoAnterior === null) throw errorHttp('Usuario no encontrado', 404);
    if (estadoAnterior === estado) {
      throw errorHttp('El usuario ya tiene el estado seleccionado');
    }
    const filas = await repo.cambiarEstado(tx, id, estado);
    if (!filas) throw errorHttp('Usuario no encontrado', 404);
    await auditar(tx, usuarioActual.UsuarioID, 'CAMBIO_ESTADO', id,
      `Cambio de estado del usuario #${id}. Estado anterior: ${estadoAnterior}. ` +
      `Estado nuevo: ${estado}.`);
    return { ok: true, mensaje: 'Estado actualizado correctamente' };
  });
}
