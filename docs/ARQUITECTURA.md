# SIGET-VÍA — Arquitectura de tres capas

## 1. Organización

```text
SIGET-VIA/
├── app/
│   ├── presentacion/   CAPA DE PRESENTACIÓN (VISTA)   React + TypeScript + Vite
│   ├── negocio/        CAPA DE LÓGICA DE NEGOCIO      Node.js + Express
│   └── datos/          CAPA DE ACCESO A DATOS         SQL Server
├── config/             variables de entorno (.env) de las tres capas
├── database/           scripts SQL
├── tests/              pruebas automáticas
└── docs/               documentación
```

Cada capa es un paquete npm independiente (`siget-via-presentacion`, `siget-via-negocio`, `siget-via-datos`). El `package.json` de la raíz los agrupa con *npm workspaces*, por eso `npm install` en la raíz instala las tres.

```text
presentacion  ──HTTP/JSON──▶  negocio  ──repositorios──▶  datos  ──SQL──▶  SQL Server
```

## 2. Reglas entre capas

| Capa | Responsabilidad | No puede |
|---|---|---|
| **presentacion** | Pantallas, formularios, validación en el navegador y llamadas a la API (`src/servicios/`) | Importar código de `negocio` o `datos`; acceder a la base de datos |
| **negocio** | Controladores HTTP, reglas del sistema, seguridad JWT y por rol, transacciones (qué se hace) | Escribir SQL o importar `mssql`. Solo `servicios/` usa la capa de datos |
| **datos** | Conexión, consultas parametrizadas, transacciones (cómo se guarda), fotos, servicio externo de DNI | Contener reglas de negocio, importar Express o código de otras capas |

`tests/verificar-capas.mjs` revisa estas reglas en los 125 archivos de código (`npm run check:capas`).

## 3. Capa de presentación — `app/presentacion/src`

| Carpeta | Contenido |
|---|---|
| `App.tsx`, `main.tsx` | Rutas, menú por rol y punto de entrada |
| `paginas/` | AsientosPublicos, Auditoria, Buses, ClienteInicio, Conductores, DashboardAdmin, Manifiestos, MisReservas, Pagos, Pasajeros, Politicas, Reclamaciones, ReclamacionesPublicas, RegistroCliente, Reportes, Reservas, Rutas, Ventas, Viajes, ViajesPublicos |
| `componentes/` | `alertas.ts` (SweetAlert2), `comprobanteReserva.ts` (PDF) |
| `estilos/` | `style.css` |
| `reglas/` | `buses.ts`, `conductores.ts`, `consultas.ts`, `pasajeros.ts`, `perfil.ts`, `politicas.ts`, `portal-publico.ts`, `reclamaciones.ts`, `reservas.ts`, `rutas.ts`, `sesion.ts`, `validaciones.ts`, `ventas.ts`, `viajes.ts` — validaciones y reglas de la interfaz; exponen las operaciones de cada módulo |
| `servicios/` | `http.ts` (único `fetch`, URL de la API y token), `sesion.ts` (almacenamiento del JWT), `api/`: `buses.api.ts`, `conductores.api.ts`, `consultas.api.ts`, `pasajeros.api.ts`, `perfil.api.ts`, `politicas.api.ts`, `reclamaciones.api.ts`, `reservas.api.ts`, `rutas.api.ts`, `usuarios.api.ts`, `ventas.api.ts`, `viajes.api.ts` |

Flujo: `paginas/*.tsx` → `reglas/*.ts` → `servicios/api/*.api.ts` → `servicios/http.ts` → API.

## 4. Capa de lógica de negocio — `app/negocio/src`

| Carpeta | Contenido |
|---|---|
| `app.js` | Configura Express (helmet, CORS, JSON) y monta los controladores en `/api/...` |
| `server.js` | Inicia el servidor |
| `controladores/` | Reciben la petición, llaman al servicio y responden JSON |
| `servicios/` | Reglas del negocio: validaciones Zod, estados y transiciones, importes, disponibilidad de asientos, políticas, auditoría |
| `seguridad/auth.middleware.js` | JWT, usuario activo, administrador, restricción por rol |
| `middlewares/` | Conversión de errores a respuestas HTTP, rutas asíncronas |
| `utils/errores.js` | `errorHttp(mensaje, código)` |

## 5. Capa de acceso a datos — `app/datos`

| Carpeta | Contenido |
|---|---|
| `config/db.js` | Conexión a SQL Server (pool) |
| `config/transaccion.js` | `enTransaccion(operación, nivel)`: begin, commit, rollback |
| `repositorios/` | Un repositorio por módulo con todas las consultas SQL parametrizadas |
| `externos/apiinti.client.js` | Consulta de DNI al servicio APIINTI |
| `scripts/seed-admin.js` | Crea el administrador inicial (`npm run seed`) |
| `uploads/perfiles/` | Fotografías de perfil |

