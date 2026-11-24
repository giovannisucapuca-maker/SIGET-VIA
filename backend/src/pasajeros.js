
import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';

// =====================================================
// SIGET-VÍA — GESTIÓN DE PASAJEROS RF15
// PASO 170.7.7.11.2
//
// DNI: 8 dígitos numéricos
// CE: 9 a 12 caracteres alfanuméricos
// PASAPORTE: 6 a 20 caracteres alfanuméricos
//
// CRUD, estados, búsqueda, consulta DNI ApiInti
// y consulta de documentos en SQL Server.
// =====================================================

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function limpiarTexto(valor) {
  return valor.trim().replace(/\s+/g, ' ');
}

function normalizarDocumento(valor) {
  return valor
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(
    new Error(mensaje),
    { statusCode }
  );
}

function fechaHoy() {
  const ahora = new Date();

  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0')
  ].join('-');
}

// =====================================================
// VALIDACIONES DE DOCUMENTOS
// =====================================================

const TIPOS_DOCUMENTO = [
  'DNI',
  'CE',
  'PASAPORTE'
];

function validarNumeroDocumento(tipo, numero) {
  switch (tipo) {
    case 'DNI':
      return /^\d{8}$/.test(numero);

    case 'CE':
      return /^[A-Z0-9]{9,12}$/.test(numero);

    case 'PASAPORTE':
      return /^[A-Z0-9]{6,20}$/.test(numero);

    default:
      return false;
  }
}

function mensajeDocumento(tipo) {
  switch (tipo) {
    case 'DNI':
      return (
        'El DNI debe contener exactamente ' +
        '8 dígitos numéricos.'
      );

    case 'CE':
      return (
        'El carné de extranjería debe contener ' +
        'entre 9 y 12 caracteres alfanuméricos.'
      );

    case 'PASAPORTE':
      return (
        'El pasaporte debe contener entre ' +
        '6 y 20 caracteres alfanuméricos.'
      );

    default:
      return 'Tipo de documento no permitido.';
  }
}

function validarDocumento(tipo, numero) {
  const tipoNormalizado = String(tipo || '')
    .trim()
    .toUpperCase();

  const numeroNormalizado = normalizarDocumento(
    String(numero || '')
  );

  if (!TIPOS_DOCUMENTO.includes(tipoNormalizado)) {
    throw errorHttp(
      'Selecciona DNI, CE o PASAPORTE.'
    );
  }

  if (
    !validarNumeroDocumento(
      tipoNormalizado,
      numeroNormalizado
    )
  ) {
    throw errorHttp(
      mensajeDocumento(tipoNormalizado)
    );
  }

  return {
    tipo: tipoNormalizado,
    numero: numeroNormalizado
  };
}

// =====================================================
// VALIDACIONES DE FECHAS Y TELÉFONO
// =====================================================

function validarFecha(fecha) {
  if (!fecha) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }

  const [anio, mes, dia] = fecha
    .split('-')
    .map(Number);

  const comprobacion = new Date(
    Date.UTC(anio, mes - 1, dia, 12)
  );

  return (
    comprobacion.getUTCFullYear() === anio &&
    comprobacion.getUTCMonth() === mes - 1 &&
    comprobacion.getUTCDate() === dia &&
    fecha <= fechaHoy()
  );
}

function validarTelefono(telefono) {
  if (!telefono) return true;

  const digitos = telefono.replace(/\D/g, '');

  return (
    /^[+0-9()\s-]{6,20}$/.test(telefono) &&
    digitos.length >= 6 &&
    digitos.length <= 15
  );
}

// =====================================================
// VALIDACIONES DE NOMBRES
// =====================================================

const patronNombre =
  /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;

const nombreSchema = z.string()
  .trim()
  .transform(limpiarTexto)
  .pipe(
    z.string()
      .min(
        2,
        'Los nombres deben tener al menos 2 caracteres.'
      )
      .max(
        100,
        'Los nombres no pueden superar 100 caracteres.'
      )
      .regex(
        patronNombre,
        'Los nombres solo permiten letras y separadores válidos.'
      )
  );

