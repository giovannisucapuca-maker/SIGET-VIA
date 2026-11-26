import { getPool, sql } from '../config/db.js';

const consultaPagos = `
  SELECT
    p.PagoID, p.VentaID, p.Metodo, p.ReferenciaSimulada,
    p.Monto, p.FechaPago, p.Estado, p.EsSimulado,
    v.CodigoComprobante, v.Estado AS EstadoVenta,
    v.Total AS TotalVenta, v.FechaVenta,
    r.ReservaID, r.Codigo AS CodigoReserva,
    u.UsuarioID AS VendedorID, u.Nombres AS VendedorNombres,
    u.Apellidos AS VendedorApellidos,
    ru.Origen, ru.Destino, vi.Salida
  FROM dbo.Pago p
  INNER JOIN dbo.Venta v ON v.VentaID = p.VentaID
  INNER JOIN dbo.Reserva r ON r.ReservaID = v.ReservaID
  INNER JOIN dbo.Usuario u ON u.UsuarioID = v.VendedorID
  INNER JOIN dbo.Viaje vi ON vi.ViajeID = r.ViajeID
  INNER JOIN dbo.Ruta ru ON ru.RutaID = vi.RutaID
`;

export async function obtenerResumenPagos() {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT
      COUNT_BIG(*) AS TotalPagos,
      COALESCE(SUM(CASE WHEN Estado = 'REGISTRADO' THEN 1 ELSE 0 END), 0) AS PagosRegistrados,
      COALESCE(SUM(CASE WHEN Estado = 'ANULADO' THEN 1 ELSE 0 END), 0) AS PagosAnulados,
      COALESCE(SUM(CASE WHEN Estado = 'REGISTRADO' THEN Monto ELSE 0 END), 0) AS TotalRegistrado,
      COALESCE(SUM(CASE WHEN Estado = 'ANULADO' THEN Monto ELSE 0 END), 0) AS TotalAnulado
    FROM dbo.Pago
    WHERE EsSimulado = 1
  `);
  return resultado.recordset[0];
}

export async function listarPagos(filtros) {
  const pool = await getPool();
  const request = pool.request()
    .input('q', sql.NVarChar(110), `%${filtros.q}%`)
    .input('estado', sql.VarChar(15), filtros.estado)
    .input('metodo', sql.VarChar(20), filtros.metodo)
    .input('desde', sql.VarChar(10), filtros.desde)
    .input('hasta', sql.VarChar(10), filtros.hasta);
  const resultado = await request.query(`
    ${consultaPagos}
    WHERE p.EsSimulado = 1
      AND (@estado = '' OR p.Estado = @estado)
      AND (@metodo = '' OR p.Metodo = @metodo)
      AND (@desde = '' OR p.FechaPago >= TRY_CONVERT(date, @desde, 23))
      AND (@hasta = '' OR p.FechaPago < DATEADD(DAY, 1, TRY_CONVERT(date, @hasta, 23)))
      AND (
        v.CodigoComprobante LIKE @q OR r.Codigo LIKE @q
        OR ru.Origen LIKE @q OR ru.Destino LIKE @q
        OR p.Metodo LIKE @q OR p.Estado LIKE @q
        OR u.Nombres LIKE @q OR u.Apellidos LIKE @q
      )
    ORDER BY p.FechaPago DESC, p.PagoID DESC
  `);
  return resultado.recordset;
}

async function obtenerAuditoria(pool, pagoId, ventaId) {
  const resultado = await pool.request()
    .input('pagoId', sql.BigInt, pagoId)
    .input('ventaId', sql.BigInt, ventaId)
    .query(`
      SELECT a.AuditoriaID, a.UsuarioID, a.Entidad,
        a.RegistroID, a.Accion, a.Detalle, a.Fecha,
        u.Nombres AS UsuarioNombres, u.Apellidos AS UsuarioApellidos
      FROM dbo.Auditoria a
      LEFT JOIN dbo.Usuario u ON u.UsuarioID = a.UsuarioID
      WHERE (LOWER(a.Entidad) = 'pago' AND a.RegistroID = @pagoId)
         OR (LOWER(a.Entidad) = 'venta' AND a.RegistroID = @ventaId)
      ORDER BY a.Fecha DESC, a.AuditoriaID DESC
    `);
  return resultado.recordset;
}

export async function obtenerDetallePago(id) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`${consultaPagos} WHERE p.PagoID = @id AND p.EsSimulado = 1`);
  const pago = resultado.recordset[0];
  if (!pago) return null;
  const auditoria = await obtenerAuditoria(pool, pago.PagoID, pago.VentaID);
  return { ...pago, auditoria };
}
