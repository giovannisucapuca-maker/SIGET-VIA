import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Las variables (VITE_API_URL) se leen de config/.env en la raíz del proyecto.
export default defineConfig({
  plugins: [react()],
  envDir: '../../config',
  server: { port: 5173 }
});
