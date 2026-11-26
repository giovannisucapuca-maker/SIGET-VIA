import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/pasajeros.repository.js';

function limpiarTexto(valor) {
  return valor.trim().replace(/\s+/g, ' ');
}

function normalizarDocumento(valor) {
  return valor
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(
    new Error(mensaje),
    { statusCode }
  );
}

function fechaHoy() {
  const ahora = new Date();

  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0')
  ].join('-');
}

// =====================================================
// VALIDACIONES DE DOCUMENTOS
// =====================================================

const TIPOS_DOCUMENTO = [
  'DNI',
  'CE',
  'PASAPORTE'
];

function validarNumeroDocumento(tipo, numero) {
  switch (tipo) {
    case 'DNI':
      return /^\d{8}$/.test(numero);

    case 'CE':
      return /^[A-Z0-9]{9,12}$/.test(numero);

    case 'PASAPORTE':
      return /^[A-Z0-9]{6,20}$/.test(numero);

    default:
      return false;
  }
}

function mensajeDocumento(tipo) {
  switch (tipo) {
    case 'DNI':
      return (
        'El DNI debe contener exactamente ' +
        '8 dígitos numéricos.'
      );

    case 'CE':
      return (
        'El carné de extranjería debe contener ' +
        'entre 9 y 12 caracteres alfanuméricos.'
      );

    case 'PASAPORTE':
      return (
        'El pasaporte debe contener entre ' +
        '6 y 20 caracteres alfanuméricos.'
      );

    default:
      return 'Tipo de documento no permitido.';
  }
}

function validarDocumento(tipo, numero) {
  const tipoNormalizado = String(tipo || '')
    .trim()
    .toUpperCase();

  const numeroNormalizado = normalizarDocumento(
    String(numero || '')
  );

  if (!TIPOS_DOCUMENTO.includes(tipoNormalizado)) {
    throw errorHttp(
      'Selecciona DNI, CE o PASAPORTE.'
    );
  }

  if (
    !validarNumeroDocumento(
      tipoNormalizado,
      numeroNormalizado
    )
  ) {
    throw errorHttp(
      mensajeDocumento(tipoNormalizado)
    );
  }

  return {
    tipo: tipoNormalizado,
    numero: numeroNormalizado
  };
}

// =====================================================
// VALIDACIONES DE FECHAS Y TELÉFONO
// =====================================================

function validarFecha(fecha) {
  if (!fecha) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }

  const [anio, mes, dia] = fecha
    .split('-')
    .map(Number);

  const comprobacion = new Date(
    Date.UTC(anio, mes - 1, dia, 12)
  );

  return (
    comprobacion.getUTCFullYear() === anio &&
    comprobacion.getUTCMonth() === mes - 1 &&
    comprobacion.getUTCDate() === dia &&
    fecha <= fechaHoy()
  );
}

function validarTelefono(telefono) {
  if (!telefono) return true;

  const digitos = telefono.replace(/\D/g, '');

  return (
    /^[+0-9()\s-]{6,20}$/.test(telefono) &&
    digitos.length >= 6 &&
    digitos.length <= 15
  );
}

// =====================================================
// VALIDACIONES DE NOMBRES
// =====================================================

const patronNombre =
  /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;

const nombreSchema = z.string()
  .trim()
  .transform(limpiarTexto)
  .pipe(
    z.string()
      .min(
        2,
        'Los nombres deben tener al menos 2 caracteres.'
      )
      .max(
        100,
        'Los nombres no pueden superar 100 caracteres.'
      )
      .regex(
        patronNombre,
        'Los nombres solo permiten letras y separadores válidos.'
      )
  );

const apellidoSchema = z.string()
  .trim()
  .transform(limpiarTexto)
  .pipe(
    z.string()
      .min(
        2,
        'Los apellidos deben tener al menos 2 caracteres.'
      )
      .max(
        120,
        'Los apellidos no pueden superar 120 caracteres.'
      )
      .regex(
        patronNombre,
        'Los apellidos solo permiten letras y separadores válidos.'
      )
  );

// =====================================================
// ESQUEMA PRINCIPAL
// =====================================================

const esquema = z.object({
  tipoDocumento: z.enum([
    'DNI',
    'CE',
    'PASAPORTE'
  ]),

  numeroDocumento: z.string()
    .trim()
    .min(
      1,
      'Ingresa el número de documento.'
    )
    .max(20)
    .transform(normalizarDocumento),

  nombres: nombreSchema,

  apellidos: apellidoSchema,

  fechaNacimiento: z.string()
    .nullable()
    .optional()
    .refine(
      validarFecha,
      'La fecha de nacimiento no es válida o es futura.'
    ),

  telefono: z.string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .refine(
      validarTelefono,
      'Ingresa un número de teléfono válido.'
    ),

  usuarioId: z.number()
    .int()
    .positive()
    .safe()
    .nullable()
    .optional(),

  estado: z.enum([
    'ACTIVO',
    'INACTIVO'
  ])
}).superRefine((datos, contexto) => {
  if (
    !validarNumeroDocumento(
      datos.tipoDocumento,
      datos.numeroDocumento
    )
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['numeroDocumento'],
      message: mensajeDocumento(
        datos.tipoDocumento
      )
    });
  }
});

function validarDatos(body) {
  const resultado = esquema.safeParse(body);

  if (!resultado.success) {
    throw errorHttp(
      resultado.error.issues[0]?.message ||
      'Los datos del pasajero son inválidos.'
    );
  }

  return resultado.data;
}

const idSchema = z.coerce.number()
  .int()
  .positive()
  .safe();

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw errorHttp(
      'Identificador de pasajero inválido.'
    );
  }

  return resultado.data;
}

