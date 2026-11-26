// =====================================================
// SIGET-VÍA — VISTA — SERVICIO DE COMUNICACIÓN CON LA API
// Cliente HTTP único para comunicarse con la API REST.
// Ninguna vista usa fetch directamente: todas las
// peticiones pasan por este archivo.
// =====================================================

export const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
).replace(/\/$/, '');

type CuerpoError = {
  error?: unknown;
  details?: Array<{ message?: string; path?: Array<string | number> }>;
};

export type FormatoError = (cuerpo: CuerpoError, status: number) => string;

export type OpcionesPeticion = {
  token?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  // Objeto que se enviará como JSON.
  json?: unknown;
  // Cuerpo crudo (por ejemplo, una imagen).
  body?: BodyInit;
  headers?: Record<string, string>;
  cache?: RequestCache;
  signal?: AbortSignal;
  formatoError?: FormatoError;
};

// Mensaje por defecto: campo "error" del backend o el código HTTP.
const mensajePorDefecto: FormatoError = (cuerpo, status) =>
  typeof cuerpo.error === 'string' ? cuerpo.error : `Error HTTP ${status}`;

// Variante que prioriza los detalles de validación (Zod).
export const mensajeConDetalles = (separador: string, conRuta = false): FormatoError =>
  (cuerpo, status) => {
    const detalle = cuerpo.details
      ?.map(item => conRuta
        ? `${(item.path || []).join('.')}: ${item.message || 'Dato inválido'}`
        : item.message)
      .filter(Boolean)
      .join(separador);
    return detalle || (typeof cuerpo.error === 'string' && cuerpo.error) || `Error HTTP ${status}`;
  };

export class ErrorApi extends Error {
  status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.status = status;
  }
}

async function enviar(ruta: string, op: OpcionesPeticion): Promise<Response> {
  const headers: Record<string, string> = { ...(op.headers || {}) };
  if (op.token) headers.Authorization = `Bearer ${op.token}`;
  if (op.json !== undefined) headers['Content-Type'] = 'application/json';

  return fetch(`${API_URL}${ruta}`, {
    method: op.method || 'GET',
    headers,
    body: op.json !== undefined ? JSON.stringify(op.json) : op.body,
    cache: op.cache,
    signal: op.signal
  });
}

async function lanzarSiFalla(respuesta: Response, op: OpcionesPeticion) {
  if (respuesta.ok) return;
  const cuerpo = (await respuesta.json().catch(() => ({}))) as CuerpoError;
  throw new ErrorApi((op.formatoError || mensajePorDefecto)(cuerpo, respuesta.status), respuesta.status);
}

// Petición que devuelve JSON.
export async function peticion<T>(ruta: string, op: OpcionesPeticion = {}): Promise<T> {
  const respuesta = await enviar(ruta, op);
  await lanzarSiFalla(respuesta, op);
  return (await respuesta.json().catch(() => ({}))) as T;
}

// Petición que devuelve un archivo (Blob), p. ej. una foto.
// Devuelve null cuando el recurso no existe (404).
export async function peticionArchivo(ruta: string, op: OpcionesPeticion = {}): Promise<Blob | null> {
  const respuesta = await enviar(ruta, op);
  if (respuesta.status === 404) return null;
  await lanzarSiFalla(respuesta, op);
  return respuesta.blob();
}

export const conQuery = (ruta: string, params: Record<string, string | number | undefined | null>) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const texto = qs.toString();
  return texto ? `${ruta}?${texto}` : ruta;
};
