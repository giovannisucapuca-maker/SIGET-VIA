
// ========================================
// SIGET-VÍA - VALIDACIONES GENERALES
// ========================================

export function limpiarTexto(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ');
}

export function normalizarDocumento(
  valor: string
): string {
  return valor.trim().toUpperCase().replace(/\s+/g, '');
}

// ========================================
// DOCUMENTOS DE IDENTIDAD
// ========================================

export function validarDNI(valor: string): boolean {
  return /^\d{8}$/.test(normalizarDocumento(valor));
}

export function validarCE(valor: string): boolean {
  // Formato configurable según el tipo de
  // documento utilizado por el sistema.
  return /^[A-Z0-9]{9,12}$/.test(
    normalizarDocumento(valor)
  );
}

export function validarRUC(valor: string): boolean {
  const ruc = normalizarDocumento(valor);

  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) {
    return false;
  }

  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

  const suma = factores.reduce(
    (total, factor, indice) =>
      total + Number(ruc[indice]) * factor,
    0
  );

  const digito = (11 - (suma % 11)) % 10;

  return digito === Number(ruc[10]);
}

export function validarDocumento(
  tipo: string,
  numero: string
): boolean {
  const tipoNormalizado = tipo.trim().toUpperCase();

  switch (tipoNormalizado) {
    case 'DNI':
      return validarDNI(numero);

    case 'CE':
    case 'CARNET_EXTRANJERIA':
    case 'CARNÉ DE EXTRANJERÍA':
      return validarCE(numero);

    case 'RUC':
      return validarRUC(numero);

    default:
      return false;
  }
}

// ========================================
// PERSONAS
// ========================================

export function validarNombre(
  valor: string
): boolean {
  const nombre = limpiarTexto(valor);

  return (
    nombre.length >= 2 &&
    nombre.length <= 100 &&
    /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u.test(nombre)
  );
}

export function validarTelefonoPeru(
  valor: string
): boolean {
  return /^9\d{8}$/.test(valor.trim());
}

export function validarCorreo(
  valor: string
): boolean {
  const correo = valor.trim();

  return (
    correo.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
  );
}

// ========================================
// TRANSPORTE
// ========================================

export function validarPlaca(
  valor: string
): boolean {
  const placa = valor.trim().toUpperCase();

  return /^[A-Z0-9-]{5,12}$/.test(placa);
}

export function validarCapacidad(
  valor: number
): boolean {
  return (
    Number.isInteger(valor) &&
    valor >= 1 &&
    valor <= 200
  );
}

export function validarDistribucion(
  capacidad: number,
  primero: number,
  segundo: number
): boolean {
  return (
    validarCapacidad(capacidad) &&
    Number.isInteger(primero) &&
    Number.isInteger(segundo) &&
    primero >= 1 &&
    segundo >= 0 &&
    primero + segundo === capacidad
  );
}

// ========================================
// VALORES NUMÉRICOS
// ========================================

export function validarMonto(
  valor: number,
  maximo = 9999999999.99
): boolean {
  return (
    Number.isFinite(valor) &&
    valor >= 0 &&
    valor <= maximo &&
    Math.abs(
      valor * 100 - Math.round(valor * 100)
    ) < 0.00001
  );
}

export function validarDistancia(
  valor: number | null
): boolean {
  return (
    valor === null ||
    (
      Number.isFinite(valor) &&
      valor > 0 &&
      valor <= 99999999
    )
  );
}

// ========================================
// FECHAS
// ========================================

export function validarRangoFechas(
  salida: string,
  llegada: string
): boolean {
  if (!salida || !llegada) {
    return false;
  }

  const inicio = new Date(salida).getTime();
  const fin = new Date(llegada).getTime();

  return (
    Number.isFinite(inicio) &&
    Number.isFinite(fin) &&
    fin > inicio
  );
}

// ========================================
// CAMPOS OBLIGATORIOS
// ========================================

export function campoObligatorio(
  valor: string | number | null | undefined
): boolean {
  if (valor === null || valor === undefined) {
    return false;
  }

  return String(valor).trim().length > 0;
}
