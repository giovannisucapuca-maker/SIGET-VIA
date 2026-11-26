// SIGET-VÍA — VISTA — SERVICIO API — Autenticación, usuarios y roles (RF1, RF2)
import { peticion, conQuery, type OpcionesPeticion } from '../http';

export const iniciarSesion = <T>(correo: string, contrasena: string) =>
  peticion<T>('/auth/login', { method: 'POST', json: { correo, contrasena } });

export const obtenerSesion = <T>(token: string, extra: Pick<OpcionesPeticion, 'signal' | 'cache'> = {}) =>
  peticion<T>('/auth/me', { token, ...extra });

export const listarRoles = <T>(token: string) =>
  peticion<T>('/roles', { token });

export const listarUsuarios = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/usuarios', { q }), { token });

export const crearUsuario = <T>(token: string, datos: unknown) =>
  peticion<T>('/usuarios', { token, method: 'POST', json: datos });

export const editarUsuario = <T>(token: string, id: number | undefined, datos: unknown) =>
  peticion<T>(`/usuarios/${id}`, { token, method: 'PUT', json: datos });

export const cambiarEstadoUsuario = <T>(token: string, id: number, estado: string) =>
  peticion<T>(`/usuarios/${id}/estado`, { token, method: 'PATCH', json: { estado } });

export const registrarCliente = <T>(datos: unknown, extra: Pick<OpcionesPeticion, 'formatoError'> = {}) =>
  peticion<T>('/publico/clientes/registro', { method: 'POST', json: datos, ...extra });
