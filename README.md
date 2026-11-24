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
- Integrar el frontend, backend y base de datos mediante una API REST.

---

## 4. Tecnologías utilizadas

### 4.1. Frontend — Capa de presentación

- React.
- TypeScript.
- Vite.
- HTML5.
- CSS3.
- React Router DOM.
- Lucide React.
- Fetch API.

Estas tecnologías permiten construir interfaces interactivas y consumir los servicios del backend.

### 4.2. Backend — Capa de lógica de negocio

- Node.js.
- Express.
- JavaScript con módulos ES.
- Zod para validaciones.
- JSON Web Token (JWT).
- bcrypt para el manejo seguro de contraseñas.
- Middlewares de autenticación y autorización.
- API REST.

El backend implementa validaciones, reglas operativas, control de permisos y procesamiento de solicitudes.

### 4.3. Base de datos — Capa de datos

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

SIGET-VÍA está desarrollado bajo un modelo de arquitectura de tres capas que integra la presentación de información, la lógica del negocio y la persistencia de datos.

### 5.1. Primera capa: presentación o vista

**Tecnologías:** React + Vite + TypeScript.

Esta capa se encarga de la interacción con el usuario y de presentar los datos recibidos del servidor.

Incluye formularios, tablas, buscadores, paneles administrativos y la interfaz pública de consulta de viajes.

**Directorio:**

`frontend/src/`

**Archivos representativos:**

- `App.tsx`
- `ViajesPublicos.tsx`
- `AsientosPublicos.tsx`
- `ClienteInicio.tsx`
- `MisReservas.tsx`
- `DashboardAdmin.tsx`
- `Viajes.tsx`
- `Reservas.tsx`
- `Ventas.tsx`
- `Pagos.tsx`

**Enlace:**

https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/frontend/src

### 5.2. Segunda capa: lógica de negocio

**Tecnologías:** Node.js + Express + JavaScript + Zod.

Esta capa recibe las solicitudes del frontend, valida la información, comprueba permisos y ejecuta las reglas del sistema.

Entre sus responsabilidades se encuentran:

- Autenticación y autorización de usuarios.
- Validación de documentos de identidad.
- Control de disponibilidad de buses y conductores.
- Validación de horarios de viajes.
- Control de disponibilidad de asientos.
- Prevención de reservas duplicadas.
- Cancelación y reprogramación de reservas.
- Validación de ventas y pagos.
- Gestión de reclamaciones.
- Registro de movimientos e historiales.

**Directorio:**

`backend/src/`

**Archivos representativos:**

- `server.js`
- `viajes.js`
- `reservas.js`
- `ventas.js`
- `pagos.js`
- `reclamaciones.js`
- `registro-clientes.js`
- `mis-reservas.js`
- `manifiestos.js`

**Enlace:**

https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/backend/src

### 5.3. Tercera capa: acceso a datos

**Tecnologías:** SQL Server + Transact-SQL.

Esta capa permite almacenar, consultar, actualizar y mantener la información del sistema.

Se utilizan consultas parametrizadas, transacciones y restricciones de integridad para proteger la consistencia de los datos.

**Archivos principales:**

- `backend/src/db.js`
- `database/01_esquema_sqlserver.sql`

**Enlaces:**

Conexión a la base de datos:

https://github.com/giovannisucapuca-maker/SIGET-VIA/blob/main/backend/src/db.js

Esquema SQL Server:

https://github.com/giovannisucapuca-maker/SIGET-VIA/blob/main/database/01_esquema_sqlserver.sql

**Observación técnica:** SIGET-VÍA presenta las tres capas a nivel funcional y de despliegue. Actualmente, algunas consultas SQL se encuentran dentro de los módulos del backend, por lo que la separación interna entre lógica de negocio y acceso a datos puede perfeccionarse mediante repositorios o servicios especializados.

### 5.4. Flujo de comunicación entre capas

```text
                USUARIO
                   |
                   v
       CAPA DE PRESENTACIÓN
        React + TypeScript
                   |
             HTTP / JSON
                   |
                   v
       CAPA DE LÓGICA DE NEGOCIO
          Node.js + Express
           Validaciones
          Reglas de negocio
          Autenticación JWT
                   |
             Consultas SQL
                   |
                   v
          CAPA DE DATOS
          SQL Server
          SIGET_VIA_DB
                   |
                   v
             RESULTADOS
                   |
                   v
              BACKEND
                   |
                   v
              FRONTEND
```

---

## 6. Módulos desarrollados

