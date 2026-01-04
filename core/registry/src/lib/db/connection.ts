import { Pool, QueryResult, PoolClient } from "pg";
import { config } from "@/config";
import { log } from "@/lib/logger";

let pool: Pool | null = null;

/**
 * Get or create PostgreSQL connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      // AWS RDS specific requirement
      ssl: {
        rejectUnauthorized: false,
      },
      // Pool settings
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000,
    });

    // Error handling for the pool itself
    pool.on("error", (err) => {
      log.error("Registry DB: Unexpected error on idle client", err);
      process.exit(-1);
    });
  }
  return pool;
}

/**
 * Get a direct client from the pool (Useful for transactions)
 * Note: You MUST release this client when done!
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return await pool.connect();
}

/**
 * Execute a query using the connection pool
 * Returns an array of rows matching the specified type
 * * @example
 * const users = await query<User>("SELECT * FROM users WHERE id = $1", [1]);
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const pool = getPool();
  const result: QueryResult = await pool.query(text, params);
  return result.rows as T[];
}

/**
 * Execute an INSERT, UPDATE, or DELETE query
 * Returns the full result object (rowCount, command, etc.)
 */
export async function execute(
  text: string,
  params?: any[]
): Promise<QueryResult> {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result;
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const pool = getPool();
    // Simple query to test connection
    await pool.query("SELECT NOW()");
    return true;
  } catch (error) {
    log.error("Registry DB: Connection test failed", error);
    return false;
  }
}
