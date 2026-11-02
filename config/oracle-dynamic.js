// config/oracle-dynamic.js
import oracle from "oracledb";
import { config } from "./index.js";
import { oracleLogger } from "./logger.js";
import { formatErrorForLogs } from "@givc/shared-backend";
import { query, queryWithRetry } from "./pgDB.js";

const conf = config.oracle || {};

/**
 * All live pools, keyed by poolKey.
 * @type {Record<string, oracle.Pool>}
 */
let pools = {};

/**
 * Pools currently being initialized.
 * @type {Record<string, Promise<oracle.Pool>>}
 */
let pendingPoolInitializations = {};

/**
 * Tracks active `getConnection` requests per pool key so we can see
 * exactly how many callers are waiting when a timeout happens.
 * Structure: waitingCounters[poolKey] = number
 * @type {Record<string, number>}
 */
let waitingCounters = {};

/**
 * Rolling stats per poolKey. Useful to diagnose contention over time.
 * Structure: poolMetrics[poolKey] = {
 *   totalAcquired, totalReleased, totalTimeouts, totalErrors,
 *   totalValidationFailures, totalPoolResets, lastAcquireMs,
 *   lastTimeoutMs, lastErrorAt, lastResetReason
 * }
 * @type {Record<string, object>}
 */
let poolMetrics = {};

let isClientInitialized = false;

function getPoolKey({
  facilityId,
  poolScope = "shared",
  userParam,
  connectStringParam,
} = {}) {
  if (facilityId !== undefined && facilityId !== null && facilityId !== "") {
    return `facility:${facilityId}:scope:${poolScope}`;
  }
  return `${userParam || conf.user}@${connectStringParam || conf.connectString}`;
}

function ensureMetricEntry(poolKey) {
  if (!poolMetrics[poolKey]) {
    poolMetrics[poolKey] = {
      totalAcquired: 0,
      totalReleased: 0,
      totalTimeouts: 0,
      totalErrors: 0,
      totalValidationFailures: 0,
      totalPoolResets: 0,
      lastAcquireMs: 0,
      lastTimeoutMs: 0,
      lastErrorAt: null,
      lastResetReason: null,
    };
  }
  return poolMetrics[poolKey];
}

/**
 * Snapshot of a pool's native stats (open / in-use / max / increment).
 * @param {oracle.Pool|null} pool
 * @returns {object|null}
 */
function mapPoolStatistics(pool) {
  if (!pool) {
    return null;
  }
  return {
    connectionsOpen: pool.connectionsOpen,
    connectionsInUse: pool.connectionsInUse,
    poolMin: pool.poolMin,
    poolMax: pool.poolMax,
    poolIncrement: pool.poolIncrement,
    queueTimeout: pool.queueTimeout,
    poolTimeout: pool.poolTimeout,
  };
}

/**
 * Build a detailed diagnostic snapshot for a pool key.
 * Combines:
 *  - current pool stats (open / in-use / max)
 *  - number of callers currently waiting for a connection
 *  - rolling counters (acquired / timeouts / errors / resets)
 *  - last error / last reset reason
 *
 * @param {string} poolKey
 * @param {object} [settings] Optional settings used to resolve the pool key
 * @returns {object}
 */
export function getPoolDiagnostics(poolKeyOrSettings = {}) {
  const poolKey =
    typeof poolKeyOrSettings === "string"
      ? poolKeyOrSettings
      : getPoolKey(poolKeyOrSettings);

  const stats = mapPoolStatistics(pools[poolKey]);
  const metrics = ensureMetricEntry(poolKey);
  const waiting = waitingCounters[poolKey] || 0;

  return {
    poolKey,
    stats,
    waiting,
    metrics: { ...metrics },
    hasPool: Boolean(pools[poolKey]),
    isInitializing: Boolean(pendingPoolInitializations[poolKey]),
  };
}

/**
 * Return diagnostics for every known pool.
 * @returns {object}
 */
