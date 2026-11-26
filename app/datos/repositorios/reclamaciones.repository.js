// SIGET-VÍA — CAPA DE ACCESO A DATOS — Libro de reclamaciones (RF11, RF12, RF13)
import { getPool, sql } from '../config/db.js';

export { enTransaccion, NIVEL } from '../config/transaccion.js';

const COLUMNAS = `
  r.ReclamacionID, r.NumeroCorrelativo, r.UsuarioID, r.ReservaID,
  r.TipoDocumento, r.NumeroDocumento, r.NombreReclamante, r.CorreoReclamante,
  r.TelefonoReclamante, r.TipoSolicitud, r.Descripcion, r.Pedido,
  r.FechaRegistro, r.Estado
`;

function camposReclamacion(request, d) {
  return request
    .input('tipoDocumento', sql.VarChar(12), d.tipoDocumento)
    .input('numeroDocumento', sql.VarChar(20), d.numeroDocumento)
    .input('nombre', sql.NVarChar(220), d.nombreReclamante)
    .input('correo', sql.NVarChar(254), d.correoReclamante)
    .input('telefono', sql.VarChar(20), d.telefonoReclamante || null)
    .input('tipoSolicitud', sql.VarChar(10), d.tipoSolicitud)
    .input('descripcion', sql.NVarChar(sql.MAX), d.descripcion)
    .input('pedido', sql.NVarChar(sql.MAX), d.pedido);
}

// ---------- Canal público ----------

// NumeroCorrelativo lo calcula SQL Server. Solo se guarda el hash del código privado.
// usuarioId: cliente con sesión iniciada (o null si el registro es anónimo).
export async function insertarPublica(tx, d, tokenHash, usuarioId = null) {
  const r = await camposReclamacion(new sql.Request(tx), d)
    .input('hash', sql.VarBinary(32), tokenHash)
    .input('usuarioId', sql.BigInt, usuarioId)
    .query(`
      INSERT INTO dbo.Reclamacion (
        UsuarioID, ReservaID, TipoDocumento, NumeroDocumento, NombreReclamante,
        CorreoReclamante, TelefonoReclamante, TipoSolicitud, Descripcion, Pedido,
        FechaRegistro, Estado, TokenConsultaHash, FechaTokenConsulta
      )
      OUTPUT INSERTED.ReclamacionID
      VALUES (
        @usuarioId, NULL, @tipoDocumento, @numeroDocumento, @nombre,
        @correo, @telefono, @tipoSolicitud, @descripcion, @pedido,
        SYSDATETIME(), 'REGISTRADO', @hash, SYSDATETIME()
      )
    `);
  return r.recordset[0].ReclamacionID;
}

export async function obtenerResumenRegistro(tx, id, incluirTipo) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .query(`
      SELECT ReclamacionID, NumeroCorrelativo,
             ${incluirTipo ? 'TipoSolicitud,' : ''}
             FechaRegistro, Estado
      FROM dbo.Reclamacion
      WHERE ReclamacionID = @id
    `);
  return r.recordset[0];
}

export async function buscarPorCredenciales(numero, hash) {
  const pool = await getPool();
  const r = await pool.request()
    .input('numero', sql.VarChar(14), numero)
    .input('hash', sql.VarBinary(32), hash)
    .query(`
      SELECT ReclamacionID, NumeroCorrelativo, TipoSolicitud, FechaRegistro, Estado
      FROM dbo.Reclamacion
      WHERE NumeroCorrelativo = @numero AND TokenConsultaHash = @hash
    `);
  return r.recordset[0] || null;
}

// Seguimiento público: sin datos del responsable.
export async function listarHistorialPublico(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`
      SELECT EstadoNuevo, FechaCambio
      FROM dbo.HistorialReclamacion
      WHERE ReclamacionID = @id
      ORDER BY FechaCambio, HistorialID
    `);
  return r.recordset;
}

export async function listarRespuestasPublicas(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`
      SELECT Contenido, FechaRespuesta
      FROM dbo.RespuestaReclamacion
      WHERE ReclamacionID = @id
      ORDER BY FechaRespuesta, RespuestaID
    `);
  return r.recordset;
}

// ---------- Administración ----------

