// SIGET-VÍA — VISTA — REGLAS DEL FORMULARIO — Rutas (RF6)
// Reglas del módulo y operaciones disponibles para la vista.
import { limpiarTexto } from './validaciones';

export { listarRutas, guardarRuta, cambiarEstadoRuta } from '../servicios/api/rutas.api';

export function normalizarCiudad(valor: string): string {
  return limpiarTexto(valor).toLocaleUpperCase('es-PE');
}

// Comparación sin tildes para detectar rutas duplicadas.
export function compararCiudad(valor: string): string {
  return normalizarCiudad(valor).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function ciudadValida(valor: string): boolean {
  return (
    valor.length >= 2 &&
    valor.length <= 120 &&
    /^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 .,'’()/-]*$/u.test(valor)
  );
}
