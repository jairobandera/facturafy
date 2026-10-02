// Pool de conexiones MySQL usando mysql2/promise.
import mysql from 'mysql2/promise';
import { config } from './env.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  dateStrings: true, // devuelve DATE/DATETIME como string, evita desfasajes de zona horaria
});

/**
 * Ejecuta una consulta y devuelve las filas.
 * @param {string} sql
 * @param {object|array} [params]
 */
export async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Ejecuta una operacion dentro de una transaccion.
 * El callback recibe una conexion; si lanza, se hace rollback.
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} fn
 */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function testConnection() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
}