El script de la base de datos está en `database/01_esquema_sqlserver.sql`.

## 6. Módulo por módulo (backend)

| Negocio — controlador | Negocio — servicio | Datos |
|---|---|---|
| `controladores/asientos-publicos.controlador.js` | `servicios/asientos-publicos.service.js` | `repositorios/asientos-publicos.repository.js` |
| `controladores/auditoria.controlador.js` | `servicios/auditoria.service.js` | `repositorios/auditoria.repository.js` |
| `controladores/auth.controlador.js` | `servicios/auth.service.js` | `repositorios/usuarios.repository.js` |
| `controladores/buses.controlador.js` | `servicios/buses.service.js` | `repositorios/buses.repository.js` |
| `controladores/conductores.controlador.js` | `servicios/conductores.service.js` | `repositorios/conductores.repository.js` |
| `controladores/consulta-dni-clientes.controlador.js` | `servicios/consulta-dni.service.js` | `externos/apiinti.client.js` |
| `controladores/manifiestos.controlador.js` | `servicios/manifiestos.service.js` | `repositorios/manifiestos.repository.js` |
| `controladores/mis-reservas.controlador.js` | `servicios/mis-reservas.service.js` | `repositorios/mis-reservas.repository.js` |
| `controladores/pagos.controlador.js` | `servicios/pagos.service.js` | `repositorios/pagos.repository.js` |
| `controladores/pasajeros.controlador.js` | `servicios/pasajeros.service.js` | `repositorios/pasajeros.repository.js` |
| `controladores/perfil-cliente.controlador.js` | `servicios/perfil-cliente.service.js` | `repositorios/perfil-cliente.repository.js` |
| `controladores/politicas.controlador.js` | `servicios/politicas.service.js` | `repositorios/politicas.repository.js` |
| `controladores/reclamaciones.controlador.js` | `servicios/reclamaciones.service.js` | `repositorios/reclamaciones.repository.js` |
| `controladores/registro-clientes.controlador.js` | `servicios/registro-clientes.service.js` | `repositorios/usuarios.repository.js` |
| `controladores/reportes.controlador.js` | `servicios/reportes.service.js` | `repositorios/reportes.repository.js` |
| `controladores/reservas.controlador.js` | `servicios/reservas.service.js` | `repositorios/reservas.repository.js` |
| `controladores/rutas.controlador.js` | `servicios/rutas.service.js` | `repositorios/rutas.repository.js` |
| `controladores/terminales.controlador.js` | `servicios/terminales.service.js` | `repositorios/terminales.repository.js` |
| `controladores/usuarios.controlador.js` | `servicios/usuarios.service.js` | `repositorios/usuarios.repository.js` |
| `controladores/ventas.controlador.js` | `servicios/ventas.service.js` | `repositorios/ventas.repository.js` |
| `controladores/viajes.controlador.js` | `servicios/viajes.service.js` | `repositorios/viajes.repository.js` |
| `controladores/viajes-publicos.controlador.js` | `servicios/viajes-publicos.service.js` | `repositorios/viajes-publicos.repository.js` |

## 7. Ejemplo: cancelar una reserva

1. **Presentación** — `paginas/Reservas.tsx` → `reglas/reservas.ts` → `servicios/api/reservas.api.ts` envía `PATCH /api/reservas/15/cancelar`.
2. **Negocio** — `controladores/reservas.controlador.js` recibe la petición; `servicios/reservas.service.js → cancelar()` comprueba el estado de la reserva, que el viaje no haya salido y que no exista una venta vigente.
3. **Datos** — `repositorios/reservas.repository.js` bloquea las filas, libera los asientos, cambia el estado y registra el historial dentro de una transacción.

## 8. Configuración

`config/.env` (copiado de `config/.env.example`) contiene las variables de las tres capas. `config/entorno.js` lo carga para negocio y datos; la presentación lo lee con `envDir` en `vite.config.ts` (solo las variables `VITE_*`).

## 9. Pruebas

| Comando | Qué comprueba |
|---|---|
| `npm test` | 182 casos de la API (correctos, validaciones, permisos, 404, 409, errores SQL) con base de datos simulada + verificación de capas |
| `npm run check:capas` | Que ninguna capa se salte el orden presentacion → negocio → datos |
| `npm run build` | Compilación TypeScript y Vite de la presentación |
| `npm run respaldo` | Respaldo de la base con SQL Server real (no es una prueba) |

Durante la reorganización también se comprobó que la API expone los mismos 92 endpoints que antes, que las respuestas coinciden con la versión original y que 26 pantallas hacen las mismas llamadas a la API. Cambio intencional: un OPERADOR que intenta crear una reserva recibe 403 (antes 500). Falta probar con SQL Server real.
