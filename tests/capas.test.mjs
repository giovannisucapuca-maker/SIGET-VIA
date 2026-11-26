// SIGET-VÍA — Prueba de arquitectura: ejecuta tests/verificar-capas.mjs
// y falla si alguna capa importa código que no le corresponde.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('las capas presentacion → negocio → datos se respetan', () => {
  const script = fileURLToPath(new URL('./verificar-capas.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