async function consultarApiInti(dni) {
  const apiKey = process.env.APIINTI_API_KEY;

  if (!apiKey) {
    throw errorHttp(
      'No se configuró APIINTI_API_KEY en el backend.',
      503
    );
  }

  let respuesta;

  try {
    respuesta = await fetch(
      `https://app.apiinti.dev/api/v1/dni/${dni}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      }
    );
  } catch {
    throw errorHttp(
      'No se pudo conectar con ApiInti.',
      502
    );
  }

  if (
    respuesta.status === 401 ||
    respuesta.status === 403
  ) {
    throw errorHttp(
      'La API Key de ApiInti fue rechazada.',
      502
    );
  }

  if (respuesta.status === 429) {
    throw errorHttp(
      'Se alcanzó el límite de consultas de ApiInti.',
      429
    );
  }

  if (respuesta.status === 404) {
    throw errorHttp(
      'No se encontraron datos para el DNI consultado.',
      404
    );
  }

  if (!respuesta.ok) {
    throw errorHttp(
      'ApiInti no pudo completar la consulta.',
      502
    );
  }

  const resultado = await respuesta
    .json()
    .catch(() => null);

  const persona = resultado?.data;

  if (
    resultado?.success === false ||
    !persona ||
    typeof persona.nombres !== 'string' ||
    typeof persona.apellidoPaterno !== 'string'
  ) {
    throw errorHttp(
      'La API no devolvió datos válidos del DNI.',
      502
    );
  }

  const nombres = limpiarTexto(
    persona.nombres
  );

  const apellidos = limpiarTexto(
    [
      persona.apellidoPaterno,
      persona.apellidoMaterno
    ]
      .filter(
        valor =>
          typeof valor === 'string' &&
          valor.trim()
      )
      .join(' ')
  );

  if (
    !patronNombre.test(nombres) ||
    !patronNombre.test(apellidos) ||
    nombres.length < 2 ||
    apellidos.length < 2
  ) {
    throw errorHttp(
      'Los nombres o apellidos devueltos no son válidos.',
      502
    );
  }

  return {
    fuente: 'APIINTI',
    encontrado: true,
    registrado: false,
    pasajeroId: null,
    tipoDocumento: 'DNI',
    numeroDocumento: dni,
    dni,
    nombres,
    apellidos,
    fechaNacimiento: null,
    estado: null
  };
}

function respuestaPasajero(pasajero) {
  return {
    fuente: 'SQL_SERVER',
    encontrado: true,
    registrado: true,
    pasajeroId: pasajero.PasajeroID,
    tipoDocumento: pasajero.TipoDocumento,
    numeroDocumento: pasajero.NumeroDocumento,
    dni: pasajero.TipoDocumento === 'DNI'
      ? pasajero.NumeroDocumento
      : null,
    nombres: pasajero.Nombres,
    apellidos: pasajero.Apellidos,
    fechaNacimiento: pasajero.FechaNacimiento,
    estado: pasajero.Estado
  };
}

function respuestaDocumentoNoRegistrado(
  tipo,
  numero
) {
  return {
    fuente: 'REGISTRO_MANUAL',
    encontrado: false,
    registrado: false,
    pasajeroId: null,
    tipoDocumento: tipo,
    numeroDocumento: numero,
    dni: null,
    nombres: '',
    apellidos: '',
    fechaNacimiento: null,
    estado: null,
    mensaje:
      'Documento no registrado. Ingresa los datos del pasajero.'
  };
}


export async function consultarPorDni(rawDni) {
  const { numero: dni } = validarDocumento('DNI', rawDni);
  const existente = await repo.buscarDocumento('DNI', dni);
  return existente ? respuestaPasajero(existente) : consultarApiInti(dni);
}

export async function consultarPorDocumento(rawTipo, rawNumero) {
  const { tipo, numero } = validarDocumento(rawTipo, rawNumero);
  const existente = await repo.buscarDocumento(tipo, numero);
  if (existente) return respuestaPasajero(existente);
  if (tipo === 'DNI') return consultarApiInti(numero);
  return respuestaDocumentoNoRegistrado(tipo, numero);
}

export async function listarPasajeros(q) {
  return repo.listar(String(q || '').trim().slice(0, 100));
}

export async function obtenerPasajero(rawId) {
  const id = obtenerId(rawId);
  const pasajero = await repo.obtener(id);
  if (!pasajero) throw errorHttp('Pasajero no encontrado.', 404);
  return pasajero;
}

export async function registrarPasajero(body) {
  const datos = validarDatos(body);
  const id = await repo.registrar(datos);
  return {
    PasajeroID: id,
    TipoDocumento: datos.tipoDocumento,
    NumeroDocumento: datos.numeroDocumento,
    mensaje: 'Pasajero registrado correctamente.'
  };
}

export async function actualizarPasajero(rawId, body) {
  const id = obtenerId(rawId);
  const datos = validarDatos(body);
  await repo.actualizar(id, datos);
  return {
    PasajeroID: id,
    TipoDocumento: datos.tipoDocumento,
    NumeroDocumento: datos.numeroDocumento,
    mensaje: 'Pasajero actualizado correctamente.'
  };
}

export async function cambiarEstadoPasajero(rawId, body) {
  const id = obtenerId(rawId);
  const validacion = z.object({ estado: z.enum(['ACTIVO', 'INACTIVO']) }).safeParse(body);
  if (!validacion.success) throw errorHttp('El estado debe ser ACTIVO o INACTIVO.');
  const { estado } = validacion.data;
  const afectados = await repo.cambiarEstado(id, estado);
  if (!afectados) throw errorHttp('Pasajero no encontrado.', 404);
  return { PasajeroID: id, Estado: estado, mensaje: 'Estado del pasajero actualizado correctamente.' };
}
