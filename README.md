# SIGET-VÍA — Entrega 1

Proyecto académico basado en los prototipos, el informe SIGET-VIA-EP y el modelo `SOGET VIA GRUPO 1.mwb`.

## Alcance REAL de esta entrega

- Esquema inicial de **19 tablas** convertido a SQL Server, claves primarias y relaciones explícitas.
- Roles `ADMINISTRADOR`, `VENTAS`, `OPERADOR`, `CLIENTE`.
- Inicio de sesión con contraseñas bcrypt y JWT; el rol se consulta desde SQL Server (no se selecciona en el login).
- Administración de usuarios: listar, buscar, registrar, editar y activar/desactivar, con auditoría.
- Interfaz React con identidad visual del prototipo.
- El resto de módulos aparece señalado como pendiente; **no funcionan aún**.

## Requisitos

Node.js 20+ (recomendado 22), npm, SQL Server y SQL Server Management Studio. SQL Server debe aceptar conexiones TCP/IP (puerto 1433 o el que configures), y el usuario SQL debe tener permisos sobre SIGET_VIA_DB.

## Paso 1 — Base de datos

En SQL Server Management Studio abre y ejecuta `database/01_esquema_sqlserver.sql` sobre una instancia local. Crea la base `SIGET_VIA_DB` y sus tablas. Usa una base nueva, no ejecutes este script sobre tablas existentes sin respaldarlas.

## Paso 2 — Backend (PowerShell / terminal VS Code)

```powershell
cd backend
Copy-Item .env.example .env
npm install
```

Edita `backend/.env`: credenciales SQL Server, `JWT_SECRET` de 32+ caracteres y `ADMIN_PASSWORD` seguro. **No subas el archivo `.env` a GitHub.**

```powershell
node src/seed-admin.js
npm run dev
```

Visita `http://localhost:4000/api/health`. Debe devolver `status: ok` y `database: connected`.

## Paso 3 — Frontend (otra terminal)

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Abre `http://localhost:5173`, ingresa con `ADMIN_EMAIL` y `ADMIN_PASSWORD` definidos en el backend.

## API

`POST /api/auth/login`, `GET /api/auth/me`, `GET /api/roles`, `GET/POST /api/usuarios`, `PUT /api/usuarios/:id`, `PATCH /api/usuarios/:id/estado`, `GET /api/health`.

## Advertencias

- El `.mwb` es MySQL; el SQL se ha adaptado a SQL Server siguiendo el informe. Revisar índices, constraints y reglas de negocio adicionales en próximas entregas.
- SQL Server no está disponible en este entorno de elaboración: **no se ha verificado una conexión real ni se ha ejecutado todo el flujo completo contra una instancia de SQL Server**.
- Es una primera implementación académica. Antes de despliegue real: HTTPS, secreto seguro, pruebas integrales, configuración de CORS por entorno, respaldos y verificación normativa.
