// SIGET-VÍA — VISTA — SERVICIO API — Perfil del cliente y fotografía
import { peticion, peticionArchivo } from '../http';

export const obtenerPerfil = <T>(token: string) =>
  peticion<T>('/cliente/perfil', { token, cache: 'no-store' });

export const actualizarPerfil = <T>(token: string, datos: unknown) =>
  peticion<T>('/cliente/perfil', { token, method: 'PUT', json: datos, cache: 'no-store' });

// Devuelve null si el cliente no tiene foto.
export const obtenerFoto = (token: string) =>
  peticionArchivo('/cliente/perfil/foto', {
    token, cache: 'no-store',
    formatoError: () => 'No se pudo recuperar la fotografía.'
  });

export const subirFoto = <T>(token: string, jpg: Blob) =>
  peticion<T>('/cliente/perfil/foto', {
    token, method: 'POST', body: jpg,
    headers: { 'Content-Type': 'image/jpeg' },
    formatoError: c => (typeof c.error === 'string' && c.error) || 'No se pudo subir la fotografía.'
  });

export const eliminarFoto = <T>(token: string) =>
  peticion<T>('/cliente/perfil/foto', { token, method: 'DELETE', cache: 'no-store' });
