// SIGET-VÍA — VISTA — SERVICIO API — Terminales terrestres
import { peticion, conQuery } from '../http';

export const listarTerminales = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/terminales', { q }), { token });

export const crearTerminal = <T>(token: string, datos: unknown) =>
  peticion<T>('/terminales', { token, method: 'POST', json: datos });

export const editarTerminal = <T>(token: string, id: number, datos: unknown) =>
  peticion<T>(`/terminales/${id}`, { token, method: 'PUT', json: datos });

export const cambiarEstadoTerminal = <T>(token: string, id: number, estado: string) =>
  peticion<T>(`/terminales/${id}/estado`, { token, method: 'PATCH', json: { estado } });
