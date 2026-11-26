// SIGET-VÍA — VISTA — SERVICIO API — Rutas (RF6)
import { peticion, conQuery } from '../http';

export const listarRutas = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/rutas', { q }), { token });

export const guardarRuta = <T>(token: string, datos: unknown, id?: number) =>
  peticion<T>(id ? `/rutas/${id}` : '/rutas', { token, method: id ? 'PUT' : 'POST', json: datos });

export const cambiarEstadoRuta = <T>(token: string, id: number, estado: string) =>
  peticion<T>(`/rutas/${id}/estado`, { token, method: 'PATCH', json: { estado } });
