import { getPool, sql } from '../config/db.js';

function campos(request, datos) {
  return request
    .input('origen', sql.NVarChar(120), datos.origen)
    .input('destino', sql.NVarChar(120), datos.destino)
    .input('distancia', sql.Decimal(10, 2), datos.distanciaKm)
    .input('terminalOrigen', sql.Int, datos.terminalOrigenId ?? null)
    .input('terminalDestino', sql.Int, datos.terminalDestinoId ?? null)
    .input('estado', sql.VarChar(12), datos.estado);
}

// Ruta con sus terminales de origen y destino (pueden no estar asignados).
const SELECT_RUTA = `
  SELECT r.RutaID, r.Origen, r.Destino, r.DistanciaKm, r.Estado,
         r.TerminalOrigenID, tor.Nombre AS TerminalOrigen, tor.Direccion AS DireccionOrigen,
         r.TerminalDestinoID, tde.Nombre AS TerminalDestino, tde.Direccion AS DireccionDestino
  FROM dbo.Ruta r
  LEFT JOIN dbo.Terminal tor ON tor.TerminalID = r.TerminalOrigenID
  LEFT JOIN dbo.Terminal tde ON tde.TerminalID = r.TerminalDestinoID
`;

// La transacción cubre la comprobación de duplicados y la escritura.
// Una excepción desencadena rollback antes de propagarse al controlador.
export async function enTransaccion(operacion) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const resultado = await operacion(tx);
    await tx.commit();
    return resultado;
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}
export async function listar(q) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('q', sql.NVarChar(130), `%${q}%`)
    .query(`${SELECT_RUTA}
            WHERE r.Origen LIKE @q OR r.Destino LIKE @q
               OR tor.Nombre LIKE @q OR tde.Nombre LIKE @q
            ORDER BY r.RutaID DESC`);
  return resultado.recordset;
}
export async function detalle(id) {
  const pool = await getPool();
  const resultado = await pool.request().input('id', sql.Int, id)
    .query(`${SELECT_RUTA} WHERE r.RutaID = @id`);
  return resultado.recordset[0] || null;
}
export async function detalleBloqueado(tx, id) {
  const resultado = await new sql.Request(tx).input('id', sql.Int, id)
    .query(`SELECT RutaID, Origen, Destino, DistanciaKm, Estado
            FROM dbo.Ruta WITH (UPDLOCK, HOLDLOCK) WHERE RutaID = @id`);
  return resultado.recordset[0] || null;
}
export async function buscarDuplicadosBloqueados(tx, excluirId) {
  const resultado = await new sql.Request(tx)
    .input('id', sql.Int, excluirId)
    .query(`SELECT RutaID, Origen, Destino FROM dbo.Ruta WITH (UPDLOCK, HOLDLOCK)
            WHERE (@id IS NULL OR RutaID <> @id)`);
  return resultado.recordset;
}
export async function insertar(tx, datos) {
  const resultado = await campos(new sql.Request(tx), datos)
    .query(`INSERT INTO dbo.Ruta (Origen, Destino, DistanciaKm, TerminalOrigenID, TerminalDestinoID, Estado)
            OUTPUT INSERTED.RutaID
            VALUES (@origen, @destino, @distancia, @terminalOrigen, @terminalDestino, @estado)`);
  return resultado.recordset[0].RutaID;
}
export async function actualizar(tx, id, datos) {
  const resultado = await campos(new sql.Request(tx).input('id', sql.Int, id), datos)
    .query(`UPDATE dbo.Ruta SET Origen = @origen, Destino = @destino,
            DistanciaKm = @distancia, TerminalOrigenID = @terminalOrigen,
            TerminalDestinoID = @terminalDestino, Estado = @estado
            WHERE RutaID = @id`);
  return resultado.rowsAffected[0] || 0;
}
export async function cambiarEstado(id, estado) {
  const pool = await getPool();
  const resultado = await pool.request().input('id', sql.Int, id)
    .input('estado', sql.VarChar(12), estado)
    .query(`UPDATE dbo.Ruta SET Estado = @estado WHERE RutaID = @id`);
  return resultado.rowsAffected[0] || 0;
}

// Terminales elegidos para la ruta (bloqueados durante la transacción).
export async function obtenerTerminales(tx, ids) {
  const lista = ids.filter(Boolean);
  if (!lista.length) return [];
  const req = new sql.Request(tx);
  lista.forEach((id, i) => req.input(`t${i}`, sql.Int, id));
  const r = await req.query(`
    SELECT TerminalID, Nombre, Ciudad, Estado
    FROM dbo.Terminal WITH (HOLDLOCK)
    WHERE TerminalID IN (${lista.map((_, i) => `@t${i}`).join(', ')})
  `);
  return r.recordset;
}

// Viajes programados a futuro que usan la ruta (CU006 — 3b).
export async function contarViajesProgramados(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT COUNT(*) AS Total FROM dbo.Viaje
      WHERE RutaID = @id AND Estado = 'PROGRAMADO' AND Salida > SYSDATETIME()
    `);
  return Number(r.recordset[0].Total);
}
