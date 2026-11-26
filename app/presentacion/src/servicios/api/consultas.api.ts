// SIGET-VÍA — VISTA — SERVICIO API — Consultas administrativas de solo lectura
// Auditoría, pagos, manifiestos (RF16) y reportes (RF14).
// `parametros` es una cadena de consulta ya armada ("?a=1&b=2" o "").
import { peticion } from '../http';

// ---------- Auditoría ----------
export const listarAuditoria = <T>(token: string, parametros = '') =>
  peticion<T>(`/auditoria${parametros}`, { token });
export const resumenAuditoria = <T>(token: string) =>
  peticion<T>('/auditoria/resumen', { token });
export const catalogosAuditoria = <T>(token: string) =>
  peticion<T>('/auditoria/catalogos', { token });
export const detalleAuditoria = <T>(token: string, id: number) =>
  peticion<T>(`/auditoria/${id}`, { token });

// ---------- Pagos ----------
export const listarPagos = <T>(token: string, parametros = '') =>
  peticion<T>(`/pagos${parametros}`, { token });
export const resumenPagos = <T>(token: string) =>
  peticion<T>('/pagos/resumen', { token });
export const detallePago = <T>(token: string, id: number) =>
  peticion<T>(`/pagos/${id}`, { token });

// ---------- Manifiestos ----------
export const listarViajesManifiesto = <T>(token: string, query = '') =>
  peticion<T>(`/manifiestos/viajes${query ? `?${query}` : ''}`, { token });
export const obtenerManifiesto = <T>(token: string, viajeId: number) =>
  peticion<T>(`/manifiestos/${viajeId}`, { token });

// ---------- Reportes y panel ----------
export const obtenerReporte = <T>(token: string, tipo: string, parametros = '') =>
  peticion<T>(`/reportes/${tipo}${parametros}`, { token });
export const resumenReportes = <T>(token: string, parametros = '', signal?: AbortSignal) =>
  peticion<T>(`/reportes/resumen${parametros}`, { token, signal, cache: signal ? 'no-store' : undefined });
export const indicadoresExtra = <T>(token: string, signal?: AbortSignal) =>
  peticion<T>('/reportes/dashboard-extra', { token, signal, cache: 'no-store' });

// ---------- Cliente: mis reservas ----------
export const listarMisReservas = <T>(token: string) =>
  peticion<T>('/cliente/mis-reservas', { token, cache: 'no-store' });
export const detalleMiReserva = <T>(token: string, id: number) =>
  peticion<T>(`/cliente/mis-reservas/${id}`, { token, cache: 'no-store' });
