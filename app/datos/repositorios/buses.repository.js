// SIGET-VÍA / RF8 — Acceso a datos exclusivo de buses y asientos.
// Todas las consultas SQL y transacciones del módulo están aquí.
import { getPool, sql } from '../config/db.js';

const consulta = `
  SELECT b.BusID, b.Placa, b.Modelo, b.Capacidad, b.Estado, b.TipoServicioID,
         ts.Nombre AS TipoServicio, ts.Descripcion AS DescripcionServicio,
         ts.Estado AS EstadoTipoServicio,
         (SELECT COUNT(*) FROM dbo.Asiento a WHERE a.BusID=b.BusID) AS AsientosRegistrados,
         (SELECT COUNT(*) FROM dbo.Asiento a WHERE a.BusID=b.BusID AND a.Nivel=1) AS AsientosPrimerPiso,
         (SELECT COUNT(*) FROM dbo.Asiento a WHERE a.BusID=b.BusID AND a.Nivel=2) AS AsientosSegundoPiso
  FROM dbo.Bus b
  LEFT JOIN dbo.TipoServicio ts ON ts.TipoServicioID=b.TipoServicioID
`;

const solicitar = (tx) => new sql.Request(tx);
const parametroId = (req, id) => req.input('id', sql.Int, id);

function campos(req, datos) {
  return req
    .input('placa', sql.VarChar(12), datos.placa)
    .input('modelo', sql.NVarChar(100), datos.modelo)
    .input('capacidad', sql.SmallInt, datos.capacidad)
    .input('estado', sql.VarChar(20), datos.estado)
    .input('tipoServicioId', sql.Int, datos.tipoServicioId ?? null);
}

export async function listarTiposServicio() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT TipoServicioID, Nombre, Descripcion, Estado
    FROM dbo.TipoServicio ORDER BY TipoServicioID
  `);
  return r.recordset;
}

export async function listarBuses(q) {
  const pool = await getPool();
  const r = await pool.request()
    .input('q', sql.NVarChar(110), `%${q}%`)
    .query(`${consulta}
      WHERE b.Placa LIKE @q OR b.Modelo LIKE @q OR ts.Nombre LIKE @q
      ORDER BY b.BusID DESC`);
  return r.recordset;
}

export async function buscarBus(id) {
  const pool = await getPool();
  const r = await parametroId(pool.request(), id)
    .query(`${consulta} WHERE b.BusID = @id`);
  return r.recordset[0] || null;
}

export async function obtenerAsientos(id) {
  const pool = await getPool();
  const r = await parametroId(pool.request(), id).query(`
    SELECT AsientoID, BusID, Numero, Nivel FROM dbo.Asiento
    WHERE BusID=@id ORDER BY Nivel, Numero
  `);
  return r.recordset;
}

export async function comenzarTransaccion() {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  return tx;
}

export async function confirmar(tx) { await tx.commit(); }
export async function revertir(tx) { await tx.rollback().catch(() => {}); }

export async function buscarPlacaEnTransaccion(tx, placa, excluirId = null) {
  const r = await solicitar(tx)
    .input('placa', sql.VarChar(12), placa)
    .input('id', sql.Int, excluirId)
    .query(`SELECT BusID FROM dbo.Bus WITH (UPDLOCK,HOLDLOCK)
            WHERE Placa=@placa AND (@id IS NULL OR BusID<>@id)`);
  return r.recordset[0] || null;
}

export async function buscarServicioEnTransaccion(tx, tipoServicioId) {
  const r = await solicitar(tx)
    .input('tipoServicioId', sql.Int, tipoServicioId)
    .query(`SELECT TipoServicioID, Nombre, Estado FROM dbo.TipoServicio WITH (HOLDLOCK)
            WHERE TipoServicioID=@tipoServicioId`);
  return r.recordset[0] || null;
}

export async function registrarBusEnTransaccion(tx, datos) {
  const r = await campos(solicitar(tx), datos).query(`
    INSERT INTO dbo.Bus (Placa,Modelo,Capacidad,Estado,TipoServicioID)
    OUTPUT INSERTED.BusID
    VALUES (@placa,@modelo,@capacidad,@estado,@tipoServicioId)
  `);
  return r.recordset[0].BusID;
}

export async function generarAsientosEnTransaccion(tx, busId, primerPiso, segundoPiso) {
  const total = primerPiso + segundoPiso;
  const r = await solicitar(tx)
    .input('busId', sql.Int, busId)
    .input('total', sql.Int, total)
    .input('segundo', sql.Int, segundoPiso)
    .query(`
      ;WITH Numeros AS (
        SELECT 1 AS Numero UNION ALL
        SELECT Numero + 1 FROM Numeros WHERE Numero < @total
      )
      INSERT INTO dbo.Asiento (BusID,Numero,Nivel)
      SELECT @busId,Numero,CASE WHEN Numero<=@segundo THEN 2 ELSE 1 END
      FROM Numeros OPTION (MAXRECURSION 0);
    `);
  return r.rowsAffected[0];
}

export async function obtenerBusBloqueado(tx, id) {
  const r = await parametroId(solicitar(tx), id).query(`
    SELECT BusID,Placa,Modelo,Capacidad,Estado,TipoServicioID
    FROM dbo.Bus WITH (UPDLOCK,HOLDLOCK) WHERE BusID=@id
  `);
  return r.recordset[0] || null;
}

export async function distribucionEnTransaccion(tx, id) {
  const r = await parametroId(solicitar(tx), id).query(`
    SELECT COUNT(*) AS Total,
      COUNT(CASE WHEN Nivel=1 THEN 1 END) AS PrimerPiso,
      COUNT(CASE WHEN Nivel=2 THEN 1 END) AS SegundoPiso
    FROM dbo.Asiento WITH (UPDLOCK,HOLDLOCK) WHERE BusID=@id
  `);
  return r.recordset[0];
}

export async function dependenciasEnTransaccion(tx, id) {
  const r = await parametroId(solicitar(tx), id).query(`
    SELECT
      (SELECT COUNT_BIG(*) FROM dbo.Viaje WITH (UPDLOCK,HOLDLOCK)
       WHERE BusID=@id) AS TotalViajes,
      (SELECT COUNT_BIG(*) FROM dbo.ReservaAsiento WITH (UPDLOCK,HOLDLOCK)
       WHERE BusID=@id) AS TotalReservas
  `);
  return r.recordset[0];
}

export async function actualizarBusEnTransaccion(tx, id, datos) {
  await campos(parametroId(solicitar(tx), id), datos).query(`
    UPDATE dbo.Bus SET Placa=@placa,Modelo=@modelo,
      Capacidad=@capacidad,Estado=@estado,TipoServicioID=@tipoServicioId
    WHERE BusID=@id
  `);
}

export async function borrarAsientosEnTransaccion(tx, id) {
  await parametroId(solicitar(tx), id)
    .query('DELETE FROM dbo.Asiento WHERE BusID=@id');
}

export async function cambiarEstadoBus(id, estado) {
  const pool = await getPool();
  const r = await parametroId(pool.request(), id)
    .input('estado', sql.VarChar(20), estado)
    .query('UPDATE dbo.Bus SET Estado=@estado WHERE BusID=@id');
  return Boolean(r.rowsAffected[0]);
}