El sistema incluye los siguientes módulos:

| N.º | Módulo | Funcionalidades desarrolladas |
|---|---|---|
| 1 | Autenticación | Inicio de sesión, JWT y control de acceso por roles. |
| 2 | Usuarios | Registro, consulta, edición y activación o desactivación. |
| 3 | Pasajeros | Registro y administración de información personal. |
| 4 | Rutas | Registro y administración de rutas interprovinciales. |
| 5 | Buses | Gestión de unidades, capacidad, estados y distribución de asientos. |
| 6 | Conductores | Registro, consulta y administración de conductores. |
| 7 | Viajes | Programación de viajes y validación de disponibilidad. |
| 8 | Consulta pública | Búsqueda de viajes por origen, destino y fecha. |
| 9 | Asientos públicos | Visualización de asientos disponibles y ocupados por bus. |
| 10 | Reservas | Registro, consulta, edición, cancelación y reprogramación. |
| 11 | Ventas | Administración de ventas y sus estados. |
| 12 | Pagos | Gestión y control de pagos, incluidos escenarios de prueba. |
| 13 | Portal del cliente | Inicio del cliente y administración de su perfil. |
| 14 | Mis reservas | Consulta de reservas asociadas al cliente. |
| 15 | Políticas del servicio | Gestión de condiciones y registro de aceptaciones. |
| 16 | Reclamaciones | Registro público y gestión administrativa. |
| 17 | Auditoría | Consulta y registro de operaciones del sistema. |
| 18 | Reportes | Visualización de información operativa y administrativa. |
| 19 | Manifiestos | Consulta de información de pasajeros por viaje. |
| 20 | Dashboard | Indicadores administrativos obtenidos desde el backend. |

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
| `/panel` | Panel administrativo u operativo. |
| `/reclamaciones/publico` | Libro de reclamaciones. |

---

## 8. Roles y permisos

El sistema utiliza roles registrados en SQL Server para controlar el acceso a sus funcionalidades.

Los perfiles contemplados son:

- **ADMINISTRADOR:** gestión administrativa de los módulos autorizados.
- **OPERADOR:** acceso a las funciones operativas habilitadas.
- **VENTAS:** perfil contemplado en el diseño y sujeto a los permisos implementados.
- **CLIENTE:** consulta de viajes, reservas y funcionalidades personales.

El rol no es seleccionado durante el inicio de sesión, sino recuperado desde la información del usuario autenticado.

Los permisos se aplican mediante validaciones en el backend y restricciones de navegación en el frontend.

---

## 9. Base de datos

El sistema utiliza la base de datos:

`SIGET_VIA_DB`

En ella se gestionan entidades relacionadas con:

- Usuarios y roles.
- Pasajeros.
- Rutas.
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

### Script disponible

`database/01_esquema_sqlserver.sql`

**Importante:** Este archivo corresponde al esquema SQL versionado en el repositorio. No debe ejecutarse sobre una base existente sin revisar previamente su contenido y contar con un respaldo actualizado. El archivo de esquema inicial no constituye por sí solo un sistema completo de migraciones incrementales.

---

## 10. Estructura del repositorio

```text
SIGET-VIA/
|
|-- backend/
|   |-- src/
|   |   |-- server.js
|   |   |-- db.js
|   |   |-- buses.js
|   |   |-- conductores.js
|   |   |-- pasajeros.js
|   |   |-- rutas.js
|   |   |-- viajes.js
|   |   |-- viajes-publicos.js
|   |   |-- asientos-publicos.js
|   |   |-- reservas.js
|   |   |-- mis-reservas.js
|   |   |-- ventas.js
|   |   |-- pagos.js
|   |   |-- reclamaciones.js
|   |   |-- reportes.js
|   |   |-- manifiestos.js
|   |   |-- auditoria.js
|   |   |-- politicas.js
|   |   |-- perfil-cliente.js
|   |   |-- registro-clientes.js
|   |   |-- seed-admin.js
|   |
|   |-- .env.example
|   |-- package.json
|   |-- package-lock.json
|
|-- frontend/
|   |-- public/
|   |   |-- via-sac-logo.png
|   |   |-- via-sac-bus-portada.png
|   |   |-- via-sac-bus-servicios.png
|   |
|   |-- src/
|   |   |-- App.tsx
|   |   |-- ViajesPublicos.tsx
|   |   |-- ViajesPublicos.css
|   |   |-- AsientosPublicos.tsx
|   |   |-- ClienteInicio.tsx
|   |   |-- MisReservas.tsx
|   |   |-- DashboardAdmin.tsx
|   |   |-- Reservas.tsx
|   |   |-- Ventas.tsx
|   |   |-- Pagos.tsx
|   |   |-- Viajes.tsx
|   |   |-- Reportes.tsx
|   |   |-- Manifiestos.tsx
|   |   |-- main.tsx
|   |   |-- style.css
|   |
|   |-- .env.example
|   |-- index.html
|   |-- package.json
|   |-- package-lock.json
|
|-- database/
|   |-- 01_esquema_sqlserver.sql
|
|-- .gitignore
|-- README.md
```

