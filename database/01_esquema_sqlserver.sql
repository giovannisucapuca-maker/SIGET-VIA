-- SIGET-VÍA: conversión inicial del esquema siget_via_db (.mwb MySQL) a SQL Server
-- Base NUEVA: ejecutar en SQL Server Management Studio.
IF DB_ID(N'SIGET_VIA_DB') IS NULL CREATE DATABASE [SIGET_VIA_DB];
GO
USE [SIGET_VIA_DB];
GO
IF OBJECT_ID(N'dbo.asiento', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[asiento] (
    [AsientoID] INT IDENTITY(1,1) NOT NULL,
    [BusID] INT NOT NULL,
    [Numero] SMALLINT NOT NULL,
    [Nivel] TINYINT NOT NULL,
    CONSTRAINT [PK_asiento] PRIMARY KEY ([AsientoID])
);
END;
GO
IF OBJECT_ID(N'dbo.auditoria', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[auditoria] (
    [AuditoriaID] BIGINT IDENTITY(1,1) NOT NULL,
    [UsuarioID] BIGINT NULL,
    [Entidad] NVARCHAR(70) NOT NULL,
    [RegistroID] BIGINT NULL,
    [Accion] NVARCHAR(20) NOT NULL,
    [Detalle] NVARCHAR(1000) NULL,
    [Fecha] DATETIME2(0) NOT NULL,
    CONSTRAINT [PK_auditoria] PRIMARY KEY ([AuditoriaID])
);
END;
GO
IF OBJECT_ID(N'dbo.bus', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[bus] (
    [BusID] INT IDENTITY(1,1) NOT NULL,
    [Placa] NVARCHAR(12) NOT NULL,
    [Modelo] NVARCHAR(100) NOT NULL,
    [Capacidad] SMALLINT NOT NULL,
    [Estado] NVARCHAR(20) NOT NULL,
    CONSTRAINT [PK_bus] PRIMARY KEY ([BusID])
);
END;
GO
IF OBJECT_ID(N'dbo.conductor', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[conductor] (
    [ConductorID] INT IDENTITY(1,1) NOT NULL,
    [TipoDocumento] NVARCHAR(12) NOT NULL,
    [NumeroDocumento] NVARCHAR(20) NOT NULL,
    [Nombres] NVARCHAR(100) NOT NULL,
    [Apellidos] NVARCHAR(120) NOT NULL,
    [NumeroLicencia] NVARCHAR(30) NOT NULL,
    [Estado] NVARCHAR(12) NOT NULL,
    CONSTRAINT [PK_conductor] PRIMARY KEY ([ConductorID])
);
END;
GO
IF OBJECT_ID(N'dbo.historialreclamacion', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[historialreclamacion] (
    [HistorialID] BIGINT IDENTITY(1,1) NOT NULL,
    [ReclamacionID] BIGINT NOT NULL,
    [ResponsableID] BIGINT NULL,
    [EstadoAnterior] NVARCHAR(15) NULL,
    [EstadoNuevo] NVARCHAR(15) NOT NULL,
    [Observacion] NVARCHAR(500) NULL,
    [FechaCambio] DATETIME2(0) NOT NULL,
    CONSTRAINT [PK_historialreclamacion] PRIMARY KEY ([HistorialID])
);
END;
GO
IF OBJECT_ID(N'dbo.historialreserva', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[historialreserva] (
    [HistorialReservaID] BIGINT IDENTITY(1,1) NOT NULL,
    [ReservaID] BIGINT NOT NULL,
    [UsuarioResponsableID] BIGINT NOT NULL,
    [Accion] NVARCHAR(15) NOT NULL,
    [ViajeAnteriorID] BIGINT NULL,
    [ViajeNuevoID] BIGINT NULL,
    [Detalle] NVARCHAR(500) NULL,
    [FechaCambio] DATETIME2(0) NOT NULL,
    CONSTRAINT [PK_historialreserva] PRIMARY KEY ([HistorialReservaID])
);
END;
GO
IF OBJECT_ID(N'dbo.pago', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[pago] (
    [PagoID] BIGINT IDENTITY(1,1) NOT NULL,
    [VentaID] BIGINT NOT NULL,
    [Metodo] NVARCHAR(20) NOT NULL,
    [ReferenciaSimulada] NVARCHAR(80) NULL,
    [Monto] DECIMAL(12,2) NOT NULL,
    [FechaPago] DATETIME2(0) NOT NULL,
    [Estado] NVARCHAR(12) NOT NULL,
    [EsSimulado] TINYINT NOT NULL,
    CONSTRAINT [PK_pago] PRIMARY KEY ([PagoID])
);
END;
GO
IF OBJECT_ID(N'dbo.pasajero', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[pasajero] (
    [PasajeroID] BIGINT IDENTITY(1,1) NOT NULL,
    [UsuarioID] BIGINT NULL,
    [TipoDocumento] NVARCHAR(12) NOT NULL,
    [NumeroDocumento] NVARCHAR(20) NOT NULL,
    [Nombres] NVARCHAR(100) NOT NULL,
    [Apellidos] NVARCHAR(120) NOT NULL,
    [FechaNacimiento] DATE NULL,
    [Telefono] NVARCHAR(20) NULL,
    [Estado] NVARCHAR(12) NOT NULL,
    CONSTRAINT [PK_pasajero] PRIMARY KEY ([PasajeroID])
);
END;
GO
IF OBJECT_ID(N'dbo.politicaservicio', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[politicaservicio] (
    [PoliticaID] INT IDENTITY(1,1) NOT NULL,
    [Tipo] NVARCHAR(25) NOT NULL,
    [Titulo] NVARCHAR(150) NOT NULL,
    [Contenido] NVARCHAR(MAX) NOT NULL,
    [Version] NVARCHAR(20) NOT NULL,
    [VigenteDesde] DATE NOT NULL,
    [VigenteHasta] DATE NULL,
    [Activa] TINYINT NOT NULL,
    CONSTRAINT [PK_politicaservicio] PRIMARY KEY ([PoliticaID])
);
END;
GO
IF OBJECT_ID(N'dbo.reclamacion', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[reclamacion] (
    [ReclamacionID] BIGINT IDENTITY(1,1) NOT NULL,
    [NumeroCorrelativo] NVARCHAR(20) NULL,
    [UsuarioID] BIGINT NULL,
    [ReservaID] BIGINT NULL,
    [TipoDocumento] NVARCHAR(12) NOT NULL,
    [NumeroDocumento] NVARCHAR(20) NOT NULL,
    [NombreReclamante] NVARCHAR(220) NOT NULL,
    [CorreoReclamante] NVARCHAR(254) NOT NULL,
    [TelefonoReclamante] NVARCHAR(20) NULL,
    [TipoSolicitud] NVARCHAR(10) NOT NULL,
    [Descripcion] NVARCHAR(MAX) NOT NULL,
    [Pedido] NVARCHAR(MAX) NOT NULL,
    [FechaRegistro] DATETIME2(0) NOT NULL,
    [Estado] NVARCHAR(15) NOT NULL,
    CONSTRAINT [PK_reclamacion] PRIMARY KEY ([ReclamacionID])
);
END;
GO
IF OBJECT_ID(N'dbo.reserva', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[reserva] (
    [ReservaID] BIGINT IDENTITY(1,1) NOT NULL,
    [Codigo] NVARCHAR(20) NULL,
    [UsuarioID] BIGINT NOT NULL,
    [ViajeID] BIGINT NOT NULL,
    [FechaReserva] DATETIME2(0) NOT NULL,
    [Estado] NVARCHAR(15) NOT NULL,
    [Total] DECIMAL(12,2) NOT NULL,
    [PoliticaID] INT NULL,
    CONSTRAINT [PK_reserva] PRIMARY KEY ([ReservaID])
);
END;
GO
IF OBJECT_ID(N'dbo.reservaasiento', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[reservaasiento] (
    [ReservaAsientoID] BIGINT IDENTITY(1,1) NOT NULL,
    [ReservaID] BIGINT NOT NULL,
    [ViajeID] BIGINT NOT NULL,
    [BusID] INT NOT NULL,
    [AsientoID] INT NOT NULL,
    [PasajeroID] BIGINT NOT NULL,
    [Precio] DECIMAL(12,2) NOT NULL,
    [Estado] NVARCHAR(10) NOT NULL,
    [AsientoActivoID] INT NULL,
    CONSTRAINT [PK_reservaasiento] PRIMARY KEY ([ReservaAsientoID])
);
END;
GO
IF OBJECT_ID(N'dbo.respuestareclamacion', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[respuestareclamacion] (
    [RespuestaID] BIGINT IDENTITY(1,1) NOT NULL,
    [ReclamacionID] BIGINT NOT NULL,
    [ResponsableID] BIGINT NOT NULL,
    [Contenido] NVARCHAR(MAX) NOT NULL,
    [FechaRespuesta] DATETIME2(0) NOT NULL,
    CONSTRAINT [PK_respuestareclamacion] PRIMARY KEY ([RespuestaID])
);
END;
GO
IF OBJECT_ID(N'dbo.rol', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[rol] (
    [RolID] INT IDENTITY(1,1) NOT NULL,
    [Nombre] NVARCHAR(30) NOT NULL,
    [Descripcion] NVARCHAR(250) NULL,
    CONSTRAINT [PK_rol] PRIMARY KEY ([RolID])
);
END;
GO
IF OBJECT_ID(N'dbo.ruta', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[ruta] (
    [RutaID] INT IDENTITY(1,1) NOT NULL,
    [Origen] NVARCHAR(120) NOT NULL,
    [Destino] NVARCHAR(120) NOT NULL,
    [DistanciaKm] DECIMAL(12,2) NULL,
    [Estado] NVARCHAR(12) NOT NULL,
    CONSTRAINT [PK_ruta] PRIMARY KEY ([RutaID])
);
END;
GO
IF OBJECT_ID(N'dbo.usuario', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[usuario] (
    [UsuarioID] BIGINT IDENTITY(1,1) NOT NULL,
    [RolID] INT NOT NULL,
    [Nombres] NVARCHAR(100) NOT NULL,
    [Apellidos] NVARCHAR(120) NOT NULL,
    [Correo] NVARCHAR(254) NOT NULL,
    [ContrasenaHash] NVARCHAR(255) NOT NULL,
    [Telefono] NVARCHAR(20) NULL,
    [Estado] NVARCHAR(12) NOT NULL,
    [FechaRegistro] DATETIME2(0) NOT NULL,
    CONSTRAINT [PK_usuario] PRIMARY KEY ([UsuarioID])
);
END;
GO
IF OBJECT_ID(N'dbo.venta', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[venta] (
    [VentaID] BIGINT IDENTITY(1,1) NOT NULL,
    [ReservaID] BIGINT NOT NULL,
    [VendedorID] BIGINT NOT NULL,
    [FechaVenta] DATETIME2(0) NOT NULL,
    [Total] DECIMAL(12,2) NOT NULL,
    [Estado] NVARCHAR(12) NOT NULL,
    [CodigoComprobante] NVARCHAR(20) NULL,
    CONSTRAINT [PK_venta] PRIMARY KEY ([VentaID])
);
END;
GO
IF OBJECT_ID(N'dbo.viaje', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[viaje] (
    [ViajeID] BIGINT IDENTITY(1,1) NOT NULL,
    [RutaID] INT NOT NULL,
    [BusID] INT NOT NULL,
    [ConductorID] INT NOT NULL,
    [Salida] DATETIME2(0) NOT NULL,
    [LlegadaEstimada] DATETIME2(0) NOT NULL,
    [Tarifa] DECIMAL(12,2) NOT NULL,
    [Estado] NVARCHAR(15) NOT NULL,
    CONSTRAINT [PK_viaje] PRIMARY KEY ([ViajeID])
);
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_asiento_BusID')
ALTER TABLE dbo.[asiento] ADD CONSTRAINT [FK_asiento_BusID] FOREIGN KEY ([BusID]) REFERENCES dbo.[bus]([BusID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_auditoria_UsuarioID')
ALTER TABLE dbo.[auditoria] ADD CONSTRAINT [FK_auditoria_UsuarioID] FOREIGN KEY ([UsuarioID]) REFERENCES dbo.[usuario]([UsuarioID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_historialreclamacion_ReclamacionID')
ALTER TABLE dbo.[historialreclamacion] ADD CONSTRAINT [FK_historialreclamacion_ReclamacionID] FOREIGN KEY ([ReclamacionID]) REFERENCES dbo.[reclamacion]([ReclamacionID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_historialreclamacion_ResponsableID')
ALTER TABLE dbo.[historialreclamacion] ADD CONSTRAINT [FK_historialreclamacion_ResponsableID] FOREIGN KEY ([ResponsableID]) REFERENCES dbo.[usuario]([UsuarioID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_historialreserva_ReservaID')
ALTER TABLE dbo.[historialreserva] ADD CONSTRAINT [FK_historialreserva_ReservaID] FOREIGN KEY ([ReservaID]) REFERENCES dbo.[reserva]([ReservaID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_historialreserva_UsuarioResponsableID')
ALTER TABLE dbo.[historialreserva] ADD CONSTRAINT [FK_historialreserva_UsuarioResponsableID] FOREIGN KEY ([UsuarioResponsableID]) REFERENCES dbo.[usuario]([UsuarioID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_historialreserva_ViajeAnteriorID')
ALTER TABLE dbo.[historialreserva] ADD CONSTRAINT [FK_historialreserva_ViajeAnteriorID] FOREIGN KEY ([ViajeAnteriorID]) REFERENCES dbo.[viaje]([ViajeID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_historialreserva_ViajeNuevoID')
ALTER TABLE dbo.[historialreserva] ADD CONSTRAINT [FK_historialreserva_ViajeNuevoID] FOREIGN KEY ([ViajeNuevoID]) REFERENCES dbo.[viaje]([ViajeID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_pago_VentaID')
ALTER TABLE dbo.[pago] ADD CONSTRAINT [FK_pago_VentaID] FOREIGN KEY ([VentaID]) REFERENCES dbo.[venta]([VentaID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_pasajero_UsuarioID')
ALTER TABLE dbo.[pasajero] ADD CONSTRAINT [FK_pasajero_UsuarioID] FOREIGN KEY ([UsuarioID]) REFERENCES dbo.[usuario]([UsuarioID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reclamacion_UsuarioID')
ALTER TABLE dbo.[reclamacion] ADD CONSTRAINT [FK_reclamacion_UsuarioID] FOREIGN KEY ([UsuarioID]) REFERENCES dbo.[usuario]([UsuarioID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reclamacion_ReservaID')
ALTER TABLE dbo.[reclamacion] ADD CONSTRAINT [FK_reclamacion_ReservaID] FOREIGN KEY ([ReservaID]) REFERENCES dbo.[reserva]([ReservaID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reserva_UsuarioID')
ALTER TABLE dbo.[reserva] ADD CONSTRAINT [FK_reserva_UsuarioID] FOREIGN KEY ([UsuarioID]) REFERENCES dbo.[usuario]([UsuarioID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reserva_ViajeID')
ALTER TABLE dbo.[reserva] ADD CONSTRAINT [FK_reserva_ViajeID] FOREIGN KEY ([ViajeID]) REFERENCES dbo.[viaje]([ViajeID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reserva_PoliticaID')
ALTER TABLE dbo.[reserva] ADD CONSTRAINT [FK_reserva_PoliticaID] FOREIGN KEY ([PoliticaID]) REFERENCES dbo.[politicaservicio]([PoliticaID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reservaasiento_ReservaID')
ALTER TABLE dbo.[reservaasiento] ADD CONSTRAINT [FK_reservaasiento_ReservaID] FOREIGN KEY ([ReservaID]) REFERENCES dbo.[reserva]([ReservaID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reservaasiento_ViajeID')
ALTER TABLE dbo.[reservaasiento] ADD CONSTRAINT [FK_reservaasiento_ViajeID] FOREIGN KEY ([ViajeID]) REFERENCES dbo.[viaje]([ViajeID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reservaasiento_BusID')
ALTER TABLE dbo.[reservaasiento] ADD CONSTRAINT [FK_reservaasiento_BusID] FOREIGN KEY ([BusID]) REFERENCES dbo.[bus]([BusID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reservaasiento_AsientoID')
ALTER TABLE dbo.[reservaasiento] ADD CONSTRAINT [FK_reservaasiento_AsientoID] FOREIGN KEY ([AsientoID]) REFERENCES dbo.[asiento]([AsientoID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_reservaasiento_PasajeroID')
ALTER TABLE dbo.[reservaasiento] ADD CONSTRAINT [FK_reservaasiento_PasajeroID] FOREIGN KEY ([PasajeroID]) REFERENCES dbo.[pasajero]([PasajeroID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_respuestareclamacion_ReclamacionID')
ALTER TABLE dbo.[respuestareclamacion] ADD CONSTRAINT [FK_respuestareclamacion_ReclamacionID] FOREIGN KEY ([ReclamacionID]) REFERENCES dbo.[reclamacion]([ReclamacionID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_respuestareclamacion_ResponsableID')
ALTER TABLE dbo.[respuestareclamacion] ADD CONSTRAINT [FK_respuestareclamacion_ResponsableID] FOREIGN KEY ([ResponsableID]) REFERENCES dbo.[usuario]([UsuarioID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_usuario_RolID')
ALTER TABLE dbo.[usuario] ADD CONSTRAINT [FK_usuario_RolID] FOREIGN KEY ([RolID]) REFERENCES dbo.[rol]([RolID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_venta_ReservaID')
ALTER TABLE dbo.[venta] ADD CONSTRAINT [FK_venta_ReservaID] FOREIGN KEY ([ReservaID]) REFERENCES dbo.[reserva]([ReservaID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_venta_VendedorID')
ALTER TABLE dbo.[venta] ADD CONSTRAINT [FK_venta_VendedorID] FOREIGN KEY ([VendedorID]) REFERENCES dbo.[usuario]([UsuarioID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_viaje_RutaID')
ALTER TABLE dbo.[viaje] ADD CONSTRAINT [FK_viaje_RutaID] FOREIGN KEY ([RutaID]) REFERENCES dbo.[ruta]([RutaID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_viaje_BusID')
ALTER TABLE dbo.[viaje] ADD CONSTRAINT [FK_viaje_BusID] FOREIGN KEY ([BusID]) REFERENCES dbo.[bus]([BusID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_viaje_ConductorID')
ALTER TABLE dbo.[viaje] ADD CONSTRAINT [FK_viaje_ConductorID] FOREIGN KEY ([ConductorID]) REFERENCES dbo.[conductor]([ConductorID]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_usuario_Correo' AND object_id=OBJECT_ID(N'dbo.usuario'))
CREATE UNIQUE INDEX [UQ_usuario_Correo] ON dbo.[usuario]([Correo]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_rol_Nombre' AND object_id=OBJECT_ID(N'dbo.rol'))
CREATE UNIQUE INDEX [UQ_rol_Nombre] ON dbo.[rol]([Nombre]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_pasajero_Documento' AND object_id=OBJECT_ID(N'dbo.pasajero'))
CREATE INDEX [IX_pasajero_Documento] ON dbo.[pasajero]([NumeroDocumento]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_bus_Placa' AND object_id=OBJECT_ID(N'dbo.bus'))
CREATE UNIQUE INDEX [UQ_bus_Placa] ON dbo.[bus]([Placa]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_conductor_Licencia' AND object_id=OBJECT_ID(N'dbo.conductor'))
CREATE UNIQUE INDEX [UQ_conductor_Licencia] ON dbo.[conductor]([NumeroLicencia]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_reclamacion_Numero' AND object_id=OBJECT_ID(N'dbo.reclamacion'))
CREATE UNIQUE INDEX [UQ_reclamacion_Numero] ON dbo.[reclamacion]([NumeroCorrelativo]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_reserva_Codigo' AND object_id=OBJECT_ID(N'dbo.reserva'))
CREATE UNIQUE INDEX [UQ_reserva_Codigo] ON dbo.[reserva]([Codigo]);
GO
-- Solo un asiento activo por viaje (SQL Server: índice único filtrado).
-- El campo AsientoActivoID del modelo fuente se preserva para compatibilidad.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_reservaasiento_Viaje_Asiento_Activo' AND object_id=OBJECT_ID(N'dbo.reservaasiento'))
CREATE UNIQUE INDEX [UX_reservaasiento_Viaje_Asiento_Activo] ON dbo.[reservaasiento]([ViajeID],[AsientoID]) WHERE [Estado] = N'ACTIVO';
GO
INSERT INTO dbo.rol (Nombre,Descripcion)
SELECT v.Nombre,v.Descripcion FROM (VALUES
(N'ADMINISTRADOR',N'Administración completa'),
(N'VENTAS',N'Personal de ventas'),
(N'OPERADOR',N'Operador de transporte'),
(N'CLIENTE',N'Cliente del sistema')
) v(Nombre,Descripcion) WHERE NOT EXISTS(SELECT 1 FROM dbo.rol r WHERE r.Nombre=v.Nombre);
GO



SELECT
    @@SERVERNAME AS NombreServidor,
    DB_NAME() AS BaseDatosActual,
    SYSTEM_USER AS UsuarioConexion;


USE SIGET_VIA_DB;
GO

SELECT
    TABLE_NAME AS Tabla,
    COLUMN_NAME AS Columna,
    DATA_TYPE AS TipoDato,
    CHARACTER_MAXIMUM_LENGTH AS Longitud,
    IS_NULLABLE AS PermiteNulos
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME IN ('Usuario', 'Rol')
ORDER BY TABLE_NAME, ORDINAL_POSITION;





USE SIGET_VIA_DB;
GO

-- Verificar los roles existentes
SELECT
    RolID,
    Nombre,
    Descripcion
FROM dbo.Rol
ORDER BY RolID;

-- Verificar los usuarios registrados
-- Sin mostrar contraseñas ni hashes
SELECT
    u.UsuarioID,
    u.Nombres,
    u.Apellidos,
    u.Correo,
    r.Nombre AS Rol,
    u.Estado,
    u.FechaRegistro
FROM dbo.Usuario AS u
INNER JOIN dbo.Rol AS r
    ON u.RolID = r.RolID
ORDER BY u.UsuarioID;



USE SIGET_VIA_DB;
GO

SELECT
    u.UsuarioID,
    u.Nombres,
    u.Apellidos,
    u.Correo,
    r.Nombre AS Rol,
    u.Estado
FROM dbo.Usuario AS u
INNER JOIN dbo.Rol AS r
    ON u.RolID = r.RolID
WHERE r.Nombre = 'ADMINISTRADOR';


USE SIGET_VIA_DB;
GO

SELECT
    u.UsuarioID,
    u.Nombres,
    u.Apellidos,
    u.Correo,
    r.Nombre AS Rol,
    u.Estado,
    u.FechaRegistro
FROM dbo.Usuario AS u
INNER JOIN dbo.Rol AS r
    ON u.RolID = r.RolID
WHERE r.Nombre = 'ADMINISTRADOR';



USE SIGET_VIA_DB;
GO

SELECT
    COLUMN_NAME AS Columna,
    DATA_TYPE AS TipoDato,
    CHARACTER_MAXIMUM_LENGTH AS Longitud,
    IS_NULLABLE AS PermiteNulos
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'Pasajero'
ORDER BY ORDINAL_POSITION;


USE SIGET_VIA_DB;
GO

SELECT
    COLUMN_NAME AS Columna,
    DATA_TYPE AS TipoDato,
    CHARACTER_MAXIMUM_LENGTH AS Longitud,
    IS_NULLABLE AS PermiteNulos
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'Ruta'
ORDER BY ORDINAL_POSITION;



USE SIGET_VIA_DB;
GO

SELECT
    COLUMN_NAME AS Columna,
    DATA_TYPE AS TipoDato,
    CHARACTER_MAXIMUM_LENGTH AS Longitud,
    IS_NULLABLE AS PermiteNulos
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'Bus'
ORDER BY ORDINAL_POSITION;



USE SIGET_VIA_DB;
GO

SELECT
    COLUMN_NAME AS Columna,
    DATA_TYPE AS TipoDato,
    CHARACTER_MAXIMUM_LENGTH AS Longitud,
    IS_NULLABLE AS PermiteNulos
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'Conductor'
ORDER BY ORDINAL_POSITION;



USE SIGET_VIA_DB;
GO

SELECT
    COLUMN_NAME AS Columna,
    DATA_TYPE AS TipoDato,
    CHARACTER_MAXIMUM_LENGTH AS Longitud,
    IS_NULLABLE AS PermiteNulos
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'Viaje'
ORDER BY ORDINAL_POSITION;



USE SIGET_VIA_DB;
GO

-- 1. Precisión de la tarifa
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    NUMERIC_PRECISION,
    NUMERIC_SCALE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'Viaje'
  AND COLUMN_NAME = 'Tarifa';

-- 2. Restricciones de la tabla
SELECT
    cc.name AS Restriccion,
    cc.definition AS Condicion
FROM sys.check_constraints cc
WHERE cc.parent_object_id = OBJECT_ID('dbo.Viaje');

-- 3. Estados que ya existen
SELECT DISTINCT Estado
FROM dbo.Viaje
ORDER BY Estado;

-- 4. Relaciones de la tabla
SELECT
    fk.name AS Relacion,
    OBJECT_NAME(fkc.referenced_object_id) AS TablaRelacionada
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc
    ON fk.object_id = fkc.constraint_object_id
WHERE fk.parent_object_id = OBJECT_ID('dbo.Viaje');






USE SIGET_VIA_DB;
GO

SELECT
    name AS Restriccion,
    definition AS CondicionCompleta
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('dbo.Viaje')
  AND name = 'CK_Viaje_Estado';




  USE SIGET_VIA_DB;
GO

SELECT
    TABLE_NAME AS Tabla,
    ORDINAL_POSITION AS Orden,
    COLUMN_NAME AS Columna,
    DATA_TYPE AS TipoDato,
    CHARACTER_MAXIMUM_LENGTH AS Longitud,
    NUMERIC_PRECISION AS Precision,
    NUMERIC_SCALE AS Escala,
    IS_NULLABLE AS PermiteNulos
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME IN (
      'Reserva',
      'ReservaAsiento',
      'Asiento'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;


USE SIGET_VIA_DB;
GO

-- 1. Restricciones CHECK de las tres tablas
SELECT
    OBJECT_NAME(parent_object_id) AS Tabla,
    name AS Restriccion,
    definition AS Condicion
FROM sys.check_constraints
WHERE parent_object_id IN (
    OBJECT_ID('dbo.Reserva'),
    OBJECT_ID('dbo.ReservaAsiento'),
    OBJECT_ID('dbo.Asiento')
)
ORDER BY Tabla, Restriccion;

-- 2. Relaciones de claves foráneas
SELECT
    fk.name AS Relacion,
    OBJECT_NAME(fk.parent_object_id) AS Tabla,
    COL_NAME(
        fkc.parent_object_id,
        fkc.parent_column_id
    ) AS Columna,
    OBJECT_NAME(
        fkc.referenced_object_id
    ) AS TablaRelacionada,
    COL_NAME(
        fkc.referenced_object_id,
        fkc.referenced_column_id
    ) AS ColumnaRelacionada
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc
    ON fk.object_id = fkc.constraint_object_id
WHERE fk.parent_object_id IN (
    OBJECT_ID('dbo.Reserva'),
    OBJECT_ID('dbo.ReservaAsiento'),
    OBJECT_ID('dbo.Asiento')
)
ORDER BY Tabla, Relacion;

-- 3. Índices únicos existentes
SELECT
    OBJECT_NAME(i.object_id) AS Tabla,
    i.name AS Indice,
    STRING_AGG(
        CAST(c.name AS nvarchar(max)), ', '
    ) WITHIN GROUP (
        ORDER BY ic.key_ordinal
    ) AS Columnas
FROM sys.indexes i
JOIN sys.index_columns ic
    ON ic.object_id = i.object_id
    AND ic.index_id = i.index_id
JOIN sys.columns c
    ON c.object_id = ic.object_id
    AND c.column_id = ic.column_id
WHERE i.is_unique = 1
  AND ic.key_ordinal > 0
  AND i.object_id IN (
      OBJECT_ID('dbo.Reserva'),
      OBJECT_ID('dbo.ReservaAsiento'),
      OBJECT_ID('dbo.Asiento')
  )
GROUP BY i.object_id, i.name
ORDER BY Tabla, Indice;




USE SIGET_VIA_DB;
GO

-- 1. Estados completos de Reserva
SELECT
    name AS Restriccion,
    definition AS CondicionCompleta
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('dbo.Reserva');

-- 2. Filtros de índices únicos
SELECT
    OBJECT_NAME(object_id) AS Tabla,
    name AS NombreIndice,
    is_unique AS EsUnico,
    has_filter AS TieneFiltro,
    filter_definition AS FiltroCompleto
FROM sys.indexes
WHERE object_id IN (
    OBJECT_ID('dbo.Reserva'),
    OBJECT_ID('dbo.ReservaAsiento'),
    OBJECT_ID('dbo.Asiento')
)
AND is_unique = 1;

-- 3. Identidades de las tablas
SELECT
    OBJECT_NAME(object_id) AS Tabla,
    name AS ColumnaIdentidad,
    seed_value AS ValorInicial,
    increment_value AS Incremento
FROM sys.identity_columns
WHERE object_id IN (
    OBJECT_ID('dbo.Reserva'),
    OBJECT_ID('dbo.ReservaAsiento'),
    OBJECT_ID('dbo.Asiento')
);



USE SIGET_VIA_DB;
GO

-- 1. Viajes disponibles
SELECT
    ViajeID,
    RutaID,
    BusID,
    ConductorID,
    Salida,
    LlegadaEstimada,
    Tarifa,
    Estado
FROM dbo.Viaje
ORDER BY ViajeID DESC;

-- 2. Buses registrados
SELECT
    BusID,
    Placa,
    Modelo,
    Capacidad,
    Estado
FROM dbo.Bus
ORDER BY BusID;

-- 3. Asientos registrados por bus y nivel
SELECT
    b.BusID,
    b.Placa,
    a.Nivel,
    COUNT(a.AsientoID) AS CantidadAsientos
FROM dbo.Bus b
LEFT JOIN dbo.Asiento a
    ON a.BusID = b.BusID
GROUP BY
    b.BusID,
    b.Placa,
    a.Nivel
ORDER BY
    b.BusID,
    a.Nivel;

-- 4. Pasajeros registrados
SELECT
    PasajeroID,
    TipoDocumento,
    NumeroDocumento,
    Nombres,
    Apellidos,
    Estado
FROM dbo.Pasajero
ORDER BY PasajeroID DESC;


USE SIGET_VIA_DB;
GO

-- Restricciones CHECK
SELECT
    OBJECT_NAME(parent_object_id) AS Tabla,
    name AS Restriccion,
    definition AS Condicion
FROM sys.check_constraints
WHERE parent_object_id IN (
    OBJECT_ID('dbo.Bus'),
    OBJECT_ID('dbo.Asiento')
);

-- Relaciones de claves foráneas
SELECT
    fk.name AS Restriccion,
    OBJECT_NAME(fk.parent_object_id) AS Tabla,
    COL_NAME(
        fkc.parent_object_id,
        fkc.parent_column_id
    ) AS Columna,
    OBJECT_NAME(
        fkc.referenced_object_id
    ) AS TablaRelacionada
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc
    ON fk.object_id = fkc.constraint_object_id
WHERE fk.parent_object_id IN (
    OBJECT_ID('dbo.Bus'),
    OBJECT_ID('dbo.Asiento')
);