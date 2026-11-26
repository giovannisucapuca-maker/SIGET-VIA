// SIGET-VÍA — CAPA DE ACCESO A DATOS — Políticas del servicio (RF17)
import { getPool, sql } from '../config/db.js';

export { enTransaccion } from '../config/transaccion.js';

const consultaPoliticas = `
  SELECT PoliticaID, Tipo, Titulo, Contenido, Version,
         CONVERT(VARCHAR(10), VigenteDesde, 23) AS VigenteDesde,
         CONVERT(VARCHAR(10), VigenteHasta, 23) AS VigenteHasta,
         Activa
  FROM dbo.PoliticaServicio
`;

function parametros(request, d) {
  return request
    .input('tipo', sql.VarChar(25), d.tipo)
    .input('titulo', sql.NVarChar(150), d.titulo)
    .input('contenido', sql.NVarChar(sql.MAX), d.contenido)
    .input('version', sql.VarChar(20), d.version)
    .input('desde', sql.VarChar(10), d.vigenteDesde)
    .input('hasta', sql.VarChar(10), d.vigenteHasta || null)
    .input('activa', sql.Bit, d.activa);
}

export async function listarVigentes() {
  const pool = await getPool();
  const r = await pool.request().query(`
    ${consultaPoliticas}
    WHERE Activa = 1
      AND VigenteDesde <= CONVERT(date, SYSDATETIME())
      AND (VigenteHasta IS NULL OR VigenteHasta >= CONVERT(date, SYSDATETIME()))
    ORDER BY Tipo ASC, VigenteDesde DESC, PoliticaID DESC
  `);
  return r.recordset;
}

export async function listar(q) {
  const pool = await getPool();
  const r = await pool.request()
    .input('q', sql.NVarChar(110), `%${q}%`)
    .query(`
      ${consultaPoliticas}
      WHERE Tipo LIKE @q OR Titulo LIKE @q OR Version LIKE @q
         OR CONVERT(VARCHAR(20), PoliticaID) LIKE @q
      ORDER BY PoliticaID DESC
    `);
  return r.recordset;
}

export async function insertar(tx, d) {
  const r = await parametros(new sql.Request(tx), d).query(`
    INSERT INTO dbo.PoliticaServicio (Tipo, Titulo, Contenido, Version,
                                      VigenteDesde, VigenteHasta, Activa)
    OUTPUT INSERTED.PoliticaID
    VALUES (@tipo, @titulo, @contenido, @version,
            CONVERT(date, @desde, 23),
            CASE WHEN @hasta IS NULL THEN NULL ELSE CONVERT(date, @hasta, 23) END,
            @activa)
  `);
  return r.recordset[0].PoliticaID;
}

export async function actualizar(tx, id, d) {
  const r = await parametros(new sql.Request(tx).input('id', sql.Int, id), d).query(`
    UPDATE dbo.PoliticaServicio
    SET Tipo = @tipo, Titulo = @titulo, Contenido = @contenido, Version = @version,
        VigenteDesde = CONVERT(date, @desde, 23),
        VigenteHasta = CASE WHEN @hasta IS NULL THEN NULL ELSE CONVERT(date, @hasta, 23) END,
        Activa = @activa
    WHERE PoliticaID = @id
  `);
  return r.rowsAffected[0] || 0;
}

// Devuelve true/false o null si no existe.
export async function obtenerActivaBloqueada(tx, id) {
  const r = await new sql.Request(tx)
    .input('id', sql.Int, id)
    .query(`
      SELECT Activa FROM dbo.PoliticaServicio WITH (UPDLOCK, HOLDLOCK)
      WHERE PoliticaID = @id
    `);
  return r.recordset.length ? Boolean(r.recordset[0].Activa) : null;
}

export async function cambiarActiva(tx, id, activa) {
  await new sql.Request(tx)
    .input('id', sql.Int, id)
    .input('activa', sql.Bit, activa)
    .query(`UPDATE dbo.PoliticaServicio SET Activa = @activa WHERE PoliticaID = @id`);
}

export async function registrarAuditoria(tx, usuarioId, politicaId, accion, detalle) {
  await new sql.Request(tx)
    .input('usuarioId', sql.BigInt, usuarioId)
    .input('politicaId', sql.BigInt, politicaId)
    .input('accion', sql.VarChar(20), accion)
    .input('detalle', sql.NVarChar(1000), detalle)
    .query(`
      INSERT INTO dbo.Auditoria (UsuarioID, Entidad, RegistroID, Accion, Detalle, Fecha)
      VALUES (@usuarioId, 'PoliticaServicio', @politicaId, @accion, @detalle, SYSDATETIME())
    `);
}
