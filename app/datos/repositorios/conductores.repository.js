import { getPool, sql } from '../config/db.js';

const fields = `
  ConductorID,
  TipoDocumento,
  NumeroDocumento,
  Nombres,
  Apellidos,
  NumeroLicencia,
  CONVERT(VARCHAR(10), FechaVencimientoLicencia, 23) AS FechaVencimientoLicencia,
  Estado
`;

function inputs(request, datos) {
  return request
    .input('tipo', sql.VarChar(12), datos.tipoDocumento)
    .input('numero', sql.VarChar(20), datos.numeroDocumento)
    .input('nombres', sql.NVarChar(100), datos.nombres)
    .input('apellidos', sql.NVarChar(120), datos.apellidos)
    .input('licencia', sql.VarChar(30), datos.numeroLicencia)
    .input('vence', sql.VarChar(10), datos.fechaVencimientoLicencia || null)
    .input('estado', sql.VarChar(12), datos.estado);
}

export async function listar(q) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('q', sql.NVarChar(110), `%${q}%`)
    .query(`
      SELECT ${fields}
      FROM dbo.Conductor
      WHERE Nombres LIKE @q
         OR Apellidos LIKE @q
         OR NumeroDocumento LIKE @q
         OR NumeroLicencia LIKE @q
      ORDER BY ConductorID DESC
    `);
  return resultado.recordset;
}

export async function obtener(id) {
  const pool = await getPool();
  const resultado = await pool.request().input('id', sql.Int, id)
    .query(`SELECT ${fields} FROM dbo.Conductor WHERE ConductorID = @id`);
  return resultado.recordset[0] || null;
}

export async function enTransaccion(operacion) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let finalizada = false;
  try {
    const resultado = await operacion(tx);
    await tx.commit();
    finalizada = true;
    return resultado;
  } catch (error) {
    if (!finalizada) await tx.rollback().catch(() => {});
    throw error;
  }
}

export async function buscarDuplicado(tx, datos, excluirId = null) {
  let request = new sql.Request(tx);
  if (excluirId !== null) request = request.input('id', sql.Int, excluirId);
  const resultado = await inputs(request, datos).query(`
    SELECT ConductorID FROM dbo.Conductor WITH (UPDLOCK, HOLDLOCK)
    WHERE ${excluirId === null ? '' : 'ConductorID <> @id AND'}
      ((TipoDocumento = @tipo AND NumeroDocumento = @numero)
      OR NumeroLicencia = @licencia)
  `);
  return resultado.recordset.length > 0;
}

export async function existeBloqueado(tx, id) {
  const resultado = await new sql.Request(tx).input('id', sql.Int, id)
    .query(`
      SELECT ConductorID
      FROM dbo.Conductor WITH (UPDLOCK, HOLDLOCK)
      WHERE ConductorID = @id
    `);
  return resultado.recordset.length > 0;
}

export async function insertar(tx, datos) {
  const resultado = await inputs(new sql.Request(tx), datos).query(`
    INSERT INTO dbo.Conductor (
      TipoDocumento, NumeroDocumento, Nombres,
      Apellidos, NumeroLicencia, FechaVencimientoLicencia, Estado
    )
    OUTPUT INSERTED.ConductorID
    VALUES (@tipo, @numero, @nombres, @apellidos, @licencia,
            CASE WHEN @vence IS NULL THEN NULL ELSE CONVERT(date, @vence, 23) END,
            @estado)
  `);
  return resultado.recordset[0].ConductorID;
}

export async function actualizar(tx, id, datos) {
  const resultado = await inputs(new sql.Request(tx).input('id', sql.Int, id), datos).query(`
    UPDATE dbo.Conductor
    SET TipoDocumento = @tipo,
        NumeroDocumento = @numero,
        Nombres = @nombres,
        Apellidos = @apellidos,
        NumeroLicencia = @licencia,
        FechaVencimientoLicencia =
          CASE WHEN @vence IS NULL THEN NULL ELSE CONVERT(date, @vence, 23) END,
        Estado = @estado
    WHERE ConductorID = @id
  `);
  return resultado.rowsAffected[0] || 0;
}

export async function cambiarEstado(id, estado) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('id', sql.Int, id)
    .input('estado', sql.VarChar(12), estado)
    .query(`UPDATE dbo.Conductor SET Estado = @estado WHERE ConductorID = @id`);
  return resultado.rowsAffected[0] || 0;
}
