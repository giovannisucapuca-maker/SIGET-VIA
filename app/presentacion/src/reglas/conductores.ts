// SIGET-VÍA — VISTA — REGLAS DEL FORMULARIO — Conductores (RF9)
export {
  listarConductores, crearConductor, editarConductor, cambiarEstadoConductor
} from '../servicios/api/conductores.api';

export function validarPasaporte(
  numero: string
): boolean {
  return /^[A-Z0-9]{6,20}$/.test(numero);
}

export function validarLicencia(
  licencia: string
): boolean {
  return /^[A-Z0-9-]{4,30}$/.test(licencia);
}

// Regla CU009: una licencia vencida no permite asignar al conductor a viajes.
export function licenciaVencida(fechaVencimiento: string | null, referencia = new Date()): boolean {
  if (!fechaVencimiento) return false;
  const hoy = [
    referencia.getFullYear(),
    String(referencia.getMonth() + 1).padStart(2, '0'),
    String(referencia.getDate()).padStart(2, '0')
  ].join('-');
  return fechaVencimiento < hoy;
}
