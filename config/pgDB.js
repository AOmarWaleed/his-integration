import pg from "pg";
import { config } from "./index.js";
import { clientLogger } from "./logger.js";

const { Pool } = pg;

let pool = null;
let isShuttingDown = false;
let poolRole = "api";

function getPoolMax() {
  return poolRole === "worker" ? config.db.workerPoolMax : config.db.apiPoolMax;
}

export function configureDatabasePool({ role = "api" } = {}) {
  if (pool && !pool.ended && role !== poolRole) {
    throw new Error(
      `Cannot switch database pool role from ${poolRole} to ${role} after initialization`,
    );
  }

  poolRole = role;
}

function createPool() {
  const newPool = new Pool({
    ...config.db,
    max: getPoolMax(),
    idleTimeoutMillis: config.db.idleTimeoutMillis,
    connectionTimeoutMillis: config.db.connectionTimeoutMillis,
    prepare: false,
    keepAlive: true,                 // TCP keepalive so LB/firewall doesn't silently drop
    keepAliveInitialDelayMillis: 10000,
  });

  newPool.on("error", (err) => {
    clientLogger.error(
      "Unexpected error on idle client:" + JSON.stringify(err),
    );
  });

  clientLogger.info(
    `PostgreSQL pool created for ${poolRole} with max ${getPoolMax()}`,
  );

  return newPool;
}

function getPool() {
  if (!pool || pool.ended) {
    if (isShuttingDown) {
      throw new Error("Database pool is shutting down, cannot create new pool");
    }
    clientLogger.warn(
      "Database pool was closed or missing, creating a new pool...",
    );
    pool = createPool();
  }
  return pool;
}

export const query = async (text, params) => {
  const start = Date.now();
  const activePool = getPool();

  try {
    const result = await activePool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      clientLogger.warn("Slow query detected:", {
        text,
        duration,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (error) {
    clientLogger.error(error);

    clientLogger.error("Database query error:" + JSON.stringify(error), {
      error: error.message,
      query: text,
      params,
    });
    throw error;
  }
};

export function isConnectionFailure(error) {
  const CONNECTION_FAILURE_PATTERNS = [
    /Connection terminated due to connection timeout/i,
    /Connection terminated unexpectedly/i,
    /Client has encountered a connection error/i,
    /ECONNRESET/,
    /ETIMEDOUT/,
    /ECONNREFUSED/,
    /terminating connection due to administrator command/i,
    /server closed the connection unexpectedly/i,
  ];

  if (!error) return false;
  const msg = String(error.message || "");
  const code = error.code || "";
  if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE"].includes(code)) {
    return true;
  }
  return CONNECTION_FAILURE_PATTERNS.some((re) => re.test(msg));
}

/**
 * Force-discard the current pool and create a fresh one.
 * Safe to call concurrently — guarded by isShuttingDown + ended check.
 * In-flight queries on the old pool are NOT killed; we just stop using it.
 */
export async function recreatePool() {
    if (isShuttingDown) {
        clientLogger.warn("Pool recreation skipped: shutting down");
        return;
    }

    const oldPool = pool;

    // Replace immediately so new queries use a fresh pool
    pool = createPool();

    if (oldPool && !oldPool.ended) {
        // Drain old pool in the background; don't await — we don't want to block callers
        oldPool.end().catch((err) => {
            clientLogger.warn("Error ending old pool: " + JSON.stringify(err));
        });
    }

    clientLogger.warn("Database pool recreated after connection failure");
}


/**
 * Run a query with one retry, recreating the pool on connection-level failures.
 */
export async function queryWithRetry(text, params, { retries = 3 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await query(text, params);
        } catch (error) {
            lastError = error;
            if (!isConnectionFailure(error) || attempt === retries) {
                throw error;
            }
            clientLogger.warn(
                `Connection-level failure on attempt ${attempt + 1}, recreating pool and retrying: ${error.message}`
            );
            await recreatePool();
            // small backoff to let old pool drain / DB recover
            await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
    }
    throw lastError;
}

export async function checkDatabaseConnection() {
  try {
    await query("SELECT 1");
    return true;
  } catch (error) {
    clientLogger.error(
      "Database connection check fail:" + JSON.stringify(error),
    );
    return false;
  }
}

export async function closeDatabasePool() {
  try {
    isShuttingDown = true;
    if (pool && !pool.ended) {
      await pool.end();
      clientLogger.info("Database pool has ended");
    }
    pool = null;
  } catch (error) {
    clientLogger.error("Error closing database pool:" + JSON.stringify(error));
    pool = null;
  } finally {
    isShuttingDown = false;
  }
}

export function getDatabasePoolSettings() {
  return {
    role: poolRole,
    max: getPoolMax(),
  };
}
