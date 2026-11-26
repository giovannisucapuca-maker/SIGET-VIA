// =====================================================
// SIGET-VÍA — CONFIGURACIÓN
// Carga las variables de config/.env para la capa de negocio
// y la capa de datos. La capa de presentación (Vite) lee el
// mismo archivo gracias a `envDir` en su vite.config.ts.
// =====================================================
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
