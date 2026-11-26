// SIGET-VÍA — CAPA DE ACCESO A DATOS — Perfil del cliente (SQL Server + archivo de foto)
import { mkdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getPool, sql } from '../config/db.js';

export { enTransaccion, esDuplicado } from '../config/transaccion.js';

// ---------- SQL Server ----------

export async function obtenerPerfil(usuarioId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.BigInt, usuarioId)
    .query(`
      SELECT UsuarioID, Nombres, Apellidos, Correo, Telefono, Estado
      FROM dbo.Usuario WHERE UsuarioID = @id
    `);
  return r.recordset[0] || null;
}

export async function existeOtroConCorreo(tx, usuarioId, correo) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, usuarioId)
    .input('correo', sql.NVarChar(254), correo)
    .query(`
      SELECT UsuarioID FROM dbo.Usuario WITH (UPDLOCK, HOLDLOCK)
      WHERE Correo = @correo AND UsuarioID <> @id
    `);
  return r.recordset.length > 0;
}

export async function actualizarPerfilActivo(tx, usuarioId, d) {
  const r = await new sql.Request(tx)
    .input('id', sql.BigInt, usuarioId)
    .input('nombres', sql.NVarChar(100), d.nombres)
    .input('apellidos', sql.NVarChar(120), d.apellidos)
    .input('correo', sql.NVarChar(254), d.correo)
    .input('telefono', sql.VarChar(20), d.telefono || null)
    .query(`
      UPDATE dbo.Usuario
      SET Nombres = @nombres, Apellidos = @apellidos, Correo = @correo, Telefono = @telefono
      OUTPUT INSERTED.UsuarioID, INSERTED.Nombres, INSERTED.Apellidos,
             INSERTED.Correo, INSERTED.Telefono
      WHERE UsuarioID = @id AND Estado = 'ACTIVO'
    `);
  return r.recordset[0] || null;
}

export async function auditarActualizacionPerfil(tx, usuarioId, detalle) {
  await new sql.Request(tx)
    .input('usuarioId', sql.BigInt, usuarioId)
    .input('detalle', sql.NVarChar(1000), detalle)
    .query(`
      INSERT INTO dbo.Auditoria (UsuarioID, Entidad, RegistroID, Accion, Detalle, Fecha)
      VALUES (@usuarioId, 'Usuario', @usuarioId, 'UPDATE', @detalle, SYSDATETIME())
    `);
}

// ---------- Almacenamiento de fotos (uploads/perfiles/<id>.jpg) ----------

// Las fotos se guardan dentro de la capa de datos: datos/uploads/perfiles.
const rutaFotos = join(dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'perfiles');
const fotoPath = id => join(rutaFotos, `${id}.jpg`);

export async function existeFoto(usuarioId) {
  try {
    await stat(fotoPath(usuarioId));
    return true;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return false;
  }
}

// Devuelve el Buffer o null si no existe.
export async function leerFoto(usuarioId) {
  try {
    return await readFile(fotoPath(usuarioId));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Escritura atómica: archivo temporal y luego rename.
export async function guardarFoto(usuarioId, imagen) {
  await mkdir(rutaFotos, { recursive: true });
  const temporal = join(rutaFotos, `${usuarioId}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporal, imagen, { flag: 'wx', mode: 0o600 });
    await rename(temporal, fotoPath(usuarioId));
  } catch (err) {
    await unlink(temporal).catch(() => {});
    throw err;
  }
}

export async function eliminarFoto(usuarioId) {
  try {
    await unlink(fotoPath(usuarioId));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}