export async function obtenerResumen() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT
      COUNT_BIG(*) AS Total,
      COALESCE(SUM(CASE WHEN Estado = 'REGISTRADO' THEN 1 ELSE 0 END), 0) AS Registrados,
      COALESCE(SUM(CASE WHEN Estado = 'EN_ATENCION' THEN 1 ELSE 0 END), 0) AS EnAtencion,
      COALESCE(SUM(CASE WHEN Estado = 'RESPONDIDO' THEN 1 ELSE 0 END), 0) AS Respondidos,
      COALESCE(SUM(CASE WHEN Estado = 'CERRADO' THEN 1 ELSE 0 END), 0) AS Cerrados
    FROM dbo.Reclamacion
  `);
  return r.recordset[0];
}

export async function listar({ q, estado, tipo }) {
  const pool = await getPool();
  const r = await pool.request()
    .input('q', sql.NVarChar(110), `%${q}%`)
    .input('estado', sql.NVarChar(15), estado)
    .input('tipo', sql.NVarChar(10), tipo)
    .query(`
      SELECT TOP (500) ${COLUMNAS}
      FROM dbo.Reclamacion r
      WHERE (@estado = '' OR r.Estado = @estado)
        AND (@tipo = '' OR r.TipoSolicitud = @tipo)
        AND (
          r.NumeroCorrelativo LIKE @q OR r.NombreReclamante LIKE @q
          OR r.NumeroDocumento LIKE @q OR r.CorreoReclamante LIKE @q
          OR r.Descripcion LIKE @q OR CONVERT(VARCHAR(30), r.ReclamacionID) LIKE @q
        )
      ORDER BY r.FechaRegistro DESC, r.ReclamacionID DESC
    `);
  return r.recordset;
}

// Devuelve { reclamacion, respuestas, historial } (reclamacion = null si no existe).
export async function obtenerDetalle(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`
      SELECT ${COLUMNAS} FROM dbo.Reclamacion r WHERE r.ReclamacionID = @id;

      SELECT rr.RespuestaID, rr.ReclamacionID, rr.ResponsableID, rr.Contenido,
             rr.FechaRespuesta, u.Nombres AS ResponsableNombres,
             u.Apellidos AS ResponsableApellidos
      FROM dbo.RespuestaReclamacion rr
      LEFT JOIN dbo.Usuario u ON u.UsuarioID = rr.ResponsableID
      WHERE rr.ReclamacionID = @id
      ORDER BY rr.FechaRespuesta, rr.RespuestaID;

      SELECT h.HistorialID, h.ReclamacionID, h.ResponsableID, h.EstadoAnterior,
             h.EstadoNuevo, h.Observacion, h.FechaCambio,
             u.Nombres AS ResponsableNombres, u.Apellidos AS ResponsableApellidos
      FROM dbo.HistorialReclamacion h
      LEFT JOIN dbo.Usuario u ON u.UsuarioID = h.ResponsableID
      WHERE h.ReclamacionID = @id
      ORDER BY h.FechaCambio, h.HistorialID;
    `);
  return {
    reclamacion: r.recordsets[0][0] || null,
    respuestas: r.recordsets[1],
    historial: r.recordsets[2]
  };
}

export async function existeUsuario(tx, usuarioId) {
  const r = await new sql.Request(tx)
    .input('usuarioId', sql.BigInt, usuarioId)
    .query(`SELECT UsuarioID FROM dbo.Usuario WHERE UsuarioID = @usuarioId`);
  return r.recordset.length > 0;
}

export async function obtenerReserva(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('reservaId', sql.BigInt, reservaId)
    .query(`SELECT ReservaID, UsuarioID FROM dbo.Reserva WHERE ReservaID = @reservaId`);
  return r.recordset[0] || null;
}

export async function insertarAdministrativa(tx, d) {
  const r = await camposReclamacion(new sql.Request(tx), d)
    .input('usuarioId', sql.BigInt, d.usuarioId ?? null)
    .input('reservaId', sql.BigInt, d.reservaId ?? null)
    .query(`
      INSERT INTO dbo.Reclamacion (
        UsuarioID, ReservaID, TipoDocumento, NumeroDocumento, NombreReclamante,
        CorreoReclamante, TelefonoReclamante, TipoSolicitud, Descripcion, Pedido,
        FechaRegistro, Estado
      )
      OUTPUT INSERTED.ReclamacionID
      VALUES (
        @usuarioId, @reservaId, @tipoDocumento, @numeroDocumento, @nombre,
        @correo, @telefono, @tipoSolicitud, @descripcion, @pedido,
        SYSDATETIME(), 'REGISTRADO'
      )
    `);
  return r.recordset[0].ReclamacionID;
}

export async function obtenerEstadoBloqueado(tx, id) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .query(`
      SELECT Estado FROM dbo.Reclamacion WITH (UPDLOCK, HOLDLOCK)
      WHERE ReclamacionID = @id
    `);
  return r.recordset[0]?.Estado ?? null;
}

export async function contarRespuestas(tx, id) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .query(`SELECT COUNT_BIG(*) AS Total FROM dbo.RespuestaReclamacion WHERE ReclamacionID = @id`);
  return Number(r.recordset[0].Total);
}

export async function actualizarEstado(tx, id, estado) {
  await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .input('estado', sql.VarChar(15), estado)
    .query(`UPDATE dbo.Reclamacion SET Estado = @estado WHERE ReclamacionID = @id`);
}

export async function insertarRespuesta(tx, id, responsableId, contenido) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .input('responsableId', sql.BigInt, responsableId)
    .input('contenido', sql.NVarChar(sql.MAX), contenido)
    .query(`
      INSERT INTO dbo.RespuestaReclamacion (ReclamacionID, ResponsableID, Contenido, FechaRespuesta)
      OUTPUT INSERTED.RespuestaID
      VALUES (@id, @responsableId, @contenido, SYSDATETIME())
    `);
  return r.recordset[0].RespuestaID;
}

// responsableId = null para el canal público (sin sesión).
export async function insertarHistorial(tx, { id, responsableId, anterior, nuevo, observacion }) {
  await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .input('responsable', sql.BigInt, responsableId)
    .input('anterior', sql.VarChar(15), anterior)
    .input('nuevo', sql.VarChar(15), nuevo)
    .input('observacion', sql.NVarChar(500), observacion)
    .query(`
      INSERT INTO dbo.HistorialReclamacion (
        ReclamacionID, ResponsableID, EstadoAnterior, EstadoNuevo, Observacion, FechaCambio
      )
      VALUES (@id, @responsable, @anterior, @nuevo, @observacion, SYSDATETIME())
    `);
}

export async function registrarAuditoria(tx, { usuarioId, entidad, registroId, accion, detalle }) {
  await new sql.Request(tx)
    .input('usuarioId', sql.BigInt, usuarioId)
    .input('entidad', sql.VarChar(70), entidad)
    .input('registroId', sql.BigInt, registroId)
    .input('accion', sql.VarChar(20), accion)
    .input('detalle', sql.NVarChar(1000), detalle)
    .query(`
      INSERT INTO dbo.Auditoria (UsuarioID, Entidad, RegistroID, Accion, Detalle, Fecha)
      VALUES (@usuarioId, @entidad, @registroId, @accion, @detalle, SYSDATETIME())
    `);
}

// ---------- Cliente autenticado: Mis reclamaciones (CU012) ----------

export async function listarDeUsuario(usuarioId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('usuarioId', sql.BigInt, usuarioId)
    .query(`
      SELECT ReclamacionID, NumeroCorrelativo, TipoSolicitud, FechaRegistro, Estado,
             LEFT(Descripcion, 160) AS Resumen
      FROM dbo.Reclamacion
      WHERE UsuarioID = @usuarioId
      ORDER BY FechaRegistro DESC, ReclamacionID DESC
    `);
  return r.recordset;
}

// Devuelve null si no existe o no pertenece al usuario.
export async function obtenerDeUsuario(usuarioId, id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('usuarioId', sql.BigInt, usuarioId)
    .input('id', sql.BigInt, id)
    .query(`
      SELECT ReclamacionID, NumeroCorrelativo, TipoDocumento, NumeroDocumento,
             NombreReclamante, CorreoReclamante, TelefonoReclamante, TipoSolicitud,
             Descripcion, Pedido, FechaRegistro, Estado
      FROM dbo.Reclamacion
      WHERE ReclamacionID = @id AND UsuarioID = @usuarioId;

      SELECT EstadoNuevo, Observacion, FechaCambio
      FROM dbo.HistorialReclamacion
      WHERE ReclamacionID = @id
      ORDER BY FechaCambio, HistorialID;

      SELECT Contenido, FechaRespuesta
      FROM dbo.RespuestaReclamacion
      WHERE ReclamacionID = @id
      ORDER BY FechaRespuesta, RespuestaID;
    `);
  const reclamacion = r.recordsets[0][0];
  if (!reclamacion) return null;
  return { reclamacion, historial: r.recordsets[1], respuestas: r.recordsets[2] };
}
