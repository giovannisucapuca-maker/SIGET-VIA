// SIGET-VÍA — CAPA DE ACCESO A DATOS — Reservas (RF4, RF10, RF18)
// Solo acceso a SQL Server. Las reglas (estados, importes, validaciones)
// están en logica/src/servicios/reservas.service.js.
import { getPool, sql } from '../config/db.js';

export { enTransaccion, NIVEL } from '../config/transaccion.js';

// Usa la transacción si existe; si no, el pool.
async function solicitud(tx) {
  return tx ? new sql.Request(tx) : (await getPool()).request();
}

// Parámetros para listas IN (@p_0, @p_1, ...).
function agregarLista(request, prefijo, valores, tipo) {
  const seguro = `siget_${prefijo}_`;
  valores.forEach((valor, i) => request.input(`${seguro}${i}`, tipo, valor));
  return valores.map((_, i) => `@${seguro}${i}`).join(', ');
}

// =====================================================
// POLÍTICAS
// =====================================================
export async function listarPoliticasObligatoriasVigentes(tx = null) {
  const r = await (await solicitud(tx)).query(`
    SELECT PoliticaID, Tipo, Titulo, Contenido, Version, VigenteDesde, VigenteHasta
    FROM dbo.PoliticaServicio
    WHERE Activa = 1
      AND VigenteDesde <= CONVERT(date, SYSDATETIME())
      AND (VigenteHasta IS NULL OR VigenteHasta >= CONVERT(date, SYSDATETIME()))
      AND Tipo IN ('RESERVA', 'CANCELACION', 'REPROGRAMACION', 'CONTRATACION', 'PRIVACIDAD')
    ORDER BY Tipo, PoliticaID DESC
  `);
  return r.recordset;
}

export async function registrarAceptacion(tx, reservaId, usuarioId, politica) {
  await new sql.Request(tx)
    .input('reservaId', sql.BigInt, reservaId)
    .input('politicaId', sql.Int, politica.PoliticaID)
    .input('usuarioId', sql.BigInt, usuarioId)
    .input('tipo', sql.VarChar(25), politica.Tipo)
    .input('version', sql.VarChar(20), politica.Version)
    .input('titulo', sql.NVarChar(300), politica.Titulo)
    .input('contenido', sql.NVarChar(sql.MAX), politica.Contenido)
    .query(`
      INSERT INTO dbo.ReservaPoliticaAceptacion (
        ReservaID, PoliticaID, UsuarioID, Tipo, Version, Titulo, ContenidoAceptado, FechaAceptacion
      )
      VALUES (@reservaId, @politicaId, @usuarioId, @tipo, @version, @titulo, @contenido, SYSDATETIME())
    `);
}

// =====================================================
// VIAJES Y ASIENTOS
// =====================================================
export async function obtenerViajeBloqueado(tx, viajeId) {
  const r = await new sql.Request(tx)
    .input('viajeId', sql.BigInt, viajeId)
    .query(`
      SELECT ViajeID, RutaID, BusID, Tarifa, Estado, Salida,
             CASE WHEN Salida > SYSDATETIME() THEN 1 ELSE 0 END AS SalidaFutura
      FROM dbo.Viaje WITH (UPDLOCK, HOLDLOCK)
      WHERE ViajeID = @viajeId
    `);
  return r.recordset[0] || null;
}

// Comparación con la hora del servidor SQL.
export async function salidaEsFutura(tx, viajeId) {
  const r = await new sql.Request(tx)
    .input('viajeId', sql.BigInt, viajeId)
    .query(`
      SELECT CASE WHEN Salida > SYSDATETIME() THEN 1 ELSE 0 END AS Futura
      FROM dbo.Viaje WHERE ViajeID = @viajeId
    `);
  return Number(r.recordset[0]?.Futura) === 1;
}

export async function contarAsientosDelBus(tx, busId, asientoIds) {
  const req = new sql.Request(tx).input('busId', sql.Int, busId);
  const lista = agregarLista(req, 'asiento', asientoIds, sql.Int);
  const r = await req.query(`
    SELECT AsientoID FROM dbo.Asiento WITH (HOLDLOCK)
    WHERE BusID = @busId AND AsientoID IN (${lista})
  `);
  return r.recordset.length;
}