const apellidoSchema = z.string()
  .trim()
  .transform(limpiarTexto)
  .pipe(
    z.string()
      .min(
        2,
        'Los apellidos deben tener al menos 2 caracteres.'
      )
      .max(
        120,
        'Los apellidos no pueden superar 120 caracteres.'
      )
      .regex(
        patronNombre,
        'Los apellidos solo permiten letras y separadores válidos.'
      )
  );

// =====================================================
// ESQUEMA PRINCIPAL
// =====================================================

const esquema = z.object({
  tipoDocumento: z.enum([
    'DNI',
    'CE',
    'PASAPORTE'
  ]),

  numeroDocumento: z.string()
    .trim()
    .min(
      1,
      'Ingresa el número de documento.'
    )
    .max(20)
    .transform(normalizarDocumento),

  nombres: nombreSchema,

  apellidos: apellidoSchema,

  fechaNacimiento: z.string()
    .nullable()
    .optional()
    .refine(
      validarFecha,
      'La fecha de nacimiento no es válida o es futura.'
    ),

  telefono: z.string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .refine(
      validarTelefono,
      'Ingresa un número de teléfono válido.'
    ),

  usuarioId: z.number()
    .int()
    .positive()
    .safe()
    .nullable()
    .optional(),

  estado: z.enum([
    'ACTIVO',
    'INACTIVO'
  ])
}).superRefine((datos, contexto) => {
  if (
    !validarNumeroDocumento(
      datos.tipoDocumento,
      datos.numeroDocumento
    )
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['numeroDocumento'],
      message: mensajeDocumento(
        datos.tipoDocumento
      )
    });
  }
});

function validarDatos(body) {
  const resultado = esquema.safeParse(body);

  if (!resultado.success) {
    throw errorHttp(
      resultado.error.issues[0]?.message ||
      'Los datos del pasajero son inválidos.'
    );
  }

  return resultado.data;
}

const idSchema = z.coerce.number()
  .int()
  .positive()
  .safe();

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw errorHttp(
      'Identificador de pasajero inválido.'
    );
  }

  return resultado.data;
}

// =====================================================
// PARÁMETROS SQL
// =====================================================

function agregarCampos(request, datos) {
  return request
    .input(
      'tipo',
      sql.VarChar(12),
      datos.tipoDocumento
    )
    .input(
      'numero',
      sql.VarChar(20),
      datos.numeroDocumento
    )
    .input(
      'nombres',
      sql.NVarChar(100),
      datos.nombres
    )
    .input(
      'apellidos',
      sql.NVarChar(120),
      datos.apellidos
    )
    .input(
      'fecha',
      sql.Date,
      datos.fechaNacimiento
        ? new Date(
            `${datos.fechaNacimiento}T12:00:00Z`
          )
        : null
    )
    .input(
      'telefono',
      sql.VarChar(20),
      datos.telefono || null
    )
    .input(
      'usuario',
      sql.BigInt,
      datos.usuarioId ?? null
    )
    .input(
      'estado',
      sql.VarChar(12),
      datos.estado
    );
}

// =====================================================
// CONSULTA GENERAL
// =====================================================

const consultaBase = `
  SELECT
    p.PasajeroID,
    p.UsuarioID,
    p.TipoDocumento,
    p.NumeroDocumento,
    p.Nombres,
    p.Apellidos,
    p.FechaNacimiento,
    p.Telefono,
    p.Estado,
    u.Correo AS UsuarioCorreo
  FROM dbo.Pasajero p
  LEFT JOIN dbo.Usuario u
    ON p.UsuarioID = u.UsuarioID
`;

// =====================================================
// VALIDAR USUARIO ASOCIADO
// =====================================================

async function validarUsuario(tx, usuarioId) {
  if (
    usuarioId === null ||
    usuarioId === undefined
  ) {
    return;
  }

  const resultado = await new sql.Request(tx)
    .input(
      'usuario',
      sql.BigInt,
      usuarioId
    )
    .query(`
      SELECT UsuarioID
      FROM dbo.Usuario WITH (HOLDLOCK)
      WHERE UsuarioID = @usuario
    `);

  if (!resultado.recordset.length) {
    throw errorHttp(
      'El usuario asociado no existe.'
    );
  }
}

// =====================================================
// CONSULTAR DNI EN APIINTI
// =====================================================

