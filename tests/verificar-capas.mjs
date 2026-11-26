// =====================================================
// SIGET-VÍA — Verificación de la arquitectura de tres capas
//
//   app/presentacion (React) → API REST → app/negocio (Express) → app/datos (SQL Server)
//
// Reglas comprobadas:
//  1. presentacion no importa código de negocio ni de datos;
//     solo presentacion/src/servicios usa fetch.
//  2. negocio no escribe SQL ni importa mssql;
//     solo negocio/src/servicios usa la capa de datos (siget-via-datos).
//  3. datos no importa código de negocio ni de presentacion, ni usa Express.
// Uso: npm run check:capas   (o node tests/verificar-capas.mjs)
// =====================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const listar = (dir, ext) => {
  const r = [];
  (function rec(d) {
    for (const f of readdirSync(d)) {
      if (f === 'node_modules' || f === 'dist') continue;
      const p = join(d, f);
      if (statSync(p).isDirectory()) rec(p); else if (ext.test(p)) r.push(p);
    }
  })(join(raiz, dir));
  return r;
};
const rel = p => relative(raiz, p).replaceAll('\\', '/');
const importaciones = src => [...src.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
const destino = (f, i) => rel(resolve(dirname(f), i));
let errores = 0;
let revisados = 0;
const fallo = m => { errores++; console.log('✗ ' + m); };

for (const f of listar('app/presentacion/src', /\.(ts|tsx)$/)) {
  revisados++;
  const src = readFileSync(f, 'utf8');
  for (const i of importaciones(src)) {
    if (i.startsWith('.') && /^app\/(negocio|datos)\//.test(destino(f, i))) fallo(`${rel(f)} importa ${i}`);
    if (i.startsWith('siget-via-')) fallo(`${rel(f)} importa ${i}`);
  }
  if (!rel(f).startsWith('app/presentacion/src/servicios/') && /\bfetch\(/.test(src)) {
    fallo(`${rel(f)} usa fetch fuera de servicios/`);
  }
}

for (const f of listar('app/negocio/src', /\.js$/)) {
  revisados++;
  const src = readFileSync(f, 'utf8');
  for (const i of importaciones(src)) {
    if (i.startsWith('.') && /^app\/(presentacion|datos)\//.test(destino(f, i))) fallo(`${rel(f)} importa ${i}`);
    if (/^mssql/.test(i)) fallo(`${rel(f)} importa ${i} (la conexión pertenece a la capa de datos)`);
    if (i.startsWith('siget-via-datos') && !rel(f).startsWith('app/negocio/src/servicios/')) {
      fallo(`${rel(f)} usa la capa de datos sin pasar por servicios/`);
    }
  }
  if (/getPool|new sql\.|sql\.(Request|Transaction)|\.query\(/.test(src)) fallo(`${rel(f)} contiene SQL`);
}

for (const f of listar('app/datos', /\.js$/)) {
  revisados++;
  const src = readFileSync(f, 'utf8');
  for (const i of importaciones(src)) {
    if (i.startsWith('.') && /^app\/(presentacion|negocio)\//.test(destino(f, i))) fallo(`${rel(f)} importa ${i}`);
    if (/^express/.test(i)) fallo(`${rel(f)} usa Express`);
  }
}

console.log(`Archivos revisados: ${revisados}.`);
console.log(errores
  ? `Violaciones: ${errores}`
  : 'Arquitectura correcta: presentacion → negocio → datos (0 violaciones).');
process.exit(errores ? 1 : 0);
