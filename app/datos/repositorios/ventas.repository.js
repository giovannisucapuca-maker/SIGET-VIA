// SIGET-VÍA — CAPA DE ACCESO A DATOS — Ventas y pagos simulados (RF5)
import { getPool, sql } from '../config/db.js';

export { enTransaccion, NIVEL, numeroErrorSql } from '../config/transaccion.js';

// ---------- Consultas ----------

// Reservas vigentes, con asientos activos y sin venta.
export async function listarReservasVendibles() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT r.ReservaID, r.Codigo, r.Estado, r.Total, v.Salida, v.Estado AS EstadoViaje,
           ru.Origen, ru.Destino, COUNT(ra.ReservaAsientoID) AS CantidadAsientos
    FROM dbo.Reserva r
    INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
    INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
    LEFT JOIN dbo.ReservaAsiento ra ON ra.ReservaID = r.ReservaID AND ra.Estado = 'ACTIVA'
    WHERE r.Estado IN ('COMPLETADA', 'CONFIRMADA', 'REPROGRAMADA')
      AND v.Estado = 'PROGRAMADO'
      AND v.Salida > SYSDATETIME()
      AND NOT EXISTS (SELECT 1 FROM dbo.Venta ve WHERE ve.ReservaID = r.ReservaID)
    GROUP BY r.ReservaID, r.Codigo, r.Estado, r.Total, v.Salida, v.Estado, ru.Origen, ru.Destino
    HAVING COUNT(ra.ReservaAsientoID) > 0
    ORDER BY v.Salida ASC, r.ReservaID DESC
  `);
  return r.recordset;
}

export async function listar(q) {
  const pool = await getPool();
  const r = await pool.request()
    .input('q', sql.NVarChar(110), `%${q}%`)
    .query(`
      SELECT ve.VentaID, ve.ReservaID, ve.VendedorID, ve.FechaVenta, ve.Total, ve.Estado,
             ve.CodigoComprobante, r.Codigo AS CodigoReserva, ru.Origen, ru.Destino, v.Salida,
             p.Metodo, p.Monto AS MontoPago, p.Estado AS EstadoPago
      FROM dbo.Venta ve
      INNER JOIN dbo.Reserva r ON r.ReservaID = ve.ReservaID
      INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
      INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
      LEFT JOIN dbo.Pago p ON p.VentaID = ve.VentaID
      WHERE ve.CodigoComprobante LIKE @q OR r.Codigo LIKE @q OR ru.Origen LIKE @q
         OR ru.Destino LIKE @q OR ve.Estado LIKE @q
      ORDER BY ve.VentaID DESC
    `);
  return r.recordset;
}

export async function obtenerCabecera(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`
      SELECT ve.VentaID, ve.ReservaID, ve.VendedorID, ve.FechaVenta, ve.Total, ve.Estado,
             ve.CodigoComprobante, r.Codigo AS CodigoReserva, r.Estado AS EstadoReserva,
             u.Nombres AS VendedorNombres, u.Apellidos AS VendedorApellidos,
             v.Salida, ru.Origen, ru.Destino, b.Placa, b.Modelo
      FROM dbo.Venta ve
      INNER JOIN dbo.Reserva r ON r.ReservaID = ve.ReservaID
      INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
      INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
      INNER JOIN dbo.Bus b ON b.BusID = v.BusID
      INNER JOIN dbo.Usuario u ON u.UsuarioID = ve.VendedorID
      WHERE ve.VentaID = @id
    `);
  return r.recordset[0] || null;
}

export async function listarPagos(ventaId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.BigInt, ventaId)
    .query(`
      SELECT PagoID, VentaID, Metodo, ReferenciaSimulada, Monto, FechaPago, Estado, EsSimulado
      FROM dbo.Pago WHERE VentaID = @id ORDER BY PagoID
    `);
  return r.recordset;
}

export async function listarPasajerosActivos(reservaId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('reservaId', sql.BigInt, reservaId)
    .query(`
      SELECT ra.ReservaAsientoID, a.Numero, a.Nivel, p.TipoDocumento, p.NumeroDocumento,
             p.Nombres, p.Apellidos, ra.Precio
      FROM dbo.ReservaAsiento ra
      INNER JOIN dbo.Asiento a ON a.AsientoID = ra.AsientoID
      INNER JOIN dbo.Pasajero p ON p.PasajeroID = ra.PasajeroID
      WHERE ra.ReservaID = @reservaId AND ra.Estado = 'ACTIVA'
      ORDER BY a.Nivel, a.Numero
    `);
  return r.recordset;
}

// ---------- Registro de venta (dentro de transacción) ----------

export async function obtenerReservaBloqueada(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('reservaId', sql.BigInt, reservaId)
    .query(`
      SELECT r.ReservaID, r.Codigo, r.Estado, r.Total, v.Estado AS EstadoViaje, v.Salida,
             CASE WHEN v.Salida > SYSDATETIME() THEN 1 ELSE 0 END AS SalidaFutura
      FROM dbo.Reserva r WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
      WHERE r.ReservaID = @reservaId
    `);
  return r.recordset[0] || null;
}

export async function existeVentaDeReserva(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('reservaId', sql.BigInt, reservaId)
    .query(`SELECT VentaID FROM dbo.Venta WITH (UPDLOCK, HOLDLOCK) WHERE ReservaID = @reservaId`);
  return r.recordset.length > 0;
}

export async function resumirAsientosActivos(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('reservaId', sql.BigInt, reservaId)
    .query(`
      SELECT COUNT_BIG(*) AS Cantidad, COALESCE(SUM(Precio), 0) AS TotalAsientos
      FROM dbo.ReservaAsiento WITH (HOLDLOCK)
      WHERE ReservaID = @reservaId AND Estado = 'ACTIVA'
    `);
  return {
    cantidad: Number(r.recordset[0].Cantidad),
    total: Number(r.recordset[0].TotalAsientos)
  };
}

export async function insertarVenta(tx, { reservaId, vendedorId, total }) {
  const r = await new sql.Request(tx)
    .input('reservaId', sql.BigInt, reservaId)
    .input('vendedorId', sql.BigInt, vendedorId)
    .input('total', sql.Decimal(12, 2), total)
    .query(`
      INSERT INTO dbo.Venta (ReservaID, VendedorID, FechaVenta, Total, Estado)
      OUTPUT INSERTED.VentaID
      VALUES (@reservaId, @vendedorId, SYSDATETIME(), @total, 'REGISTRADA')
    `);
  return r.recordset[0].VentaID;
}

export async function insertarPagoSimulado(tx, { ventaId, metodo, referencia, monto }) {
  const r = await new sql.Request(tx)
    .input('ventaId', sql.BigInt, ventaId)
    .input('metodo', sql.VarChar(20), metodo)
    .input('referencia', sql.NVarChar(100), referencia || null)
    .input('monto', sql.Decimal(12, 2), monto)
    .query(`
      INSERT INTO dbo.Pago (VentaID, Metodo, ReferenciaSimulada, Monto, FechaPago, Estado, EsSimulado)
      OUTPUT INSERTED.PagoID
      VALUES (@ventaId, @metodo, @referencia, @monto, SYSDATETIME(), 'REGISTRADO', 1)
    `);
  return r.recordset[0].PagoID;
}

export async function obtenerCodigoComprobante(tx, ventaId) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, ventaId)
    .query(`SELECT CodigoComprobante FROM dbo.Venta WHERE VentaID = @id`);
  return r.recordset[0]?.CodigoComprobante ?? null;
}

// ---------- Anulación (dentro de transacción) ----------

export async function obtenerVentaBloqueada(tx, id) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .query(`
      SELECT VentaID, CodigoComprobante, ReservaID, Estado, Total
      FROM dbo.Venta WITH (UPDLOCK, HOLDLOCK) WHERE VentaID = @id
    `);
  return r.recordset[0] || null;
}

export async function listarPagosBloqueados(tx, ventaId) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, ventaId)
    .query(`
      SELECT PagoID, Estado, EsSimulado, Monto, Metodo
      FROM dbo.Pago WITH (UPDLOCK, HOLDLOCK) WHERE VentaID = @id
    `);
  return r.recordset;
}

export async function anularPago(tx, pagoId) {
  const r = await new sql.Request(tx)
    .input('pagoId', sql.BigInt, pagoId)
    .query(`UPDATE dbo.Pago SET Estado = 'ANULADO' WHERE PagoID = @pagoId AND Estado = 'REGISTRADO'`);
  return r.rowsAffected[0] || 0;
}

export async function anularVenta(tx, id) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .query(`UPDATE dbo.Venta SET Estado = 'ANULADA' WHERE VentaID = @id AND Estado = 'REGISTRADA'`);
  return r.rowsAffected[0] || 0;
}

// ---------- Auditoría (misma transacción) ----------

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