*Se muestran los archivos principales. El repositorio contiene otros módulos y archivos auxiliares.*

---

## 11. Requisitos de ejecución

Para ejecutar el proyecto en un entorno local se necesita:

- Node.js 20 o superior, según las dependencias instaladas.
- npm.
- Microsoft SQL Server.
- SQL Server Management Studio.
- Visual Studio Code o un editor compatible.
- Git, opcional para clonar y actualizar el repositorio.

SQL Server debe estar configurado para aceptar las conexiones necesarias desde el backend.

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

### Paso 3. Configurar el backend

Abrir una terminal:

```powershell
cd backend
Copy-Item .env.example .env
npm install
```

Editar el archivo `.env` utilizando los parámetros definidos en `.env.example`.

Configurar las credenciales SQL Server y un `JWT_SECRET` seguro.

**No publicar `.env` ni credenciales reales en GitHub.**

Si se necesita crear una cuenta administrativa inicial en una base nueva y el script está configurado para ello:

```powershell
node src/seed-admin.js
```

Iniciar el backend:

```powershell
npm run dev
```

La API utiliza el puerto configurado en el entorno. En la configuración local empleada durante el desarrollo se utiliza:

```text
http://localhost:4000/api
```

Comprobar el endpoint:

```text
http://localhost:4000/api/health
```

### Paso 4. Configurar el frontend

Desde la carpeta principal del repositorio, abrir otra terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

En el archivo `.env`, configurar la dirección del backend según corresponda.

La aplicación normalmente se inicia en:

```text
http://localhost:5173
```

La pantalla inicial es la página pública de Vía SAC. Desde ella se puede acceder al buscador de pasajes, registro e inicio de sesión.

### Paso 5. Comprobar la compilación

Para verificar el frontend:

```powershell
npm run build
```

La compilación permite detectar errores de TypeScript y generación de archivos, pero no reemplaza las pruebas funcionales.

---

## 13. API REST

El backend expone endpoints HTTP para la integración con el frontend.

Entre las rutas desarrolladas se encuentran:

| Endpoint | Funcionalidad |
|---|---|
| `POST /api/auth/login` | Autenticación. |
| `GET /api/auth/me` | Consultar la sesión autenticada. |
| `GET /api/roles` | Consultar roles. |
| `/api/usuarios` | Administración de usuarios. |
| `/api/pasajeros` | Gestión de pasajeros. |
| `/api/rutas` | Gestión de rutas. |
| `/api/buses` | Gestión de buses. |
| `/api/conductores` | Gestión de conductores. |
| `/api/viajes` | Gestión de viajes. |
| `GET /api/publico/viajes` | Consulta pública de viajes. |
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

- Frontend React con backend Express.
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
- Reforzar la separación interna entre negocio y acceso a datos.
- Revisar la documentación técnica final.
- Preparar evidencias y sustentación del proyecto.

**El sistema se encuentra en desarrollo académico. No debe considerarse una aplicación certificada o lista para producción.**

---

## 16. Enlaces de entrega — Arquitectura de tres capas

Los siguientes enlaces permiten identificar el código fuente correspondiente a cada parte del sistema.

### Repositorio general

https://github.com/giovannisucapuca-maker/SIGET-VIA

### Directorio de vista

https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/frontend/src

### Directorio de lógica de negocio

https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/backend/src

### Archivo de conexión y acceso a datos

https://github.com/giovannisucapuca-maker/SIGET-VIA/blob/main/backend/src/db.js

### Archivos de configuración

https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/backend

https://github.com/giovannisucapuca-maker/SIGET-VIA/tree/main/frontend

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

El avance representa una aplicación académica integrada, en proceso de validación final y mejora de su organización interna.

---

**Proyecto académico: SIGET-VÍA**  
**Curso: EFSRT 2 — Integración de las Capas de Datos, Negocio y Vista**  
**Institución: ZEGEL**