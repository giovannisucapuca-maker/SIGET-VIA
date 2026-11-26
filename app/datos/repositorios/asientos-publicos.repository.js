// SIGET-VÍA — CAPA DE ACCESO A DATOS — Asientos públicos por viaje (RF4, RF10). Solo lectura.
import { getPool, sql } from '../config/db.js';

// Viaje disponible (programado, futuro, ruta activa y bus operativo).
export async function obtenerViajeDisponible(viajeId, ahora) {
  const pool = await getPool();
  const r = await pool.request()
    .input('viajeId', sql.BigInt, viajeId)
    .input('ahora', sql.DateTime2, ahora)
    .query(`
      SELECT v.ViajeID, v.BusID, v.Salida, v.LlegadaEstimada, v.Tarifa,
             r.Origen, r.Destino,
             tor.Nombre AS TerminalOrigen, tor.Direccion AS DireccionOrigen, tde.Nombre AS TerminalDestino, tde.Direccion AS DireccionDestino,
             b.Placa, b.Modelo, b.Capacidad,
             ts.TipoServicioID, ts.Nombre AS TipoServicio,
             ts.Descripcion AS DescripcionServicio
      FROM dbo.Viaje v
      INNER JOIN dbo.Ruta r ON r.RutaID = v.RutaID
      LEFT JOIN dbo.Terminal tor ON tor.TerminalID = r.TerminalOrigenID
      LEFT JOIN dbo.Terminal tde ON tde.TerminalID = r.TerminalDestinoID
      INNER JOIN dbo.Bus b ON b.BusID = v.BusID
      LEFT JOIN dbo.TipoServicio ts ON ts.TipoServicioID = b.TipoServicioID
      WHERE v.ViajeID = @viajeId
        AND v.Estado = N'PROGRAMADO'
        AND v.Salida > @ahora
        AND r.Estado = N'ACTIVA'
        AND b.Estado = N'OPERATIVO'
    `);
  return r.recordset[0] || null;
}

// Asientos del bus con indicador de ocupación para el viaje.
export async function listarAsientosConOcupacion(viajeId, busId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('viajeId', sql.BigInt, viajeId)
    .input('busId', sql.Int, busId)
    .query(`
      SELECT a.AsientoID, a.Numero, a.Nivel,
        CAST(CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.ReservaAsiento ra
          INNER JOIN dbo.Reserva r ON r.ReservaID = ra.ReservaID
          WHERE ra.ViajeID = @viajeId
            AND ra.AsientoID = a.AsientoID
            AND ra.Estado IN (N'ACTIVA', N'ACTIVO')
            AND r.Estado <> N'CANCELADA'
        ) THEN 1 ELSE 0 END AS bit) AS Ocupado
      FROM dbo.Asiento a
      WHERE a.BusID = @busId
      ORDER BY a.Nivel ASC, a.Numero ASC
    `);
  return r.recordset;
}
