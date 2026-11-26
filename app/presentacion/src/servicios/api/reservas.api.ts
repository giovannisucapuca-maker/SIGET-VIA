// SIGET-VÍA — VISTA — SERVICIO API — Reservas (RF4, RF10, RF18)
import { peticion, conQuery, type FormatoError, type OpcionesPeticion } from '../http';

export const listarReservas = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/reservas', { q }), { token });

export const catalogosReservas = <T>(token: string) =>
  peticion<T>('/reservas/catalogos', { token });

export const asientosDeViaje = <T>(token: string, viajeId: number) =>
  peticion<T>(`/reservas/asientos/${viajeId}`, { token });

export const politicasVigentesReserva = <T>(token: string, opciones: Pick<OpcionesPeticion, 'cache' | 'signal' | 'formatoError'> = {}) =>
  peticion<T>('/reservas/politicas-vigentes', { token, ...opciones });

export const historialReserva = <T>(token: string, id: number) =>
  peticion<T>(`/reservas/${id}/historial`, { token });

export const detalleReserva = <T>(token: string, id: number) =>
  peticion<T>(`/reservas/${id}`, { token });

export const crearReserva = <T>(token: string, datos: unknown, formatoError?: FormatoError, cache?: RequestCache) =>
  peticion<T>('/reservas', { token, method: 'POST', json: datos, formatoError, cache });

// Consulta de DNI (servicio externo a través del backend). Requiere autorización declarada.
export const consultarDniCliente = <T>(token: string, dni: string, formatoError?: FormatoError) =>
  peticion<T>(`/cliente/consulta-dni/${encodeURIComponent(dni)}`, {
    token, cache: 'no-store', headers: { 'X-Consulta-Autorizada': 'si' }, formatoError
  });

export const cancelarReserva = <T>(token: string, id: number) =>
  peticion<T>(`/reservas/${id}/cancelar`, { token, method: 'PATCH' });

export const editarReserva = <T>(token: string, id: number, datos: unknown) =>
  peticion<T>(`/reservas/${id}`, { token, method: 'PUT', json: datos });

export const reprogramarReserva = <T>(token: string, id: number, datos: unknown) =>
  peticion<T>(`/reservas/${id}/reprogramar`, { token, method: 'PATCH', json: datos });

// Consulta de pasajero por documento (módulo Pasajeros, usada al reservar).
export const buscarPasajeroPorDocumento = <T>(token: string, tipo: string, numero: string) =>
  peticion<T>(`/pasajeros/documento/${tipo}/${encodeURIComponent(numero)}`, { token });
