
import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';

// =====================================================
// SIGET-VÍA — POLÍTICAS DEL SERVICIO
// PASO 172.9.5.2 — RF17
// =====================================================

const TIPOS = [
  'RESERVA',
  'CANCELACION',
  'REPROGRAMACION',
  'CONTRATACION',
  'PRIVACIDAD',
  'OTRA'
];

const tipoSchema = z.enum(TIPOS);

const idSchema = z.coerce
  .number()
  .int()
  .positive()
  .safe();

// =====================================================
// VALIDAR FECHAS
// =====================================================

function fechaValida(valor) {
  if (
    typeof valor !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor)
  ) {
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

const fechaSchema = z.string().refine(
  fechaValida,
  'La fecha debe tener formato AAAA-MM-DD.'
);

// =====================================================
// ESQUEMA DE POLÍTICAS
// =====================================================

const politicaSchema = z.object({
  tipo: tipoSchema,

  titulo: z.string()
    .trim()
    .min(5)
    .max(150),

  contenido: z.string()
    .trim()
    .min(20)
    .max(30000),

  version: z.string()
    .trim()
    .min(1)
    .max(20),

  vigenteDesde: fechaSchema,

  vigenteHasta: z.union([
    fechaSchema,
    z.null()
  ]).optional(),

  activa: z.boolean().default(true)
}).refine(
  datos =>
    !datos.vigenteHasta ||
    datos.vigenteHasta >= datos.vigenteDesde,
  {
    message:
      'La fecha final no puede ser anterior a la inicial.',
    path: ['vigenteHasta']
  }
);

// =====================================================
// ERRORES HTTP
// =====================================================

function errorHttp(
  mensaje,
  statusCode = 400
) {
  return Object.assign(
    new Error(mensaje),
    { statusCode }
  );
}

// =====================================================
// AUDITORÍA ADMINISTRATIVA
// =====================================================

async function registrarAuditoria(
  tx,
  usuarioId,
  politicaId,
  accion,
  detalle
) {
  await new sql.Request(tx)
    .input(
      'usuarioId',
      sql.BigInt,
      usuarioId
    )
    .input(
      'politicaId',
      sql.BigInt,
      politicaId
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
        'PoliticaServicio',
        @politicaId,
        @accion,
        @detalle,
        SYSDATETIME()
      )
    `);
}

// =====================================================
// PARÁMETROS PARA REGISTRO Y EDICIÓN
// =====================================================

function parametrosPolitica(
  request,
  datos
) {
  return request
    .input(
      'tipo',
      sql.VarChar(25),
      datos.tipo
    )
    .input(
      'titulo',
      sql.NVarChar(150),
      datos.titulo
    )
    .input(
      'contenido',
      sql.NVarChar(sql.MAX),
      datos.contenido
    )
    .input(
      'version',
      sql.VarChar(20),
      datos.version
    )
    .input(
      'desde',
      sql.VarChar(10),
      datos.vigenteDesde
    )
    .input(
      'hasta',
      sql.VarChar(10),
      datos.vigenteHasta || null
    )
    .input(
      'activa',
      sql.Bit,
      datos.activa
    );
}

// =====================================================
// CONSULTA BASE DE POLÍTICAS
// =====================================================

const consultaPoliticas = `
  SELECT
    PoliticaID,
    Tipo,
    Titulo,
    Contenido,
    Version,

    CONVERT(
      VARCHAR(10),
      VigenteDesde,
      23
    ) AS VigenteDesde,

    CONVERT(
      VARCHAR(10),
      VigenteHasta,
      23
    ) AS VigenteHasta,

    Activa

  FROM dbo.PoliticaServicio
`;

// =====================================================
// ROUTER PRINCIPAL
// =====================================================

export function createPoliticasRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  // Todos los endpoints requieren sesión activa.
  router.use(auth, activeUser);

  // ===================================================
  // GET /api/politicas/catalogos
  // ===================================================

  router.get(
    '/catalogos',
    (req, res) => {
      return res.json({
        tipos: TIPOS
      });
    }
  );

  // ===================================================
  // GET /api/politicas/vigentes
  //
  // RF17 — POLÍTICAS VIGENTES
  //
  // Disponible para usuarios autenticados.
  // La consulta debe enviar:
  // Authorization: Bearer TOKEN
  //
  // No modifica ni registra aceptaciones.
  // ===================================================

  router.get(
    '/vigentes',
    asyncRoute(async (req, res) => {
      const pool = await getPool();

      res.set(
        'Cache-Control',
        'no-store'
      );

      const resultado = await pool
        .request()
        .query(`
          ${consultaPoliticas}

          WHERE
            Activa = 1

            AND VigenteDesde <=
              CONVERT(
                date,
                SYSDATETIME()
              )

            AND (
              VigenteHasta IS NULL

              OR VigenteHasta >=
                CONVERT(
                  date,
                  SYSDATETIME()
                )
            )

          ORDER BY
            Tipo ASC,
            VigenteDesde DESC,
            PoliticaID DESC
        `);

      return res.json(
        resultado.recordset
      );
    })
  );

  // ===================================================
  // ACCESO ADMINISTRATIVO
  // ===================================================

  router.use(admin);

  // ===================================================
  // GET /api/politicas
  // LISTAR Y BUSCAR
  // ===================================================

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const q = String(
        req.query.q || ''
      )
        .trim()
        .slice(0, 100);

      const pool = await getPool();

      const resultado = await pool
        .request()
        .input(
          'q',
          sql.NVarChar(110),
          `%${q}%`
        )
        .query(`
          ${consultaPoliticas}

          WHERE
            Tipo LIKE @q
            OR Titulo LIKE @q
            OR Version LIKE @q

            OR CONVERT(
              VARCHAR(20),
              PoliticaID
            ) LIKE @q

          ORDER BY
            PoliticaID DESC
        `);

      return res.json(
        resultado.recordset
      );
    })
  );

  // ===================================================
  // POST /api/politicas
  // REGISTRAR POLÍTICA
  // ===================================================

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const datos = politicaSchema.parse(
        req.body
      );

      const pool = await getPool();

      const tx = new sql.Transaction(
        pool
      );

      await tx.begin();

      try {
        const resultado =
          await parametrosPolitica(
            new sql.Request(tx),
            datos
          ).query(`
            INSERT INTO dbo.PoliticaServicio (
              Tipo,
              Titulo,
              Contenido,
              Version,
              VigenteDesde,
              VigenteHasta,
              Activa
            )

            OUTPUT INSERTED.PoliticaID

            VALUES (
              @tipo,
              @titulo,
              @contenido,
              @version,

              CONVERT(
                date,
                @desde,
                23
              ),

              CASE
                WHEN @hasta IS NULL
                  THEN NULL
                ELSE CONVERT(
                  date,
                  @hasta,
                  23
                )
              END,

              @activa
            )
          `);

        const politicaId =
          resultado.recordset[0]
            .PoliticaID;

        await registrarAuditoria(
          tx,
          req.currentUser.UsuarioID,
          politicaId,
          'INSERT',
          `Registro de política #${politicaId}. ` +
          `Tipo: ${datos.tipo}. ` +
          `Versión: ${datos.version}.`
        );

        await tx.commit();

        return res.status(201).json({
          PoliticaID: politicaId,
          mensaje:
            'Política registrada correctamente.'
        });
      } catch (error) {
        await tx.rollback().catch(
          () => {}
        );

        throw error;
      }
    })
  );

  // ===================================================
  // PUT /api/politicas/:id
  // EDITAR POLÍTICA
  // ===================================================

  router.put(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = idSchema.parse(
        req.params.id
      );

      const datos = politicaSchema.parse(
        req.body
      );

      const pool = await getPool();

      const tx = new sql.Transaction(
        pool
      );

      await tx.begin();

      try {
        const resultado =
          await parametrosPolitica(
            new sql.Request(tx)
              .input(
                'id',
                sql.Int,
                id
              ),
            datos
          ).query(`
            UPDATE dbo.PoliticaServicio

            SET
              Tipo = @tipo,
              Titulo = @titulo,
              Contenido = @contenido,
              Version = @version,

              VigenteDesde =
                CONVERT(
                  date,
                  @desde,
                  23
                ),

              VigenteHasta =
                CASE
                  WHEN @hasta IS NULL
                    THEN NULL

                  ELSE CONVERT(
                    date,
                    @hasta,
                    23
                  )
                END,

              Activa = @activa

            WHERE PoliticaID = @id
          `);

        if (
          resultado.rowsAffected[0] !== 1
        ) {
          throw errorHttp(
            'Política no encontrada.',
            404
          );
        }

        await registrarAuditoria(
          tx,
          req.currentUser.UsuarioID,
          id,
          'UPDATE',
          `Actualización de política #${id}. ` +
          `Tipo: ${datos.tipo}. ` +
          `Versión: ${datos.version}.`
        );

        await tx.commit();

        return res.json({
          ok: true,
          mensaje:
            'Política actualizada correctamente.'
        });
      } catch (error) {
        await tx.rollback().catch(
          () => {}
        );

        throw error;
      }
    })
  );

  // ===================================================
  // PATCH /api/politicas/:id/estado
  // ACTIVAR O DESACTIVAR POLÍTICA
  // ===================================================

  router.patch(
    '/:id/estado',
    asyncRoute(async (req, res) => {
      const id = idSchema.parse(
        req.params.id
      );

      const { activa } = z.object({
        activa: z.boolean()
      }).parse(req.body);

      const pool = await getPool();

      const tx = new sql.Transaction(
        pool
      );

      await tx.begin();

      try {
        const actual =
          await new sql.Request(tx)
            .input(
              'id',
              sql.Int,
              id
            )
            .query(`
              SELECT Activa

              FROM dbo.PoliticaServicio
                WITH (
                  UPDLOCK,
                  HOLDLOCK
                )

              WHERE PoliticaID = @id
            `);

        if (!actual.recordset.length) {
          throw errorHttp(
            'Política no encontrada.',
            404
          );
        }

        const estadoAnterior =
          Boolean(
            actual.recordset[0].Activa
          );

        if (estadoAnterior === activa) {
          throw errorHttp(
            'La política ya tiene ese estado.'
          );
        }

        await new sql.Request(tx)
          .input(
            'id',
            sql.Int,
            id
          )
          .input(
            'activa',
            sql.Bit,
            activa
          )
          .query(`
            UPDATE dbo.PoliticaServicio

            SET Activa = @activa

            WHERE PoliticaID = @id
          `);

        await registrarAuditoria(
          tx,
          req.currentUser.UsuarioID,
          id,
          'CAMBIO_ESTADO',
          `Política #${id}: ` +
          `${estadoAnterior ? 'ACTIVA' : 'INACTIVA'} ` +
          `a ${activa ? 'ACTIVA' : 'INACTIVA'}.`
        );

        await tx.commit();

        return res.json({
          ok: true,
          mensaje:
            'Estado de política actualizado.'
        });
      } catch (error) {
        await tx.rollback().catch(
          () => {}
        );

        throw error;
      }
    })
  );

  return router;
}
