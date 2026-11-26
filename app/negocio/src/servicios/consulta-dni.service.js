// SIGET-VÍA — CAPA DE LÓGICA — Consulta de DNI para clientes (RF4, RF10, RF15)
import { consultarDni } from 'siget-via-datos/externos/apiinti.client.js';
import { errorHttp } from '../utils/errores.js';

const patronNombre = /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;

function limpiarTexto(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ');
}

function nombreValido(valor, maximo) {
  return typeof valor === 'string' && valor.length >= 2 &&
    valor.length <= maximo && patronNombre.test(valor);
}

export function puedeConsultar(usuario) {
  return usuario?.Rol === 'CLIENTE' && usuario?.Estado === 'ACTIVO';
}

// autorizacionDeclarada: el cliente confirmó tener autorización del titular.
export async function consultarDniCliente(dniRaw, autorizacionDeclarada) {
  if (!autorizacionDeclarada) {
    throw errorHttp('Debes confirmar que cuentas con autorización del titular del documento.');
  }
  const dni = String(dniRaw || '').trim();
  if (!/^\d{8}$/.test(dni)) throw errorHttp('El DNI debe tener exactamente 8 dígitos.');

  let persona;
  try {
    persona = await consultarDni(dni);
  } catch (error) {
    // No exponer mensajes internos del proveedor.
    throw errorHttp(error.message || 'No fue posible consultar el DNI.',
      Number(error.statusCode) || 502);
  }

  if (!persona) {
    return { encontrado: false, fuente: 'APIINTI', tipoDocumento: 'DNI', nombres: null, apellidos: null };
  }

  const nombres = limpiarTexto(persona.nombres);
  const apellidos = limpiarTexto(
    [persona.apellidoPaterno, persona.apellidoMaterno]
      .filter(v => typeof v === 'string' && v.trim())
      .join(' ')
  );
  if (!nombreValido(nombres, 100) || !nombreValido(apellidos, 120)) {
    throw errorHttp('Los datos recibidos no tienen un formato válido.', 502);
  }
  return { encontrado: true, fuente: 'APIINTI', tipoDocumento: 'DNI', nombres, apellidos };
}