export async function listarAsientosOcupados(tx, viajeId, asientoIds, excluirReservaId = null) {
  const req = new sql.Request(tx)
    .input('viajeId', sql.BigInt, viajeId)
    .input('excluirReservaId', sql.BigInt, excluirReservaId);
  const lista = agregarLista(req, 'ocupado', asientoIds, sql.Int);
  const r = await req.query(`
    SELECT AsientoID FROM dbo.ReservaAsiento WITH (UPDLOCK, HOLDLOCK)
    WHERE ViajeID = @viajeId AND Estado = 'ACTIVA'
      AND (@excluirReservaId IS NULL OR ReservaID <> @excluirReservaId)
      AND AsientoID IN (${lista})
  `);
  return r.recordset;
}

export async function listarPasajerosConAsiento(tx, viajeId, pasajeroIds, excluirReservaId = null) {
  const req = new sql.Request(tx)
    .input('viajeId', sql.BigInt, viajeId)
    .input('excluirReservaId', sql.BigInt, excluirReservaId);
  const lista = agregarLista(req, 'pasajero', pasajeroIds, sql.BigInt);
  const r = await req.query(`
    SELECT PasajeroID FROM dbo.ReservaAsiento WITH (UPDLOCK, HOLDLOCK)
    WHERE ViajeID = @viajeId AND Estado = 'ACTIVA'
      AND (@excluirReservaId IS NULL OR ReservaID <> @excluirReservaId)
      AND PasajeroID IN (${lista})
  `);
  return r.recordset;
}

// =====================================================
// PASAJEROS
// =====================================================
export async function buscarPasajeroBloqueado(tx, tipoDocumento, numeroDocumento) {
  const r = await new sql.Request(tx)
    .input('tipo', sql.VarChar(12), tipoDocumento)
    .input('numero', sql.VarChar(20), numeroDocumento)
    .query(`
      SELECT PasajeroID, Nombres, Apellidos, FechaNacimiento, Estado
      FROM dbo.Pasajero WITH (UPDLOCK, HOLDLOCK)
      WHERE TipoDocumento = @tipo AND NumeroDocumento = @numero
    `);
  return r.recordset[0] || null;
}

export async function insertarPasajero(tx, item) {
  const r = await new sql.Request(tx)
    .input('tipo', sql.VarChar(12), item.tipoDocumento)
    .input('numero', sql.VarChar(20), item.numeroDocumento)
    .input('nombres', sql.NVarChar(100), item.nombres)
    .input('apellidos', sql.NVarChar(120), item.apellidos)
    .input('fecha', sql.Date, new Date(`${item.fechaNacimiento}T12:00:00Z`))
    .input('estado', sql.VarChar(12), 'ACTIVO')
    .query(`
      INSERT INTO dbo.Pasajero (UsuarioID, TipoDocumento, NumeroDocumento, Nombres,
                                Apellidos, FechaNacimiento, Telefono, Estado)
      OUTPUT INSERTED.PasajeroID
      VALUES (NULL, @tipo, @numero, @nombres, @apellidos, @fecha, NULL, @estado)
    `);
  return r.recordset[0].PasajeroID;
}

// =====================================================
// RESERVA (CABECERA Y DETALLE)
// =====================================================
export async function insertarReserva(tx, { usuarioId, viajeId, estado, total, politicaId }) {
  const r = await new sql.Request(tx)
    .input('usuario', sql.BigInt, usuarioId)
    .input('viaje', sql.BigInt, viajeId)
    .input('estado', sql.VarChar(15), estado)
    .input('total', sql.Decimal(12, 2), total)
    .input('politicaId', sql.Int, politicaId)
    .query(`
      INSERT INTO dbo.Reserva (UsuarioID, ViajeID, FechaReserva, Estado, Total, PoliticaID)
      OUTPUT INSERTED.ReservaID
      VALUES (@usuario, @viaje, SYSDATETIME(), @estado, @total, @politicaId)
    `);
  return r.recordset[0].ReservaID;
}

