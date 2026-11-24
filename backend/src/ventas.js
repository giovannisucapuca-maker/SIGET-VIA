
import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';

// ======================================================
// SIGET-VÍA — VENTAS Y PAGOS SIMULADOS
// PASO 170.7.7.12.5.2
// ======================================================
//
// Funcionalidades:
// - Consultar reservas disponibles para venta.
// - Listar ventas y comprobantes.
// - Consultar detalle, pasajeros y pagos.
// - Registrar venta y pago simulado.
// - Evitar ventas duplicadas.
// - Anular ventas y pagos.
// - Conservar reservas y asientos.
// - Registrar auditoría de cada operación.
// - Mostrar DNI, CE y PASAPORTE.
// - Conciliar importes antes de anular.
//
// No realiza cobros bancarios reales.
// No emite comprobantes tributarios electrónicos.
// No modifica la estructura de SQL Server.
//
// ======================================================

// ======================================================
// ESQUEMAS DE VALIDACIÓN
// ======================================================

const idSchema = z.coerce
  .number()
  .int()
  .positive()
  .safe();

const pagoSchema = z.object({
  reservaId: z.number()
    .int()
    .positive()
    .safe(),

  metodo: z.enum([
    'EFECTIVO',
    'TARJETA',
    'TRANSFERENCIA',
    'OTRO'
  ]),

  referenciaSimulada: z.string()
    .trim()
    .max(100)
    .nullable()
    .optional()
});

// ======================================================
// UTILIDADES
// ======================================================

function fallo(mensaje, statusCode = 400) {
  return Object.assign(
    new Error(mensaje),
    { statusCode }
  );
}

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw fallo('Identificador inválido.');
  }

  return resultado.data;
}

function validarPago(body) {
  const resultado = pagoSchema.safeParse(body);

  if (!resultado.success) {
    throw fallo(
      resultado.error.issues[0]?.message ||
      'Los datos del pago son inválidos.'
    );
  }

  return resultado.data;
}

// ======================================================
// ERRORES DE SQL SERVER
// ======================================================

function errorDeBase(err) {
  const numero =
    err.number ??
    err.originalError?.info?.number;

  if (
    numero === 2601 ||
    numero === 2627
  ) {
    return fallo(
      'Esta reserva ya tiene una venta o ' +
      'existe un registro duplicado.',
      409
    );
  }

  if (numero === 547) {
    return fallo(
      'SQL Server rechazó la operación por ' +
      'una restricción de integridad. ' +
      'Verifica los datos relacionados.',
      409
    );
  }

  return err;
}

// ======================================================
// AUDITORÍA AUTOMÁTICA
// ======================================================
//
// Estructura de dbo.Auditoria:
//
// AuditoriaID
// UsuarioID
// Entidad
// RegistroID
// Accion
// Detalle
// Fecha
//
// Las operaciones de auditoría se ejecutan
// dentro de la misma transacción.
//
// ======================================================

async function registrarAuditoria({
  tx,
  usuarioId,
  entidad,
  registroId,
  accion,
  detalle
}) {
  const accionesPermitidas = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'CAMBIO_ESTADO',
    'LOGIN',
    'OTRO'
  ];

  if (!accionesPermitidas.includes(accion)) {
    throw fallo(
      'La acción de auditoría no está permitida.',
      500
    );
  }

  if (
    !usuarioId ||
    !entidad ||
    !registroId
  ) {
    throw fallo(
      'Faltan datos obligatorios para auditar.',
      500
    );
  }

  await new sql.Request(tx)
    .input(
      'usuarioId',
      sql.BigInt,
      usuarioId
    )
    .input(
      'entidad',
      sql.VarChar(70),
      entidad
    )
    .input(
      'registroId',
      sql.BigInt,
      registroId
    )
    .input(
      'accion',
      sql.VarChar(20),
      accion
    )
    .input(
      'detalle',
      sql.NVarChar(1000),
      detalle
    )
    .query(`
      INSERT INTO dbo.Auditoria (
        UsuarioID,
        Entidad,
        RegistroID,
        Accion,
        Detalle,
        Fecha
      )
      VALUES (
        @usuarioId,
        @entidad,
        @registroId,
        @accion,
        @detalle,
        SYSDATETIME()
      )
    `);
}

