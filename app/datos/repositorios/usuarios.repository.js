// SIGET-VÍA — CAPA DE ACCESO A DATOS — Usuarios, roles y autenticación (RF1, RF2)
import { getPool, sql } from '../config/db.js';

export { enTransaccion, esDuplicado } from '../config/transaccion.js';

export async function buscarSesionPorId(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.BigInt, id)
    .query(`
      SELECT u.UsuarioID, u.RolID, u.Nombres, u.Apellidos, u.Correo, u.Estado,
             r.Nombre AS Rol
      FROM dbo.Usuario u
      INNER JOIN dbo.Rol r ON r.RolID = u.RolID
      WHERE u.UsuarioID = @id
    `);
  return r.recordset[0] || null;
}

export async function buscarPorCorreo(correo) {
  const pool = await getPool();
  const r = await pool.request()
    .input('correo', sql.NVarChar(254), correo)
    .query(`
      SELECT u.UsuarioID, u.RolID, u.Nombres, u.Apellidos, u.Correo,
             u.ContrasenaHash, u.Estado, r.Nombre AS Rol
      FROM dbo.Usuario u
      INNER JOIN dbo.Rol r ON r.RolID = u.RolID
      WHERE u.Correo = @correo
    `);
  return r.recordset[0] || null;
}

export async function listarRoles() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT RolID, Nombre FROM dbo.Rol ORDER BY RolID
  `);
  return r.recordset;
}

export async function obtenerRolIdPorNombre(nombre) {
  const pool = await getPool();
  const r = await pool.request()
    .input('nombre', sql.NVarChar(50), nombre)
    .query(`SELECT TOP (1) RolID FROM dbo.Rol WHERE Nombre = @nombre`);
  return r.recordset[0]?.RolID ?? null;
}

export async function listarUsuarios(q) {
  const pool = await getPool();
  const r = await pool.request()
    .input('q', sql.NVarChar(110), `%${q}%`)
    .query(`
      SELECT u.UsuarioID, u.Nombres, u.Apellidos, u.Correo, u.Telefono,
             u.Estado, u.RolID, r.Nombre AS Rol
      FROM dbo.Usuario u
      INNER JOIN dbo.Rol r ON r.RolID = u.RolID
      WHERE u.Nombres LIKE @q OR u.Apellidos LIKE @q OR u.Correo LIKE @q
      ORDER BY u.UsuarioID DESC
    `);
  return r.recordset;
}

export async function existeRol(tx, rolId) {
  const r = await new sql.Request(tx)
    .input('rol', sql.Int, rolId)
    .query(`SELECT RolID FROM dbo.Rol WHERE RolID = @rol`);
  return r.recordset.length > 0;
}

export async function insertarUsuario(tx, d, hash) {
  const r = await new sql.Request(tx)
    .input('rol', sql.Int, d.rolId)
    .input('n', sql.NVarChar(100), d.nombres)
    .input('a', sql.NVarChar(120), d.apellidos)
    .input('c', sql.NVarChar(254), d.correo)
    .input('h', sql.NVarChar(255), hash)
    .input('t', sql.VarChar(20), d.telefono || null)
    .input('e', sql.VarChar(12), d.estado)
    .query(`
      INSERT INTO dbo.Usuario (RolID, Nombres, Apellidos, Correo, ContrasenaHash,
                               Telefono, Estado, FechaRegistro)
      OUTPUT INSERTED.UsuarioID
      VALUES (@rol, @n, @a, @c, @h, @t, @e, SYSDATETIME())
    `);
  return r.recordset[0].UsuarioID;
}

// Registro público de clientes (sin transacción, rol asignado por el servidor).
export async function insertarCliente(rolId, d, hash) {
  const pool = await getPool();
  const r = await pool.request()
    .input('rolId', sql.Int, rolId)
    .input('nombres', sql.NVarChar(100), d.nombres)
    .input('apellidos', sql.NVarChar(120), d.apellidos)
    .input('correo', sql.NVarChar(254), d.correo)
    .input('telefono', sql.VarChar(20), d.telefono || null)
    .input('hash', sql.NVarChar(255), hash)
    .query(`
      INSERT INTO dbo.Usuario (RolID, Nombres, Apellidos, Correo, ContrasenaHash,
                               Telefono, Estado, FechaRegistro)
      OUTPUT INSERTED.UsuarioID, INSERTED.Nombres, INSERTED.Apellidos, INSERTED.Correo
      VALUES (@rolId, @nombres, @apellidos, @correo, @hash, @telefono, N'ACTIVO', SYSDATETIME())
    `);
  return r.recordset[0];
}

// hash = null conserva la contraseña actual.
export async function actualizarUsuario(tx, id, d, hash) {
  const request = new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .input('n', sql.NVarChar(100), d.nombres)
    .input('a', sql.NVarChar(120), d.apellidos)
    .input('c', sql.NVarChar(254), d.correo)
    .input('t', sql.VarChar(20), d.telefono || null)
    .input('rol', sql.Int, d.rolId)
    .input('e', sql.VarChar(12), d.estado);
  if (hash) request.input('h', sql.NVarChar(255), hash);
  const r = await request.query(`
    UPDATE dbo.Usuario
    SET Nombres = @n, Apellidos = @a, Correo = @c, Telefono = @t,
        RolID = @rol, Estado = @e
        ${hash ? ', ContrasenaHash = @h' : ''}
    WHERE UsuarioID = @id
  `);
  return r.rowsAffected[0] || 0;
}

export async function obtenerEstadoBloqueado(tx, id) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .query(`
      SELECT Estado FROM dbo.Usuario WITH (UPDLOCK, HOLDLOCK)
      WHERE UsuarioID = @id
    `);
  return r.recordset[0]?.Estado ?? null;
}

export async function cambiarEstado(tx, id, estado) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .input('estado', sql.VarChar(12), estado)
    .query(`UPDATE dbo.Usuario SET Estado = @estado WHERE UsuarioID = @id`);
  return r.rowsAffected[0] || 0;
}

export async function registrarAuditoria(tx, userId, accion, recordId, detalle) {
  await new sql.Request(tx)
    .input('userId', sql.BigInt, userId)
    .input('action', sql.VarChar(20), accion)
    .input('recordId', sql.BigInt, recordId)
    .input('detail', sql.NVarChar(1000), detalle)
    .query(`
      INSERT INTO dbo.Auditoria (UsuarioID, Entidad, RegistroID, Accion, Detalle, Fecha)
      VALUES (@userId, 'Usuario', @recordId, @action, @detail, SYSDATETIME())
    `);
}
