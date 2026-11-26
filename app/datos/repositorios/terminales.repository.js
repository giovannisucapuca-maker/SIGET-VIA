// SIGET-VÍA — CAPA DE ACCESO A DATOS — Terminales terrestres
// Terminales de embarque y desembarque de Transportes Vía S.A.C.
import { getPool, sql } from '../config/db.js';

export { enTransaccion, NIVEL } from '../config/transaccion.js';

const COLUMNAS = `
  t.TerminalID, t.Nombre, t.Ciudad, t.Direccion, t.Referencia, t.Telefono, t.Estado,
  (SELECT COUNT(*) FROM dbo.Ruta r
    WHERE r.Estado = 'ACTIVA'
      AND (r.TerminalOrigenID = t.TerminalID OR r.TerminalDestinoID = t.TerminalID)) AS RutasActivas
`;

function campos(request, d) {
  return request
    .input('nombre', sql.NVarChar(120), d.nombre)
    .input('ciudad', sql.NVarChar(120), d.ciudad)
    .input('direccion', sql.NVarChar(250), d.direccion)
    .input('referencia', sql.NVarChar(250), d.referencia || null)
    .input('telefono', sql.VarChar(20), d.telefono || null)
    .input('estado', sql.VarChar(12), d.estado);
}

export async function listar(q) {
  const pool = await getPool();
  const r = await pool.request()
    .input('q', sql.NVarChar(130), `%${q}%`)
    .query(`
      SELECT ${COLUMNAS}
      FROM dbo.Terminal t
      WHERE t.Nombre LIKE @q OR t.Ciudad LIKE @q OR t.Direccion LIKE @q
      ORDER BY t.Ciudad, t.Nombre
    `);
  return r.recordset;
}

export async function obtener(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, id)
    .query(`SELECT ${COLUMNAS} FROM dbo.Terminal t WHERE t.TerminalID = @id`);
  return r.recordset[0] || null;
}

// Terminales con el mismo nombre (para detectar duplicados por ciudad).
export async function listarParaDuplicado(tx, excluirId) {
  const r = await new sql.Request(tx)
    .input('id', sql.Int, excluirId)
    .query(`
      SELECT TerminalID, Nombre, Ciudad FROM dbo.Terminal WITH (UPDLOCK, HOLDLOCK)
      WHERE (@id IS NULL OR TerminalID <> @id)
    `);
  return r.recordset;
}

export async function obtenerBloqueado(tx, id) {
  const r = await new sql.Request(tx)
    .input('id', sql.Int, id)
    .query(`SELECT TerminalID, Ciudad, Estado FROM dbo.Terminal WITH (UPDLOCK, HOLDLOCK) WHERE TerminalID = @id`);
  return r.recordset[0] || null;
}

export async function contarRutasActivas(tx, id) {
  const r = await new sql.Request(tx)
    .input('id', sql.Int, id)
    .query(`
      SELECT COUNT(*) AS Total FROM dbo.Ruta WITH (HOLDLOCK)
      WHERE Estado = 'ACTIVA' AND (TerminalOrigenID = @id OR TerminalDestinoID = @id)
    `);
  return Number(r.recordset[0].Total);
}

export async function insertar(tx, d) {
  const r = await campos(new sql.Request(tx), d).query(`
    INSERT INTO dbo.Terminal (Nombre, Ciudad, Direccion, Referencia, Telefono, Estado)
    OUTPUT INSERTED.TerminalID
    VALUES (@nombre, @ciudad, @direccion, @referencia, @telefono, @estado)
  `);
  return r.recordset[0].TerminalID;
}

export async function actualizar(tx, id, d) {
  const r = await campos(new sql.Request(tx).input('id', sql.Int, id), d).query(`
    UPDATE dbo.Terminal
    SET Nombre = @nombre, Ciudad = @ciudad, Direccion = @direccion,
        Referencia = @referencia, Telefono = @telefono, Estado = @estado
    WHERE TerminalID = @id
  `);
  return r.rowsAffected[0] || 0;
}

export async function cambiarEstado(tx, id, estado) {
  const r = await new sql.Request(tx)
    .input('id', sql.Int, id)
    .input('estado', sql.VarChar(12), estado)
    .query(`UPDATE dbo.Terminal SET Estado = @estado WHERE TerminalID = @id`);
  return r.rowsAffected[0] || 0;
}

export async function contarRutasConTerminalEnOtraCiudad(tx, id, ciudad) {
  const r = await new sql.Request(tx)
    .input('id', sql.Int, id)
    .input('ciudad', sql.NVarChar(120), ciudad)
    .query(`
      SELECT COUNT(*) AS Total FROM dbo.Ruta WITH (HOLDLOCK)
      WHERE (TerminalOrigenID = @id AND Origen <> @ciudad)
         OR (TerminalDestinoID = @id AND Destino <> @ciudad)
    `);
  return Number(r.recordset[0].Total);
}
