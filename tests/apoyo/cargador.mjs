// Sustituye el controlador de SQL Server por uno simulado durante las pruebas.
export async function resolve(especificador, contexto, siguiente) {
  if (especificador === 'mssql/msnodesqlv8.js' || especificador === 'mssql') {
    return { url: new URL('./mssql-falso.mjs', import.meta.url).href, shortCircuit: true };
  }
  return siguiente(especificador, contexto);
}
