// SIGET-VÍA — VISTA — REGLAS DEL FORMULARIO — Pasajeros (RF15)
// Reglas de validación de pasajeros y operaciones disponibles.
import { validarDNI, validarCE } from './validaciones';

export {
  listarPasajeros, crearPasajero, editarPasajero, cambiarEstadoPasajero
} from '../servicios/api/pasajeros.api';
export { listarUsuarios } from '../servicios/api/usuarios.api';


export type TipoDocumento = 'DNI' | 'CE' | 'PASAPORTE';

export function fechaLocalHoy(): string {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1)
    .padStart(2, '0');
  const dia = String(ahora.getDate())
    .padStart(2, '0');

  return `${anio}-${mes}-${dia}`;
}

export function validarPasaporte(numero: string): boolean {
  // Formato general, no verificación oficial.
  return /^[A-Z0-9]{6,20}$/.test(numero);
}

export function validarTelefonoOpcional(
  telefono: string
): boolean {
  if (!telefono) return true;

  // Permite móvil peruano de 9 dígitos,
  // y números nacionales/internacionales
  // con prefijo y separadores convencionales.
  const digitos = telefono.replace(/\D/g, '');

  return (
    /^[+0-9()\s-]{6,20}$/.test(telefono) &&
    digitos.length >= 6 &&
    digitos.length <= 15
  );
}

export function validarFechaNacimiento(
  fecha: string
): boolean {
  if (!fecha) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }

  const [anio, mes, dia] =
    fecha.split('-').map(Number);

  const comprobacion =
    new Date(anio, mes - 1, dia);

  const fechaValida =
    comprobacion.getFullYear() === anio &&
    comprobacion.getMonth() === mes - 1 &&
    comprobacion.getDate() === dia;

  return (
    fechaValida &&
    fecha <= fechaLocalHoy()
  );
}

export function validarNumeroDocumento(
  tipo: TipoDocumento,
  numero: string
): string | null {
  if (!numero) {
    return 'Ingresa el número de documento.';
  }

  if (tipo === 'DNI') {
    if (!validarDNI(numero)) {
      return 'El DNI debe contener exactamente 8 dígitos numéricos.';
    }
  }

  if (tipo === 'CE') {
    if (!validarCE(numero)) {
      return (
        'El carné de extranjería debe tener ' +
        'entre 9 y 12 caracteres alfanuméricos.'
      );
    }
  }

  if (tipo === 'PASAPORTE') {
    if (!validarPasaporte(numero)) {
      return (
        'El pasaporte debe tener entre 6 y 20 ' +
        'caracteres alfanuméricos.'
      );
    }
  }

  return null;
}
