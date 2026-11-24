
import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';

// =====================================================
// SIGET-VÍA — GESTIÓN DE PAGOS SIMULADOS
// PASO 170.7.7.12.5.2
// =====================================================
//
// FUNCIONALIDADES:
//
// 1. Consultar todos los pagos simulados.
// 2. Filtrar por búsqueda, estado y método.
// 3. Filtrar por rango de fechas.
// 4. Consultar indicadores generales.
// 5. Consultar detalle de un pago.
// 6. Consultar auditoría del pago y su venta.
// 7. Conservar integridad de los datos.
// 8. Impedir ediciones y eliminaciones directas.
//
// IMPORTANTE:
//
// Los pagos se registran desde Ventas.
// Las anulaciones se realizan desde Ventas.
// No se realizan cobros bancarios reales.
// =====================================================

// =====================================================
// 1. ESQUEMAS DE VALIDACIÓN
// =====================================================

const idSchema = z.coerce
  .number()
  .int()
  .positive()
  .safe();

const ESTADOS = [
  'REGISTRADO',
  'ANULADO'
];

const METODOS = [
  'EFECTIVO',
  'TARJETA',
  'TRANSFERENCIA',
  'OTRO'
];

// =====================================================
// 2. FUNCIONES AUXILIARES
// =====================================================

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(
    new Error(mensaje),
    { statusCode }
  );
}

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw errorHttp(
      'Identificador de pago inválido.'
    );
  }

  return resultado.data;
}

// =====================================================
// 3. VALIDACIÓN DE FECHAS
// =====================================================