export async function insertarReservaAsiento(tx, { reservaId, viajeId, busId, asientoId, pasajeroId, precio, estado }) {
  await new sql.Request(tx)
    .input('reservaId', sql.BigInt, reservaId)
    .input('viajeId', sql.BigInt, viajeId)
    .input('busId', sql.Int, busId)
    .input('asientoId', sql.Int, asientoId)
    .input('pasajeroId', sql.BigInt, pasajeroId)
    .input('precio', sql.Decimal(12, 2), precio)
    .input('estado', sql.VarChar(10), estado)
    .query(`
      INSERT INTO dbo.ReservaAsiento (ReservaID, ViajeID, BusID, AsientoID, PasajeroID, Precio, Estado)
      VALUES (@reservaId, @viajeId, @busId, @asientoId, @pasajeroId, @precio, @estado)
    `);
}

export async function obtenerCodigo(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('reservaId', sql.BigInt, reservaId)
    .query(`SELECT Codigo FROM dbo.Reserva WHERE ReservaID = @reservaId`);
  return r.recordset[0]?.Codigo ?? null;
}

export async function registrarHistorial(tx, {
  reservaId, usuarioResponsableId, accion, viajeAnteriorId = null, viajeNuevoId = null, detalle
}) {
  await new sql.Request(tx)
    .input('reservaId', sql.BigInt, reservaId)
    .input('usuarioId', sql.BigInt, usuarioResponsableId)
    .input('accion', sql.VarChar(15), accion)
    .input('viajeAnteriorId', sql.BigInt, viajeAnteriorId)
    .input('viajeNuevoId', sql.BigInt, viajeNuevoId)
    .input('detalle', sql.NVarChar(1000), detalle)
    .query(`
      INSERT INTO dbo.HistorialReserva (ReservaID, UsuarioResponsableID, Accion,
                                        ViajeAnteriorID, ViajeNuevoID, Detalle, FechaCambio)
      VALUES (@reservaId, @usuarioId, @accion, @viajeAnteriorId, @viajeNuevoId, @detalle, SYSDATETIME())
    `);
}

// Reserva + datos del viaje actual, bloqueando la reserva.
export async function obtenerReservaBloqueada(tx, id) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .query(`
      SELECT r.ReservaID, r.Codigo, r.ViajeID, r.Estado, r.Total,
             v.RutaID, v.BusID, v.Tarifa, v.Salida, v.Estado AS EstadoViaje,
             CASE WHEN v.Salida > SYSDATETIME() THEN 1 ELSE 0 END AS SalidaFutura
      FROM dbo.Reserva r WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
      WHERE r.ReservaID = @id
    `);
  return r.recordset[0] || null;
}

export async function listarVentasConPagosBloqueadas(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, reservaId)
    .query(`
      SELECT v.VentaID, v.Estado AS EstadoVenta, p.PagoID, p.Estado AS EstadoPago, p.EsSimulado
      FROM dbo.Venta v WITH (UPDLOCK, HOLDLOCK)
      LEFT JOIN dbo.Pago p WITH (UPDLOCK, HOLDLOCK) ON p.VentaID = v.VentaID
      WHERE v.ReservaID = @id
    `);
  return r.recordset;
}

export async function tieneVentaBloqueada(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, reservaId)
    .query(`SELECT TOP (1) VentaID FROM dbo.Venta WITH (UPDLOCK, HOLDLOCK) WHERE ReservaID = @id`);
  return r.recordset.length > 0;
}

export async function listarAsignacionesBloqueadas(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, reservaId)
    .query(`
      SELECT ReservaAsientoID, AsientoID, PasajeroID, Estado
      FROM dbo.ReservaAsiento WITH (UPDLOCK, HOLDLOCK)
      WHERE ReservaID = @id
      ORDER BY ReservaAsientoID
    `);
  return r.recordset;
}

export async function liberarAsientos(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, reservaId)
    .query(`UPDATE dbo.ReservaAsiento SET Estado = 'LIBERADA' WHERE ReservaID = @id AND Estado = 'ACTIVA'`);
  return r.rowsAffected[0] || 0;
}

export async function marcarCancelada(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, reservaId)
    .query(`UPDATE dbo.Reserva SET Estado = 'CANCELADA' WHERE ReservaID = @id`);
  return r.rowsAffected[0] || 0;
}

