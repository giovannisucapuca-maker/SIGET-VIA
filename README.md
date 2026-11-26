# SIGET-VÍA — Sistema Integrado de Gestión de Transporte Interprovincial

**Proyecto académico — EFSRT 2: Integración de las Capas de Datos, Negocio y Vista**

**Institución:** ZEGEL  
**Empresa de referencia:** Transportes Vía S.A.C.  
**Estado:** Desarrollo avanzado — integración de módulos y preparación de pruebas finales.  
**Repositorio:** https://github.com/giovannisucapuca-maker/SIGET-VIA

---

## 1. Descripción del proyecto

SIGET-VÍA es un sistema informático desarrollado para apoyar la gestión operativa y administrativa de una empresa de transporte interprovincial de pasajeros.

El proyecto tiene como referencia a Transportes Vía S.A.C. y busca integrar en una sola plataforma los procesos de administración de usuarios, pasajeros, buses, conductores, rutas, viajes, reservas, ventas, pagos, reclamaciones, reportes y manifiestos.

El sistema cuenta con una interfaz pública para consultar viajes, horarios, tarifas y disponibilidad de asientos, así como interfaces privadas para clientes y personal autorizado.

Su desarrollo se fundamenta en los requerimientos funcionales y no funcionales, los prototipos, el informe del proyecto y los modelos de base de datos elaborados durante el curso.

## 2. Objetivo general

Desarrollar un sistema web de gestión de transporte interprovincial mediante la integración de las capas de presentación, lógica de negocio y acceso a datos, utilizando React, Node.js, Express y SQL Server, para facilitar la administración de operaciones y la atención de los clientes.

## 3. Objetivos específicos

- Implementar una arquitectura de tres capas utilizando tecnologías web.
- Gestionar usuarios y controlar el acceso mediante autenticación y roles.
- Administrar pasajeros, buses, conductores, rutas y viajes.
- Permitir la consulta pública de horarios y tarifas.
- Gestionar reservas y la selección de asientos por nivel del bus.
- Incorporar los procesos de ventas, pagos y anulaciones.
- Registrar historiales y operaciones de auditoría.
- Implementar el libro de reclamaciones.
- Generar reportes y manifiestos de pasajeros.
- Integrar las capas de presentación, lógica de negocio y acceso a datos mediante una API REST.

---

## 4. Tecnologías utilizadas

### 4.1. Capa de presentación — `app/presentacion/`

- React.
- TypeScript.
- Vite.
- HTML5.
- CSS3.
- React Router DOM.
- Lucide React.
- Fetch API.

Estas tecnologías permiten construir interfaces interactivas y consumir los servicios de la capa de lógica.

### 4.2. Capa de lógica de negocio — `app/negocio/`

- Node.js.
- Express.
- JavaScript con módulos ES.
- Zod para validaciones.
- JSON Web Token (JWT).
- bcrypt para el manejo seguro de contraseñas.
- Middlewares de autenticación y autorización.
- API REST.

La capa de lógica implementa validaciones, reglas operativas, control de permisos y procesamiento de solicitudes.

### 4.3. Capa de acceso a datos — `app/datos/`

- Microsoft SQL Server.
- Transact-SQL (T-SQL).
- SQL Server Management Studio (SSMS).
- Biblioteca `mssql` para la conexión desde Node.js.
- Transacciones SQL Server.
- Claves primarias y foráneas.
- Restricciones de integridad.
- Consultas parametrizadas.

---

## 5. Arquitectura de tres capas

Las tres capas están **separadas en carpetas independientes** dentro de `app/`. Cada una es un paquete propio con sus dependencias:

| Capa | Carpeta | Tecnología | Responsabilidad |
|---|---|---|---|
| Presentación (vista) | `app/presentacion/` | React + TypeScript + Vite | Pantallas, formularios y navegación. Se comunica con la API REST |
| Lógica de negocio | `app/negocio/` | Node.js + Express + Zod + JWT | Controladores HTTP, reglas del sistema, seguridad por roles |
| Acceso a datos | `app/datos/` | SQL Server + `mssql` | Conexión, consultas parametrizadas, transacciones |

```text
presentacion  ──HTTP/JSON──▶  negocio  ──repositorios──▶  datos  ──SQL──▶  SQL Server (SIGET_VIA_DB)
```

Reglas:

- **presentacion** no importa código de `negocio` ni de `datos`; solo `src/servicios/` llama a la API.
- **negocio** no escribe SQL; solo sus `servicios/` usan la capa de datos (paquete `siget-via-datos`).
- **datos** no contiene reglas del negocio ni conoce Express.