export function getAllPoolDiagnostics() {
  const result = {};
  const keys = new Set([
    ...Object.keys(pools),
    ...Object.keys(pendingPoolInitializations),
    ...Object.keys(waitingCounters),
    ...Object.keys(poolMetrics),
  ]);
  for (const key of keys) {
    result[key] = getPoolDiagnostics(key);
  }
  return result;
}

async function resetOraclePool(settings = {}, reason = "unknown") {
  const poolKey = getPoolKey(settings);
  const oldPool = pools[poolKey];

  const metrics = ensureMetricEntry(poolKey);
  metrics.totalPoolResets += 1;
  metrics.lastResetReason = reason;

  const diag = getPoolDiagnostics(poolKey);

  delete pools[poolKey];
  delete pendingPoolInitializations[poolKey];

  if (oldPool) {
    try {
      await oldPool.close(0);
      oracleLogger.debug("Oracle pool reset completed", {
        poolKey,
        reason,
        beforeReset: diag,
      });
    } catch (poolCloseError) {
      oracleLogger.warn("Error closing Oracle pool during reset", {
        poolKey,
        reason,
        error: poolCloseError.message,
      });
    }
  }
}

function initOracleClient() {
  if (!isClientInitialized) {
    try {
      oracle.initOracleClient({ libDir: conf.libDir });
      isClientInitialized = true;
      oracleLogger.info("Oracle Client initialized successfully");
    } catch (error) {
      if (!String(error?.message || "").includes("already been initialized")) {
        throw error;
      }
      isClientInitialized = true;
    }
  }
}

function getPoolDefaults(poolScope = "shared") {
  if (poolScope === "job") {
    return {
      poolMin: conf.jobPoolMin,
      poolMax: conf.jobPoolMax,
      poolIncrement: conf.jobPoolIncrement,
    };
  }
  if (poolScope === "api") {
    return {
      poolMin: conf.apiPoolMin,
      poolMax: conf.apiPoolMax,
      poolIncrement: conf.apiPoolIncrement,
    };
  }
  return {
    poolMin: conf.sharedPoolMin,
    poolMax: conf.sharedPoolMax,
    poolIncrement: conf.sharedPoolIncrement,
  };
}

/**
 * Initialize an Oracle connection pool for a given key.
 * If the pool already exists, returns it as-is.
 * If another initialization is in progress for the same key, awaits it.
 * @param {object} [options]
 * @returns {Promise<oracle.Pool>}
 */
export async function initOraclePool({
  poolMin,
  poolMax,
  poolIncrement,
  poolTimeout = conf.poolTimeout,
  queueTimeout = conf.queueTimeout,
  userParam,
  passwordParam,
  connectStringParam,
  facilityId,
  poolScope = "shared",
} = {}) {
  const scopedDefaults = getPoolDefaults(poolScope);
  const poolKey = getPoolKey({
    facilityId,
    poolScope,
    userParam,
    connectStringParam,
  });
  const resolvedPoolMin = poolMin ?? scopedDefaults.poolMin;
  const resolvedPoolMax = poolMax ?? scopedDefaults.poolMax;
  const resolvedPoolIncrement = poolIncrement ?? scopedDefaults.poolIncrement;

  ensureMetricEntry(poolKey);

  if (pools[poolKey]) {
    oracleLogger.warn("Oracle pool already exists, returning existing pool", {
      poolKey,
      diagnostics: getPoolDiagnostics(poolKey),
    });
    return pools[poolKey];
  }

  if (pendingPoolInitializations[poolKey]) {
    oracleLogger.info(
      "Oracle pool initialization already in progress, waiting for existing initialization",
      // { poolKey },
    );
    return await pendingPoolInitializations[poolKey];
  }

  try {
    initOracleClient();

    pendingPoolInitializations[poolKey] = oracle
      .createPool({
        user: userParam || conf.user,
        password: passwordParam || conf.password,
        connectString: connectStringParam || conf.connectString,
        poolMin: resolvedPoolMin,
        poolMax: resolvedPoolMax,
        poolIncrement: resolvedPoolIncrement,
        poolTimeout : poolTimeout || 60,
        queueTimeout,
        enableStatistics: true,
         queueTimeout: 10000
        // poolPingInterval: 60,     
        // poolTimeout: 120,
      })
      .then((pool) => {
        pools[poolKey] = pool;
        oracleLogger.verbose(
          "✅ Oracle connection pool created successfully",
          {
            poolKey,
            facilityId: facilityId || null,
            poolScope,
            poolMin: resolvedPoolMin,
            poolMax: resolvedPoolMax,
            poolIncrement: resolvedPoolIncrement,
            queueTimeout,
            poolTimeout,
            connectString: connectStringParam || conf.connectString,
          },
        );
        return pool;
      })
      .finally(() => {
        delete pendingPoolInitializations[poolKey];
      });

    return await pendingPoolInitializations[poolKey];
  } catch (error) {
    oracleLogger.error("fail to create Oracle connection pool", {
      poolKey,
      requested: {
        poolMin: resolvedPoolMin,
        poolMax: resolvedPoolMax,
        poolIncrement: resolvedPoolIncrement,
        queueTimeout,
        poolTimeout,
      },
      error: formatErrorForLogs(error),
    });
    throw error;
  }
}

