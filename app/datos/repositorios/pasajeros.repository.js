import { getPool, sql } from '../config/db.js';

const consultaBase = `
  SELECT p.PasajeroID, p.UsuarioID, p.TipoDocumento,
         p.NumeroDocumento, p.Nombres, p.Apellidos,
         p.FechaNacimiento, p.Telefono, p.Estado,
         u.Correo AS UsuarioCorreo
  FROM dbo.Pasajero p
  LEFT JOIN dbo.Usuario u ON p.UsuarioID = u.UsuarioID
`;

function agregarCampos(request, datos) {
  return request
    .input('tipo', sql.VarChar(12), datos.tipoDocumento)
    .input('numero', sql.VarChar(20), datos.numeroDocumento)
    .input('nombres', sql.NVarChar(100), datos.nombres)
    .input('apellidos', sql.NVarChar(120), datos.apellidos)
    .input('fecha', sql.Date, datos.fechaNacimiento ? new Date(`${datos.fechaNacimiento}T12:00:00Z`) : null)
    .input('telefono', sql.VarChar(20), datos.telefono || null)
    .input('usuario', sql.BigInt, datos.usuarioId ?? null)
    .input('estado', sql.VarChar(12), datos.estado);
}

export async function buscarDocumento(tipo, numero) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('tipo', sql.VarChar(12), tipo)
    .input('numero', sql.VarChar(20), numero)
    .query(`SELECT TOP (1) PasajeroID, TipoDocumento, NumeroDocumento,
                   Nombres, Apellidos, FechaNacimiento, Estado
            FROM dbo.Pasajero
            WHERE TipoDocumento = @tipo AND NumeroDocumento = @numero`);
  return resultado.recordset[0] || null;
}

export async function listar(q) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('q', sql.NVarChar(110), `%${q}%`)
    .query(`${consultaBase}
      WHERE p.Nombres LIKE @q OR p.Apellidos LIKE @q
         OR p.NumeroDocumento LIKE @q OR p.TipoDocumento LIKE @q
      ORDER BY p.PasajeroID DESC`);
  return resultado.recordset;
}

export async function obtener(id) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`${consultaBase} WHERE p.PasajeroID = @id`);
  return resultado.recordset[0] || null;
}

async function validarUsuario(tx, usuarioId) {
  if (usuarioId === null || usuarioId === undefined) return false;
  const resultado = await new sql.Request(tx)
    .input('usuario', sql.BigInt, usuarioId)
    .query(`SELECT UsuarioID FROM dbo.Usuario WITH (HOLDLOCK) WHERE UsuarioID = @usuario`);
  return resultado.recordset.length > 0;
}

export async function registrar(datos) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    if (datos.usuarioId !== null && datos.usuarioId !== undefined && !await validarUsuario(tx, datos.usuarioId)) {
      throw Object.assign(new Error('El usuario asociado no existe.'), { statusCode: 400 });
    }
    const existente = await new sql.Request(tx)
      .input('tipo', sql.VarChar(12), datos.tipoDocumento)
      .input('numero', sql.VarChar(20), datos.numeroDocumento)
      .query(`SELECT PasajeroID FROM dbo.Pasajero WITH (UPDLOCK, HOLDLOCK)
              WHERE TipoDocumento = @tipo AND NumeroDocumento = @numero`);
    if (existente.recordset.length) {
      throw Object.assign(new Error('Ya existe un pasajero con ese documento.'), { statusCode: 409 });
    }
    const resultado = await agregarCampos(new sql.Request(tx), datos)
      .query(`INSERT INTO dbo.Pasajero
        (UsuarioID, TipoDocumento, NumeroDocumento, Nombres, Apellidos, FechaNacimiento, Telefono, Estado)
        OUTPUT INSERTED.PasajeroID
        VALUES (@usuario, @tipo, @numero, @nombres, @apellidos, @fecha, @telefono, @estado)`);
    const pasajeroId = resultado.recordset[0].PasajeroID;
    await tx.commit();
    return pasajeroId;
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

export async function actualizar(id, datos) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const actual = await new sql.Request(tx)
      .input('id', sql.BigInt, id)
      .query(`SELECT PasajeroID FROM dbo.Pasajero WITH (UPDLOCK, HOLDLOCK) WHERE PasajeroID = @id`);
    if (!actual.recordset.length) {
      throw Object.assign(new Error('Pasajero no encontrado.'), { statusCode: 404 });
    }
    if (datos.usuarioId !== null && datos.usuarioId !== undefined && !await validarUsuario(tx, datos.usuarioId)) {
      throw Object.assign(new Error('El usuario asociado no existe.'), { statusCode: 400 });
    }
    const duplicado = await new sql.Request(tx)
      .input('id', sql.BigInt, id)
      .input('tipo', sql.VarChar(12), datos.tipoDocumento)
      .input('numero', sql.VarChar(20), datos.numeroDocumento)
      .query(`SELECT PasajeroID FROM dbo.Pasajero WITH (UPDLOCK, HOLDLOCK)
              WHERE TipoDocumento = @tipo AND NumeroDocumento = @numero AND PasajeroID <> @id`);
    if (duplicado.recordset.length) {
      throw Object.assign(new Error('El documento ya pertenece a otro pasajero.'), { statusCode: 409 });
    }
    const resultado = await agregarCampos(new sql.Request(tx), datos)
      .input('id', sql.BigInt, id)
      .query(`UPDATE dbo.Pasajero SET UsuarioID = @usuario, TipoDocumento = @tipo,
              NumeroDocumento = @numero, Nombres = @nombres, Apellidos = @apellidos,
              FechaNacimiento = @fecha, Telefono = @telefono, Estado = @estado
              WHERE PasajeroID = @id`);
    if (resultado.rowsAffected[0] !== 1) {
      throw Object.assign(new Error('No se pudo actualizar el pasajero.'), { statusCode: 409 });
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

export async function cambiarEstado(id, estado) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('id', sql.BigInt, id)
    .input('estado', sql.VarChar(12), estado)
    .query(`UPDATE dbo.Pasajero SET Estado = @estado WHERE PasajeroID = @id`);
  return resultado.rowsAffected[0] || 0;
}
