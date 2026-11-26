// SIGET-VÍA — VISTA — REGLAS DEL FORMULARIO — Reservas (RF4, RF10, RF18)
export {
  listarReservas, catalogosReservas, asientosDeViaje, politicasVigentesReserva,
  historialReserva, detalleReserva, crearReserva, cancelarReserva, editarReserva,
  reprogramarReserva, buscarPasajeroPorDocumento
} from '../servicios/api/reservas.api';

// Estados de reserva que admiten edición, cancelación o reprogramación.
export const ESTADOS_RESERVA_MODIFICABLES = ['COMPLETADA', 'CONFIRMADA', 'REPROGRAMADA'];

export function hoyLocal(): string {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

export function fechaValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const [a, m, d] = valor.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);

  return (
    fecha.getFullYear() === a &&
    fecha.getMonth() === m - 1 &&
    fecha.getDate() === d &&
    valor <= hoyLocal()
  );
}

export function calcularEdad(valor: string): number | null {
  if (!fechaValida(valor)) return null;

  const [a, m, d] = valor.split('-').map(Number);
  const hoy = new Date();

  let edad = hoy.getFullYear() - a;

  if (
    hoy.getMonth() + 1 < m ||
    (hoy.getMonth() + 1 === m && hoy.getDate() < d)
  ) {
    edad--;
  }

  return edad >= 0 ? edad : null;
}
