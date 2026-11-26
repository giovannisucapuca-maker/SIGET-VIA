// SIGET-VÍA — VISTA — REGLAS DEL FORMULARIO — Sesión, roles y usuarios (RF1, RF2)
import { tomarRetorno } from '../servicios/sesion';

export { leerToken, guardarToken, borrarToken } from '../servicios/sesion';
export {
  iniciarSesion, obtenerSesion, listarRoles, listarUsuarios,
  crearUsuario, editarUsuario, cambiarEstadoUsuario
} from '../servicios/api/usuarios.api';

export const ROLES = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  VENTAS: 'VENTAS',
  OPERADOR: 'OPERADOR',
  CLIENTE: 'CLIENTE'
} as const;

// Módulos del panel que puede usar cada perfil del personal (RNF5).
// El cliente tiene su propio portal y no usa este panel.
const MODULOS_POR_ROL: Record<string, readonly string[] | 'todos'> = {
  [ROLES.ADMINISTRADOR]: 'todos',
  [ROLES.VENTAS]: ['/panel', '/reservas', '/ventas', '/pagos', '/politicas'],
  [ROLES.OPERADOR]: ['/panel', '/manifiestos', '/politicas']
};

export function esPersonal(rol: string): boolean {
  return rol in MODULOS_POR_ROL;
}

export function puedeAcceder(rol: string, ruta: string): boolean {
  const modulos = MODULOS_POR_ROL[rol];
  if (!modulos) return false;
  return modulos === 'todos' || modulos.includes(ruta);
}

export function nombrePerfil(rol: string): string {
  return ({
    ADMINISTRADOR: 'Administrador',
    VENTAS: 'Personal de ventas',
    OPERADOR: 'Operador de transporte',
    CLIENTE: 'Cliente'
  } as Record<string, string>)[rol] || rol;
}

// Regla: el cliente entra a su portal; el personal, al panel administrativo.
export function rutaInicial(usuario: { Rol: string }): string {
  return usuario.Rol === ROLES.CLIENTE ? '/cliente' : '/panel';
}

// Regla: si el cliente venía de elegir asientos, vuelve a esa página para
// terminar su reserva. Solo se aceptan rutas internas de selección de asientos.
export function rutaDespuesDeIniciarSesion(usuario: { Rol: string }): string {
  const retorno = tomarRetorno();
  if (usuario.Rol === ROLES.CLIENTE && /^\/viajes\/publico\/\d+\/asientos$/.test(retorno)) {
    return retorno;
  }
  return rutaInicial(usuario);
}
