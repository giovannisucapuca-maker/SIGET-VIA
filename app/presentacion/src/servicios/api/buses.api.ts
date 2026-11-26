// SIGET-VÍA — VISTA — SERVICIO API — Buses (RF8)
import { peticion, conQuery } from '../http';

export const listarBuses = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/buses', { q }), { token });

export const listarTiposServicio = <T>(token: string) =>
  peticion<T>('/buses/tipos-servicio', { token });

export const crearBus = <T>(token: string, datos: unknown) =>
  peticion<T>('/buses', { token, method: 'POST', json: datos });

export const editarBus = <T>(token: string, id: number | undefined, datos: unknown) =>
  peticion<T>(`/buses/${id}`, { token, method: 'PUT', json: datos });

export const cambiarEstadoBus = <T>(token: string, id: number, estado: string) =>
  peticion<T>(`/buses/${id}/estado`, { token, method: 'PATCH', json: { estado } });
