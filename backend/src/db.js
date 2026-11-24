
import sql from 'mssql/msnodesqlv8.js';
import 'dotenv/config';

let poolPromise = null;

export async function getPool() {
  if (!poolPromise) {
    const server = process.env.DB_SERVER;
    const database = process.env.DB_DATABASE;

    if (!server || !database) {
      throw new Error(
        'Faltan DB_SERVER o DB_DATABASE en el archivo .env'
      );
    }

    const connectionString = [
      'Driver={ODBC Driver 17 for SQL Server}',
      `Server=${server}`,
      `Database=${database}`,
      'Trusted_Connection=Yes'
    ].join(';') + ';';

    const config = {
      server,
      database,
      connectionString,
      options: {
        trustedConnection: true
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };

    const connectionPool = new sql.ConnectionPool(config);

    poolPromise = connectionPool.connect().catch((error) => {
      poolPromise = null;
      console.error('Error de conexión SQL Server:', error);
      throw error;
    });
  }

  return poolPromise;
}

export { sql };