/**
 * Get a connection from the pool.
 *
 * IMPORTANT: The caller MUST close the returned connection.
 * Prefer `withOracleConnection()` which handles cleanup automatically.
 *
 * @param {object} [settings]
 * @param {number} [acquireTimeout=30000]
 * @returns {Promise<oracle.Connection>}
 */
export async function getOracleConnection(
  settings = {},
  acquireTimeout = 30000,
) {
  const poolKey = getPoolKey(settings);
  const metrics = ensureMetricEntry(poolKey);

  if (!pools[poolKey]) {
    oracleLogger.debug("Pool not initialized, initializing now..." + poolKey);
    await initOraclePool(settings);
  }

  const acquireStartedAt = Date.now();
  waitingCounters[poolKey] = (waitingCounters[poolKey] || 0) + 1;

  try {
    const pool = pools[poolKey];
    if (!pool) {
      throw new Error(`Oracle pool unavailable for key: ${poolKey}`);
    }

    const poolStatsBefore = getPoolStatistics(settings);

    if (
      poolStatsBefore &&
      poolStatsBefore.connectionsInUse >= poolStatsBefore.poolMax - 1
    ) {
      oracleLogger.warn("Oracle pool nearly exhausted", {
        poolKey,
        waiting: waitingCounters[poolKey],
        poolStats: poolStatsBefore,
        metrics: { ...metrics },
      });
    }

    let timeoutId;
    let connection;
    try {
      connection = await Promise.race([
        pool.getConnection(),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            const stats = getPoolStatistics(settings);
            const timeoutError = new Error(
              `Pool getConnection timeout after ${acquireTimeout}ms. ` +
                `Pool stats: connectionsInUse=${stats?.connectionsInUse}, ` +
                `connectionsOpen=${stats?.connectionsOpen}, ` +
                `poolMax=${stats?.poolMax}, waiting=${waitingCounters[poolKey]}`,
            );
            timeoutError.code = "POOL_ACQUIRE_TIMEOUT";
            timeoutError.diagnostics = {
              poolKey,
              stats,
              waiting: waitingCounters[poolKey],
              metrics: { ...metrics },
            };
            reject(timeoutError);
          }, acquireTimeout);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }

    const acquireMs = Date.now() - acquireStartedAt;
    metrics.lastAcquireMs = acquireMs;

    try {
      await connection.execute("SELECT 1 FROM DUAL");
      oracleLogger.debug("Connection validated successfully", {
        poolKey,
        acquireMs,
        waiting: waitingCounters[poolKey] - 1,
      });
    } catch (error) {
      metrics.totalValidationFailures += 1;
      oracleLogger.error(
        "Connection validation fail, retrying with new connection",
        {
          poolKey,
          acquireMs,
          waiting: waitingCounters[poolKey] - 1,
          poolStatsBefore,
          poolStatsAfter: getPoolStatistics(settings),
          metrics: { ...metrics },
          error: formatErrorForLogs(error),
        },
      );

      try {
        await connection.close();
      } catch (closeError) {
        oracleLogger.debug("Error closing invalid connection", {
          poolKey,
          error: closeError.message,
        });
      }

      await resetOraclePool(settings, "connection-validation-failed");
      await initOraclePool(settings);
      return await getOracleConnection(settings, acquireTimeout);
    }

    metrics.totalAcquired += 1;

    if (acquireMs > 2000) {
      oracleLogger.warn('Slow connection acquisition from pool')
      oracleLogger.debug( {
        poolKey,
        acquireMs,
        waiting: waitingCounters[poolKey] - 1,
        poolStats: getPoolStatistics(settings),
        metrics: { ...metrics },
      });
    }

    return connection;
  } catch (error) {
    const stats = getPoolStatistics(settings);
    const waiting = Math.max((waitingCounters[poolKey] || 1) - 1, 0);

    if (error?.code === "POOL_ACQUIRE_TIMEOUT") {
      metrics.totalTimeouts += 1;
      metrics.lastTimeoutMs = Date.now() - acquireStartedAt;
      metrics.lastErrorAt = new Date().toISOString();
    } else {
      metrics.totalErrors += 1;
      metrics.lastErrorAt = new Date().toISOString();
    }

    if (
      error?.code === "POOL_ACQUIRE_TIMEOUT" &&
      stats &&
      stats.connectionsInUse === 0
    ) {
      oracleLogger.warn(
        "Acquire timeout on idle Oracle pool, recreating pool and retrying once",
        {
          poolKey,
          waiting,
          poolStats: stats,
          metrics: { ...metrics },
        },
      );

      await resetOraclePool(settings, "idle-pool-acquire-timeout");
      await initOraclePool(settings);
      return await getOracleConnection(settings, acquireTimeout);
    }

    oracleLogger.error("fail to get connection from pool", {
      poolKey,
      waiting,
      poolStats: stats,
      metrics: { ...metrics },
      error: formatErrorForLogs(error),
    });
    throw error;
  } finally {
    waitingCounters[poolKey] = Math.max(
      (waitingCounters[poolKey] || 1) - 1,
      0,
    );
  }
}


