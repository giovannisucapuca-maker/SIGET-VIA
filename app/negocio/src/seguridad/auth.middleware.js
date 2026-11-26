// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Middlewares de seguridad (RNF5)
import {
  verificarToken, obtenerUsuarioActivo, esAdministrador
} from '../servicios/auth.service.js';

// Requiere un JWT válido: deja el contenido en req.session.
export function auth(req, res, next) {
  try {
    req.session = verificarToken(req.headers.authorization);
    next();
  } catch (error) {
    return res.status(error.statusCode || 401).json({ error: error.message });
  }
}

// Comprueba que el usuario siga ACTIVO: deja sus datos en req.currentUser.
export async function activeUser(req, res, next) {
  try {
    req.currentUser = await obtenerUsuarioActivo(req.session);
    next();
  } catch (error) {
    if (error.statusCode === 401) {
      return res.status(401).json({ error: error.message });
    }
    next(error);
  }
}

// Solo rol ADMINISTRADOR.
export function admin(req, res, next) {
  if (!esAdministrador(req.session)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
}

// Restringe a un rol concreto (p. ej. CLIENTE).
export function soloRol(rol, mensaje = 'No autorizado') {
  return (req, res, next) => {
    if (req.currentUser?.Rol !== rol) return res.status(403).json({ error: mensaje });
    next();
  };
}

// Permite el acceso solo a los roles indicados (usa req.currentUser de activeUser).
export function roles(...permitidos) {
  return (req, res, next) => {
    if (!permitidos.includes(req.currentUser?.Rol)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    next();
  };
}

// Personal que atiende reservas y ventas: administrador y personal de ventas (CU005, CU010, CU018).
export const personalVentas = roles('ADMINISTRADOR', 'VENTAS');

// Sesión opcional: si llega un token válido de un usuario activo, deja
// req.currentUser; si no hay token (o no es válido) continúa sin usuario.
export async function sesionOpcional(req, res, next) {
  if (!req.headers.authorization) return next();
  try {
    const sesion = verificarToken(req.headers.authorization);
    req.currentUser = await obtenerUsuarioActivo(sesion);
  } catch {
    req.currentUser = null;
  }
  next();
}