// ======================================================
// ROUTER PRINCIPAL
// ======================================================

export function createVentasRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  router.use(
    auth,
    activeUser,
    admin
  );

  // ====================================================
  // GET /api/ventas/catalogos
  // RESERVAS DISPONIBLES PARA VENTA
  // ====================================================

  router.get(
    '/catalogos',
    asyncRoute(async (req, res) => {
      const pool = await getPool();

      const resultado = await pool.request()
        .query(`
          SELECT
            r.ReservaID,
            r.Codigo,
            r.Estado,
            r.Total,

            v.Salida,
            v.Estado AS EstadoViaje,

            ru.Origen,
            ru.Destino,

            COUNT(
              ra.ReservaAsientoID
            ) AS CantidadAsientos

          FROM dbo.Reserva r

          INNER JOIN dbo.Viaje v
            ON v.ViajeID = r.ViajeID

          INNER JOIN dbo.Ruta ru
            ON ru.RutaID = v.RutaID

          LEFT JOIN dbo.ReservaAsiento ra
            ON ra.ReservaID = r.ReservaID
            AND ra.Estado = 'ACTIVA'

          WHERE
            r.Estado IN (
              'COMPLETADA',
              'CONFIRMADA',
              'REPROGRAMADA'
            )

            AND v.Estado = 'PROGRAMADO'

            AND v.Salida > SYSDATETIME()

            AND NOT EXISTS (
              SELECT 1
              FROM dbo.Venta ve
              WHERE ve.ReservaID = r.ReservaID
            )

          GROUP BY
            r.ReservaID,
            r.Codigo,
            r.Estado,
            r.Total,
            v.Salida,
            v.Estado,
            ru.Origen,
            ru.Destino

          HAVING
            COUNT(
              ra.ReservaAsientoID
            ) > 0

          ORDER BY
            v.Salida ASC,
            r.ReservaID DESC
        `);

      return res.json({
        reservas: resultado.recordset
      });
    })
  );

  // ====================================================
  // GET /api/ventas
  // LISTAR VENTAS
  // ====================================================

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const q = String(
        req.query.q || ''
      )
        .trim()
        .slice(0, 100);

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'q',
          sql.NVarChar(110),
          `%${q}%`
        )
        .query(`
          SELECT
            ve.VentaID,
            ve.ReservaID,
            ve.VendedorID,
            ve.FechaVenta,
            ve.Total,
            ve.Estado,
            ve.CodigoComprobante,

            r.Codigo AS CodigoReserva,

            ru.Origen,
            ru.Destino,

            v.Salida,

            p.Metodo,
            p.Monto AS MontoPago,
            p.Estado AS EstadoPago

          FROM dbo.Venta ve

          INNER JOIN dbo.Reserva r
            ON r.ReservaID = ve.ReservaID

          INNER JOIN dbo.Viaje v
            ON v.ViajeID = r.ViajeID

          INNER JOIN dbo.Ruta ru
            ON ru.RutaID = v.RutaID

          LEFT JOIN dbo.Pago p
            ON p.VentaID = ve.VentaID

          WHERE
            ve.CodigoComprobante LIKE @q
            OR r.Codigo LIKE @q
            OR ru.Origen LIKE @q
            OR ru.Destino LIKE @q
            OR ve.Estado LIKE @q

          ORDER BY
            ve.VentaID DESC
        `);

      return res.json(
        resultado.recordset
      );
    })
  );

  // ====================================================
  // GET /api/ventas/:id
  // DETALLE DE VENTA, PAGO Y PASAJEROS
  // ====================================================

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const pool = await getPool();

      // ----------------------------------------------
      // 1. CABECERA DE VENTA
      // ----------------------------------------------

      const cabecera = await pool.request()
        .input(
          'id',
          sql.BigInt,
          id
        )
        .query(`
          SELECT
            ve.VentaID,
            ve.ReservaID,
            ve.VendedorID,
            ve.FechaVenta,
            ve.Total,
            ve.Estado,
            ve.CodigoComprobante,

            r.Codigo AS CodigoReserva,
            r.Estado AS EstadoReserva,

            u.Nombres AS VendedorNombres,
            u.Apellidos AS VendedorApellidos,

            v.Salida,

            ru.Origen,
            ru.Destino,

            b.Placa,
            b.Modelo

          FROM dbo.Venta ve

          INNER JOIN dbo.Reserva r
            ON r.ReservaID = ve.ReservaID

          INNER JOIN dbo.Viaje v
            ON v.ViajeID = r.ViajeID

          INNER JOIN dbo.Ruta ru
            ON ru.RutaID = v.RutaID

          INNER JOIN dbo.Bus b
            ON b.BusID = v.BusID

          INNER JOIN dbo.Usuario u
            ON u.UsuarioID = ve.VendedorID

          WHERE ve.VentaID = @id
        `);

      if (!cabecera.recordset.length) {
        return res.status(404).json({
          error: 'Venta no encontrada.'
        });
      }

      // ----------------------------------------------
      // 2. PAGOS DE LA VENTA
      // ----------------------------------------------

      const pagos = await pool.request()
        .input(
          'id',
          sql.BigInt,
          id
        )
        .query(`
          SELECT
            PagoID,
            VentaID,
            Metodo,
            ReferenciaSimulada,
            Monto,
            FechaPago,
            Estado,
            EsSimulado

          FROM dbo.Pago

          WHERE VentaID = @id

          ORDER BY PagoID
        `);

      // ----------------------------------------------
      // 3. PASAJEROS Y ASIENTOS
      // ----------------------------------------------

      const pasajeros = await pool.request()
        .input(
          'reservaId',
          sql.BigInt,
          cabecera.recordset[0].ReservaID
        )
        .query(`
          SELECT
            ra.ReservaAsientoID,

            a.Numero,
            a.Nivel,

            p.TipoDocumento,
            p.NumeroDocumento,
            p.Nombres,
            p.Apellidos,

            ra.Precio

          FROM dbo.ReservaAsiento ra

          INNER JOIN dbo.Asiento a
            ON a.AsientoID = ra.AsientoID

          INNER JOIN dbo.Pasajero p
            ON p.PasajeroID = ra.PasajeroID

          WHERE
            ra.ReservaID = @reservaId
            AND ra.Estado = 'ACTIVA'

          ORDER BY
            a.Nivel,
            a.Numero
        `);

      // Mantener la respuesta compatible
      // con frontend/src/Ventas.tsx.

      return res.json({
        ...cabecera.recordset[0],
        pagos: pagos.recordset,
        pasajeros: pasajeros.recordset
      });
    })
  );

  // ====================================================
  // POST /api/ventas
  // REGISTRAR VENTA, PAGO Y AUDITORÍA
  // ====================================================

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const datos = validarPago(
        req.body
      );

      const usuarioId =
        req.currentUser.UsuarioID;

      const pool = await getPool();
      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // --------------------------------------------
        // 1. BLOQUEAR Y CONSULTAR RESERVA
        // --------------------------------------------

        const consultaReserva = await new sql.Request(tx)
          .input(
            'reservaId',
            sql.BigInt,
            datos.reservaId
          )
          .query(`
            SELECT
              r.ReservaID,
              r.Codigo,
              r.Estado,
              r.Total,

              v.Estado AS EstadoViaje,
              v.Salida,

              CASE
                WHEN v.Salida > SYSDATETIME()
                THEN 1
                ELSE 0
              END AS SalidaFutura

            FROM dbo.Reserva r
              WITH (UPDLOCK, HOLDLOCK)

            INNER JOIN dbo.Viaje v
              ON v.ViajeID = r.ViajeID

            WHERE
              r.ReservaID = @reservaId
          `);

        const reserva =
          consultaReserva.recordset[0];

        if (!reserva) {
          throw fallo(
            'Reserva no encontrada.',
            404
          );
        }

        // --------------------------------------------
        // 2. VALIDAR ESTADO DE RESERVA
        // --------------------------------------------

        const estadosReservaPermitidos = [
          'COMPLETADA',
          'CONFIRMADA',
          'REPROGRAMADA'
        ];

        if (
          !estadosReservaPermitidos.includes(
            reserva.Estado
          )
        ) {
          throw fallo(
            'El estado de la reserva no permite registrar ventas.',
            409
          );
        }

        // --------------------------------------------
        // 3. VALIDAR ESTADO DEL VIAJE
        // --------------------------------------------

        if (
          reserva.EstadoViaje !== 'PROGRAMADO'
        ) {
          throw fallo(
            'Solo se venden pasajes de viajes PROGRAMADOS.',
            409
          );
        }

        // --------------------------------------------
        // 4. VALIDAR FECHA DE SALIDA
        // --------------------------------------------

        if (
          Number(reserva.SalidaFutura) !== 1
        ) {
          throw fallo(
            'La hora de salida ya llegó. ' +
            'No se puede vender esta reserva.',
            409
          );
        }

        // --------------------------------------------
        // 5. IMPEDIR VENTAS DUPLICADAS
        // --------------------------------------------

        const existente = await new sql.Request(tx)
          .input(
            'reservaId',
            sql.BigInt,
            datos.reservaId
          )
          .query(`
            SELECT VentaID

            FROM dbo.Venta
              WITH (UPDLOCK, HOLDLOCK)

            WHERE ReservaID = @reservaId
          `);

        if (existente.recordset.length) {
          throw fallo(
            'Esta reserva ya tiene una venta ' +
            'registrada o anulada.',
            409
          );
        }

        // --------------------------------------------
        // 6. VALIDAR ASIENTOS ACTIVOS
        // --------------------------------------------

        const consultaAsientos = await new sql.Request(tx)
          .input(
            'reservaId',
            sql.BigInt,
            datos.reservaId
          )
          .query(`
            SELECT
              COUNT_BIG(*) AS Cantidad,
              COALESCE(
                SUM(Precio),
                0
              ) AS TotalAsientos

            FROM dbo.ReservaAsiento
              WITH (HOLDLOCK)

            WHERE
              ReservaID = @reservaId
              AND Estado = 'ACTIVA'
          `);

        const cantidadAsientos = Number(
          consultaAsientos.recordset[0].Cantidad
        );

        if (cantidadAsientos < 1) {
          throw fallo(
            'La reserva no tiene asientos activos.',
            409
          );
        }

        // --------------------------------------------
        // 7. VALIDAR MONTO
        // --------------------------------------------

        const total = Number(
          reserva.Total
        );

        const totalAsientos = Number(
          consultaAsientos.recordset[0].TotalAsientos
        );

        if (
          !Number.isFinite(total) ||
          total <= 0 ||
          total > 9999999999.99
        ) {
          throw fallo(
            'El total de la reserva es inválido para el cobro.',
            409
          );
        }

        if (
          !Number.isFinite(totalAsientos) ||
          Math.round(total * 100) !==
          Math.round(totalAsientos * 100)
        ) {
          throw fallo(
            'El importe de la reserva no ' +
            'coincide con los asientos activos.',
            409
          );
        }

        // --------------------------------------------
        // 8. REGISTRAR VENTA
        // --------------------------------------------

        const venta = await new sql.Request(tx)
          .input(
            'reservaId',
            sql.BigInt,
            datos.reservaId
          )
          .input(
            'vendedorId',
            sql.BigInt,
            usuarioId
          )
          .input(
            'total',
            sql.Decimal(12, 2),
            total
          )
          .query(`
            INSERT INTO dbo.Venta (
              ReservaID,
              VendedorID,
              FechaVenta,
              Total,
              Estado
            )

            OUTPUT INSERTED.VentaID

            VALUES (
              @reservaId,
              @vendedorId,
              SYSDATETIME(),
              @total,
              'REGISTRADA'
            )
          `);

        const ventaId =
          venta.recordset[0].VentaID;

        // --------------------------------------------
        // 9. REGISTRAR PAGO SIMULADO
        // --------------------------------------------

        const pago = await new sql.Request(tx)
          .input(
            'ventaId',
            sql.BigInt,
            ventaId
          )
          .input(
            'metodo',
            sql.VarChar(20),
            datos.metodo
          )
          .input(
            'referencia',
            sql.NVarChar(100),
            datos.referenciaSimulada || null
          )
          .input(
            'monto',
            sql.Decimal(12, 2),
            total
          )
          .query(`
            INSERT INTO dbo.Pago (
              VentaID,
              Metodo,
              ReferenciaSimulada,
              Monto,
              FechaPago,
              Estado,
              EsSimulado
            )

            OUTPUT INSERTED.PagoID

            VALUES (
              @ventaId,
              @metodo,
              @referencia,
              @monto,
              SYSDATETIME(),
              'REGISTRADO',
              1
            )
          `);

        const pagoId =
          pago.recordset[0].PagoID;

        // --------------------------------------------
        // 10. RECUPERAR CÓDIGO DE COMPROBANTE
        // --------------------------------------------

        const comprobante = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            ventaId
          )
          .query(`
            SELECT CodigoComprobante

            FROM dbo.Venta

            WHERE VentaID = @id
          `);

        const codigoComprobante =
          comprobante.recordset[0]
            ?.CodigoComprobante ?? null;

        // --------------------------------------------
        // 11. AUDITORÍA DE LA VENTA
        // --------------------------------------------

        await registrarAuditoria({
          tx,
          usuarioId,
          entidad: 'Venta',
          registroId: ventaId,
          accion: 'INSERT',
          detalle:
            `Registro de venta simulada ` +
            `${codigoComprobante || `#${ventaId}`}. ` +
            `Reserva ${reserva.Codigo}. ` +
            `Monto S/ ${total.toFixed(2)}. ` +
            `Estado REGISTRADA.`
        });

        // --------------------------------------------
        // 12. AUDITORÍA DEL PAGO
        // --------------------------------------------

        await registrarAuditoria({
          tx,
          usuarioId,
          entidad: 'Pago',
          registroId: pagoId,
          accion: 'INSERT',
          detalle:
            `Registro de pago simulado #${pagoId}. ` +
            `Venta #${ventaId}. ` +
            `Método ${datos.metodo}. ` +
            `Monto S/ ${total.toFixed(2)}. ` +
            `Estado REGISTRADO.`
        });

        // --------------------------------------------
        // 13. CONFIRMAR TRANSACCIÓN
        // --------------------------------------------

        // Si falla la venta, el pago o la auditoría,
        // se revierte toda la transacción.

        await tx.commit();

        return res.status(201).json({
          VentaID: ventaId,
          PagoID: pagoId,
          CodigoComprobante: codigoComprobante,
          Total: total,
          mensaje:
            'Venta, pago simulado y auditoría ' +
            'registrados correctamente.'
        });

      } catch (err) {
        await tx.rollback().catch(() => {});
        throw errorDeBase(err);
      }
    })
  );

  // ====================================================
  // PATCH /api/ventas/:id/anular
  // ANULAR VENTA, PAGO Y REGISTRAR AUDITORÍA
  // ====================================================

  router.patch(
    '/:id/anular',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const usuarioId =
        req.currentUser.UsuarioID;

      const pool = await getPool();
      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // --------------------------------------------
        // 1. BLOQUEAR Y VALIDAR VENTA
        // --------------------------------------------

        const consultaVenta = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            SELECT
              VentaID,
              CodigoComprobante,
              ReservaID,
              Estado,
              Total

            FROM dbo.Venta
              WITH (UPDLOCK, HOLDLOCK)

            WHERE VentaID = @id
          `);

        if (!consultaVenta.recordset.length) {
          throw fallo(
            'Venta no encontrada.',
            404
          );
        }

        const venta =
          consultaVenta.recordset[0];

        if (
          venta.Estado !== 'REGISTRADA'
        ) {
          throw fallo(
            'Solo se pueden anular ventas REGISTRADAS.',
            409
          );
        }

        // --------------------------------------------
        // 2. BLOQUEAR Y VALIDAR PAGO
        // --------------------------------------------

        const consultaPago = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            SELECT
              PagoID,
              Estado,
              EsSimulado,
              Monto,
              Metodo

            FROM dbo.Pago
              WITH (UPDLOCK, HOLDLOCK)

            WHERE VentaID = @id
          `);

        if (
          consultaPago.recordset.length !== 1
        ) {
          throw fallo(
            'La venta debe tener exactamente un ' +
            'pago simulado para anularse.',
            409
          );
        }

        const pago =
          consultaPago.recordset[0];

        if (
          !pago.EsSimulado ||
          pago.Estado !== 'REGISTRADO'
        ) {
          throw fallo(
            'El pago simulado de esta venta ' +
            'no tiene un estado válido.',
            409
          );
        }

        // --------------------------------------------
        // 3. CONCILIAR IMPORTES
        // --------------------------------------------

        const totalVenta = Number(
          venta.Total
        );

        const montoPago = Number(
          pago.Monto
        );

        if (
          !Number.isFinite(totalVenta) ||
          !Number.isFinite(montoPago) ||
          Math.round(totalVenta * 100) !==
          Math.round(montoPago * 100)
        ) {
          throw fallo(
            'El importe del pago no coincide con ' +
            'la venta. Revisa la conciliación.',
            409
          );
        }

        // --------------------------------------------
        // 4. ANULAR PAGO
        // --------------------------------------------

        const actualizacionPago =
          await new sql.Request(tx)
            .input(
              'pagoId',
              sql.BigInt,
              pago.PagoID
            )
            .query(`
              UPDATE dbo.Pago

              SET Estado = 'ANULADO'

              WHERE
                PagoID = @pagoId
                AND Estado = 'REGISTRADO'
            `);

        if (
          actualizacionPago.rowsAffected[0] !== 1
        ) {
          throw fallo(
            'No se pudo actualizar el pago.',
            409
          );
        }

        // --------------------------------------------
        // 5. ANULAR VENTA
        // --------------------------------------------

        const actualizacionVenta =
          await new sql.Request(tx)
            .input(
              'id',
              sql.BigInt,
              id
            )
            .query(`
              UPDATE dbo.Venta

              SET Estado = 'ANULADA'

              WHERE
                VentaID = @id
                AND Estado = 'REGISTRADA'
            `);

        if (
          actualizacionVenta.rowsAffected[0] !== 1
        ) {
          throw fallo(
            'No se pudo actualizar la venta.',
            409
          );
        }

        // --------------------------------------------
        // 6. AUDITORÍA DE ANULACIÓN DE VENTA
        // --------------------------------------------

        await registrarAuditoria({
          tx,
          usuarioId,
          entidad: 'Venta',
          registroId: id,
          accion: 'CAMBIO_ESTADO',
          detalle:
            `Anulación de venta ` +
            `${venta.CodigoComprobante || `#${id}`}. ` +
            `Estado REGISTRADA -> ANULADA. ` +
            `Monto S/ ${totalVenta.toFixed(2)}. ` +
            `ReservaID ${venta.ReservaID}.`
        });

        // --------------------------------------------
        // 7. AUDITORÍA DE ANULACIÓN DE PAGO
        // --------------------------------------------

        await registrarAuditoria({
          tx,
          usuarioId,
          entidad: 'Pago',
          registroId: pago.PagoID,
          accion: 'CAMBIO_ESTADO',
          detalle:
            `Anulación de pago simulado #${pago.PagoID}. ` +
            `Venta #${id}. ` +
            `Estado REGISTRADO -> ANULADO. ` +
            `Método ${pago.Metodo}. ` +
            `Monto S/ ${montoPago.toFixed(2)}.`
        });

        // --------------------------------------------
        // 8. CONFIRMAR TRANSACCIÓN
        // --------------------------------------------

        // La reserva y sus asientos no se modifican.
        // La anulación no elimina registros.
        // Se conserva el historial de auditoría.

        await tx.commit();

        return res.json({
          VentaID: id,
          PagoID: pago.PagoID,
          Estado: 'ANULADA',
          EstadoPago: 'ANULADO',
          mensaje:
            'Venta y pago simulados anulados correctamente. ' +
            'La auditoría fue registrada. ' +
            'Reserva y asientos sin cambios.'
        });

      } catch (err) {
        await tx.rollback().catch(() => {});
        throw errorDeBase(err);
      }
    })
  );

  return router;
}