/**
 * Get pool statistics for a specific pool.
 * @param {object} [settings]
 * @returns {object|null}
 */
export function getPoolStatistics(settings = {}) {
  const poolKey = getPoolKey(settings);
  const pool = pools[poolKey];
  return mapPoolStatistics(pool);
}

/**
 * Get statistics for all pools.
 * @returns {object}
 */
export function getAllPoolStatistics() {
  const result = {};
  for (const [poolKey, pool] of Object.entries(pools)) {
    result[poolKey] = mapPoolStatistics(pool);
  }
  return result;
}

/**
 * Close a specific pool.
 * @param {number} [drainTime=10]
 * @param {string} [poolKey]
 * @returns {Promise<void>}
 */
export async function closeOraclePool(drainTime = 10, poolKey) {
  const mainPoolKey = getPoolKey();
  const targetPoolKey =
    poolKey ||
    (pools[mainPoolKey]
      ? mainPoolKey
      : Object.keys(pools).find((key) => Boolean(pools[key])));

  if (!targetPoolKey) {
    oracleLogger.warn("No Oracle pool to close");
    return;
  }

  const pool = pools[targetPoolKey];
  if (pool) {
    try {
      oracleLogger.debug(`Closing Oracle pool (drain time: ${drainTime}s)...`, {
        poolKey: targetPoolKey,
        diagnostics: getPoolDiagnostics(targetPoolKey),
      });
      await pool.close(drainTime);
      delete pools[targetPoolKey];
      delete pendingPoolInitializations[targetPoolKey];
      delete waitingCounters[targetPoolKey];
      oracleLogger.info("✅ Oracle pool closed successfully");
    } catch (error) {
      oracleLogger.error("Error closing Oracle pool", {
        poolKey: targetPoolKey,
        error: formatErrorForLogs(error),
      });
      throw error;
    }
  } else {
    oracleLogger.warn("No Oracle pool to close", { poolKey: targetPoolKey });
  }
}

