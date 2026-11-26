import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './estilos/style.css';

// SIGET-VÍA — Punto de entrada del frontend.
// Capa de VISTA. Se comunica con la capa de lógica (logica/) por la API REST.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