Se comprueban automáticamente con `npm run check:capas` y `npm test`.

### 5.1. Ejemplo: cancelar una reserva

```text
app/presentacion/src/paginas/Reservas.tsx            botón "Cancelar"
  → app/presentacion/src/servicios/api/reservas.api.ts   PATCH /api/reservas/15/cancelar
app/negocio/src/controladores/reservas.controlador.js recibe la petición
  → app/negocio/src/servicios/reservas.service.js      ¿se puede cancelar? ¿el viaje ya salió? ¿tiene venta vigente?
app/datos/repositorios/reservas.repository.js        libera asientos, cambia estado y registra historial (transacción)
```

### 5.2. Enlaces por capa

- Presentación: https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/app/presentacion
- Lógica de negocio: https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/app/negocio
- Acceso a datos: https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/app/datos

Detalle módulo por módulo en `docs/ARQUITECTURA.md`.

---

## 6. Módulos desarrollados

El sistema incluye los siguientes módulos:

| N.º | Módulo | Funcionalidades desarrolladas |
|---|---|---|
| 1 | Autenticación | Inicio de sesión, JWT y control de acceso por roles. |
| 2 | Usuarios | Registro, consulta, edición y activación o desactivación. |
| 3 | Pasajeros | Registro y administración de información personal. |
| 4 | Rutas | Registro y administración de rutas interprovinciales, con terminal de origen y de destino. No se puede desactivar una ruta con viajes programados. |
| 4.1 | Terminales terrestres | Registro de terminales de embarque por ciudad (nombre, dirección, referencia, teléfono). No se desactiva un terminal usado por rutas activas. |
| 5 | Buses | Gestión de unidades, capacidad, estados y distribución de asientos. |
| 6 | Conductores | Registro, consulta y administración de conductores, con fecha de vencimiento de licencia. |
| 7 | Viajes | Programación de viajes y validación de disponibilidad. No se asigna un conductor con la licencia vencida a la fecha de salida. |
| 8 | Consulta pública | Búsqueda de viajes por origen, destino y fecha. |
| 9 | Asientos públicos | Visualización de asientos disponibles y ocupados por bus. |
| 10 | Reservas | Registro, consulta, edición, cancelación y reprogramación. |
| 11 | Ventas | Administración de ventas y sus estados. |
| 12 | Pagos | Gestión y control de pagos simulados; el pago puede simularse como APROBADO o RECHAZADO (en ese caso no se registra la venta). |
| 13 | Portal del cliente | Inicio del cliente y administración de su perfil. |
| 14 | Mis reservas | Consulta de reservas asociadas al cliente. |
| 15 | Políticas del servicio | Gestión de condiciones y registro de aceptaciones. |
| 16 | Reclamaciones | Registro público y gestión administrativa. El cliente con sesión ve sus reclamaciones en *Mis reclamaciones* y descarga su constancia. |
| 17 | Auditoría | Consulta y registro de operaciones del sistema. |
| 18 | Reportes | Visualización de información operativa y administrativa; exportación a Excel (.xlsx), CSV y PDF. |
| 19 | Manifiestos | Consulta de información de pasajeros por viaje. |
| 20 | Dashboard | Indicadores administrativos obtenidos desde la capa de lógica. |

**Estado de validación:** Los módulos anteriores han sido implementados e integrados progresivamente. Esto no implica que todas las pruebas integrales finales hayan sido completadas.

---

## 7. Portal público de Vía SAC

El sistema dispone de una ventana pública desarrollada con React y CSS.

Se ha utilizado como referencia visual la identidad de Transportes Vía S.A.C., incorporando su logo y fotografías de buses para la presentación académica.

### Funcionalidades

- Página pública de bienvenida.
- Consulta de rutas y horarios.
- Búsqueda por origen, destino y fecha.
- Visualización de tarifas.
- Consulta de disponibilidad de asientos.
- Identificación del tipo de servicio.
- Acceso a la selección de asientos.
- Registro de clientes.
- Inicio de sesión.
- Acceso al libro de reclamaciones.
- Condiciones del servicio y política de privacidad (`/condiciones`).
- Terminal de embarque y de llegada en cada viaje.

### Rutas principales

