
import Swal from 'sweetalert2';

// ========================================
// SIGET-VÍA - ALERTAS REUTILIZABLES
// ========================================

const colorPrincipal = '#173b63';
const colorConfirmar = '#f58220';

export async function alertaExito(
  mensaje: string,
  titulo = 'Operación exitosa'
) {
  await Swal.fire({
    icon: 'success',
    title: titulo,
    text: mensaje,
    confirmButtonText: 'Aceptar',
    confirmButtonColor: colorPrincipal
  });
}

export async function alertaError(
  mensaje: string,
  titulo = 'No se pudo completar'
) {
  await Swal.fire({
    icon: 'error',
    title: titulo,
    text: mensaje,
    confirmButtonText: 'Entendido',
    confirmButtonColor: colorPrincipal
  });
}

export async function alertaAdvertencia(
  mensaje: string,
  titulo = 'Verifica los datos'
) {
  await Swal.fire({
    icon: 'warning',
    title: titulo,
    text: mensaje,
    confirmButtonText: 'Corregir',
    confirmButtonColor: colorPrincipal
  });
}

export async function confirmarAccion(
  mensaje: string,
  titulo = '¿Confirmar operación?'
): Promise<boolean> {
  const resultado = await Swal.fire({
    icon: 'question',
    title: titulo,
    text: mensaje,
    showCancelButton: true,
    confirmButtonText: 'Sí, continuar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: colorConfirmar,
    cancelButtonColor: colorPrincipal,
    reverseButtons: true
  });

  return resultado.isConfirmed;
}

export async function alertaGuardando(
  mensaje = 'Procesando información...'
) {
  await Swal.fire({
    title: 'Procesando',
    text: mensaje,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
}

export function cerrarAlerta() {
  Swal.close();
}
