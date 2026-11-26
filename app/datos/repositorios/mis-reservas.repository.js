// SIGET-VÍA — CAPA DE ACCESO A DATOS — Reservas del cliente autenticado
import { getPool, sql } from '../config/db.js';

export async function listarPorUsuario(usuarioId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('usuarioId', sql.BigInt, usuarioId)
    .query(`
      SELECT r.ReservaID, r.Codigo, r.FechaReserva, r.Estado, r.Total,
             r.ViajeID, v.Salida, v.LlegadaEstimada, ru.Origen, ru.Destino,
             tor.Nombre AS TerminalOrigen, tor.Direccion AS DireccionOrigen, tde.Nombre AS TerminalDestino, tde.Direccion AS DireccionDestino,
             b.Placa, b.Modelo, ts.Nombre AS TipoServicio,
             (SELECT COUNT(*) FROM dbo.ReservaAsiento ra
              WHERE ra.ReservaID = r.ReservaID AND ra.Estado = 'ACTIVA') AS CantidadAsientos
      FROM dbo.Reserva r
      INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
      INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
      LEFT JOIN dbo.Terminal tor ON tor.TerminalID = ru.TerminalOrigenID
      LEFT JOIN dbo.Terminal tde ON tde.TerminalID = ru.TerminalDestinoID
      INNER JOIN dbo.Bus b ON b.BusID = v.BusID
      LEFT JOIN dbo.TipoServicio ts ON ts.TipoServicioID = b.TipoServicioID
      WHERE r.UsuarioID = @usuarioId
      ORDER BY r.ReservaID DESC
    `);
  return r.recordset;
}

export async function obtenerCabecera(usuarioId, id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('usuarioId', sql.BigInt, usuarioId)
    .input('id', sql.BigInt, id)
    .query(`
      SELECT r.ReservaID, r.Codigo, r.FechaReserva, r.Estado, r.Total,
             r.ViajeID, v.Salida, v.LlegadaEstimada, ru.Origen, ru.Destino,
             tor.Nombre AS TerminalOrigen, tor.Direccion AS DireccionOrigen, tde.Nombre AS TerminalDestino, tde.Direccion AS DireccionDestino,
             b.Placa, b.Modelo, ts.Nombre AS TipoServicio
      FROM dbo.Reserva r
      INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
      INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
      LEFT JOIN dbo.Terminal tor ON tor.TerminalID = ru.TerminalOrigenID
      LEFT JOIN dbo.Terminal tde ON tde.TerminalID = ru.TerminalDestinoID
      INNER JOIN dbo.Bus b ON b.BusID = v.BusID
      LEFT JOIN dbo.TipoServicio ts ON ts.TipoServicioID = b.TipoServicioID
      WHERE r.ReservaID = @id AND r.UsuarioID = @usuarioId
    `);
  return r.recordset[0] || null;
}

export async function listarItems(id) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.BigInt, id).query(`
    SELECT ra.ReservaAsientoID, ra.Estado, ra.Precio, a.Numero, a.Nivel,
           p.TipoDocumento, p.NumeroDocumento, p.Nombres, p.Apellidos
    FROM dbo.ReservaAsiento ra
    INNER JOIN dbo.Asiento a ON a.AsientoID = ra.AsientoID
    INNER JOIN dbo.Pasajero p ON p.PasajeroID = ra.PasajeroID
    WHERE ra.ReservaID = @id
    ORDER BY a.Nivel, a.Numero
  `);
  return r.recordset;
}