| Ruta | Descripción |
|---|---|
| `/` | Página pública principal. |
| `/login` | Inicio de sesión. |
| `/registro` | Registro de clientes. |
| `/viajes/publico` | Consulta pública de viajes. |
| `/viajes/publico/:viajeId/asientos` | Selección de asientos. |
| `/cliente` | Portal privado del cliente. |
| `/mis-reservas` | Reservas del cliente autenticado. |
| `/mis-reclamaciones` | Reclamaciones del cliente autenticado. |
| `/condiciones` | Condiciones del servicio vigentes. |
| `/panel` | Panel administrativo u operativo. |
| `/reclamaciones/publico` | Libro de reclamaciones. |

---

## 8. Roles y permisos

El sistema utiliza roles registrados en SQL Server para controlar el acceso a sus funcionalidades.

Los perfiles contemplados son:

- **ADMINISTRADOR:** gestión administrativa de los módulos autorizados.
- **OPERADOR:** manifiestos de pasajeros y consulta de políticas.
- **VENTAS:** reservas, ventas, pagos simulados, búsqueda de pasajeros por documento y consulta de políticas.
- **CLIENTE:** consulta de viajes, reservas y funcionalidades personales.

El rol no es seleccionado durante el inicio de sesión, sino recuperado desde la información del usuario autenticado.

Los permisos se aplican mediante validaciones en la capa de lógica y restricciones de navegación en la capa de presentación.

---

## 9. Base de datos

El sistema utiliza la base de datos:

`SIGET_VIA_DB`

En ella se gestionan entidades relacionadas con:

- Usuarios y roles.
- Pasajeros.
- Rutas y terminales terrestres.
- Buses y asientos.
- Conductores.
- Viajes.
- Reservas y detalles de asientos.
- Ventas y pagos.
- Políticas del servicio.
- Historiales.
- Reclamaciones.
- Auditoría.

El esquema inicial del proyecto fue adaptado desde un modelo de datos elaborado para MySQL hacia Microsoft SQL Server.

Durante el desarrollo se incorporaron estructuras y funcionalidades adicionales.

### Scripts disponibles

| Archivo | Uso |
|---|---|
| `database/01_esquema_sqlserver.sql` | Esquema inicial. |
| `database/02_actualizacion_sqlserver.sql` | Agrega la tabla `Terminal`, los terminales de la ruta y la fecha de vencimiento de licencia. Se ejecuta una vez y se puede repetir sin problema. |
| `database/RESPALDO.md` | Cómo respaldar (`npm run respaldo`) y restaurar la base (RNF8). |

**Importante:** Este archivo corresponde al esquema SQL versionado en el repositorio. No debe ejecutarse sobre una base existente sin revisar previamente su contenido y contar con un respaldo actualizado. El archivo de esquema inicial no constituye por sí solo un sistema completo de migraciones incrementales.

---

## 10. Estructura del repositorio

```text
SIGET-VIA/
├── app/
│   ├── presentacion/              ← CAPA DE PRESENTACIÓN (VISTA) — React + TypeScript + Vite
│   │   ├── public/                logo e imágenes de Vía SAC
│   │   ├── src/
│   │   │   ├── App.tsx            rutas de la aplicación y menú por rol
│   │   │   ├── main.tsx           punto de entrada
│   │   │   ├── paginas/           21 pantallas (portal público, cliente y administración)
│   │   │   ├── componentes/       alertas (SweetAlert2) y comprobante PDF
│   │   │   ├── estilos/           hojas de estilo
│   │   │   ├── reglas/            validaciones de formularios y reglas de la interfaz
│   │   │   └── servicios/         comunicación con la API: http.ts, sesion.ts, api/*.api.ts
│   │   ├── index.html · vite.config.ts · tsconfig.json
│   │   └── package.json
│   │
│   ├── negocio/                   ← CAPA DE LÓGICA DE NEGOCIO — Node.js + Express
│   │   ├── src/
│   │   │   ├── controladores/     endpoints de la API REST /api (un archivo por módulo)
│   │   │   ├── servicios/         reglas del negocio por módulo (validaciones Zod, estados, importes)
│   │   │   ├── seguridad/         autenticación JWT y control de acceso por rol
│   │   │   ├── middlewares/       manejo de errores y rutas asíncronas
│   │   │   ├── utils/errores.js   errores de negocio con código HTTP
│   │   │   ├── app.js             Application Factory (configura Express)
│   │   │   └── server.js          arranque del servidor
│   │   └── package.json
│   │
│   └── datos/                     ← CAPA DE ACCESO A DATOS — SQL Server
│       ├── config/                db.js (conexión) · transaccion.js (commit/rollback)
│       ├── repositorios/          consultas SQL parametrizadas (patrón Repository)
│       ├── externos/              apiinti.client.js (consulta de DNI)
│       ├── scripts/seed-admin.js  crea el administrador inicial
│       ├── uploads/perfiles/      fotografías de perfil
│       └── package.json           paquete siget-via-datos (mssql, msnodesqlv8)
│
├── config/                        ← CONFIGURACIÓN
│   ├── .env.example               variables de entorno de las tres capas
│   └── entorno.js                 carga config/.env
├── database/                      ← SCRIPTS SQL
│   └── 01_esquema_sqlserver.sql   esquema de SIGET_VIA_DB (SQL Server)
├── tests/                         ← PRUEBAS (node --test)
│   ├── api.test.mjs               142 casos de la API con base de datos simulada
│   ├── capas.test.mjs             verifica que se respeten las capas
│   ├── verificar-capas.mjs
│   ├── apoyo/                     controlador SQL simulado
│   └── esperado/api.json          respuestas esperadas
├── docs/
│   └── ARQUITECTURA.md            detalle de la arquitectura módulo por módulo
├── package.json                   proyecto raíz (npm workspaces: instala las tres capas)
└── README.md
```

