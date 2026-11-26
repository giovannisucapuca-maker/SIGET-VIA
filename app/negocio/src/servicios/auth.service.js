// SIGET-VÍA — CAPA DE LÓGICA — Autenticación y sesión (RF1)
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/usuarios.repository.js';
import { errorHttp } from '../utils/errores.js';

const loginSchema = z.object({
  correo: z.string().trim().email().max(254),
  contrasena: z.string().min(1)
});

export function validarConfiguracion() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Configura JWT_SECRET de al menos 32 caracteres en .env');
  }
}

function emitirToken(usuario) {
  return jwt.sign(
    { sub: String(usuario.UsuarioID), rol: usuario.Rol, rolId: usuario.RolID },
    process.env.JWT_SECRET,
    { expiresIn: '8h', issuer: 'siget-via', algorithm: 'HS256' }
  );
}

export async function iniciarSesion(body) {
  const datos = loginSchema.parse(body);
  const usuario = await repo.buscarPorCorreo(datos.correo);

  if (!usuario || !(await bcrypt.compare(datos.contrasena, usuario.ContrasenaHash))) {
    throw errorHttp('Credenciales inválidas', 401);
  }

  // CU001 — 7b: solo después de comprobar la contraseña se informa que la
  // cuenta está desactivada (así no se revela qué correos existen).
  if (usuario.Estado !== 'ACTIVO') {
    throw errorHttp('Tu cuenta está desactivada. Comunícate con la empresa para reactivarla.', 403);
  }

  // eslint-disable-next-line no-unused-vars
  const { ContrasenaHash, Estado, ...usuarioSeguro } = usuario;
  return { token: emitirToken(usuario), usuario: usuarioSeguro };
}

// Devuelve el contenido del token o lanza 401.
export function verificarToken(cabeceraAuthorization) {
  const token = /^Bearer (.+)$/.exec(cabeceraAuthorization || '')?.[1];
  if (!token) throw errorHttp('Autenticación requerida', 401);
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'siget-via', algorithms: ['HS256']
    });
  } catch {
    throw errorHttp('Sesión inválida o vencida', 401);
  }
}

// Comprueba en la base de datos que el usuario siga activo y con el mismo rol.
export async function obtenerUsuarioActivo(sesion) {
  const usuario = await repo.buscarSesionPorId(sesion.sub);
  if (!usuario || usuario.Estado !== 'ACTIVO' || usuario.Rol !== sesion.rol ||
      Number(usuario.RolID) !== Number(sesion.rolId)) {
    throw errorHttp('Usuario deshabilitado o sesión inválida', 401);
  }
  return usuario;
}

export function esAdministrador(sesion) {
  return sesion?.rol === 'ADMINISTRADOR';
}
