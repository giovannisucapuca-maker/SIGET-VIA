# Respaldo y restauración de la base de datos (RNF8)

## Generar un respaldo

Desde la carpeta del proyecto:

```powershell
npm run respaldo
```

El comando crea un archivo `SIGET_VIA_DB_AAAAMMDD_HHMMSS.bak` y lo verifica
(`RESTORE VERIFYONLY`). Se guarda en:

1. la carpeta indicada en `RESPALDO_DIR` dentro de `config/.env`, o
2. la carpeta de respaldos por defecto de SQL Server
   (normalmente `C:\Program Files\Microsoft SQL Server\MSSQLxx.SQLEXPRESS\MSSQL\Backup`).

> La carpeta debe existir y el servicio de SQL Server debe poder escribir en ella.

### Respaldo automático diario (opcional)

En el Programador de tareas de Windows, crea una tarea diaria con:

- Programa: `npm.cmd`
- Argumentos: `run respaldo`
- Iniciar en: la carpeta del proyecto (`...\SIGET VIA`)

## Restaurar un respaldo

1. Detén la API (`Ctrl + C` en la terminal de `npm run dev:api`).
2. En SQL Server Management Studio, abre una consulta nueva sobre `master` y ejecuta
   (cambia la ruta por la del archivo que quieres restaurar):

```sql
USE master;
ALTER DATABASE SIGET_VIA_DB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;

RESTORE DATABASE SIGET_VIA_DB
FROM DISK = N'C:\SIGET-respaldos\SIGET_VIA_DB_20261126_210000.bak'
WITH REPLACE, CHECKSUM;

ALTER DATABASE SIGET_VIA_DB SET MULTI_USER;
```

3. Vuelve a iniciar la API y revisa `http://localhost:4000/api/health`.