---

## 11. Requisitos de ejecución

Para ejecutar el proyecto en un entorno local se necesita:

- Node.js 20 o superior, según las dependencias instaladas.
- npm.
- Microsoft SQL Server.
- SQL Server Management Studio.
- Visual Studio Code o un editor compatible.
- Git, opcional para clonar y actualizar el repositorio.

SQL Server debe estar configurado para aceptar las conexiones necesarias desde la capa de datos.

---

## 12. Instalación y ejecución

### Paso 1. Obtener el código fuente

```powershell
git clone https://github.com/giovannisucapuca-maker/SIGET-VIA.git
cd SIGET-VIA
```

### Paso 2. Preparar SQL Server

Abrir SQL Server Management Studio y configurar una instancia de SQL Server.

Revisar el script ubicado en:

```text
database/01_esquema_sqlserver.sql
```

Si se trata de una instalación nueva, ejecutar el esquema después de comprobar sus instrucciones y requisitos.

Si ya existe una base `SIGET_VIA_DB` con datos, realizar primero un respaldo y verificar las diferencias de estructura.

En todos los casos, ejecutar después `database/02_actualizacion_sqlserver.sql`.

### Paso 3. Configurar las variables de entorno

```powershell
Copy-Item config\.env.example config\.env
```

Editar `config/.env`: credenciales de SQL Server, `JWT_SECRET` seguro y, si se usa, `APIINTI_API_KEY`. Este único archivo lo leen las tres capas.

**No publicar `.env` ni credenciales reales en GitHub.**

### Paso 4. Instalar las tres capas

Desde la carpeta principal (un solo comando instala presentación, negocio y datos):

```powershell
npm install
```

Si se necesita crear la cuenta administrativa inicial:

```powershell
npm run seed
```

### Paso 5. Ejecutar

Terminal 1 — capa de negocio (API):

```powershell
npm run dev:api
```

API: `http://localhost:4000/api` · comprobación: `http://localhost:4000/api/health`

Terminal 2 — capa de presentación:

```powershell
npm run dev:web
```

Aplicación: `http://localhost:5173`. La pantalla inicial es la página pública de Vía SAC.

### Paso 6. Pruebas y compilación

```powershell
npm test              # pruebas de la API y de la arquitectura
npm run check:capas   # solo la verificación de capas
npm run build         # compila la capa de presentación
npm run respaldo      # respaldo .bak de la base (ver database/RESPALDO.md)
```

Las pruebas usan una base de datos simulada; no reemplazan las pruebas con SQL Server real.

---

## 13. API REST

La capa de lógica expone endpoints HTTP para la integración con la capa de presentación.

Entre las rutas desarrolladas se encuentran:

| Endpoint | Funcionalidad |
|---|---|
| `POST /api/auth/login` | Autenticación. |
| `GET /api/auth/me` | Consultar la sesión autenticada. |
| `GET /api/roles` | Consultar roles. |
| `/api/usuarios` | Administración de usuarios. |
| `/api/pasajeros` | Gestión de pasajeros. |
| `/api/rutas` | Gestión de rutas. |
| `/api/terminales` | Gestión de terminales terrestres. |
| `/api/buses` | Gestión de buses. |
| `/api/conductores` | Gestión de conductores. |
| `/api/viajes` | Gestión de viajes. |
| `GET /api/publico/viajes` | Consulta pública de viajes. |
| `GET /api/publico/condiciones` | Condiciones del servicio vigentes. |
| `/api/cliente/mis-reclamaciones` | Reclamaciones del cliente autenticado. |
| `/api/reservas` | Gestión de reservas. |
| `/api/ventas` | Gestión de ventas. |
| `/api/pagos` | Gestión de pagos. |
| `/api/reclamaciones` | Gestión de reclamaciones. |
| `/api/reportes` | Información para reportes. |
| `GET /api/health` | Verificación del servicio. |

