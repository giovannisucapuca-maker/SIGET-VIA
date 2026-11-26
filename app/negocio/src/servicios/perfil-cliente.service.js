// SIGET-VÍA — CAPA DE LÓGICA — Perfil editable del cliente y fotografía (PASO 174.5)
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/perfil-cliente.repository.js';
import { errorHttp } from '../utils/errores.js';

const schema = z.object({
  nombres: z.string().trim().min(2).max(100),
  apellidos: z.string().trim().min(2).max(120),
  correo: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  telefono: z.union([z.string().trim().max(20), z.null()]).optional()
});

export async function obtenerPerfil(usuarioId) {
  const perfil = await repo.obtenerPerfil(usuarioId);
  if (!perfil) throw errorHttp('Perfil no encontrado.', 404);
  return { ...perfil, tieneFoto: await repo.existeFoto(usuarioId) };
}

export async function actualizarPerfil(usuarioId, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw errorHttp(parsed.error.issues[0]?.message || 'Datos inválidos.');
  }
  const d = parsed.data;

  try {
    return await repo.enTransaccion(async tx => {
      if (await repo.existeOtroConCorreo(tx, usuarioId, d.correo)) {
        throw errorHttp('El correo ya está registrado por otra cuenta.', 409);
      }
      const usuario = await repo.actualizarPerfilActivo(tx, usuarioId, d);
      if (!usuario) throw errorHttp('Usuario no encontrado o inactivo.', 404);
      await repo.auditarActualizacionPerfil(tx, usuarioId,
        `Actualización de perfil propio. Correo: ${d.correo}.`);
      return { usuario, mensaje: 'Perfil actualizado correctamente.' };
    });
  } catch (err) {
    if (repo.esDuplicado(err)) throw errorHttp('El correo ya existe.', 409);
    throw err;
  }
}

export async function obtenerFoto(usuarioId) {
  const foto = await repo.leerFoto(usuarioId);
  if (!foto) throw errorHttp('No hay foto guardada.', 404);
  return foto;
}

// Regla: solo JPG (cabecera FFD8 y cierre FFD9) de máximo 1 MB.
export async function guardarFoto(usuarioId, imagen) {
  if (!Buffer.isBuffer(imagen) || !imagen.length || imagen.length > 1024 * 1024) {
    throw errorHttp('La foto debe ser JPG y pesar máximo 1 MB.');
  }
  const esJpg = imagen.length > 4 &&
    imagen[0] === 0xff && imagen[1] === 0xd8 &&
    imagen[imagen.length - 2] === 0xff && imagen[imagen.length - 1] === 0xd9;
  if (!esJpg) throw errorHttp('Archivo inválido. Debe ser una imagen JPG.');
  await repo.guardarFoto(usuarioId, imagen);
  return { mensaje: 'Foto actualizada correctamente.' };
}

export async function eliminarFoto(usuarioId) {
  await repo.eliminarFoto(usuarioId);
  return { mensaje: 'Foto eliminada correctamente.' };
}