async function consultarApiInti(dni) {
  const apiKey = process.env.APIINTI_API_KEY;

  if (!apiKey) {
    throw errorHttp(
      'No se configuró APIINTI_API_KEY en el backend.',
      503
    );
  }

  let respuesta;

  try {
    respuesta = await fetch(
      `https://app.apiinti.dev/api/v1/dni/${dni}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      }
    );
  } catch {
    throw errorHttp(
      'No se pudo conectar con ApiInti.',
      502
    );
  }

  if (
    respuesta.status === 401 ||
    respuesta.status === 403
  ) {
    throw errorHttp(
      'La API Key de ApiInti fue rechazada.',
      502
    );
  }

  if (respuesta.status === 429) {
    throw errorHttp(
      'Se alcanzó el límite de consultas de ApiInti.',
      429
    );
  }

  if (respuesta.status === 404) {
    throw errorHttp(
      'No se encontraron datos para el DNI consultado.',
      404
    );
  }

  if (!respuesta.ok) {
    throw errorHttp(
      'ApiInti no pudo completar la consulta.',
      502
    );
  }

  const resultado = await respuesta
    .json()
    .catch(() => null);

  const persona = resultado?.data;

  if (
    resultado?.success === false ||
    !persona ||
    typeof persona.nombres !== 'string' ||
    typeof persona.apellidoPaterno !== 'string'
  ) {
    throw errorHttp(
      'La API no devolvió datos válidos del DNI.',
      502
    );
  }

  const nombres = limpiarTexto(
    persona.nombres
  );

  const apellidos = limpiarTexto(
    [
      persona.apellidoPaterno,
      persona.apellidoMaterno
    ]
      .filter(
        valor =>
          typeof valor === 'string' &&
          valor.trim()
      )
      .join(' ')
  );

  if (
    !patronNombre.test(nombres) ||
    !patronNombre.test(apellidos) ||
    nombres.length < 2 ||
    apellidos.length < 2
  ) {
    throw errorHttp(
      'Los nombres o apellidos devueltos no son válidos.',
      502
    );
  }

  return {
    fuente: 'APIINTI',
    encontrado: true,
    registrado: false,
    pasajeroId: null,
    tipoDocumento: 'DNI',
    numeroDocumento: dni,
    dni,
    nombres,
    apellidos,
    fechaNacimiento: null,
    estado: null
  };
}

// =====================================================
// CONSULTAR DOCUMENTO EN SQL SERVER
// =====================================================

async function buscarDocumento(pool, tipo, numero) {
  const resultado = await pool.request()
    .input(
      'tipo',
      sql.VarChar(12),
      tipo
    )
    .input(
      'numero',
      sql.VarChar(20),
      numero
    )
    .query(`
      SELECT TOP (1)
        PasajeroID,
        TipoDocumento,
        NumeroDocumento,
        Nombres,
        Apellidos,
        FechaNacimiento,
        Estado
      FROM dbo.Pasajero
      WHERE TipoDocumento = @tipo
        AND NumeroDocumento = @numero
    `);

  return resultado.recordset[0] || null;
}

function respuestaPasajero(pasajero) {
  return {
    fuente: 'SQL_SERVER',
    encontrado: true,
    registrado: true,
    pasajeroId: pasajero.PasajeroID,
    tipoDocumento: pasajero.TipoDocumento,
    numeroDocumento: pasajero.NumeroDocumento,
    dni: pasajero.TipoDocumento === 'DNI'
      ? pasajero.NumeroDocumento
      : null,
    nombres: pasajero.Nombres,
    apellidos: pasajero.Apellidos,
    fechaNacimiento: pasajero.FechaNacimiento,
    estado: pasajero.Estado
  };
}

function respuestaDocumentoNoRegistrado(
  tipo,
  numero
) {
  return {
    fuente: 'REGISTRO_MANUAL',
    encontrado: false,
    registrado: false,
    pasajeroId: null,
    tipoDocumento: tipo,
    numeroDocumento: numero,
    dni: null,
    nombres: '',
    apellidos: '',
    fechaNacimiento: null,
    estado: null,
    mensaje:
      'Documento no registrado. Ingresa los datos del pasajero.'
  };
}

// =====================================================
// CONTROL DE ERRORES SQL
// =====================================================

function manejarErrorSQL(error, res) {
  const numero =
    error.number ??
    error.originalError?.info?.number;

  if (
    numero === 2601 ||
    numero === 2627
  ) {
    res.status(409).json({
      error:
        'Ya existe un pasajero con este tipo y número de documento.'
    });
    return true;
  }

  if (numero === 547) {
    res.status(409).json({
      error:
        'La operación incumple una restricción de SQL Server.'
    });
    return true;
  }

  return false;
}

// =====================================================
// ROUTER PRINCIPAL
// =====================================================

export function createPasajerosRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  // Mantener permisos actuales.
  router.use(auth, activeUser, admin);

  // ===================================================
  // GET /api/pasajeros/dni/:dni
  // Mantiene consulta SQL Server + ApiInti.
  // ===================================================

  router.get(
    '/dni/:dni',
    asyncRoute(async (req, res) => {
      const { numero: dni } = validarDocumento(
        'DNI',
        req.params.dni
      );

      const pool = await getPool();

      const existente = await buscarDocumento(
        pool,
        'DNI',
        dni
      );

      if (existente) {
        return res.json(
          respuestaPasajero(existente)
        );
      }

      const datos = await consultarApiInti(dni);

      return res.json(datos);
    })
  );

  // ===================================================
  // NUEVO:
  // GET /api/pasajeros/documento/:tipo/:numero
  //
  // DNI: SQL Server y ApiInti.
  // CE/PASAPORTE: SQL Server.
  // Si no existe, permite registro manual.
  // ===================================================

  router.get(
    '/documento/:tipo/:numero',
    asyncRoute(async (req, res) => {
      const { tipo, numero } = validarDocumento(
        req.params.tipo,
        req.params.numero
      );

      const pool = await getPool();

      const existente = await buscarDocumento(
        pool,
        tipo,
        numero
      );

      if (existente) {
        return res.json(
          respuestaPasajero(existente)
        );
      }

      if (tipo === 'DNI') {
        const datos = await consultarApiInti(
          numero
        );

        return res.json(datos);
      }

      return res.json(
        respuestaDocumentoNoRegistrado(
          tipo,
          numero
        )
      );
    })
  );

  // ===================================================
  // GET /api/pasajeros
  // LISTAR Y BUSCAR
  // ===================================================

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const q = String(req.query.q || '')
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
          ${consultaBase}
          WHERE
            p.Nombres LIKE @q
            OR p.Apellidos LIKE @q
            OR p.NumeroDocumento LIKE @q
            OR p.TipoDocumento LIKE @q
          ORDER BY p.PasajeroID DESC
        `);

      return res.json(
        resultado.recordset
      );
    })
  );

  // ===================================================
  // GET /api/pasajeros/:id
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
          ${consultaBase}
          WHERE p.PasajeroID = @id
        `);

      if (!resultado.recordset.length) {
        return res.status(404).json({
          error: 'Pasajero no encontrado.'
        });
      }

      return res.json(
        resultado.recordset[0]
      );
    })
  );

  // ===================================================
  // POST /api/pasajeros
  // REGISTRAR PASAJERO
  // ===================================================

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const datos = validarDatos(
        req.body
      );

      const pool = await getPool();

      const tx = new sql.Transaction(
        pool
      );

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        await validarUsuario(
          tx,
          datos.usuarioId
        );

        const existente = await new sql.Request(tx)
          .input(
            'tipo',
            sql.VarChar(12),
            datos.tipoDocumento
          )
          .input(
            'numero',
            sql.VarChar(20),
            datos.numeroDocumento
          )
          .query(`
            SELECT PasajeroID
            FROM dbo.Pasajero WITH (UPDLOCK, HOLDLOCK)
            WHERE TipoDocumento = @tipo
              AND NumeroDocumento = @numero
          `);

        if (existente.recordset.length) {
          throw errorHttp(
            'Ya existe un pasajero con ese documento.',
            409
          );
        }

        const resultado = await agregarCampos(
          new sql.Request(tx),
          datos
        ).query(`
          INSERT INTO dbo.Pasajero (
            UsuarioID,
            TipoDocumento,
            NumeroDocumento,
            Nombres,
            Apellidos,
            FechaNacimiento,
            Telefono,
            Estado
          )
          OUTPUT INSERTED.PasajeroID
          VALUES (
            @usuario,
            @tipo,
            @numero,
            @nombres,
            @apellidos,
            @fecha,
            @telefono,
            @estado
          )
        `);

        const pasajeroId =
          resultado.recordset[0].PasajeroID;

        await tx.commit();

        return res.status(201).json({
          PasajeroID: pasajeroId,
          TipoDocumento:
            datos.tipoDocumento,
          NumeroDocumento:
            datos.numeroDocumento,
          mensaje:
            'Pasajero registrado correctamente.'
        });

      } catch (error) {
        await tx.rollback().catch(() => {});

        if (manejarErrorSQL(error, res)) {
          return;
        }

        throw error;
      }
    })
  );

  // ===================================================
  // PUT /api/pasajeros/:id
  // EDITAR PASAJERO
  // ===================================================

  router.put(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const datos = validarDatos(
        req.body
      );

      const pool = await getPool();

      const tx = new sql.Transaction(
        pool
      );

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        const actual = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            SELECT PasajeroID
            FROM dbo.Pasajero WITH (UPDLOCK, HOLDLOCK)
            WHERE PasajeroID = @id
          `);

        if (!actual.recordset.length) {
          throw errorHttp(
            'Pasajero no encontrado.',
            404
          );
        }

        await validarUsuario(
          tx,
          datos.usuarioId
        );

        const duplicado = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .input(
            'tipo',
            sql.VarChar(12),
            datos.tipoDocumento
          )
          .input(
            'numero',
            sql.VarChar(20),
            datos.numeroDocumento
          )
          .query(`
            SELECT PasajeroID
            FROM dbo.Pasajero WITH (UPDLOCK, HOLDLOCK)
            WHERE TipoDocumento = @tipo
              AND NumeroDocumento = @numero
              AND PasajeroID <> @id
          `);

        if (duplicado.recordset.length) {
          throw errorHttp(
            'El documento ya pertenece a otro pasajero.',
            409
          );
        }

        const resultado = await agregarCampos(
          new sql.Request(tx),
          datos
        )
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            UPDATE dbo.Pasajero
            SET
              UsuarioID = @usuario,
              TipoDocumento = @tipo,
              NumeroDocumento = @numero,
              Nombres = @nombres,
              Apellidos = @apellidos,
              FechaNacimiento = @fecha,
              Telefono = @telefono,
              Estado = @estado
            WHERE PasajeroID = @id
          `);

        if (resultado.rowsAffected[0] !== 1) {
          throw errorHttp(
            'No se pudo actualizar el pasajero.',
            409
          );
        }

        await tx.commit();

        return res.json({
          PasajeroID: id,
          TipoDocumento:
            datos.tipoDocumento,
          NumeroDocumento:
            datos.numeroDocumento,
          mensaje:
            'Pasajero actualizado correctamente.'
        });

      } catch (error) {
        await tx.rollback().catch(() => {});

        if (manejarErrorSQL(error, res)) {
          return;
        }

        throw error;
      }
    })
  );

  // ===================================================
  // PATCH /api/pasajeros/:id/estado
  // ACTIVAR O DESACTIVAR PASAJERO
  // ===================================================

  router.patch(
    '/:id/estado',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const validacion = z.object({
        estado: z.enum([
          'ACTIVO',
          'INACTIVO'
        ])
      }).safeParse(req.body);

      if (!validacion.success) {
        return res.status(400).json({
          error:
            'El estado debe ser ACTIVO o INACTIVO.'
        });
      }

      const { estado } = validacion.data;

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'id',
          sql.BigInt,
          id
        )
        .input(
          'estado',
          sql.VarChar(12),
          estado
        )
        .query(`
          UPDATE dbo.Pasajero
          SET Estado = @estado
          WHERE PasajeroID = @id
        `);

      if (!resultado.rowsAffected[0]) {
        return res.status(404).json({
          error: 'Pasajero no encontrado.'
        });
      }

      return res.json({
        PasajeroID: id,
        Estado: estado,
        mensaje:
          'Estado del pasajero actualizado correctamente.'
      });
    })
  );

  return router;
}
