// SIGET-VÍA — VISTA — REGLAS DEL FORMULARIO — Políticas del servicio (RF17)
import {
  listarPoliticasAdmin, listarPoliticasVigentes
} from '../servicios/api/politicas.api';

export {
  catalogosPoliticas, crearPolitica, editarPolitica, cambiarEstadoPolitica,
  condicionesPublicas
} from '../servicios/api/politicas.api';

// Regla: el administrador ve y busca todas; los demás solo las vigentes.
export function listarPoliticas<T>(token: string, esAdmin: boolean, texto = '') {
  return esAdmin
    ? listarPoliticasAdmin<T>(token, texto)
    : listarPoliticasVigentes<T>(token);
}

// Datos mínimos de una política para evaluar su estado.
type EstadoPolitica = {
  VigenteDesde: string;
  VigenteHasta: string | null;
  Activa: boolean | number;
};

export function fechaHoy(): string {
  const fecha = new Date();
  const anio = fecha.getFullYear();
  const mes = String(
    fecha.getMonth() + 1
  ).padStart(2, '0');
  const dia = String(
    fecha.getDate()
  ).padStart(2, '0');

  return `${anio}-${mes}-${dia}`;
}

export function estaActiva(politica: EstadoPolitica): boolean {
  return (
    politica.Activa === true ||
    politica.Activa === 1
  );
}

export function estaVigente(politica: EstadoPolitica): boolean {
  const hoy = fechaHoy();

  return (
    estaActiva(politica) &&
    politica.VigenteDesde <= hoy &&
    (
      !politica.VigenteHasta ||
      politica.VigenteHasta >= hoy
    )
  );
}

// Orden y nombres con que se muestran las políticas al público (CU017).
export const SECCIONES_CONDICIONES = [
  ['CONTRATACION', 'Condiciones de contratación'],
  ['RESERVA', 'Política de reservas'],
  ['CANCELACION', 'Política de cancelación'],
  ['REPROGRAMACION', 'Política de reprogramación'],
  ['PRIVACIDAD', 'Privacidad y datos personales'],
  ['OTRA', 'Otras condiciones']
] as const;
