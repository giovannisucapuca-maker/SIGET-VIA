// SIGET-VÍA — VISTA — SERVICIO API — Libro de reclamaciones (RF11, RF12, RF13)
import { peticion, mensajeConDetalles } from '../http';

const formatoAdmin = mensajeConDetalles('; ', true);
const formatoPublico = mensajeConDetalles('; ');

// ---------- Administración ----------
export const listarReclamaciones = <T>(token: string, cadena = '') =>
  peticion<T>(`/reclamaciones${cadena ? `?${cadena}` : ''}`, { token, formatoError: formatoAdmin });

export const resumenReclamaciones = <T>(token: string) =>
  peticion<T>('/reclamaciones/resumen', { token, formatoError: formatoAdmin });

export const detalleReclamacion = <T>(token: string, id: number) =>
  peticion<T>(`/reclamaciones/${id}`, { token, formatoError: formatoAdmin });

export const registrarReclamacion = <T>(token: string, datos: unknown) =>
  peticion<T>('/reclamaciones', { token, method: 'POST', json: datos, formatoError: formatoAdmin });

export const cambiarEstadoReclamacion = <T>(token: string, id: number, estado: string, observacion: string) =>
  peticion<T>(`/reclamaciones/${id}/estado`, {
    token, method: 'PATCH', json: { estado, observacion }, formatoError: formatoAdmin
  });

export const responderReclamacion = <T>(token: string, id: number, contenido: string) =>
  peticion<T>(`/reclamaciones/${id}/respuestas`, {
    token, method: 'POST', json: { contenido }, formatoError: formatoAdmin
  });

// ---------- Canal público (sin sesión) ----------
// Si se envía el token de un cliente, la reclamación queda vinculada a su cuenta.
export const registrarReclamacionPublica = <T>(datos: unknown, token = '') =>
  peticion<T>('/reclamaciones/publicas', {
    method: 'POST', json: datos, cache: 'no-store', formatoError: formatoPublico,
    token: token || undefined
  });

export const consultarReclamacionPublica = <T>(datos: unknown) =>
  peticion<T>('/reclamaciones/consulta', { method: 'POST', json: datos, cache: 'no-store', formatoError: formatoPublico });

// ---------- Cliente autenticado: Mis reclamaciones (CU012) ----------
export const listarMisReclamaciones = <T>(token: string) =>
  peticion<T>('/cliente/mis-reclamaciones', { token, cache: 'no-store' });

export const detalleMiReclamacion = <T>(token: string, id: number) =>
  peticion<T>(`/cliente/mis-reclamaciones/${id}`, { token, cache: 'no-store' });