function fechaValida(valor) {
  if (valor === '') {
    return true;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }

  const [anio, mes, dia] = valor
    .split('-')
    .map(Number);

  const fecha = new Date(
    Date.UTC(anio, mes - 1, dia)
  );

  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

// =====================================================
// 4. VALIDACIÓN DE FILTROS
// =====================================================

function obtenerFiltros(query) {
  const esquema = z.object({
    q: z.string()
      .trim()
      .max(100)
      .optional(),

    estado: z.string()
      .optional(),

    metodo: z.string()
      .optional(),

    desde: z.string()
      .optional(),

    hasta: z.string()
      .optional()
  });

  const resultado = esquema.safeParse(query);

  if (!resultado.success) {
    throw errorHttp(
      'Los filtros enviados no son válidos.'
    );
  }

  const datos = resultado.data;

  const filtros = {
    q: (datos.q || '').trim(),
    estado: (datos.estado || '').trim(),
    metodo: (datos.metodo || '').trim(),
    desde: (datos.desde || '').trim(),
    hasta: (datos.hasta || '').trim()
  };

  // Validar estado.

  if (
    filtros.estado &&
    !ESTADOS.includes(filtros.estado)
  ) {
    throw errorHttp(
      'El estado del pago no es válido.'
    );
  }

  // Validar método.

  if (
    filtros.metodo &&
    !METODOS.includes(filtros.metodo)
  ) {
    throw errorHttp(
      'El método de pago no es válido.'
    );
  }

  // Validar fechas.

  if (
    !fechaValida(filtros.desde) ||
    !fechaValida(filtros.hasta)
  ) {
    throw errorHttp(
      'El rango de fechas no es válido.'
    );
  }

  // Comprobar orden de fechas.

  if (
    filtros.desde &&
    filtros.hasta &&
    filtros.desde > filtros.hasta
  ) {
    throw errorHttp(
      'La fecha inicial no puede ser posterior a la final.'
    );
  }

  return filtros;
}

// =====================================================
// 5. CONSULTA PRINCIPAL DE PAGOS
// =====================================================

const consultaPagos = `
  SELECT
    p.PagoID,
    p.VentaID,
    p.Metodo,
    p.ReferenciaSimulada,
    p.Monto,
    p.FechaPago,
    p.Estado,
    p.EsSimulado,

    v.CodigoComprobante,
    v.Estado AS EstadoVenta,
    v.Total AS TotalVenta,
    v.FechaVenta,

    r.ReservaID,
    r.Codigo AS CodigoReserva,

    u.UsuarioID AS VendedorID,
    u.Nombres AS VendedorNombres,
    u.Apellidos AS VendedorApellidos,

    ru.Origen,
    ru.Destino,

    vi.Salida

  FROM dbo.Pago p

  INNER JOIN dbo.Venta v
    ON v.VentaID = p.VentaID

  INNER JOIN dbo.Reserva r
    ON r.ReservaID = v.ReservaID

  INNER JOIN dbo.Usuario u
    ON u.UsuarioID = v.VendedorID

  INNER JOIN dbo.Viaje vi
    ON vi.ViajeID = r.ViajeID

  INNER JOIN dbo.Ruta ru
    ON ru.RutaID = vi.RutaID
`;

// =====================================================
// 6. CONSULTAR AUDITORÍA DE PAGOS Y VENTAS
// =====================================================

async function obtenerAuditoria(
  pool,
  pagoId,
  ventaId
) {
  const resultado = await pool.request()
    .input(
      'pagoId',
      sql.BigInt,
      pagoId
    )
    .input(
      'ventaId',
      sql.BigInt,
      ventaId
    )
    .query(`
      SELECT
        a.AuditoriaID,
        a.UsuarioID,
        a.Entidad,
        a.RegistroID,
        a.Accion,
        a.Detalle,
        a.Fecha,

        u.Nombres AS UsuarioNombres,
        u.Apellidos AS UsuarioApellidos

      FROM dbo.Auditoria a

      LEFT JOIN dbo.Usuario u
        ON u.UsuarioID = a.UsuarioID

      WHERE
        (
          LOWER(a.Entidad) = 'pago'
          AND a.RegistroID = @pagoId
        )
        OR
        (
          LOWER(a.Entidad) = 'venta'
          AND a.RegistroID = @ventaId
        )

      ORDER BY
        a.Fecha DESC,
        a.AuditoriaID DESC
    `);

  return resultado.recordset;
}

// =====================================================
// 7. ROUTER PRINCIPAL
// =====================================================

export function createPagosRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  // Solo usuarios administrativos autorizados.

  router.use(
    auth,
    activeUser,
    admin
  );

  // ===================================================
  // GET /api/pagos/resumen
  // INDICADORES GENERALES
  // ===================================================

  router.get(
    '/resumen',
    asyncRoute(async (req, res) => {
      const pool = await getPool();

      const resultado = await pool.request()
        .query(`
          SELECT
            COUNT_BIG(*) AS TotalPagos,

            COALESCE(
              SUM(
                CASE
                  WHEN Estado = 'REGISTRADO'
                  THEN 1
                  ELSE 0
                END
              ),
              0
            ) AS PagosRegistrados,

            COALESCE(
              SUM(
                CASE
                  WHEN Estado = 'ANULADO'
                  THEN 1
                  ELSE 0
                END
              ),
              0
            ) AS PagosAnulados,

            COALESCE(
              SUM(
                CASE
                  WHEN Estado = 'REGISTRADO'
                  THEN Monto
                  ELSE 0
                END
              ),
              0
            ) AS TotalRegistrado,

            COALESCE(
              SUM(
                CASE
                  WHEN Estado = 'ANULADO'
                  THEN Monto
                  ELSE 0
                END
              ),
              0
            ) AS TotalAnulado

          FROM dbo.Pago

          WHERE EsSimulado = 1
        `);

      return res.json(
        resultado.recordset[0]
      );
    })
  );

  // ===================================================
  // GET /api/pagos
  // LISTADO COMPLETO CON FILTROS
  // ===================================================

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const filtros = obtenerFiltros(
        req.query
      );

      const pool = await getPool();

      const request = pool.request()
        .input(
          'q',
          sql.NVarChar(110),
          `%${filtros.q}%`
        )
        .input(
          'estado',
          sql.VarChar(15),
          filtros.estado
        )
        .input(
          'metodo',
          sql.VarChar(20),
          filtros.metodo
        )
        .input(
          'desde',
          sql.VarChar(10),
          filtros.desde
        )
        .input(
          'hasta',
          sql.VarChar(10),
          filtros.hasta
        );

      const resultado = await request.query(`
        ${consultaPagos}

        WHERE
          p.EsSimulado = 1

          AND (
            @estado = ''
            OR p.Estado = @estado
          )

          AND (
            @metodo = ''
            OR p.Metodo = @metodo
          )

          AND (
            @desde = ''
            OR p.FechaPago >=
              TRY_CONVERT(date, @desde, 23)
          )

          AND (
            @hasta = ''
            OR p.FechaPago <
              DATEADD(
                DAY,
                1,
                TRY_CONVERT(date, @hasta, 23)
              )
          )

          AND (
            v.CodigoComprobante LIKE @q
            OR r.Codigo LIKE @q
            OR ru.Origen LIKE @q
            OR ru.Destino LIKE @q
            OR p.Metodo LIKE @q
            OR p.Estado LIKE @q
            OR u.Nombres LIKE @q
            OR u.Apellidos LIKE @q
          )

        ORDER BY
          p.FechaPago DESC,
          p.PagoID DESC
      `);

      return res.json(
        resultado.recordset
      );
    })
  );

  // ===================================================
  // GET /api/pagos/:id
  // DETALLE DE PAGO Y AUDITORÍA
  // ===================================================

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'id',
          sql.BigInt,
          id
        )
        .query(`
          ${consultaPagos}

          WHERE
            p.PagoID = @id
            AND p.EsSimulado = 1
        `);

      const pago = resultado.recordset[0];

      if (!pago) {
        return res.status(404).json({
          error: 'Pago no encontrado.'
        });
      }

      // Obtener historial de auditoría.

      const auditoria = await obtenerAuditoria(
        pool,
        pago.PagoID,
        pago.VentaID
      );

      return res.json({
        ...pago,
        auditoria
      });
    })
  );

  // ===================================================
  // 8. PROTECCIÓN DE OPERACIONES
  // ===================================================
  //
  // Este módulo únicamente consulta pagos.
  //
  // El registro se realiza desde:
  // POST /api/ventas
  //
  // La anulación se realiza desde:
  // PATCH /api/ventas/:id/anular
  //
  // No permite modificar directamente:
  //
  // - Monto.
  // - Estado.
  // - VentaID.
  // - Metodo.
  //
  // Tampoco permite eliminar pagos.
  //
  // La auditoría automática se registra dentro
  // de las transacciones de ventas.js.
  //
  // ===================================================

  return router;
}
