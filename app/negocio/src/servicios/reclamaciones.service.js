// SIGET-VÍA — CAPA DE LÓGICA — Libro de reclamaciones (RF11, RF12, RF13)
// Código privado de 8 caracteres (solo se guarda su hash SHA-256).
import { randomInt, createHash } from 'node:crypto';
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/reclamaciones.repository.js';
import { errorHttp } from '../utils/errores.js';

export const ESTADOS = ['REGISTRADO', 'EN_ATENCION', 'RESPONDIDO', 'CERRADO'];
export const TIPOS = ['RECLAMO', 'QUEJA'];
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Flujo permitido de estados.
const TRANSICIONES = {
  REGISTRADO: ['EN_ATENCION'],
  EN_ATENCION: ['RESPONDIDO'],
  RESPONDIDO: ['CERRADO'],
  CERRADO: []
};

const idSchema = z.coerce.number().int().positive().safe();

const reclamacionSchema = z.object({
  usuarioId: idSchema.nullable().optional(),
  reservaId: idSchema.nullable().optional(),
  tipoDocumento: z.string().trim().min(1).max(12),
  numeroDocumento: z.string().trim().min(4).max(20),
  nombreReclamante: z.string().trim().min(3).max(220),
  correoReclamante: z.string().trim().email().max(254),
  telefonoReclamante: z.string().trim().max(20).nullable().optional(),
  tipoSolicitud: z.enum(TIPOS),
  descripcion: z.string().trim().min(10).max(5000),
  pedido: z.string().trim().min(5).max(5000)
});

// El canal público no permite enviar UsuarioID ni ReservaID.
const solicitudPublicaSchema = reclamacionSchema
  .omit({ usuarioId: true, reservaId: true })
  .strict();

// Código nuevo: 8 alfanuméricos. Código anterior: 64 hexadecimales.
const consultaPublicaSchema = z.object({
  numeroCorrelativo: z.string().trim().regex(/^REC-\d{10}$/, 'Número correlativo inválido.'),
  codigoPrivado: z.string().trim().regex(
    /^(?:[A-Za-z0-9]{8}|[A-Fa-f0-9]{64})$/,
    'El código privado no tiene un formato válido.'
  )
}).strict();

const estadoSchema = z.object({
  estado: z.enum(ESTADOS),
  observacion: z.string().trim().max(500).optional().default('')
});

const respuestaSchema = z.object({
  contenido: z.string().trim().min(10).max(5000)
});

function obtenerId(valor) {
  const r = idSchema.safeParse(valor);
  if (!r.success) throw errorHttp('El identificador no es válido.');
  return r.data;
}

// Exactamente 8 caracteres, con al menos una letra y un número.
function generarCodigoPrivado() {
  let codigo;
  do {
    codigo = '';
    for (let i = 0; i < 8; i++) codigo += ALFABETO[randomInt(ALFABETO.length)];
  } while (!/[A-Z]/.test(codigo) || !/[0-9]/.test(codigo));
  return codigo;
}

function calcularHash(codigo) {
  return createHash('sha256').update(codigo, 'utf8').digest();
}

// ---------- CU011 — Registro público ----------
// usuario: cliente con sesión iniciada (opcional). Si existe, la reclamación
// queda vinculada a su cuenta y aparece en "Mis reclamaciones" (CU012).
export async function registrarPublica(body, usuario = null) {
  const usuarioId = usuario?.Rol === 'CLIENTE' ? usuario.UsuarioID : null;
  const d = solicitudPublicaSchema.parse(body);
  const codigoPrivado = generarCodigoPrivado();
  const tokenHash = calcularHash(codigoPrivado);

  return repo.enTransaccion(async tx => {
    const id = await repo.insertarPublica(tx, d, tokenHash, usuarioId);
    await repo.insertarHistorial(tx, {
      id, responsableId: null, anterior: null, nuevo: 'REGISTRADO',
      observacion: 'Reclamación recibida por el canal público.'
    });
    const resumen = await repo.obtenerResumenRegistro(tx, id, true);
    // El código original solo se entrega en esta respuesta.
    return {
      ...resumen,
      codigoPrivado,
      mensaje: 'Reclamación registrada correctamente. Guarde su código privado de consulta.'
    };
  }, repo.NIVEL.SERIALIZABLE);
}

// ---------- CU012 — Consulta pública ----------
export async function consultarPublica(body) {
  const d = consultaPublicaSchema.parse(body);
  const codigo = d.codigoPrivado.trim();
  // 64 caracteres: formato anterior en minúsculas; 8 caracteres: mayúsculas.
  const normalizado = codigo.length === 64 ? codigo.toLowerCase() : codigo.toUpperCase();

  const reclamacion = await repo.buscarPorCredenciales(d.numeroCorrelativo, calcularHash(normalizado));
  if (!reclamacion) {
    throw errorHttp('No se encontró una reclamación con esas credenciales.', 404);
  }
  return {
    reclamacion,
    historial: await repo.listarHistorialPublico(reclamacion.ReclamacionID),
    respuestas: await repo.listarRespuestasPublicas(reclamacion.ReclamacionID)
  };
}

// ---------- CU013 — Gestión administrativa ----------
export const catalogos = () => ({ estados: ESTADOS, tipos: TIPOS });

export const resumen = () => repo.obtenerResumen();

export async function listar(query) {
  const q = String(query.q || '').trim().slice(0, 100);
  const estado = String(query.estado || '').trim().toUpperCase();
  const tipo = String(query.tipo || '').trim().toUpperCase();
  if (estado && !ESTADOS.includes(estado)) throw errorHttp('Estado de reclamación inválido.');
  if (tipo && !TIPOS.includes(tipo)) throw errorHttp('Tipo de solicitud inválido.');
  return repo.listar({ q, estado, tipo });
}

