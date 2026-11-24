import { Router } from 'express';
import { getPool, sql } from './db.js';
// SIGET-VÍA — PASO 174: consultas exclusivas del cliente autenticado.
export function createMisReservasRouter({ auth, activeUser, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser);
  router.use((req, res, next) => {
    if (req.currentUser?.Rol !== 'CLIENTE') {
      return res.status(403).json({ error: 'Disponible únicamente para clientes.' });
    }
    next();
  });
  router.get('/', asyncRoute(async (req, res) => {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('usuarioId', sql.BigInt, req.currentUser.UsuarioID)
      .query(`
        SELECT r.ReservaID, r.Codigo, r.FechaReserva, r.Estado, r.Total,
               r.ViajeID, v.Salida, v.LlegadaEstimada, ru.Origen, ru.Destino,
               b.Placa, b.Modelo, ts.Nombre AS TipoServicio,
               (SELECT COUNT(*) FROM dbo.ReservaAsiento ra
                WHERE ra.ReservaID = r.ReservaID AND ra.Estado = 'ACTIVA') AS CantidadAsientos
        FROM dbo.Reserva r
        INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
        INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
        INNER JOIN dbo.Bus b ON b.BusID = v.BusID
        LEFT JOIN dbo.TipoServicio ts ON ts.TipoServicioID = b.TipoServicioID
        WHERE r.UsuarioID = @usuarioId
        ORDER BY r.ReservaID DESC
      `);
    res.set('Cache-Control', 'no-store');
    res.json(resultado.recordset);
  }));
  router.get('/:id', asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const pool = await getPool();
    const cabecera = await pool.request()
      .input('usuarioId', sql.BigInt, req.currentUser.UsuarioID)
      .input('id', sql.BigInt, id)
      .query(`
        SELECT r.ReservaID, r.Codigo, r.FechaReserva, r.Estado, r.Total,
               r.ViajeID, v.Salida, v.LlegadaEstimada, ru.Origen, ru.Destino,
               b.Placa, b.Modelo, ts.Nombre AS TipoServicio
        FROM dbo.Reserva r
        INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
        INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
        INNER JOIN dbo.Bus b ON b.BusID = v.BusID
        LEFT JOIN dbo.TipoServicio ts ON ts.TipoServicioID = b.TipoServicioID
        WHERE r.ReservaID = @id AND r.UsuarioID = @usuarioId
      `);
    if (!cabecera.recordset.length) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }
    const detalle = await pool.request().input('id', sql.BigInt, id).query(`
      SELECT ra.ReservaAsientoID, ra.Estado, ra.Precio, a.Numero, a.Nivel,
             p.TipoDocumento, p.NumeroDocumento, p.Nombres, p.Apellidos
      FROM dbo.ReservaAsiento ra
      INNER JOIN dbo.Asiento a ON a.AsientoID = ra.AsientoID
      INNER JOIN dbo.Pasajero p ON p.PasajeroID = ra.PasajeroID
      WHERE ra.ReservaID = @id
      ORDER BY a.Nivel, a.Numero
    `);
    res.set('Cache-Control', 'no-store');
    res.json({ ...cabecera.recordset[0], items: detalle.recordset });
  }));
  return router;
}
