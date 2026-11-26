// =====================================================
// SIGET-VÍA — PRUEBAS DE INTEGRACIÓN DE LA API
//
// Levanta la capa de negocio (Express) con una base de datos
// SIMULADA (tests/apoyo/mssql-falso.mjs) y ejecuta casos HTTP:
// operaciones correctas, validaciones, permisos por rol,
// recursos inexistentes (404), conflictos (409) y errores SQL.
// Cada respuesta se compara con tests/esperado/api.json.
//
// Ejecutar desde la raíz:  npm test
// Regenerar lo esperado:   ACTUALIZAR_ESPERADO=1 npm test
// =====================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.JWT_SECRET = 'x'.repeat(40);
process.env.NODE_ENV = 'test';
process.env.DB_SERVER = 'simulado';
process.env.DB_DATABASE = 'SIGET_VIA_DB';
process.env.APIINTI_API_KEY = '';   // sin servicio externo de DNI durante las pruebas

const app = (await import('../app/negocio/src/app.js')).default;
const archivoEsperado = fileURLToPath(new URL('./esperado/api.json', import.meta.url));

// ---------- Datos simulados y respuestas de la base de datos ----------
const HASH = await bcrypt.hash('Clave123', 4);
const usuarios = {
  1: { UsuarioID: 1, RolID: 1, Rol: 'ADMINISTRADOR', Nombres: 'Ana', Apellidos: 'Admin', Correo: 'admin@x.com', Estado: 'ACTIVO' },
  2: { UsuarioID: 2, RolID: 3, Rol: 'CLIENTE', Nombres: 'Carlos', Apellidos: 'Cliente', Correo: 'cli@x.com', Estado: 'ACTIVO' },
  3: { UsuarioID: 3, RolID: 2, Rol: 'OPERADOR', Nombres: 'Olga', Apellidos: 'Op', Correo: 'op@x.com', Estado: 'ACTIVO' },
  4: { UsuarioID: 4, RolID: 4, Rol: 'VENTAS', Nombres: 'Vera', Apellidos: 'Ventas', Correo: 'ven@x.com', Estado: 'ACTIVO' },
  5: { UsuarioID: 5, RolID: 3, Rol: 'CLIENTE', Nombres: 'Iván', Apellidos: 'Inactivo', Correo: 'inactivo@x.com', Estado: 'INACTIVO' }
};
const token = u => jwt.sign({ sub: String(u.UsuarioID), rol: u.Rol, rolId: u.RolID }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'siget-via', algorithm: 'HS256' });
const TOK = { admin: token(usuarios[1]), cliente: token(usuarios[2]), op: token(usuarios[3]), ventas: token(usuarios[4]) };

const politicas = ['RESERVA','CANCELACION','REPROGRAMACION','CONTRATACION','PRIVACIDAD']
  .map((t, i) => ({ PoliticaID: 10 + i, Tipo: t, Titulo: 'Política ' + t, Contenido: 'Contenido largo de la política ' + t, Version: '1.0', VigenteDesde: '2026-01-01', VigenteHasta: null }));

let st = {}; // estado del escenario actual
const R = (recordset, extra = {}) => ({ recordset, ...extra });
// Error simulado de SQL Server (2627 = clave duplicada).
const err = n => Object.assign(new Error('sql error ' + n), { number: n });

