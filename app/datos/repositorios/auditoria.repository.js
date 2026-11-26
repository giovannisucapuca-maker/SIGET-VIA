import { getPool, sql } from '../config/db.js';

const consultaBase = `
  FROM dbo.Auditoria a
  LEFT JOIN dbo.Usuario u
    ON u.UsuarioID = a.UsuarioID
`;

export async function consultarCatalogosAuditoria() {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT DISTINCT Entidad
    FROM dbo.Auditoria
    WHERE Entidad IS NOT NULL
    ORDER BY Entidad;

    SELECT UsuarioID, Nombres, Apellidos, Estado
    FROM dbo.Usuario
    ORDER BY Apellidos, Nombres;
  `);
  return {
    entidades: resultado.recordsets[0],
    usuarios: resultado.recordsets[1]
  };
}

export async function consultarResumenAuditoria() {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT
      COUNT_BIG(*) AS TotalEventos,
      COALESCE(SUM(CASE WHEN Accion = 'INSERT' THEN 1 ELSE 0 END), 0) AS Inserciones,
      COALESCE(SUM(CASE WHEN Accion = 'CAMBIO_ESTADO' THEN 1 ELSE 0 END), 0) AS CambiosEstado,
      COALESCE(SUM(CASE WHEN Accion = 'UPDATE' THEN 1 ELSE 0 END), 0) AS Actualizaciones,
      COALESCE(SUM(CASE WHEN Accion = 'LOGIN' THEN 1 ELSE 0 END), 0) AS IniciosSesion,
      COUNT(DISTINCT UsuarioID) AS UsuariosInvolucrados
    FROM dbo.Auditoria
  `);
  return resultado.recordset[0];
}

export async function consultarListadoAuditoria(filtros) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('q', sql.NVarChar(110), `%${filtros.q}%`)
    .input('accion', sql.VarChar(20), filtros.accion)
    .input('entidad', sql.VarChar(70), filtros.entidad)
    .input('usuarioId', sql.BigInt, filtros.usuarioId)
    .input('desde', sql.VarChar(10), filtros.desde)
    .input('hasta', sql.VarChar(10), filtros.hasta)
    .query(`
      SELECT TOP (500)
        a.AuditoriaID, a.UsuarioID, a.Entidad, a.RegistroID,
        a.Accion, a.Detalle, a.Fecha,
        u.Nombres AS UsuarioNombres,
        u.Apellidos AS UsuarioApellidos,
        u.Correo AS UsuarioCorreo
      ${consultaBase}
      WHERE
        (@accion = '' OR a.Accion = @accion)
        AND (@entidad = '' OR a.Entidad = @entidad)
        AND (@usuarioId IS NULL OR a.UsuarioID = @usuarioId)
        AND (@desde = '' OR a.Fecha >= TRY_CONVERT(date, @desde, 23))
        AND (
          @hasta = '' OR a.Fecha < DATEADD(DAY, 1, TRY_CONVERT(date, @hasta, 23))
        )
        AND (
          a.Entidad LIKE @q OR a.Accion LIKE @q OR a.Detalle LIKE @q
          OR u.Nombres LIKE @q OR u.Apellidos LIKE @q OR u.Correo LIKE @q
          OR CONVERT(VARCHAR(30), a.AuditoriaID) LIKE @q
        )
      ORDER BY a.Fecha DESC, a.AuditoriaID DESC
    `);
  return resultado.recordset;
}

export async function consultarDetalleAuditoria(id) {
  const pool = await getPool();
  const resultado = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`
      SELECT
        a.AuditoriaID, a.UsuarioID, a.Entidad, a.RegistroID,
        a.Accion, a.Detalle, a.Fecha,
        u.Nombres AS UsuarioNombres,
        u.Apellidos AS UsuarioApellidos,
        u.Correo AS UsuarioCorreo, u.RolID
      ${consultaBase}
      WHERE a.AuditoriaID = @id
    `);
  return resultado.recordset[0] ?? null;
}
