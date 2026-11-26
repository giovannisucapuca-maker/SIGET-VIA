// =====================================================
// SIGET-VÍA — PUNTO DE ARRANQUE DEL BACKEND
// La configuración de la API está en app.js.
// =====================================================
import app from './app.js';

const PORT = Number(process.env.PORT || 4000);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log('====================================');
    console.log('SIGET-VÍA - SERVIDOR BACKEND');
    console.log(`API: http://localhost:${PORT}`);
    console.log('Base de datos: SIGET_VIA_DB');
    console.log('Capas: presentacion → negocio → datos');
    console.log('====================================');
  });
}

export default app;