Los métodos HTTP disponibles y las reglas de autorización pueden variar según cada endpoint.

---

## 14. Validaciones y seguridad

Se han incorporado controles de seguridad y consistencia, entre ellos:

- Autenticación mediante JWT.
- Contraseñas protegidas con bcrypt.
- Control de acceso basado en roles.
- Validaciones de entrada con Zod.
- Consultas SQL parametrizadas.
- Transacciones para operaciones sensibles.
- Verificación de disponibilidad de asientos.
- Validación de estados de buses y conductores.
- Prevención de conflictos de horarios.
- Historial de cambios y auditoría.
- Validación de documentos DNI, CE y pasaporte en los módulos correspondientes.

Estos mecanismos forman parte de la implementación actual y deben complementarse con pruebas de seguridad e integración antes de un despliegue productivo.

---

## 15. Avance del desarrollo

### Funcionalidades implementadas

El desarrollo incluye la integración de:

- Vista en React y lógica de negocio en Express, con acceso a datos separado.
- Backend Express con SQL Server.
- Autenticación y roles.
- Gestión operativa y administrativa.
- Consultas públicas de viajes.
- Selección y control de asientos.
- Reservas y sus operaciones relacionadas.
- Ventas y pagos.
- Reclamaciones y políticas.
- Reportes, manifiestos y auditoría.
- Portal público con identidad visual de Vía SAC.

### Actividades pendientes

- Completar las pruebas funcionales integrales.
- Revisar el funcionamiento conjunto de los módulos.
- Verificar los escenarios de errores y permisos.
- Comprobar la integridad de datos después de operaciones encadenadas.
- Revisar la documentación técnica final.
- Preparar evidencias y sustentación del proyecto.

**El sistema se encuentra en desarrollo académico. No debe considerarse una aplicación certificada o lista para producción.**

---

## 16. Enlaces de entrega — Arquitectura de tres capas

### Repositorio general

https://github.com/giovannisucapuca-maker/SIGET-VIA

### Capa de presentación (vista)

https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/app/presentacion

### Capa de lógica de negocio

https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/app/negocio

### Capa de acceso a datos

https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/app/datos

- Conexión a SQL Server: https://github.com/giovannisucapuca-maker/SIGET-VIA/blob/main/app/datos/config/db.js
- Repositorios: https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/app/datos/repositorios

### Script del esquema de base de datos

https://github.com/giovannisucapuca-maker/SIGET-VIA/blob/main/database/01_esquema_sqlserver.sql

---

## 17. Consideraciones del proyecto

- SIGET-VÍA es un proyecto desarrollado con fines académicos.
- Transportes Vía S.A.C. es la empresa utilizada como referencia para el análisis y diseño.
- Las imágenes y elementos de identidad visual se utilizan como recursos de referencia académica, sin representar una publicación oficial de la empresa.
- Los datos utilizados en las pruebas no representan necesariamente operaciones reales.
- Los archivos `.env`, credenciales privadas y archivos personales deben mantenerse fuera del repositorio público.
- El sistema requiere SQL Server y la configuración correspondiente para funcionar.
- La estructura de la base de datos y los scripts deben mantenerse actualizados respecto al esquema utilizado por la aplicación.

---

## 18. Conclusión

SIGET-VÍA demuestra la integración funcional de las capas de presentación, lógica de negocio y acceso a datos mediante una aplicación web para la gestión del transporte interprovincial.

La capa de presentación está implementada con React y TypeScript; la capa de negocio utiliza Node.js y Express; y la persistencia de información se realiza mediante Microsoft SQL Server.

El proyecto incorpora módulos administrativos y de atención al cliente, así como operaciones de consulta, registro, actualización, reservas y gestión de información.

Las capas de presentación, lógica de negocio y acceso a datos están separadas en `app/presentacion`, `app/negocio` y `app/datos`, con dependencias en un solo sentido y pruebas que lo verifican. El proyecto sigue en proceso de validación final.

---

**Proyecto académico: SIGET-VÍA**  
**Curso: EFSRT 2 — Integración de las Capas de Datos, Negocio y Vista**  
**Institución: ZEGEL**