// SIGET-VÍA — VISTA — SERVICIO API — Ventas y pagos simulados (RF5)
import { peticion, conQuery } from '../http';

export const listarVentas = <T>(token: string, q = '') =>
  peticion<T>(conQuery('/ventas', { q }), { token });

export const reservasVendibles = <T>(token: string) =>
  peticion<T>('/ventas/catalogos', { token });

export const detalleVenta = <T>(token: string, id: number) =>
  peticion<T>(`/ventas/${id}`, { token });

export const registrarVenta = <T>(token: string, datos: unknown) =>
  peticion<T>('/ventas', { token, method: 'POST', json: datos });

export const anularVenta = <T>(token: string, id: number) =>
  peticion<T>(`/ventas/${id}/anular`, { token, method: 'PATCH' });
