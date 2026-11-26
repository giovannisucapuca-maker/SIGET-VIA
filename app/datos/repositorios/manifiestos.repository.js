// SIGET-VÍA — CAPA DE ACCESO A DATOS — Manifiesto de pasajeros (RF16). Solo lectura.
import { getPool, sql } from '../config/db.js';

export async function listarViajes(q, fecha) {
  const pool = await getPool();
  const r = await pool.request()
    .input('q', sql.NVarChar(110), `%${q}%`)
    .input('fecha', sql.VarChar(10), fecha)
    .query(`
      SELECT TOP (300)
        v.ViajeID, v.RutaID, v.BusID, v.ConductorID, v.Salida, v.LlegadaEstimada, v.Estado,
        ru.Origen, ru.Destino, b.Placa, b.Modelo,
        (
          SELECT COUNT_BIG(*)
          FROM dbo.ReservaAsiento ra
          INNER JOIN dbo.Reserva r ON r.ReservaID = ra.ReservaID
          WHERE ra.ViajeID = v.ViajeID AND ra.Estado = 'ACTIVA'
            AND r.Estado IN ('CONFIRMADA', 'COMPLETADA', 'REPROGRAMADA')
        ) AS TotalPasajeros
      FROM dbo.Viaje v
      INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
      INNER JOIN dbo.Bus b ON b.BusID = v.BusID
      WHERE
        (
          @fecha = ''
          OR (
            v.Salida >= CONVERT(date, @fecha, 23)
            AND v.Salida < DATEADD(DAY, 1, CONVERT(date, @fecha, 23))
          )
        )
        AND (
          ru.Origen LIKE @q OR ru.Destino LIKE @q OR b.Placa LIKE @q
          OR v.Estado LIKE @q OR CONVERT(VARCHAR(30), v.ViajeID) LIKE @q
        )
      ORDER BY v.Salida DESC, v.ViajeID DESC
    `);
  return r.recordset;
}

// Devuelve { viaje, pasajeros } (viaje = null si no existe).
export async function obtenerManifiesto(viajeId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('viajeId', sql.BigInt, viajeId)
    .query(`
      -- DATOS DEL VIAJE
      SELECT v.ViajeID, v.RutaID, v.BusID, v.ConductorID, v.Salida, v.LlegadaEstimada,
             v.Estado, v.Tarifa, ru.Origen, ru.Destino, b.Placa, b.Modelo, b.Capacidad,
             tor.Nombre AS TerminalOrigen, tor.Direccion AS DireccionOrigen, tde.Nombre AS TerminalDestino, tde.Direccion AS DireccionDestino
      FROM dbo.Viaje v
      INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
      LEFT JOIN dbo.Terminal tor ON tor.TerminalID = ru.TerminalOrigenID
      LEFT JOIN dbo.Terminal tde ON tde.TerminalID = ru.TerminalDestinoID
      INNER JOIN dbo.Bus b ON b.BusID = v.BusID
      WHERE v.ViajeID = @viajeId;

      -- PASAJEROS Y ASIENTOS
      SELECT ra.ReservaAsientoID, ra.ReservaID, ra.ViajeID, ra.AsientoID, ra.PasajeroID,
             r.Codigo AS CodigoReserva, r.Estado AS EstadoReserva,
             a.Numero AS NumeroAsiento,
             p.TipoDocumento, p.NumeroDocumento, p.Nombres, p.Apellidos,
             ra.Estado AS EstadoAsiento
      FROM dbo.ReservaAsiento ra
      INNER JOIN dbo.Reserva r ON r.ReservaID = ra.ReservaID
      INNER JOIN dbo.Asiento a ON a.AsientoID = ra.AsientoID AND a.BusID = ra.BusID
      INNER JOIN dbo.Pasajero p ON p.PasajeroID = ra.PasajeroID
      WHERE ra.ViajeID = @viajeId AND ra.Estado = 'ACTIVA'
        AND r.Estado IN ('CONFIRMADA', 'COMPLETADA', 'REPROGRAMADA')
      ORDER BY TRY_CONVERT(INT, a.Numero), a.Numero, p.Apellidos, p.Nombres;
    `);
  return {
    viaje: r.recordsets[0]?.[0] || null,
    pasajeros: r.recordsets[1] || []
  };
}