export async function actualizarAsignacion(tx, { reservaAsientoId, reservaId, asientoId, pasajeroId }) {
  const r = await new sql.Request(tx)
    .input('reservaAsientoId', sql.BigInt, reservaAsientoId)
    .input('reservaId', sql.BigInt, reservaId)
    .input('asientoId', sql.Int, asientoId)
    .input('pasajeroId', sql.BigInt, pasajeroId)
    .query(`
      UPDATE dbo.ReservaAsiento
      SET AsientoID = @asientoId, PasajeroID = @pasajeroId
      WHERE ReservaAsientoID = @reservaAsientoId AND ReservaID = @reservaId AND Estado = 'ACTIVA'
    `);
  return r.rowsAffected[0] || 0;
}

export async function contarReferenciasAReservaAsiento(tx) {
  const r = await new sql.Request(tx).query(`
    SELECT COUNT(*) AS Total FROM sys.foreign_keys
    WHERE referenced_object_id = OBJECT_ID('dbo.ReservaAsiento')
  `);
  return Number(r.recordset[0].Total);
}

export async function eliminarAsignacionesActivas(tx, reservaId) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, reservaId)
    .query(`DELETE FROM dbo.ReservaAsiento WHERE ReservaID = @id AND Estado = 'ACTIVA'`);
  return r.rowsAffected[0] || 0;
}

export async function cambiarViaje(tx, reservaId, viajeNuevoId) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, reservaId)
    .input('nuevo', sql.BigInt, viajeNuevoId)
    .query(`UPDATE dbo.Reserva SET ViajeID = @nuevo, Estado = 'REPROGRAMADA' WHERE ReservaID = @id`);
  return r.rowsAffected[0] || 0;
}

