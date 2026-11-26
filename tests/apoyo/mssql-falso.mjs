// SIGET-VÍA — Controlador SQL Server SIMULADO para pruebas.
// Cada consulta se responde con globalThis.__fakeDb(sqlNormalizado, parametros).
const tipo = n => { const f = (...a) => ({ t: n, a }); f.t = n; return f; };
const sql = {
  BigInt: tipo('BigInt'), Int: tipo('Int'), NVarChar: tipo('NVarChar'), VarChar: tipo('VarChar'),
  Decimal: tipo('Decimal'), Bit: tipo('Bit'), Date: tipo('Date'), DateTime2: tipo('DateTime2'),
  VarBinary: tipo('VarBinary'), MAX: -1,
  ISOLATION_LEVEL: { READ_COMMITTED: 2, SERIALIZABLE: 4 }
};
class Request {
  constructor(tx) { this.tx = tx; this.inputs = {}; }
  input(n, t, v) { this.inputs[n] = v; return this; }
  async query(texto) {
    const norm = texto.replace(/\s+/g, ' ').trim();
    globalThis.__log?.push({ sql: norm, inputs: this.inputs, tx: !!this.tx });
    const r = await globalThis.__fakeDb(norm, this.inputs);
    const rs = r?.recordsets || [r?.recordset || []];
    return { recordset: rs[0], recordsets: rs, rowsAffected: r?.rowsAffected || [rs[0].length] };
  }
}
class Transaction {
  constructor(pool) { this.pool = pool; }
  async begin() { globalThis.__log?.push({ evento: 'BEGIN' }); }
  async commit() { globalThis.__log?.push({ evento: 'COMMIT' }); }
  async rollback() { globalThis.__log?.push({ evento: 'ROLLBACK' }); }
}
class ConnectionPool {
  constructor() {}
  async connect() { return this; }
  request() { return new Request(null); }
}
Object.assign(sql, { Request, Transaction, ConnectionPool });
export default sql;
export { Request, Transaction, ConnectionPool };
