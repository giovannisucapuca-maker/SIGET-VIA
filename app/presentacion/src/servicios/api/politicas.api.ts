// SIGET-VÍA — VISTA — SERVICIO API — Políticas del servicio (RF17)
import { peticion, conQuery, mensajeConDetalles } from '../http';

const formatoError = mensajeConDetalles('. ');

export const listarPoliticasAdmin = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/politicas', { q }), { token, formatoError });

export const listarPoliticasVigentes = <T>(token: string) =>
  peticion<T>('/politicas/vigentes', { token, formatoError });

export const catalogosPoliticas = <T>(token: string) =>
  peticion<T>('/politicas/catalogos', { token, formatoError });

export const crearPolitica = <T>(token: string, datos: unknown) =>
  peticion<T>('/politicas', { token, method: 'POST', json: datos, formatoError });

export const editarPolitica = <T>(token: string, id: number | undefined, datos: unknown) =>
  peticion<T>(`/politicas/${id}`, { token, method: 'PUT', json: datos, formatoError });

export const cambiarEstadoPolitica = <T>(token: string, id: number, activa: boolean) =>
  peticion<T>(`/politicas/${id}/estado`, { token, method: 'PATCH', json: { activa }, formatoError });

// Condiciones y políticas vigentes para el público, sin sesión (CU017).
export const condicionesPublicas = <T>() =>
  peticion<T>('/publico/condiciones', { cache: 'no-store', formatoError });
