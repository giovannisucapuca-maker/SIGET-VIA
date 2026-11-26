// SIGET-VÍA — VISTA — SERVICIO API — Conductores (RF9)
import { peticion, conQuery } from '../http';

export const listarConductores = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/conductores', { q }), { token });

export const crearConductor = <T>(token: string, datos: unknown) =>
  peticion<T>('/conductores', { token, method: 'POST', json: datos });

export const editarConductor = <T>(token: string, id: number | undefined, datos: unknown) =>
  peticion<T>(`/conductores/${id}`, { token, method: 'PUT', json: datos });

export const cambiarEstadoConductor = <T>(token: string, id: number, estado: string) =>
  peticion<T>(`/conductores/${id}/estado`, { token, method: 'PATCH', json: { estado } });