globalThis.__fakeDb = async (s, i) => {
  const has = (...p) => p.every(x => s.includes(x));
  // ----- usuarios / auth -----
  if (has('FROM dbo.Usuario u', 'INNER JOIN dbo.Rol r') && has('u.UsuarioID = @id')) return R(usuarios[i.id] ? [usuarios[i.id]] : []);
  if (has('WHERE u.Correo = @correo')) { const u = Object.values(usuarios).find(x => x.Correo === i.correo); return R(u ? [{ ...u, ContrasenaHash: HASH }] : []); }
  if (/SELECT RolID, Nombre FROM dbo\.Rol/.test(s)) return R([{ RolID: 1, Nombre: 'ADMINISTRADOR' }, { RolID: 3, Nombre: 'CLIENTE' }]);
  if (/SELECT TOP \(1\) RolID FROM dbo\.Rol/.test(s)) return R(st.sinRolCliente ? [] : [{ RolID: 3 }]);
  if (/SELECT RolID FROM dbo\.Rol WHERE RolID = @rol/.test(s)) return R([1, 2, 3].includes(i.rol) ? [{ RolID: i.rol }] : []);
  if (has('INSERT INTO dbo.Usuario')) { if ((i.c || i.correo) === 'dup@x.com') throw err(2627); return R([{ UsuarioID: 99, Nombres: i.nombres, Apellidos: i.apellidos, Correo: i.correo }]); }
  if (has('FROM dbo.Usuario u', 'LIKE @q')) return R([usuarios[1]]);
  if (has('SELECT Estado FROM dbo.Usuario')) return R(i.id === 404 ? [] : [{ Estado: 'ACTIVO' }]);
  if (has('UPDATE dbo.Usuario SET Estado')) return R([], { rowsAffected: [1] });
  if (has('UPDATE dbo.Usuario') && has('OUTPUT')) return R(i.id === 2 ? [{ UsuarioID: 2, Nombres: i.nombres, Apellidos: i.apellidos, Correo: i.correo, Telefono: i.telefono }] : []);
  if (has('UPDATE dbo.Usuario')) return R([], { rowsAffected: [i.id === 404 ? 0 : 1] });
  if (has('SELECT UsuarioID FROM dbo.Usuario WITH')) return R(i.correo === 'otro@x.com' ? [{ UsuarioID: 7 }] : []);
  if (has('SELECT UsuarioID, Nombres, Apellidos, Correo, Telefono, Estado FROM dbo.Usuario')) return R([{ UsuarioID: i.id, Nombres: 'Carlos', Apellidos: 'Cliente', Correo: 'cli@x.com', Telefono: null, Estado: 'ACTIVO' }]);
  if (has('SELECT UsuarioID FROM dbo.Usuario WHERE UsuarioID = @usuarioId')) return R(i.usuarioId === 2 ? [{ UsuarioID: 2 }] : []);
  if (has('INSERT INTO dbo.Auditoria')) return R([]);
  // ----- viajes públicos / asientos públicos -----
  if (has('AsientosRegistrados')) return R([{ ViajeID: 5, Origen: 'LIMA', Destino: 'ICA', Salida: '2030-01-01T10:00:00Z', LlegadaEstimada: null, Tarifa: 50, BusID: 1, Placa: 'ABC-123', Modelo: 'X', Capacidad: 40, TipoServicioID: 1, TipoServicio: ' VIP ', AsientosRegistrados: 40, AsientosOcupados: 3 }]);
  if (has("v.Estado = N'PROGRAMADO'", 'v.Salida > @ahora')) return R(i.viajeId === 5 ? [{ ViajeID: 5, BusID: 1, Salida: 'x', LlegadaEstimada: 'y', Tarifa: 50, Origen: 'LIMA', Destino: 'ICA', Placa: 'P', Modelo: 'M', Capacidad: 4, TipoServicioID: null, TipoServicio: '', DescripcionServicio: null }] : []);
  if (has('AS Ocupado', 'FROM dbo.Asiento a')) return R([{ AsientoID: 1, BusID: 1, Numero: '1', Nivel: 1, Ocupado: true }, { AsientoID: 2, BusID: 1, Numero: '2', Nivel: 1, Ocupado: false }, { AsientoID: 3, BusID: 1, Numero: '3', Nivel: 2, Ocupado: false }]);
  // ----- mis reservas -----
  if (has('WHERE r.UsuarioID = @usuarioId') && has('CantidadAsientos')) return R([{ ReservaID: 1, Codigo: 'R1' }]);
  if (has('WHERE r.ReservaID = @id AND r.UsuarioID = @usuarioId')) return R(i.id === 1 ? [{ ReservaID: 1, Codigo: 'R1' }] : []);
  if (has('FROM dbo.ReservaAsiento ra', 'WHERE ra.ReservaID = @id') && has('a.Nivel, a.Numero') && !has('p.FechaNacimiento')) return R([{ ReservaAsientoID: 1, Numero: '1' }]);
  // ----- manifiestos -----
  if (has('TotalPasajeros')) return R([{ ViajeID: 5, TotalPasajeros: 2, q: i.q, fecha: i.fecha }]);
  if (has('WHERE v.ViajeID = @viajeId;')) return { recordsets: [i.viajeId === 5 ? [{ ViajeID: 5, Capacidad: 40 }] : [], [{ ReservaAsientoID: 1 }, { ReservaAsientoID: 2 }]] };
  // ----- políticas -----
  if (has('FROM dbo.PoliticaServicio') && /Tipo IN \( ?'RESERVA'/.test(s)) return R(st.faltaPolitica ? politicas.slice(1) : politicas);
  if (has('FROM dbo.PoliticaServicio') && has('Activa = 1')) return R(politicas);
  if (has('FROM dbo.PoliticaServicio') && has('LIKE @q')) return R(politicas.slice(0, 1));
  if (has('INSERT INTO dbo.PoliticaServicio')) return R([{ PoliticaID: 77 }]);
  if (has('UPDATE dbo.PoliticaServicio SET Tipo')) return R([], { rowsAffected: [i.id === 404 ? 0 : 1] });
  if (has('SELECT Activa FROM dbo.PoliticaServicio')) return R(i.id === 404 ? [] : [{ Activa: true }]);
  if (has('UPDATE dbo.PoliticaServicio SET Activa')) return R([], { rowsAffected: [1] });
  if (has('INSERT INTO dbo.ReservaPoliticaAceptacion')) return R([]);
  // ----- mis reclamaciones (cliente) -----
  if (has('WHERE ReclamacionID = @id AND UsuarioID = @usuarioId')) return { recordsets: [i.id === 31 && i.usuarioId === 2 ? [{ ReclamacionID: 31, NumeroCorrelativo: 'REC-0000000031', Estado: 'EN_ATENCION' }] : [], [{ EstadoNuevo: 'REGISTRADO' }, { EstadoNuevo: 'EN_ATENCION' }], []] };
  if (has('FROM dbo.Reclamacion', 'WHERE UsuarioID = @usuarioId')) return R(i.usuarioId === 2 ? [{ ReclamacionID: 31, NumeroCorrelativo: 'REC-0000000031', Estado: 'EN_ATENCION' }] : []);
  // ----- reclamaciones -----
  if (has('INSERT INTO dbo.Reclamacion')) { st.usuarioReclamo = i.usuarioId ?? null; return R([{ ReclamacionID: 31 }]); }
  if (has('INSERT INTO dbo.HistorialReclamacion')) return R([]);
  if (has('FROM dbo.Reclamacion WHERE ReclamacionID = @id') && !has('UPDLOCK')) return R([{ ReclamacionID: 31, NumeroCorrelativo: 'REC-0000000031', ...(has('TipoSolicitud') ? { TipoSolicitud: 'RECLAMO' } : {}), FechaRegistro: 'f', Estado: 'REGISTRADO' }]);
  if (has('TokenConsultaHash = @hash')) return R(i.numero === 'REC-0000000031' ? [{ ReclamacionID: 31, NumeroCorrelativo: i.numero, TipoSolicitud: 'QUEJA', FechaRegistro: 'f', Estado: 'RESPONDIDO' }] : []);
  if (has('SELECT EstadoNuevo, FechaCambio FROM dbo.HistorialReclamacion')) return R([{ EstadoNuevo: 'REGISTRADO' }]);
  if (has('SELECT Contenido, FechaRespuesta FROM dbo.RespuestaReclamacion')) return R([{ Contenido: 'ok' }]);
  if (has('COUNT_BIG(*) AS Total') && has('Registrados')) return R([{ Total: 3 }]);
  if (has('FROM dbo.Reclamacion r') && has('LIKE @q')) return R([{ ReclamacionID: 31, estado: i.estado, tipo: i.tipo }]);
  if (has('FROM dbo.Reclamacion r WHERE r.ReclamacionID = @id')) return { recordsets: [i.id === 31 ? [{ ReclamacionID: 31 }] : [], [{ RespuestaID: 1 }], [{ HistorialID: 1 }]] };
  if (has('FROM dbo.Reclamacion WITH')) return R(i.id === 404 ? [] : [{ ReclamacionID: i.id, Estado: st.estadoReclamo }]);
  if (has('COUNT_BIG(*) AS Total FROM dbo.RespuestaReclamacion')) return R([{ Total: st.respuestas ?? 0 }]);
  if (has('UPDATE dbo.Reclamacion')) return R([], { rowsAffected: [1] });
  if (has('INSERT INTO dbo.RespuestaReclamacion')) return R([{ RespuestaID: 8 }]);
  if (has('SELECT ReservaID, UsuarioID FROM dbo.Reserva WHERE ReservaID = @reservaId')) return R(i.reservaId === 1 ? [{ ReservaID: 1, UsuarioID: 2 }] : []);
  // ----- reservas -----
  if (has('FROM dbo.Viaje WITH (UPDLOCK, HOLDLOCK)')) { const id = i.viajeId ?? i.viajeNuevoId; return R(id === 404 ? [] : [{ ViajeID: id, RutaID: id === 6 ? 2 : 1, BusID: 1, Tarifa: 50, Estado: st.estadoViaje || 'PROGRAMADO', Salida: 'x', SalidaFutura: 1 }]); }
  if (has('AS Futura FROM dbo.Viaje')) return R([{ Futura: st.vencido ? 0 : 1 }]);
  if (has('SELECT AsientoID FROM dbo.Asiento WITH (HOLDLOCK)')) { const n = Object.keys(i).filter(k => k.startsWith('siget_asiento_')).length; return R(Array.from({ length: st.asientoAjeno ? n - 1 : n }, (_, k) => ({ AsientoID: k }))); }
  if (has('SELECT AsientoID FROM dbo.ReservaAsiento')) return R(st.asientoOcupado ? [{ AsientoID: 1 }] : []);
  if (has('SELECT PasajeroID FROM dbo.ReservaAsiento')) return R([]);
  if (has('FROM dbo.Pasajero WITH (UPDLOCK, HOLDLOCK)')) return R(i.numero === '11111111' ? [{ PasajeroID: 500, Estado: st.pasajeroInactivo ? 'INACTIVO' : 'ACTIVO' }] : []);
  if (has('INSERT INTO dbo.Pasajero')) return R([{ PasajeroID: 600 + Number(i.numero.slice(-1)) }]);
  if (has('INSERT INTO dbo.Reserva ')) { if (st.dupReserva) throw err(2627); return R([{ ReservaID: 900 }]); }
  if (has('INSERT INTO dbo.ReservaAsiento')) return R([]);
  if (has('SELECT Codigo FROM dbo.Reserva')) return R([{ Codigo: 'RSV-900' }]);
  if (has('INSERT INTO dbo.HistorialReserva')) return R([]);
  if (has('FROM dbo.Reserva r WITH (UPDLOCK, HOLDLOCK)') && has('dbo.Viaje v')) { const id = i.id ?? i.rid ?? i.reservaId; return R(id === 404 ? [] : [{ ReservaID: id, Codigo: 'RSV-' + id, ViajeID: 5, Estado: st.estadoReserva || 'COMPLETADA', Total: st.totalReserva ?? 100, RutaID: 1, BusID: 1, Tarifa: 50, Salida: 'x', EstadoViaje: 'PROGRAMADO', SalidaFutura: 1 }]); }
  if (has('FROM dbo.Venta v WITH (UPDLOCK, HOLDLOCK)') && has('dbo.Pago p')) return R(st.ventas || []);
  if (has('VentaID FROM dbo.Venta WITH (UPDLOCK, HOLDLOCK) WHERE ReservaID')) return R(st.tieneVenta ? [{ VentaID: 1 }] : []);
  if (has('FROM dbo.ReservaAsiento WITH (UPDLOCK, HOLDLOCK) WHERE ReservaID = @')) return R([{ ReservaAsientoID: 71, AsientoID: 1, PasajeroID: 500, Estado: 'ACTIVA' }, { ReservaAsientoID: 72, AsientoID: 2, PasajeroID: 501, Estado: 'ACTIVA' }]);
  if (has("SET Estado = 'LIBERADA'")) return R([], { rowsAffected: [2] });
  if (has("UPDATE dbo.Reserva SET Estado = 'CANCELADA'")) return R([], { rowsAffected: [1] });
  if (has('UPDATE dbo.ReservaAsiento SET AsientoID')) return R([], { rowsAffected: [1] });
  if (has('sys.foreign_keys')) return R([{ Total: 0 }]);
  if (has('DELETE FROM dbo.ReservaAsiento')) return R([], { rowsAffected: [2] });
  if (has('UPDATE dbo.Reserva SET ViajeID')) return R([], { rowsAffected: [1] });
  if (has('PasajeroID, TipoDocumento, NumeroDocumento, Nombres, Apellidos, Estado FROM dbo.Pasajero')) return { recordsets: [[{ ViajeID: 5 }], [{ PasajeroID: 1 }]] };
  if (has('WHERE v.ViajeID = @viajeId') && has('b.Capacidad')) return R(i.viajeId === 5 ? [{ ViajeID: 5, BusID: 1 }] : []);
  if (has('GROUP BY r.ReservaID, r.Codigo, r.FechaReserva')) return R([{ ReservaID: 1, q: i.q }]);
  if (has('SELECT ReservaID, Codigo, Estado FROM dbo.Reserva WHERE ReservaID = @reservaId')) return R(i.reservaId === 1 ? [{ ReservaID: 1, Codigo: 'R1', Estado: 'COMPLETADA' }] : []);
  if (has('FROM dbo.HistorialReserva h')) return R([{ ReservaID: 1, Accion: 'CREACION', UsuarioResponsableID: 1, ResponsableNombres: 'Ana', ResponsableApellidos: null }, { ReservaID: 1, Accion: 'X', UsuarioResponsableID: 9 }]);
  if (has('u.Nombres AS UsuarioNombres')) return R(i.id === 1 ? [{ ReservaID: 1 }] : []);
  if (has('p.FechaNacimiento', 'FROM dbo.ReservaAsiento ra')) return R([{ ReservaAsientoID: 71 }]);
  // ----- ventas -----
  if (/NOT EXISTS \( ?SELECT 1 FROM dbo.Venta ve/.test(s)) return R([{ ReservaID: 1 }]);
  if (has('FROM dbo.Venta ve') && has('LIKE @q')) return R([{ VentaID: 1, q: i.q }]);
  if (has('u.Nombres AS VendedorNombres')) return R(i.id === 1 ? [{ VentaID: 1, ReservaID: 1 }] : []);
  if (has('ReferenciaSimulada, Monto, FechaPago')) return R([{ PagoID: 1 }]);
  if (has("WHERE ra.ReservaID = @reservaId AND ra.Estado = 'ACTIVA'")) return R([{ ReservaAsientoID: 1 }]);
  if (has('SELECT VentaID FROM dbo.Venta WITH (UPDLOCK, HOLDLOCK) WHERE ReservaID')) return R(st.tieneVenta ? [{ VentaID: 1 }] : []);
  if (has('COUNT_BIG(*) AS Cantidad')) return R([{ Cantidad: st.cantAsientos ?? 2, TotalAsientos: st.totalAsientos ?? 100 }]);
  if (has('INSERT INTO dbo.Venta')) { if (st.dupVenta) throw err(2627); return R([{ VentaID: 41 }]); }
  if (has('INSERT INTO dbo.Pago')) return R([{ PagoID: 42 }]);
  if (has('SELECT CodigoComprobante FROM dbo.Venta')) return R([{ CodigoComprobante: 'B001-41' }]);
  if (has('FROM dbo.Venta WITH (UPDLOCK, HOLDLOCK) WHERE VentaID')) return R(i.id === 404 ? [] : [{ VentaID: i.id, CodigoComprobante: null, ReservaID: 1, Estado: st.estadoVenta || 'REGISTRADA', Total: 100 }]);
  if (has('FROM dbo.Pago WITH (UPDLOCK, HOLDLOCK) WHERE VentaID')) return R(st.pagos || [{ PagoID: 42, Estado: 'REGISTRADO', EsSimulado: true, Monto: 100, Metodo: 'EFECTIVO' }]);
  if (has("UPDATE dbo.Pago SET Estado = 'ANULADO'")) return R([], { rowsAffected: [1] });
  if (has("UPDATE dbo.Venta SET Estado = 'ANULADA'")) return R([], { rowsAffected: [1] });
  // ----- terminales terrestres -----
  if (has('FROM dbo.Terminal t', 'LIKE @q')) return R([{ TerminalID: 1, Nombre: 'Terminal Javier Prado', Ciudad: 'LIMA', Direccion: 'Av. Javier Prado 1155', Referencia: null, Telefono: null, Estado: 'ACTIVO', RutasActivas: 2 }]);
  if (has('FROM dbo.Terminal t WHERE t.TerminalID = @id')) return R(i.id === 1 ? [{ TerminalID: 1, Nombre: 'Terminal Javier Prado', Ciudad: 'LIMA', Estado: 'ACTIVO', RutasActivas: 2 }] : []);
  if (has('SELECT TerminalID, Nombre, Ciudad FROM dbo.Terminal WITH')) return R([{ TerminalID: 1, Nombre: 'Terminal Javier Prado', Ciudad: 'LIMA' }]);
  if (has('SELECT TerminalID, Ciudad, Estado FROM dbo.Terminal WITH')) return R(i.id === 404 ? [] : [{ TerminalID: i.id, Ciudad: 'LIMA', Estado: 'ACTIVO' }]);
  if (has('TerminalOrigenID = @id AND Origen <> @ciudad')) return R([{ Total: st.rutasOtraCiudad ?? 0 }]);
  if (has('FROM dbo.Ruta WITH (HOLDLOCK)', 'TerminalOrigenID = @id')) return R([{ Total: st.rutasActivas ?? 0 }]);
  if (has('INSERT INTO dbo.Terminal')) return R([{ TerminalID: 12 }]);
  if (has('UPDATE dbo.Terminal')) return R([], { rowsAffected: [1] });
  // ----- rutas (estado) -----
  if (has('FROM dbo.Viaje', "RutaID = @id AND Estado = 'PROGRAMADO'")) return R([{ Total: st.viajesProgramados ?? 0 }]);
  if (has('UPDATE dbo.Ruta SET Estado')) return R([], { rowsAffected: [i.id === 404 ? 0 : 1] });
  // ----- viajes: referencias (licencia del conductor) -----
  if (has('AS VenceLicencia')) return R([{ EstadoRuta: 'ACTIVA', EstadoBus: 'OPERATIVO', EstadoConductor: 'ACTIVO', VenceLicencia: st.vence ?? '2099-12-31' }]);
  return R([{ __sinRegla: s.slice(0, 80) }]);
};


// ---------- Ejecución de casos ----------
const resultados = [];
let base;

async function caso(nombre, metodo, ruta, { tok, body, headers = {}, estado = {} } = {}) {
  st = estado;
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${TOK[tok]}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let cuerpo = await r.text();
  try { cuerpo = JSON.parse(cuerpo); } catch {}
  if (cuerpo && typeof cuerpo === 'object') { if (cuerpo.token) cuerpo.token = '<jwt>'; if (cuerpo.codigoPrivado) cuerpo.codigoPrivado = /^[A-Z0-9]{8}$/.test(cuerpo.codigoPrivado) ? '<8chars>' : 'MAL'; if (cuerpo.details) cuerpo.details = '<zod>'; }
  resultados.push({ nombre, status: r.status, cuerpo });
}

test('API SIGET-VÍA con base de datos simulada', async t => {
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  try {

    const reservaOK = { viajeId: 5, politicaIds: [10, 11, 12, 13, 14], aceptacionConfirmada: true, items: [{ asientoId: 1, tipoDocumento: 'DNI', numeroDocumento: '11111111', nombres: 'Juan', apellidos: 'Pérez' }, { asientoId: 2, numeroDocumento: '22222222', nombres: 'Rosa', apellidos: 'Díaz', fechaNacimiento: '1990-05-05' }] };

    await caso('health', 'GET', '/api/health');
    await caso('404', 'GET', '/api/nada');
    await caso('login body inválido', 'POST', '/api/auth/login', { body: { correo: 'x' } });
    await caso('login ok', 'POST', '/api/auth/login', { body: { correo: 'admin@x.com', contrasena: 'Clave123' } });
    await caso('login clave mala', 'POST', '/api/auth/login', { body: { correo: 'admin@x.com', contrasena: 'no' } });
    await caso('me sin token', 'GET', '/api/auth/me');
    await caso('me token malo', 'GET', '/api/auth/me', { headers: { Authorization: 'Bearer abc' } });
    await caso('me ok', 'GET', '/api/auth/me', { tok: 'cliente' });
    await caso('roles cliente 403', 'GET', '/api/roles', { tok: 'cliente' });
    await caso('roles admin', 'GET', '/api/roles', { tok: 'admin' });
    await caso('usuarios listar', 'GET', '/api/usuarios?q=an', { tok: 'admin' });
    await caso('usuarios crear ok', 'POST', '/api/usuarios', { tok: 'admin', body: { nombres: 'N', apellidos: 'A', correo: 'n@x.com', rolId: 2, contrasena: '12345678' } });
    await caso('usuarios crear rol malo', 'POST', '/api/usuarios', { tok: 'admin', body: { nombres: 'N', apellidos: 'A', correo: 'n@x.com', rolId: 9, contrasena: '12345678' } });
    await caso('usuarios crear duplicado', 'POST', '/api/usuarios', { tok: 'admin', body: { nombres: 'N', apellidos: 'A', correo: 'dup@x.com', rolId: 2, contrasena: '12345678' } });
    await caso('usuarios crear inválido', 'POST', '/api/usuarios', { tok: 'admin', body: { nombres: '' } });
    await caso('usuarios editar propio rol', 'PUT', '/api/usuarios/1', { tok: 'admin', body: { nombres: 'N', apellidos: 'A', correo: 'n@x.com', rolId: 2, estado: 'ACTIVO' } });
    await caso('usuarios editar ok', 'PUT', '/api/usuarios/5', { tok: 'admin', body: { nombres: 'N', apellidos: 'A', correo: 'n@x.com', rolId: 2, estado: 'ACTIVO', contrasena: '' } });
    await caso('usuarios editar 404', 'PUT', '/api/usuarios/404', { tok: 'admin', body: { nombres: 'N', apellidos: 'A', correo: 'n@x.com', rolId: 2, estado: 'ACTIVO' } });
    await caso('usuarios estado propio', 'PATCH', '/api/usuarios/1/estado', { tok: 'admin', body: { estado: 'INACTIVO' } });
    await caso('usuarios estado igual', 'PATCH', '/api/usuarios/5/estado', { tok: 'admin', body: { estado: 'ACTIVO' } });
    await caso('usuarios estado ok', 'PATCH', '/api/usuarios/5/estado', { tok: 'admin', body: { estado: 'INACTIVO' } });
    await caso('usuarios estado 404', 'PATCH', '/api/usuarios/404/estado', { tok: 'admin', body: { estado: 'INACTIVO' } });
    await caso('viajes públicos filtro malo', 'GET', '/api/publico/viajes?fecha=2026-02-30');
    await caso('viajes públicos fecha pasada', 'GET', '/api/publico/viajes?fecha=2000-01-01');
    await caso('viajes públicos ok', 'GET', '/api/publico/viajes?origen=LIMA');
    await caso('asientos públicos id malo', 'GET', '/api/publico/asientos/abc');
    await caso('asientos públicos 404', 'GET', '/api/publico/asientos/9');
    await caso('asientos públicos ok', 'GET', '/api/publico/asientos/5');
    await caso('registro inválido', 'POST', '/api/publico/clientes/registro', { body: { nombres: 'A' } });
    await caso('registro ok', 'POST', '/api/publico/clientes/registro', { body: { nombres: 'Luis', apellidos: 'Rojas', correo: 'LUIS@x.com', contrasena: 'Clave1234', confirmarContrasena: 'Clave1234', aceptaPrivacidad: true } });
    await caso('registro duplicado', 'POST', '/api/publico/clientes/registro', { body: { nombres: 'Luis', apellidos: 'Rojas', correo: 'dup@x.com', contrasena: 'Clave1234', confirmarContrasena: 'Clave1234', aceptaPrivacidad: true } });
    await caso('registro sin rol', 'POST', '/api/publico/clientes/registro', { body: { nombres: 'Luis', apellidos: 'Rojas', correo: 'l@x.com', contrasena: 'Clave1234', confirmarContrasena: 'Clave1234', aceptaPrivacidad: true }, estado: { sinRolCliente: true } });
    await caso('mis reservas admin 403', 'GET', '/api/cliente/mis-reservas', { tok: 'admin' });
    await caso('mis reservas', 'GET', '/api/cliente/mis-reservas', { tok: 'cliente' });
    await caso('mis reservas id malo', 'GET', '/api/cliente/mis-reservas/x', { tok: 'cliente' });
    await caso('mis reservas 404', 'GET', '/api/cliente/mis-reservas/2', { tok: 'cliente' });
    await caso('mis reservas detalle', 'GET', '/api/cliente/mis-reservas/1', { tok: 'cliente' });
    await caso('perfil admin 403', 'GET', '/api/cliente/perfil', { tok: 'admin' });
    await caso('perfil put inválido', 'PUT', '/api/cliente/perfil', { tok: 'cliente', body: { nombres: 'A' } });
    await caso('perfil put correo otro', 'PUT', '/api/cliente/perfil', { tok: 'cliente', body: { nombres: 'Carlos', apellidos: 'Cli', correo: 'OTRO@x.com' } });
    await caso('perfil put ok', 'PUT', '/api/cliente/perfil', { tok: 'cliente', body: { nombres: 'Carlos', apellidos: 'Cli', correo: 'c@x.com', telefono: '999' } });
    await caso('dni admin 403', 'GET', '/api/cliente/consulta-dni/12345678', { tok: 'admin' });
    await caso('dni sin autorización', 'GET', '/api/cliente/consulta-dni/12345678', { tok: 'cliente' });
    await caso('dni malo', 'GET', '/api/cliente/consulta-dni/123', { tok: 'cliente', headers: { 'X-Consulta-Autorizada': 'si' } });
    await caso('dni sin clave', 'GET', '/api/cliente/consulta-dni/12345678', { tok: 'cliente', headers: { 'X-Consulta-Autorizada': 'si' } });
    await caso('manifiestos cliente 403', 'GET', '/api/manifiestos/viajes', { tok: 'cliente' });
    await caso('manifiestos fecha mala', 'GET', '/api/manifiestos/viajes?fecha=2026-13-01', { tok: 'op' });
    await caso('manifiestos viajes', 'GET', '/api/manifiestos/viajes?q=lima&fecha=2026-01-01', { tok: 'op' });
    await caso('manifiesto 404', 'GET', '/api/manifiestos/9', { tok: 'admin' });
    await caso('manifiesto id malo', 'GET', '/api/manifiestos/-1', { tok: 'admin' });
    await caso('manifiesto ok', 'GET', '/api/manifiestos/5', { tok: 'admin' });
    await caso('políticas catálogos', 'GET', '/api/politicas/catalogos', { tok: 'cliente' });
    await caso('políticas vigentes', 'GET', '/api/politicas/vigentes', { tok: 'cliente' });
    await caso('políticas listar cliente 403', 'GET', '/api/politicas', { tok: 'cliente' });
    await caso('políticas listar', 'GET', '/api/politicas?q=res', { tok: 'admin' });
    const pol = { tipo: 'RESERVA', titulo: 'Título largo', contenido: 'Contenido de más de veinte caracteres', version: '2', vigenteDesde: '2026-01-01', vigenteHasta: null };
    await caso('políticas crear', 'POST', '/api/politicas', { tok: 'admin', body: pol });
    await caso('políticas crear fechas malas', 'POST', '/api/politicas', { tok: 'admin', body: { ...pol, vigenteHasta: '2025-01-01' } });
    await caso('políticas editar 404', 'PUT', '/api/politicas/404', { tok: 'admin', body: pol });
    await caso('políticas editar', 'PUT', '/api/politicas/3', { tok: 'admin', body: pol });
    await caso('políticas estado igual', 'PATCH', '/api/politicas/3/estado', { tok: 'admin', body: { activa: true } });
    await caso('políticas estado ok', 'PATCH', '/api/politicas/3/estado', { tok: 'admin', body: { activa: false } });
    await caso('políticas estado 404', 'PATCH', '/api/politicas/404/estado', { tok: 'admin', body: { activa: false } });
    const rec = { tipoDocumento: 'DNI', numeroDocumento: '12345678', nombreReclamante: 'Pedro Paz', correoReclamante: 'p@x.com', tipoSolicitud: 'RECLAMO', descripcion: 'Descripción suficiente', pedido: 'Pedido' };
    await caso('reclamo público ok', 'POST', '/api/reclamaciones/publicas', { body: rec });
    await caso('reclamo público con usuarioId', 'POST', '/api/reclamaciones/publicas', { body: { ...rec, usuarioId: 1 } });
    await caso('reclamo consulta mala', 'POST', '/api/reclamaciones/consulta', { body: { numeroCorrelativo: 'X', codigoPrivado: 'abc' } });
    await caso('reclamo consulta 404', 'POST', '/api/reclamaciones/consulta', { body: { numeroCorrelativo: 'REC-0000000099', codigoPrivado: 'ABCD1234' } });
    await caso('reclamo consulta ok', 'POST', '/api/reclamaciones/consulta', { body: { numeroCorrelativo: 'REC-0000000031', codigoPrivado: 'abcd1234' } });
    await caso('reclamos catálogos', 'GET', '/api/reclamaciones/catalogos', { tok: 'admin' });
    await caso('reclamos resumen', 'GET', '/api/reclamaciones/resumen', { tok: 'admin' });
    await caso('reclamos listar estado malo', 'GET', '/api/reclamaciones?estado=xx', { tok: 'admin' });
    await caso('reclamos listar', 'GET', '/api/reclamaciones?estado=cerrado&tipo=queja&q=a', { tok: 'admin' });
    await caso('reclamo detalle 404', 'GET', '/api/reclamaciones/5', { tok: 'admin' });
    await caso('reclamo detalle', 'GET', '/api/reclamaciones/31', { tok: 'admin' });
    await caso('reclamo admin crear', 'POST', '/api/reclamaciones', { tok: 'admin', body: { ...rec, usuarioId: 2, reservaId: 1 } });
    await caso('reclamo admin usuario inexistente', 'POST', '/api/reclamaciones', { tok: 'admin', body: { ...rec, usuarioId: 8 } });
    await caso('reclamo admin reserva ajena', 'POST', '/api/reclamaciones', { tok: 'admin', body: { ...rec, usuarioId: 2, reservaId: 1 }, estado: {} });
    await caso('reclamo estado transición mala', 'PATCH', '/api/reclamaciones/31/estado', { tok: 'admin', body: { estado: 'CERRADO' }, estado: { estadoReclamo: 'REGISTRADO' } });
    await caso('reclamo estado igual', 'PATCH', '/api/reclamaciones/31/estado', { tok: 'admin', body: { estado: 'REGISTRADO' }, estado: { estadoReclamo: 'REGISTRADO' } });
    await caso('reclamo estado sin respuesta', 'PATCH', '/api/reclamaciones/31/estado', { tok: 'admin', body: { estado: 'RESPONDIDO' }, estado: { estadoReclamo: 'EN_ATENCION', respuestas: 0 } });
    await caso('reclamo estado ok', 'PATCH', '/api/reclamaciones/31/estado', { tok: 'admin', body: { estado: 'EN_ATENCION', observacion: 'obs' }, estado: { estadoReclamo: 'REGISTRADO' } });
    await caso('reclamo estado 404', 'PATCH', '/api/reclamaciones/404/estado', { tok: 'admin', body: { estado: 'EN_ATENCION' } });
    await caso('reclamo respuesta estado malo', 'POST', '/api/reclamaciones/31/respuestas', { tok: 'admin', body: { contenido: 'Respuesta suficiente' }, estado: { estadoReclamo: 'REGISTRADO' } });
    await caso('reclamo respuesta ok', 'POST', '/api/reclamaciones/31/respuestas', { tok: 'admin', body: { contenido: 'Respuesta suficiente' }, estado: { estadoReclamo: 'EN_ATENCION' } });
    await caso('reservas políticas vigentes', 'GET', '/api/reservas/politicas-vigentes', { tok: 'cliente' });
    await caso('reservas políticas faltan', 'GET', '/api/reservas/politicas-vigentes', { tok: 'cliente', estado: { faltaPolitica: true } });
    await caso('reserva operador 403', 'POST', '/api/reservas', { tok: 'op', body: reservaOK });
    await caso('reserva inválida', 'POST', '/api/reservas', { tok: 'cliente', body: { ...reservaOK, items: [] } });
    await caso('reserva doc malo', 'POST', '/api/reservas', { tok: 'cliente', body: { ...reservaOK, items: [{ asientoId: 1, numeroDocumento: '12', nombres: 'Juan', apellidos: 'Pérez' }] } });
    await caso('reserva ok', 'POST', '/api/reservas', { tok: 'cliente', body: reservaOK });
    await caso('reserva políticas cambiaron', 'POST', '/api/reservas', { tok: 'cliente', body: { ...reservaOK, politicaIds: [10, 11, 12, 13, 99] } });
    await caso('reserva viaje 404', 'POST', '/api/reservas', { tok: 'cliente', body: { ...reservaOK, viajeId: 404 } });
    await caso('reserva viaje no programado', 'POST', '/api/reservas', { tok: 'cliente', body: reservaOK, estado: { estadoViaje: 'EN_RUTA' } });
    await caso('reserva vencida', 'POST', '/api/reservas', { tok: 'cliente', body: reservaOK, estado: { vencido: true } });
    await caso('reserva asiento ajeno', 'POST', '/api/reservas', { tok: 'cliente', body: reservaOK, estado: { asientoAjeno: true } });
    await caso('reserva asiento ocupado', 'POST', '/api/reservas', { tok: 'cliente', body: reservaOK, estado: { asientoOcupado: true } });
    await caso('reserva pasajero inactivo', 'POST', '/api/reservas', { tok: 'cliente', body: reservaOK, estado: { pasajeroInactivo: true } });
    await caso('reserva pasajero nuevo sin fecha', 'POST', '/api/reservas', { tok: 'cliente', body: { ...reservaOK, items: [{ asientoId: 2, numeroDocumento: '22222222', nombres: 'Rosa', apellidos: 'Díaz' }] } });
    await caso('reserva duplicado SQL', 'POST', '/api/reservas', { tok: 'cliente', body: reservaOK, estado: { dupReserva: true } });
    await caso('reservas catálogos cliente 403', 'GET', '/api/reservas/catalogos', { tok: 'cliente' });
    await caso('reservas catálogos', 'GET', '/api/reservas/catalogos', { tok: 'admin' });
    await caso('reservas asientos 404', 'GET', '/api/reservas/asientos/9', { tok: 'admin' });
    await caso('reservas asientos', 'GET', '/api/reservas/asientos/5', { tok: 'admin' });
    await caso('reservas listar', 'GET', '/api/reservas?q=abc', { tok: 'admin' });
    await caso('reserva historial 404', 'GET', '/api/reservas/2/historial', { tok: 'admin' });
    await caso('reserva historial', 'GET', '/api/reservas/1/historial', { tok: 'admin' });
    await caso('reserva detalle 404', 'GET', '/api/reservas/2', { tok: 'admin' });
    await caso('reserva detalle', 'GET', '/api/reservas/1', { tok: 'admin' });
    await caso('cancelar 404', 'PATCH', '/api/reservas/404/cancelar', { tok: 'admin' });
    await caso('cancelar ya cancelada', 'PATCH', '/api/reservas/1/cancelar', { tok: 'admin', estado: { estadoReserva: 'CANCELADA' } });
    await caso('cancelar venta vigente', 'PATCH', '/api/reservas/1/cancelar', { tok: 'admin', estado: { ventas: [{ VentaID: 1, EstadoVenta: 'REGISTRADA' }] } });
    await caso('cancelar pago inconsistente', 'PATCH', '/api/reservas/1/cancelar', { tok: 'admin', estado: { ventas: [{ VentaID: 1, EstadoVenta: 'ANULADA', PagoID: 1, EstadoPago: 'REGISTRADO', EsSimulado: 1 }] } });
    await caso('cancelar ok', 'PATCH', '/api/reservas/1/cancelar', { tok: 'admin' });
    const edicion = { items: [{ reservaAsientoId: 71, asientoId: 3, numeroDocumento: '11111111', nombres: 'Juan', apellidos: 'Pérez' }, { reservaAsientoId: 72, asientoId: 2, numeroDocumento: '22222222', nombres: 'Rosa', apellidos: 'Díaz', fechaNacimiento: '1990-01-01' }] };
    await caso('editar ok', 'PUT', '/api/reservas/1', { tok: 'admin', body: edicion });
    await caso('editar con venta', 'PUT', '/api/reservas/1', { tok: 'admin', body: edicion, estado: { tieneVenta: true } });
    await caso('editar cantidad', 'PUT', '/api/reservas/1', { tok: 'admin', body: { items: edicion.items.slice(0, 1) } });
    await caso('editar intercambio', 'PUT', '/api/reservas/1', { tok: 'admin', body: { items: [{ ...edicion.items[0], asientoId: 2 }, { ...edicion.items[1], asientoId: 4 }] } });
    await caso('editar detalle ajeno', 'PUT', '/api/reservas/1', { tok: 'admin', body: { items: [{ ...edicion.items[0], reservaAsientoId: 99 }, edicion.items[1]] } });
    const reprog = { viajeNuevoId: 7, items: [{ reservaAsientoId: 71, asientoId: 5 }, { reservaAsientoId: 72, asientoId: 6 }] };
    await caso('reprogramar ok', 'PATCH', '/api/reservas/1/reprogramar', { tok: 'admin', body: reprog });
    await caso('reprogramar mismo viaje', 'PATCH', '/api/reservas/1/reprogramar', { tok: 'admin', body: { ...reprog, viajeNuevoId: 5 } });
    await caso('reprogramar otra ruta', 'PATCH', '/api/reservas/1/reprogramar', { tok: 'admin', body: { ...reprog, viajeNuevoId: 6 } });
    await caso('reprogramar destino 404', 'PATCH', '/api/reservas/1/reprogramar', { tok: 'admin', body: { ...reprog, viajeNuevoId: 404 } });
    await caso('reprogramar repetidos', 'PATCH', '/api/reservas/1/reprogramar', { tok: 'admin', body: { viajeNuevoId: 7, items: [{ reservaAsientoId: 71, asientoId: 5 }, { reservaAsientoId: 71, asientoId: 6 }] } });
    await caso('ventas catálogos', 'GET', '/api/ventas/catalogos', { tok: 'admin' });
    await caso('ventas listar', 'GET', '/api/ventas?q=b', { tok: 'admin' });
    await caso('venta detalle 404', 'GET', '/api/ventas/2', { tok: 'admin' });
    await caso('venta detalle', 'GET', '/api/ventas/1', { tok: 'admin' });
    await caso('venta inválida', 'POST', '/api/ventas', { tok: 'admin', body: { reservaId: 1, metodo: 'BITCOIN' } });
    await caso('venta ok', 'POST', '/api/ventas', { tok: 'admin', body: { reservaId: 1, metodo: 'EFECTIVO', referenciaSimulada: 'ref' } });
    await caso('venta reserva 404', 'POST', '/api/ventas', { tok: 'admin', body: { reservaId: 404, metodo: 'EFECTIVO' } });
    await caso('venta ya existe', 'POST', '/api/ventas', { tok: 'admin', body: { reservaId: 1, metodo: 'EFECTIVO' }, estado: { tieneVenta: true } });
    await caso('venta importe no cuadra', 'POST', '/api/ventas', { tok: 'admin', body: { reservaId: 1, metodo: 'EFECTIVO' }, estado: { totalAsientos: 90 } });
    await caso('venta sin asientos', 'POST', '/api/ventas', { tok: 'admin', body: { reservaId: 1, metodo: 'EFECTIVO' }, estado: { cantAsientos: 0 } });
    await caso('venta duplicado SQL', 'POST', '/api/ventas', { tok: 'admin', body: { reservaId: 1, metodo: 'TARJETA' }, estado: { dupVenta: true } });
    await caso('anular ok', 'PATCH', '/api/ventas/41/anular', { tok: 'admin' });
    await caso('anular 404', 'PATCH', '/api/ventas/404/anular', { tok: 'admin' });
    await caso('anular ya anulada', 'PATCH', '/api/ventas/41/anular', { tok: 'admin', estado: { estadoVenta: 'ANULADA' } });
    await caso('anular dos pagos', 'PATCH', '/api/ventas/41/anular', { tok: 'admin', estado: { pagos: [{}, {}] } });
    await caso('anular monto distinto', 'PATCH', '/api/ventas/41/anular', { tok: 'admin', estado: { pagos: [{ PagoID: 42, Estado: 'REGISTRADO', EsSimulado: true, Monto: 90, Metodo: 'EFECTIVO' }] } });
    await caso('reportes catálogos', 'GET', '/api/reportes/catalogos', { tok: 'admin' });
    await caso('reportes tipo inexistente', 'GET', '/api/reportes/xyz', { tok: 'admin' });
    await caso('pagos id malo', 'GET', '/api/pagos/abc', { tok: 'admin' });
    await caso('auditoría id malo', 'GET', '/api/auditoria/abc', { tok: 'admin' });

    // ----- CU001: credenciales y cuenta desactivada -----
    await caso('login correo inexistente', 'POST', '/api/auth/login', { body: { correo: 'nadie@x.com', contrasena: 'Clave123' } });
    await caso('login cuenta inactiva clave mala', 'POST', '/api/auth/login', { body: { correo: 'inactivo@x.com', contrasena: 'no' } });
    await caso('login cuenta inactiva', 'POST', '/api/auth/login', { body: { correo: 'inactivo@x.com', contrasena: 'Clave123' } });
    // ----- Perfil VENTAS: solo reservas, ventas y pagos -----
    await caso('ventas: listar ventas', 'GET', '/api/ventas?q=b', { tok: 'ventas' });
    await caso('ventas: reservas catálogos', 'GET', '/api/reservas/catalogos', { tok: 'ventas' });
    await caso('ventas: crear reserva', 'POST', '/api/reservas', { tok: 'ventas', body: reservaOK });
    await caso('ventas: usuarios 403', 'GET', '/api/usuarios', { tok: 'ventas' });
    await caso('ventas: terminales 403', 'GET', '/api/terminales', { tok: 'ventas' });
    await caso('operador: ventas 403', 'GET', '/api/ventas', { tok: 'op' });
    // ----- CU010: pago simulado rechazado -----
    await caso('venta pago rechazado', 'POST', '/api/ventas', { tok: 'ventas', body: { reservaId: 1, metodo: 'TARJETA', resultadoSimulado: 'RECHAZADO' } });
    await caso('venta resultado inválido', 'POST', '/api/ventas', { tok: 'ventas', body: { reservaId: 1, metodo: 'TARJETA', resultadoSimulado: 'QUIZAS' } });
    // ----- Condiciones del servicio (público) -----
    await caso('condiciones públicas', 'GET', '/api/publico/condiciones');
    // ----- CU012: reclamo del cliente y Mis reclamaciones -----
    await caso('reclamo público con sesión cliente', 'POST', '/api/reclamaciones/publicas', { tok: 'cliente', body: rec });
    resultados.push({ nombre: 'reclamo con sesión cliente: UsuarioID guardado', status: 0, cuerpo: st.usuarioReclamo });
    await caso('reclamo público con sesión admin', 'POST', '/api/reclamaciones/publicas', { tok: 'admin', body: rec });
    resultados.push({ nombre: 'reclamo con sesión admin: UsuarioID guardado', status: 0, cuerpo: st.usuarioReclamo });
    await caso('reclamo público token malo', 'POST', '/api/reclamaciones/publicas', { body: rec, headers: { Authorization: 'Bearer abc' } });
    await caso('mis reclamaciones', 'GET', '/api/cliente/mis-reclamaciones', { tok: 'cliente' });
    await caso('mis reclamaciones sin sesión', 'GET', '/api/cliente/mis-reclamaciones');
    await caso('mis reclamaciones admin 403', 'GET', '/api/cliente/mis-reclamaciones', { tok: 'admin' });
    await caso('mi reclamación detalle', 'GET', '/api/cliente/mis-reclamaciones/31', { tok: 'cliente' });
    await caso('mi reclamación ajena 404', 'GET', '/api/cliente/mis-reclamaciones/32', { tok: 'cliente' });
    // ----- Terminales terrestres -----
    const term = { nombre: 'Terminal Plaza Norte', ciudad: ' lima ', direccion: 'Av. Tomás Valle s/n', telefono: '(01) 555-1234' };
    await caso('terminales listar', 'GET', '/api/terminales?q=lima', { tok: 'admin' });
    await caso('terminales cliente 403', 'GET', '/api/terminales', { tok: 'cliente' });
    await caso('terminal detalle', 'GET', '/api/terminales/1', { tok: 'admin' });
    await caso('terminal detalle 404', 'GET', '/api/terminales/9', { tok: 'admin' });
    await caso('terminal id malo', 'GET', '/api/terminales/abc', { tok: 'admin' });
    await caso('terminal crear', 'POST', '/api/terminales', { tok: 'admin', body: term });
    await caso('terminal crear duplicado', 'POST', '/api/terminales', { tok: 'admin', body: { ...term, nombre: 'terminal  javier prado', ciudad: 'Lima' } });
    await caso('terminal crear inválido', 'POST', '/api/terminales', { tok: 'admin', body: { nombre: 'T', ciudad: 'LIMA', direccion: 'x' } });
    await caso('terminal crear teléfono malo', 'POST', '/api/terminales', { tok: 'admin', body: { ...term, telefono: 'abc' } });
    await caso('terminal editar', 'PUT', '/api/terminales/2', { tok: 'admin', body: term });
    await caso('terminal editar 404', 'PUT', '/api/terminales/404', { tok: 'admin', body: term });
    await caso('terminal editar cambia ciudad con rutas', 'PUT', '/api/terminales/2', { tok: 'admin', body: { ...term, ciudad: 'ICA' }, estado: { rutasOtraCiudad: 1 } });
    await caso('terminal desactivar con rutas', 'PATCH', '/api/terminales/2/estado', { tok: 'admin', body: { estado: 'INACTIVO' }, estado: { rutasActivas: 2 } });
    await caso('terminal desactivar', 'PATCH', '/api/terminales/2/estado', { tok: 'admin', body: { estado: 'INACTIVO' } });
    await caso('terminal estado malo', 'PATCH', '/api/terminales/2/estado', { tok: 'admin', body: { estado: 'X' } });
    // ----- CU006: ruta con viajes programados -----
    await caso('ruta desactivar con viajes', 'PATCH', '/api/rutas/1/estado', { tok: 'admin', body: { estado: 'INACTIVA' }, estado: { viajesProgramados: 3 } });
    await caso('ruta desactivar', 'PATCH', '/api/rutas/1/estado', { tok: 'admin', body: { estado: 'INACTIVA' } });
    // ----- CU009: licencia del conductor vencida -----
    const viaje = { rutaId: 1, busId: 1, conductorId: 1, salida: '2030-03-10T08:00', llegadaEstimada: '2030-03-10T13:00', tarifa: 50, estado: 'PROGRAMADO' };
    await caso('viaje licencia vencida', 'POST', '/api/viajes', { tok: 'admin', body: viaje, estado: { vence: '2030-03-01' } });

  } finally {
    server.close();
  }

  if (process.env.ACTUALIZAR_ESPERADO || !existsSync(archivoEsperado)) {
    writeFileSync(archivoEsperado, JSON.stringify(resultados, null, 1) + '\n');
  }
  const esperado = JSON.parse(readFileSync(archivoEsperado, 'utf8'));
  assert.equal(resultados.length, esperado.length, 'cantidad de casos');
  for (let i = 0; i < resultados.length; i++) {
    await t.test(resultados[i].nombre, () => {
      assert.deepEqual(resultados[i], esperado[i]);
    });
  }
});
