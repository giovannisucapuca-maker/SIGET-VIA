// SIGET-VÍA — VISTA — SERVICIO API — Viajes (RF7) y consulta pública (RF3)
import { peticion, conQuery, type OpcionesPeticion } from '../http';

type Extra = Pick<OpcionesPeticion, 'signal' | 'formatoError'>;

export const listarViajes = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/viajes', { q }), { token });

export const catalogosViajes = <T>(token: string) =>
  peticion<T>('/viajes/catalogos', { token });

export const crearViaje = <T>(token: string, datos: unknown) =>
  peticion<T>('/viajes', { token, method: 'POST', json: datos });

export const editarViaje = <T>(token: string, id: number | undefined, datos: unknown) =>
  peticion<T>(`/viajes/${id}`, { token, method: 'PUT', json: datos });

// ---------- Portal público (sin sesión) ----------
export const buscarViajesPublicos = <T>(filtros: Record<string, string | undefined>, extra: Extra = {}) =>
  peticion<T>(conQuery('/publico/viajes', filtros), { cache: 'no-store', ...extra });

export const consultarAsientosPublicos = <T>(viajeId: number | string, extra: Extra = {}) =>
  peticion<T>(`/publico/asientos/${viajeId}`, { cache: 'no-store', ...extra });

export const cambiarEstadoViaje = <T>(token: string, id: number, estado: string) =>
  peticion<T>(`/viajes/${id}/estado`, { token, method: 'PATCH', json: { estado } });
