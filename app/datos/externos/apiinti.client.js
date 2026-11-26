// SIGET-VÍA — CAPA DE ACCESO A DATOS — Fuente externa: servicio APIINTI (consulta de DNI)
// Es una fuente de datos externa, por eso vive en la capa de datos.
// No registra DNI ni respuestas en logs y no expone la clave del servicio.

function fallo(mensaje, statusCode) {
  return Object.assign(new Error(mensaje), { statusCode, esNegocio: true });
}

// Devuelve los datos crudos de la persona o null si no existe.
export async function consultarDni(dni) {
  const apiKey = process.env.APIINTI_API_KEY;
  if (!apiKey) throw fallo('El servicio de consulta de DNI no está configurado.', 503);

  let respuesta;
  try {
    respuesta = await fetch(`https://app.apiinti.dev/api/v1/dni/${dni}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw fallo('No se pudo conectar con el servicio de consulta.', 502);
  }

  if (respuesta.status === 401 || respuesta.status === 403) {
    throw fallo('El servicio de consulta no está autorizado.', 503);
  }
  if (respuesta.status === 429) {
    throw fallo('El servicio alcanzó su límite de consultas.', 429);
  }
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw fallo('El servicio no pudo completar la consulta.', 502);

  const resultado = await respuesta.json().catch(() => null);
  const persona = resultado?.data;
  if (resultado?.success === false || !persona ||
      typeof persona.nombres !== 'string' ||
      typeof persona.apellidoPaterno !== 'string') {
    throw fallo('El servicio devolvió información inválida.', 502);
  }
  return persona;
}
