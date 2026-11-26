// SIGET-VÍA — VISTA — SERVICIO API — Pasajeros (RF15)
import { peticion, conQuery } from '../http';

export const listarPasajeros = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/pasajeros', { q }), { token });

export const crearPasajero = <T>(token: string, datos: unknown) =>
  peticion<T>('/pasajeros', { token, method: 'POST', json: datos });

export const editarPasajero = <T>(token: string, id: number | undefined, datos: unknown) =>
  peticion<T>(`/pasajeros/${id}`, { token, method: 'PUT', json: datos });

export const cambiarEstadoPasajero = <T>(token: string, id: number, estado: string) =>
  peticion<T>(`/pasajeros/${id}/estado`, { token, method: 'PATCH', json: { estado } });
