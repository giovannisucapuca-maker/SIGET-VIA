// Registra el cargador de módulos de prueba (node --import ./tests/apoyo/registrar.mjs).
import { register } from 'node:module';
register('./cargador.mjs', import.meta.url);
