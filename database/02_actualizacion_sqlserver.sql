-- =====================================================
-- SIGET-VÍA — Actualización 02 (ejecutar UNA vez en SSMS antes
-- de iniciar la nueva versión; se puede repetir sin problema).
--
--  1. Tabla Terminal (terminales terrestres de embarque).
--  2. Ruta.TerminalOrigenID / Ruta.TerminalDestinoID (opcionales).
--  3. Conductor.FechaVencimientoLicencia (validación de licencia vigente).
-- =====================================================
USE [SIGET_VIA_DB];
GO

-- 1. Terminales terrestres --------------------------------
IF OBJECT_ID(N'dbo.Terminal', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Terminal (
        TerminalID    INT IDENTITY(1,1) NOT NULL,
        Nombre        NVARCHAR(120) NOT NULL,
        Ciudad        NVARCHAR(120) NOT NULL,
        Direccion     NVARCHAR(250) NOT NULL,
        Referencia    NVARCHAR(250) NULL,
        Telefono      VARCHAR(20)   NULL,
        Estado        VARCHAR(12)   NOT NULL
                      CONSTRAINT DF_Terminal_Estado DEFAULT ('ACTIVO'),
        FechaRegistro DATETIME2(0)  NOT NULL
                      CONSTRAINT DF_Terminal_FechaRegistro DEFAULT (SYSDATETIME()),
        CONSTRAINT PK_Terminal PRIMARY KEY (TerminalID),
        CONSTRAINT CK_Terminal_Estado CHECK (Estado IN ('ACTIVO', 'INACTIVO'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = N'UX_Terminal_Ciudad_Nombre'
                 AND object_id = OBJECT_ID(N'dbo.Terminal'))
    CREATE UNIQUE INDEX UX_Terminal_Ciudad_Nombre ON dbo.Terminal (Ciudad, Nombre);
GO

-- 2. Terminales en las rutas -------------------------------
IF COL_LENGTH(N'dbo.Ruta', N'TerminalOrigenID') IS NULL
    ALTER TABLE dbo.Ruta ADD TerminalOrigenID INT NULL;
GO
IF COL_LENGTH(N'dbo.Ruta', N'TerminalDestinoID') IS NULL
    ALTER TABLE dbo.Ruta ADD TerminalDestinoID INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Ruta_TerminalOrigen')
    ALTER TABLE dbo.Ruta ADD CONSTRAINT FK_Ruta_TerminalOrigen
        FOREIGN KEY (TerminalOrigenID) REFERENCES dbo.Terminal (TerminalID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Ruta_TerminalDestino')
    ALTER TABLE dbo.Ruta ADD CONSTRAINT FK_Ruta_TerminalDestino
        FOREIGN KEY (TerminalDestinoID) REFERENCES dbo.Terminal (TerminalID);
GO

-- 3. Vencimiento de licencia del conductor ------------------
IF COL_LENGTH(N'dbo.Conductor', N'FechaVencimientoLicencia') IS NULL
    ALTER TABLE dbo.Conductor ADD FechaVencimientoLicencia DATE NULL;
GO

PRINT 'SIGET-VÍA: actualización 02 aplicada correctamente.';
GO