// =====================================================
// CONSULTAS ADMINISTRATIVAS
// =====================================================
export async function listarCatalogos() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT v.ViajeID, v.BusID, v.Salida, v.LlegadaEstimada, v.Tarifa, v.Estado,
           r.Origen, r.Destino, b.Placa, b.Modelo, b.Capacidad
    FROM dbo.Viaje v
    INNER JOIN dbo.Ruta r ON r.RutaID = v.RutaID
    INNER JOIN dbo.Bus b ON b.BusID = v.BusID
    WHERE v.Estado = 'PROGRAMADO' AND v.Salida > SYSDATETIME()
    ORDER BY v.Salida ASC;

    SELECT PasajeroID, TipoDocumento, NumeroDocumento, Nombres, Apellidos, Estado
    FROM dbo.Pasajero
    WHERE Estado = 'ACTIVO'
    ORDER BY Apellidos, Nombres;
  `);
  return { viajes: r.recordsets[0], pasajeros: r.recordsets[1] };
}

export async function obtenerViajeConBus(viajeId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('viajeId', sql.BigInt, viajeId)
    .query(`
      SELECT v.ViajeID, v.BusID, v.Salida, v.LlegadaEstimada, v.Tarifa, v.Estado,
             r.Origen, r.Destino, b.Placa, b.Modelo, b.Capacidad
      FROM dbo.Viaje v
      INNER JOIN dbo.Ruta r ON r.RutaID = v.RutaID
      INNER JOIN dbo.Bus b ON b.BusID = v.BusID
      WHERE v.ViajeID = @viajeId
    `);
  return r.recordset[0] || null;
}

export async function listarAsientosDeViaje(viajeId, busId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('viajeId', sql.BigInt, viajeId)
    .input('busId', sql.Int, busId)
    .query(`
      SELECT a.AsientoID, a.BusID, a.Numero, a.Nivel,
        CAST(CASE WHEN EXISTS (
          SELECT 1 FROM dbo.ReservaAsiento ra
          WHERE ra.ViajeID = @viajeId AND ra.AsientoID = a.AsientoID AND ra.Estado = 'ACTIVA'
        ) THEN 1 ELSE 0 END AS bit) AS Ocupado
      FROM dbo.Asiento a
      WHERE a.BusID = @busId
      ORDER BY a.Nivel, a.Numero
    `);
  return r.recordset;
}

export async function listar(q) {
  const pool = await getPool();
  const r = await pool.request()
    .input('q', sql.NVarChar(110), `%${q}%`)
    .query(`
      SELECT r.ReservaID, r.Codigo, r.FechaReserva, r.Estado, r.Total, r.ViajeID,
             CONCAT(ru.Origen, ' - ', ru.Destino) AS Ruta, v.Salida, b.Placa,
             COUNT(ra.ReservaAsientoID) AS CantidadAsientos
      FROM dbo.Reserva r
      INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
      INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
      INNER JOIN dbo.Bus b ON b.BusID = v.BusID
      LEFT JOIN dbo.ReservaAsiento ra ON ra.ReservaID = r.ReservaID
      WHERE r.Codigo LIKE @q OR ru.Origen LIKE @q OR ru.Destino LIKE @q
         OR b.Placa LIKE @q OR r.Estado LIKE @q
      GROUP BY r.ReservaID, r.Codigo, r.FechaReserva, r.Estado, r.Total, r.ViajeID,
               ru.Origen, ru.Destino, v.Salida, b.Placa
      ORDER BY r.ReservaID DESC
    `);
  return r.recordset;
}

export async function obtenerResumenReserva(reservaId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('reservaId', sql.BigInt, reservaId)
    .query(`SELECT ReservaID, Codigo, Estado FROM dbo.Reserva WHERE ReservaID = @reservaId`);
  return r.recordset[0] || null;
}

export async function listarHistorial(reservaId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('reservaId', sql.BigInt, reservaId)
    .query(`
      SELECT h.ReservaID, h.UsuarioResponsableID, h.Accion, h.ViajeAnteriorID, h.ViajeNuevoID,
             h.Detalle, h.FechaCambio,
             u.Nombres AS ResponsableNombres, u.Apellidos AS ResponsableApellidos
      FROM dbo.HistorialReserva h
      LEFT JOIN dbo.Usuario u ON u.UsuarioID = h.UsuarioResponsableID
      WHERE h.ReservaID = @reservaId
      ORDER BY h.FechaCambio ASC
    `);
  return r.recordset;
}

export async function obtenerCabecera(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`
      SELECT r.ReservaID, r.Codigo, r.FechaReserva, r.Estado, r.Total, r.PoliticaID,
             u.UsuarioID, u.Nombres AS UsuarioNombres, u.Apellidos AS UsuarioApellidos,
             v.ViajeID, v.Salida, v.LlegadaEstimada, v.Tarifa,
             ru.Origen, ru.Destino, b.Placa, b.Modelo,
             tor.Nombre AS TerminalOrigen, tor.Direccion AS DireccionOrigen, tde.Nombre AS TerminalDestino, tde.Direccion AS DireccionDestino
      FROM dbo.Reserva r
      INNER JOIN dbo.Usuario u ON u.UsuarioID = r.UsuarioID
      INNER JOIN dbo.Viaje v ON v.ViajeID = r.ViajeID
      INNER JOIN dbo.Ruta ru ON ru.RutaID = v.RutaID
      LEFT JOIN dbo.Terminal tor ON tor.TerminalID = ru.TerminalOrigenID
      LEFT JOIN dbo.Terminal tde ON tde.TerminalID = ru.TerminalDestinoID
      INNER JOIN dbo.Bus b ON b.BusID = v.BusID
      WHERE r.ReservaID = @id
    `);
  return r.recordset[0] || null;
}

export async function listarItems(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`
      SELECT ra.ReservaAsientoID, ra.AsientoID, a.Numero, a.Nivel, ra.PasajeroID,
             p.TipoDocumento, p.NumeroDocumento, p.Nombres, p.Apellidos, p.FechaNacimiento,
             ra.Precio, ra.Estado
      FROM dbo.ReservaAsiento ra
      INNER JOIN dbo.Asiento a ON a.AsientoID = ra.AsientoID
      INNER JOIN dbo.Pasajero p ON p.PasajeroID = ra.PasajeroID
      WHERE ra.ReservaID = @id
      ORDER BY a.Nivel, a.Numero
    `);
  return r.recordset;
}