/**
 * Close all pools.
 * @param {number} [drainTime=10]
 * @returns {Promise<void>}
 */
export async function closeAllOraclePools(drainTime = 10) {
  const poolKeys = Object.keys(pools).filter((key) => Boolean(pools[key]));
  for (const poolKey of poolKeys) {
    await closeOraclePool(drainTime, poolKey);
  }
}

/**
 * Simple health check on one or all pools.
 * @param {string} [poolKey]
 * @returns {Promise<boolean>}
 */
export async function checkOraclePoolHealth(poolKey) {
  try {
    if (!pools || Object.keys(pools).length === 0) {
      return false;
    }

    const keysToCheck = poolKey
      ? [poolKey]
      : Object.keys(pools).filter((key) => Boolean(pools[key]));

    if (keysToCheck.length === 0) {
      return false;
    }

    for (const key of keysToCheck) {
      const pool = pools[key];
      if (!pool) {
        oracleLogger.warn(`Oracle pool not found for key: ${key}`);
        return false;
      }

      let connection;
      try {
        connection = await pool.getConnection();
        const result = await connection.execute("SELECT 1 FROM DUAL");
        if (!result.rows || result.rows.length === 0) {
          oracleLogger.error(
            `Oracle pool health query returned no rows for key: ${key}`,
          );
          return false;
        }
      } finally {
        if (connection) {
          await connection.close();
        }
      }
    }

    return true;
  } catch (error) {
    oracleLogger.error("Oracle pool health check fail", {
      poolKey,
      error: formatErrorForLogs(error),
    });
    return false;
  }
}







/**
 * Wrap a handler so that it fetches the facility from PostgreSQL,
 * opens an Oracle connection, passes both to the inner function,
 * and guarantees the connection is closed.
 * 
 * @param {(args: { connection: any, facility: any, abortSignal: AbortSignal, params: object }) => Promise<any>} fn
 * @returns {Function}
 */
export const withOracleConnection = (fn) => async (repeatMins, facilityId, abortSignal) => {
  let facility;
  try {
    const facilities = await queryWithRetry(
      `SELECT * FROM facility WHERE facility_id = $1`,
      [facilityId],
    );
    if (!facilities.rows?.length) {
      oracleLogger.warn(`[cron] Facility ${facilityId} not found`);
      return;
    }
    facility = facilities.rows[0];
  } catch (pgError) {
    oracleLogger.error(`[cron] PostgreSQL error while fetching facility ${facilityId}: ${pgError.message}`);
    throw pgError;
  }

  // Resolve the poolKey to ensure we update the correct metrics
  const poolKey = getPoolKey({
    facilityId,
    poolScope: "job",
    userParam: facility.his_db_username,
    connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
  });

  const connection = await getOracleConnection({
    facilityId,
    poolScope: "job",
    userParam: facility.his_db_username,
    passwordParam: facility.his_db_password,
    connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
  });

  try {
 
    const summary = await fn({
      connection,
      facility,
      abortSignal,
      params: {
        patientId: null,
        episodeNo: null,
        // startDate: startDateFormatted,
        // endDate,
      },
    });
    return summary;
  } finally {
    try {
      await connection.close();
      
      // Increment the totalReleased metric upon successful close
      const metrics = ensureMetricEntry(poolKey);
      metrics.totalReleased += 1;
      
      oracleLogger.debug(`[cron] Connection closed successfully for facility ${facilityId}`, {
        poolKey,
        metrics: { ...metrics }
      });
    } catch (closeError) {
      oracleLogger.error(`[cron] Failed to close connection for facility ${facilityId}: ${closeError.message}`, {
        poolKey
      });
    }
  }
};