export async function detalle(idRaw) {
  const datos = await repo.obtenerDetalle(obtenerId(idRaw));
  if (!datos.reclamacion) throw errorHttp('Reclamación no encontrada.', 404);
  return datos;
}

export async function registrarAdministrativa(body, usuarioActualId) {
  const d = reclamacionSchema.parse(body);

  return repo.enTransaccion(async tx => {
    if (d.usuarioId != null && !(await repo.existeUsuario(tx, d.usuarioId))) {
      throw errorHttp('El usuario vinculado no existe.');
    }
    if (d.reservaId != null) {
      const reserva = await repo.obtenerReserva(tx, d.reservaId);
      if (!reserva) throw errorHttp('La reserva vinculada no existe.');
      if (d.usuarioId != null && Number(reserva.UsuarioID) !== Number(d.usuarioId)) {
        throw errorHttp('La reserva no pertenece al usuario indicado.');
      }
    }

    const id = await repo.insertarAdministrativa(tx, d);
    await repo.insertarHistorial(tx, {
      id, responsableId: usuarioActualId, anterior: null, nuevo: 'REGISTRADO',
      observacion: 'Reclamación recibida y registrada.'
    });
    await repo.registrarAuditoria(tx, {
      usuarioId: usuarioActualId, entidad: 'Reclamacion', registroId: id, accion: 'INSERT',
      detalle: `Registro de ${d.tipoSolicitud} #${id}. Estado REGISTRADO.`
    });
    const resumenRegistro = await repo.obtenerResumenRegistro(tx, id, false);
    return { ...resumenRegistro, mensaje: 'Reclamación registrada correctamente.' };
  }, repo.NIVEL.SERIALIZABLE);
}

export async function cambiarEstado(idRaw, body, usuarioActualId) {
  const id = obtenerId(idRaw);
  const d = estadoSchema.parse(body);

  return repo.enTransaccion(async tx => {
    const anterior = await repo.obtenerEstadoBloqueado(tx, id);
    if (anterior === null) throw errorHttp('Reclamación no encontrada.', 404);
    const nuevo = d.estado;
    if (anterior === nuevo) throw errorHttp('La reclamación ya tiene ese estado.');
    if (!(TRANSICIONES[anterior] || []).includes(nuevo)) {
      throw errorHttp(`No se permite cambiar de ${anterior} a ${nuevo}.`, 409);
    }
    if (nuevo === 'RESPONDIDO' && (await repo.contarRespuestas(tx, id)) === 0) {
      throw errorHttp('Primero registra una respuesta.');
    }

    await repo.actualizarEstado(tx, id, nuevo);
    await repo.insertarHistorial(tx, {
      id, responsableId: usuarioActualId, anterior, nuevo,
      observacion: d.observacion || `Cambio de estado a ${nuevo}.`
    });
    await repo.registrarAuditoria(tx, {
      usuarioId: usuarioActualId, entidad: 'Reclamacion', registroId: id,
      accion: 'CAMBIO_ESTADO',
      detalle: `Reclamación #${id}. ${anterior} -> ${nuevo}. ${d.observacion || ''}`
    });
    return {
      ok: true, ReclamacionID: id, EstadoAnterior: anterior, EstadoNuevo: nuevo,
      mensaje: 'Estado actualizado correctamente.'
    };
  }, repo.NIVEL.SERIALIZABLE);
}

export async function registrarRespuesta(idRaw, body, usuarioActualId) {
  const id = obtenerId(idRaw);
  const d = respuestaSchema.parse(body);

  return repo.enTransaccion(async tx => {
    const estado = await repo.obtenerEstadoBloqueado(tx, id);
    if (estado === null) throw errorHttp('Reclamación no encontrada.', 404);
    if (estado !== 'EN_ATENCION') {
      throw errorHttp('La reclamación debe estar EN_ATENCION para registrar una respuesta.', 409);
    }

    const respuestaId = await repo.insertarRespuesta(tx, id, usuarioActualId, d.contenido);
    await repo.actualizarEstado(tx, id, 'RESPONDIDO');
    await repo.insertarHistorial(tx, {
      id, responsableId: usuarioActualId, anterior: 'EN_ATENCION', nuevo: 'RESPONDIDO',
      observacion: 'Respuesta registrada por personal autorizado.'
    });
    await repo.registrarAuditoria(tx, {
      usuarioId: usuarioActualId, entidad: 'RespuestaReclamacion', registroId: respuestaId,
      accion: 'INSERT', detalle: `Respuesta #${respuestaId} registrada para reclamación #${id}.`
    });
    await repo.registrarAuditoria(tx, {
      usuarioId: usuarioActualId, entidad: 'Reclamacion', registroId: id,
      accion: 'CAMBIO_ESTADO', detalle: `Reclamación #${id}. EN_ATENCION -> RESPONDIDO.`
    });
    return {
      RespuestaID: respuestaId, ReclamacionID: id, Estado: 'RESPONDIDO',
      mensaje: 'Respuesta registrada correctamente.'
    };
  }, repo.NIVEL.SERIALIZABLE);
}

// ---------- CU012 — Mis reclamaciones (cliente autenticado) ----------
export function listarMisReclamaciones(usuarioId) {
  return repo.listarDeUsuario(usuarioId);
}

export async function detalleMiReclamacion(usuarioId, idRaw) {
  const datos = await repo.obtenerDeUsuario(usuarioId, obtenerId(idRaw));
  // Si no pertenece al cliente se responde igual que si no existiera.
  if (!datos) throw errorHttp('Reclamación no encontrada.', 404);
  return datos;
}
