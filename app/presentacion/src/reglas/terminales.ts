// SIGET-VÍA — VISTA — REGLAS DEL FORMULARIO — Terminales terrestres
import { compararCiudad } from './rutas';

export {
  listarTerminales, crearTerminal, editarTerminal, cambiarEstadoTerminal
} from '../servicios/api/terminales.api';

export type TerminalResumen = {
  TerminalID: number;
  Nombre: string;
  Ciudad: string;
  Estado: string;
};

// Terminales que se pueden elegir para una ciudad: activos y de esa ciudad
// (se conserva el que ya tenía asignado la ruta aunque esté inactivo).
export function terminalesDeCiudad<T extends TerminalResumen>(
  terminales: T[], ciudad: string, actualId: number | null = null
): T[] {
  const c = compararCiudad(ciudad || '');
  if (!c) return [];
  return terminales.filter(t =>
    compararCiudad(t.Ciudad) === c && (t.Estado === 'ACTIVO' || t.TerminalID === actualId));
}

// Texto para mostrar un lugar de embarque: "Terminal (Ciudad)" o solo la ciudad.
export function lugar(ciudad: string, terminal?: string | null): string {
  return terminal ? `${terminal} (${ciudad})` : ciudad;
}
