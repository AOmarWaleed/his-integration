// config/oracle-dynamic.js
import oracle from "oracledb";
import { config } from "./index.js";
import { oracleLogger } from "./logger.js";
import { formatErrorForLogs } from "@givc/shared-backend";
import { query, queryWithRetry } from "./pgDB.js";

const conf = config.oracle || {};

/**
 * Default retry / validation configuration for Oracle pool & connections.
 */
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_BACKOFF_MS = 2000;
const DEFAULT_MAX_BACKOFF_MS = 20000;
const VALIDATION_TIMEOUT_MS = 5000;
const POOL_DRAIN_SECONDS = 10;

/**
 * All live pools, keyed by poolKey.
 * One shared pool is created lazily per facility when the first job/request
 * for that facility runs, and reused by all subsequent jobs for the same facility.
 * @type {Record<string, oracle.Pool>}
 */
let pools = {};

/**
 * Pools currently being initialized (mutex per poolKey so concurrent jobs
 * for the same facility wait on the same creation promise).
 * @type {Record<string, Promise<oracle.Pool>>}
 */
let pendingPoolInitializations = {};

/**
 * Pools currently being recreated (mutex per poolKey so only one job
 * recreates an unhealthy pool while other jobs for that facility wait).
 * @type {Record<string, Promise<oracle.Pool>>}
 */
let pendingPoolRecreations = {};

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
 *   totalValidationFailures, totalPoolResets, totalRetries,
 *   lastAcquireMs, lastTimeoutMs, lastErrorAt, lastResetReason
 * }
 * @type {Record<string, object>}
 */
let poolMetrics = {};

let isClientInitialized = false;

/**
 * Build a canonical pool key per facility so all jobs for the same facility
 * share a single Oracle connection pool within the process.
 */
function getPoolKey({
  facilityId,
  userParam,
  connectStringParam,
} = {}) {
  if (facilityId !== undefined && facilityId !== null && facilityId !== "") {
    return `facility:${facilityId}`;
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
      totalRetries: 0,
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
 * @param {string|object} poolKeyOrSettings
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
    isRecreating: Boolean(pendingPoolRecreations[poolKey]),
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
    ...Object.keys(pendingPoolRecreations),
    ...Object.keys(waitingCounters),
    ...Object.keys(poolMetrics),
  ]);
  for (const key of keys) {
    result[key] = getPoolDiagnostics(key);
  }
  return result;
}

/**
 * Check if an Oracle error indicates a broken/expired connection or pool.
 * @param {Error} error
 * @returns {boolean}
 */
export function isOracleConnectionOrPoolError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || "");

  const fatalPatterns = [
    /POOL_ACQUIRE_TIMEOUT/i,
    /VALIDATION_TIMEOUT/i,
    /NJS-040/i, // connection request timeout (queueTimeout)
    /NJS-003/i, // invalid connection
    /NJS-064/i, // connection pool is closing
    /NJS-065/i, // connection pool was closed
    /NJS-500/i, // connection broken / lost
    /NJS-503/i, // connection failure
    /NJS-510/i, // connect timeout
    /NJS-521/i, // end-of-file on communication channel
    /ORA-03113/i, // end-of-file on communication channel
    /ORA-03114/i, // not connected to ORACLE
    /ORA-03135/i, // connection lost contact
    /ORA-01012/i, // not logged on
    /ORA-02396/i, // exceeded maximum idle time
    /ORA-00028/i, // your session has been killed
    /ORA-12514/i, // listener does not currently know of service
    /ORA-12541/i, // TNS:no listener
    /ORA-12170/i, // TNS:connect timeout occurred
    /DPI-1010/i, // not connected
    /DPI-1080/i, // connection was closed by ORA-3113 / ORA-3135
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /EPIPE/i,
  ];

  return (
    code === "POOL_ACQUIRE_TIMEOUT" ||
    code === "VALIDATION_TIMEOUT" ||
    fatalPatterns.some((re) => re.test(code) || re.test(msg))
  );
}

/**
 * Safely close a connection, optionally dropping it from the pool so a dead
 * socket is never returned to another job.
 * @param {oracle.Connection|null} connection
 * @param {object} [options]
 * @param {boolean} [options.drop=false]
 * @param {string} [options.poolKey="unknown"]
 */
async function safeCloseConnection(
  connection,
  { drop = false, poolKey = "unknown" } = {},
) {
  if (!connection) return;
  try {
    await Promise.race([
      connection.close(drop ? { drop: true } : undefined),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection close timeout")), 5000),
      ),
    ]);
  } catch (closeError) {
    oracleLogger.debug("Error closing Oracle connection", {
      poolKey,
      drop,
      error: closeError.message,
    });
  }
}

/**
 * Run the dummy health check query (`SELECT 1 FROM DUAL`) on a connection
 * with a strict timeout so a dead socket cannot hang the job forever.
 * @param {oracle.Connection} connection
 * @param {number} [timeoutMs=VALIDATION_TIMEOUT_MS]
 * @returns {Promise<boolean>}
 */
async function validateConnectionWithDummyQuery(
  connection,
  timeoutMs = VALIDATION_TIMEOUT_MS,
) {
  let timer = null;
  try {
    const result = await Promise.race([
      connection.execute("SELECT 1 FROM DUAL"),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(
            `Oracle dummy query (SELECT 1 FROM DUAL) timed out after ${timeoutMs}ms`,
          );
          err.code = "VALIDATION_TIMEOUT";
          reject(err);
        }, timeoutMs);
      }),
    ]);

    return Boolean(result && Array.isArray(result.rows) && result.rows.length > 0);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Compute exponential backoff delay with jitter.
 * @param {number} attempt - 0-based retry attempt index
 * @param {number} [baseMs=DEFAULT_BASE_BACKOFF_MS]
 * @param {number} [maxMs=DEFAULT_MAX_BACKOFF_MS]
 * @returns {number}
 */
function computeBackoffDelayMs(
  attempt,
  baseMs = DEFAULT_BASE_BACKOFF_MS,
  maxMs = DEFAULT_MAX_BACKOFF_MS,
) {
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 500);
  return exponential + jitter;
}

/**
 * Sleep helper that respects an optional AbortSignal.
 * @param {number} ms
 * @param {AbortSignal} [abortSignal]
 * @returns {Promise<void>}
 */
function sleepWithAbort(ms, abortSignal) {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      const err = new Error("Aborted during retry backoff");
      err.name = "AbortError";
      return reject(err);
    }

    let onAbort;
    const timer = setTimeout(() => {
      if (abortSignal && onAbort) {
        abortSignal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, ms);

    if (abortSignal) {
      onAbort = () => {
        clearTimeout(timer);
        const err = new Error("Aborted during retry backoff");
        err.name = "AbortError";
        reject(err);
      };
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Safely recreate the Oracle pool for a given facility/settings.
 * Guarded by `pendingPoolRecreations[poolKey]` so if 10 jobs for the same
 * facility detect an expired pool at the same time, only 1 recreation runs
 * and the other 9 await the new pool.
 *
 * The old pool is drained asynchronously in the background with `close(drainTime)`
 * so any in-flight queries on other jobs can finish cleanly without leaking
 * sessions on the Oracle server.
 *
 * @param {object} [settings={}]
 * @param {string} [reason="unknown"]
 * @returns {Promise<oracle.Pool>}
 */
export async function recreateOraclePool(settings = {}, reason = "unknown") {
  const poolKey = getPoolKey(settings);

  if (pendingPoolRecreations[poolKey]) {
    oracleLogger.info(
      `Oracle pool recreation already in progress for ${poolKey}, waiting...`,
      { poolKey, reason },
    );
    return await pendingPoolRecreations[poolKey];
  }

  pendingPoolRecreations[poolKey] = (async () => {
    const oldPool = pools[poolKey];
    const metrics = ensureMetricEntry(poolKey);
    metrics.totalPoolResets += 1;
    metrics.lastResetReason = reason;

    const diagBefore = getPoolDiagnostics(poolKey);

    // Detach old pool immediately so new callers wait on the fresh pool
    delete pools[poolKey];
    delete pendingPoolInitializations[poolKey];

    if (oldPool) {
      // Drain and close the old pool in the background without blocking recreation
      Promise.resolve()
        .then(async () => {
          try {
            await oldPool.close(POOL_DRAIN_SECONDS);
            oracleLogger.debug("Old Oracle pool drained and closed during recreate", {
              poolKey,
              reason,
              beforeReset: diagBefore,
            });
          } catch (closeErr) {
            try {
              await oldPool.close(0);
            } catch (_) {
              // ignore secondary close error
            }
            oracleLogger.warn("Error closing old Oracle pool during recreate", {
              poolKey,
              reason,
              error: closeErr.message,
            });
          }
        })
        .catch(() => {});
    }

    oracleLogger.warn("Recreating shared Oracle pool for facility", {
      poolKey,
      reason,
      beforeReset: diagBefore,
    });

    return await initOraclePool(settings);
  })().finally(() => {
    delete pendingPoolRecreations[poolKey];
  });

  return await pendingPoolRecreations[poolKey];
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
    poolMin: conf.jobPoolMin ?? conf.sharedPoolMin ?? 1,
    poolMax: conf.jobPoolMax ?? conf.sharedPoolMax ?? 16,
    poolIncrement: conf.jobPoolIncrement ?? conf.sharedPoolIncrement ?? 2,
  };
}

/**
 * Initialize a shared Oracle connection pool for a facility (or default key).
 * - Created lazily when the first job for a facility starts.
 * - Reused by all subsequent jobs for the same facility.
 * - Concurrent calls for the same facility await the same initialization promise.
 *
 * @param {object} [options]
 * @returns {Promise<oracle.Pool>}
 */
export async function initOraclePool({
  poolMin,
  poolMax,
  poolIncrement,
  poolTimeout = conf.poolTimeout || 60,
  queueTimeout = conf.queueTimeout || 60000,
  userParam,
  passwordParam,
  connectStringParam,
  facilityId,
  poolScope = "job",
} = {}) {
  const scopedDefaults = getPoolDefaults(poolScope);
  const poolKey = getPoolKey({
    facilityId,
    poolScope,
    userParam,
    connectStringParam,
  });
  const resolvedPoolMin = poolMin ?? scopedDefaults.poolMin ?? 0;
  const resolvedPoolMax = Math.max(poolMax ?? scopedDefaults.poolMax ?? 16, 10);
  const resolvedPoolIncrement = poolIncrement ?? scopedDefaults.poolIncrement ?? 2;
  const resolvedQueueTimeout = Number.isFinite(queueTimeout) && queueTimeout > 0
    ? queueTimeout
    : 60000;
  const resolvedPoolTimeout = Number.isFinite(poolTimeout) && poolTimeout > 0
    ? poolTimeout
    : 60;

  ensureMetricEntry(poolKey);

  if (pools[poolKey]) {
    oracleLogger.debug("Using existing shared Oracle pool for facility", {
      poolKey,
      diagnostics: getPoolDiagnostics(poolKey),
    });
    return pools[poolKey];
  }

  if (pendingPoolInitializations[poolKey]) {
    oracleLogger.info(
      `Oracle pool initialization already in progress for ${poolKey}, waiting...`,
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
        poolTimeout: resolvedPoolTimeout,
        queueTimeout: resolvedQueueTimeout,
        poolPingInterval: 30,
        enableStatistics: true,
      })
      .then((pool) => {
        pools[poolKey] = pool;
        oracleLogger.info(
          "✅ Shared Oracle connection pool created for facility",
          {
            poolKey,
            facilityId: facilityId || null,
            poolScope,
            poolMin: resolvedPoolMin,
            poolMax: resolvedPoolMax,
            poolIncrement: resolvedPoolIncrement,
            queueTimeout: resolvedQueueTimeout,
            poolTimeout: resolvedPoolTimeout,
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
        queueTimeout: resolvedQueueTimeout,
        poolTimeout: resolvedPoolTimeout,
      },
      error: formatErrorForLogs(error),
    });
    throw error;
  }
}

/**
 * Single attempt to acquire a connection from the facility's shared pool
 * and validate it with a dummy query (`SELECT 1 FROM DUAL`).
 *
 * @param {object} settings
 * @param {number} acquireTimeout
 * @returns {Promise<oracle.Connection>}
 */
async function acquireAndValidateOnce(settings = {}, acquireTimeout = 45000) {
  const poolKey = getPoolKey(settings);
  const metrics = ensureMetricEntry(poolKey);

  if (pendingPoolRecreations[poolKey]) {
    await pendingPoolRecreations[poolKey];
  }

  if (!pools[poolKey]) {
    oracleLogger.debug(`Shared pool not initialized for ${poolKey}, creating now...`);
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

    // Dummy query validation before the job starts: SELECT 1 FROM DUAL
    let isValid = false;
    try {
      isValid = await validateConnectionWithDummyQuery(connection, VALIDATION_TIMEOUT_MS);
    } catch (validationError) {
      metrics.totalValidationFailures += 1;
      oracleLogger.warn("Dummy query validation failed on Oracle connection", {
        poolKey,
        acquireMs,
        error: formatErrorForLogs(validationError),
      });
      await safeCloseConnection(connection, { drop: true, poolKey });
      validationError.isValidationFailure = true;
      throw validationError;
    }

    if (!isValid) {
      metrics.totalValidationFailures += 1;
      await safeCloseConnection(connection, { drop: true, poolKey });
      const emptyValidationErr = new Error(
        `Dummy query (SELECT 1 FROM DUAL) returned no rows for ${poolKey}`,
      );
      emptyValidationErr.code = "VALIDATION_EMPTY";
      emptyValidationErr.isValidationFailure = true;
      throw emptyValidationErr;
    }

    oracleLogger.debug("Connection validated successfully via dummy query", {
      poolKey,
      acquireMs,
      waiting: waitingCounters[poolKey] - 1,
    });

    metrics.totalAcquired += 1;

    if (acquireMs > 2000) {
      oracleLogger.warn("Slow connection acquisition from pool", {
        poolKey,
        acquireMs,
        waiting: waitingCounters[poolKey] - 1,
        poolStats: getPoolStatistics(settings),
        metrics: { ...metrics },
      });
    }

    return connection;
  } catch (error) {
    if (error?.code === "POOL_ACQUIRE_TIMEOUT" || /NJS-040/i.test(error?.message || "")) {
      metrics.totalTimeouts += 1;
      metrics.lastTimeoutMs = Date.now() - acquireStartedAt;
      metrics.lastErrorAt = new Date().toISOString();
    } else {
      metrics.totalErrors += 1;
      metrics.lastErrorAt = new Date().toISOString();
    }
    throw error;
  } finally {
    waitingCounters[poolKey] = Math.max(
      (waitingCounters[poolKey] || 1) - 1,
      0,
    );
  }
}

/**
 * Get a validated connection from the facility's shared pool, with
 * automatic pool health verification, safe pool recreation if expired/broken,
 * and exponential backoff retry.
 *
 * IMPORTANT: The caller MUST close the returned connection.
 * Prefer `withOracleConnection()` which handles cleanup automatically.
 *
 * @param {object} [settings]
 * @param {number} [acquireTimeout=45000]
 * @param {object} [retryOptions]
 * @param {number} [retryOptions.maxRetries=DEFAULT_MAX_RETRIES]
 * @param {number} [retryOptions.baseBackoffMs=DEFAULT_BASE_BACKOFF_MS]
 * @param {AbortSignal} [retryOptions.abortSignal]
 * @returns {Promise<oracle.Connection>}
 */
export async function getOracleConnection(
  settings = {},
  acquireTimeout = 45000,
  retryOptions = {},
) {
  const poolKey = getPoolKey(settings);
  const metrics = ensureMetricEntry(poolKey);
  const maxRetries = retryOptions.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseBackoffMs = retryOptions.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const abortSignal = retryOptions.abortSignal ?? settings.abortSignal ?? null;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (abortSignal?.aborted) {
      const abortErr = new Error(`Aborted before acquiring Oracle connection for ${poolKey}`);
      abortErr.name = "AbortError";
      throw abortErr;
    }

    try {
      return await acquireAndValidateOnce(settings, acquireTimeout);
    } catch (error) {
      lastError = error;

      if (error?.name === "AbortError" || abortSignal?.aborted) {
        throw error;
      }

      const stats = getPoolStatistics(settings);
      const isValidationFail = Boolean(error?.isValidationFailure);
      const isAcquireTimeout =
        error?.code === "POOL_ACQUIRE_TIMEOUT" ||
        /NJS-040/i.test(error?.message || "");
      const isConnOrPoolErr = isOracleConnectionOrPoolError(error);

      if (attempt >= maxRetries || (!isValidationFail && !isConnOrPoolErr)) {
        oracleLogger.error("Failed to get Oracle connection after retries", {
          poolKey,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          waiting: waitingCounters[poolKey] || 0,
          poolStats: stats,
          metrics: { ...metrics },
          error: formatErrorForLogs(error),
        });
        throw error;
      }

      metrics.totalRetries += 1;

      // Decide whether the pool itself needs recreation:
      // 1. Dummy query failed (connection/pool expired or dropped by firewall/Oracle)
      // 2. Pool threw NJS-064 / NJS-065 / ORA-03113 / ORA-03114 / ORA-03135 / DPI-1010 / DPI-1080
      // 3. Acquire timeout happened while pool shows 0 in-use connections (wedged pool)
      // 4. Acquire timeout happened on retry attempt >= 2 and a direct pool health ping fails
      let shouldRecreatePool =
        isValidationFail ||
        (!isAcquireTimeout && isConnOrPoolErr) ||
        (isAcquireTimeout && stats && stats.connectionsInUse === 0);

      if (!shouldRecreatePool && isAcquireTimeout && attempt >= 1) {
        const poolHealthy = await checkOraclePoolHealth(poolKey);
        if (!poolHealthy) {
          shouldRecreatePool = true;
        }
      }

      const delayMs = computeBackoffDelayMs(attempt, baseBackoffMs);

      oracleLogger.warn(
        `Oracle connection attempt ${attempt + 1}/${maxRetries + 1} failed for ${poolKey}; ` +
          `${shouldRecreatePool ? "recreating pool and " : ""}retrying in ${delayMs}ms`,
        {
          poolKey,
          attempt: attempt + 1,
          delayMs,
          shouldRecreatePool,
          poolStats: stats,
          error: error.message,
        },
      );

      await sleepWithAbort(delayMs, abortSignal);

      if (shouldRecreatePool) {
        try {
          await recreateOraclePool(
            settings,
            isValidationFail
              ? "dummy-query-validation-failed"
              : error.code || "connection-error",
          );
        } catch (recreateErr) {
          oracleLogger.error("Error recreating Oracle pool during retry", {
            poolKey,
            attempt: attempt + 1,
            error: formatErrorForLogs(recreateErr),
          });
        }
      }
    }
  }

  throw lastError;
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
      delete pendingPoolRecreations[targetPoolKey];
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
 * Simple health check on one or all pools using dummy query (`SELECT 1 FROM DUAL`).
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
        connection = await Promise.race([
          pool.getConnection(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Health check getConnection timeout for ${key}`)),
              VALIDATION_TIMEOUT_MS,
            ),
          ),
        ]);
        const valid = await validateConnectionWithDummyQuery(
          connection,
          VALIDATION_TIMEOUT_MS,
        );
        if (!valid) {
          oracleLogger.error(
            `Oracle pool health query returned no rows for key: ${key}`,
          );
          await safeCloseConnection(connection, { drop: true, poolKey: key });
          connection = null;
          return false;
        }
      } finally {
        if (connection) {
          await safeCloseConnection(connection, { drop: false, poolKey: key });
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
 * Wrap a job handler so that:
 * 1. It fetches the facility from PostgreSQL.
 * 2. When the first job for a facility starts, it lazily initializes a single
 *    shared Oracle pool for that facility (`facility:<facilityId>`), and all
 *    subsequent jobs for the same facility share that pool.
 * 3. Before executing the job, it acquires a connection (with exponential
 *    backoff retry) and validates it via `SELECT 1 FROM DUAL` (recreating the
 *    pool automatically if expired/broken).
 * 4. If the job itself fails mid-execution due to an Oracle connection/pool
 *    drop, it recreates the pool and retries the job with exponential backoff.
 * 5. Guarantees the connection is closed in `finally`.
 *
 * @param {(args: { connection: any, facility: any, abortSignal: AbortSignal, params: object }) => Promise<any>} fn
 * @returns {Function}
 */
export const withOracleConnection =
  (fn) => async (repeatMins, facilityId, abortSignal) => {
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
      oracleLogger.error(
        `[cron] PostgreSQL error while fetching facility ${facilityId}: ${pgError.message}`,
      );
      throw pgError;
    }

    const poolSettings = {
      facilityId,
      poolScope: "job",
      userParam: facility.his_db_username,
      passwordParam: facility.his_db_password,
      connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
      abortSignal,
    };

    const poolKey = getPoolKey(poolSettings);
    const maxJobRetries = 2;
    let lastJobError = null;

    for (let jobAttempt = 0; jobAttempt <= maxJobRetries; jobAttempt++) {
      if (abortSignal?.aborted) {
        const abortErr = new Error(
          `[cron] Job aborted for facility ${facilityId}`,
        );
        abortErr.name = "AbortError";
        throw abortErr;
      }

      // Acquires a connection from the shared facility pool, runs SELECT 1 FROM DUAL,
      // and automatically retries with backoff + pool recreation if needed.
      let connection = await getOracleConnection(poolSettings, 45000, {
        maxRetries: DEFAULT_MAX_RETRIES,
        baseBackoffMs: DEFAULT_BASE_BACKOFF_MS,
        abortSignal,
      });

      let dropConnectionOnClose = false;

      try {
        const summary = await fn({
          connection,
          facility,
          abortSignal,
          params: {
            patientId: null,
            episodeNo: null,
          },
        });
        return summary;
      } catch (jobError) {
        lastJobError = jobError;
        const isConnErr = isOracleConnectionOrPoolError(jobError);

        if (isConnErr) {
          dropConnectionOnClose = true;
        }

        if (
          !isConnErr ||
          jobAttempt >= maxJobRetries ||
          abortSignal?.aborted
        ) {
          throw jobError;
        }

        const backoffMs = computeBackoffDelayMs(jobAttempt, DEFAULT_BASE_BACKOFF_MS);
        oracleLogger.warn(
          `[cron] Job for facility ${facilityId} failed due to Oracle connection error ` +
            `(attempt ${jobAttempt + 1}/${maxJobRetries + 1}): ${jobError.message}. ` +
            `Recreating facility pool and retrying in ${backoffMs}ms...`,
          { poolKey, facilityId, attempt: jobAttempt + 1 },
        );

        await safeCloseConnection(connection, { drop: true, poolKey });
        connection = null;
        const metrics = ensureMetricEntry(poolKey);
        metrics.totalReleased += 1;

        await sleepWithAbort(backoffMs, abortSignal);
        await recreateOraclePool(poolSettings, "job-mid-execution-connection-lost");
      } finally {
        if (connection) {
          await safeCloseConnection(connection, {
            drop: dropConnectionOnClose,
            poolKey,
          });

          const metrics = ensureMetricEntry(poolKey);
          metrics.totalReleased += 1;

          oracleLogger.debug(
            `[cron] Connection released for facility ${facilityId}`,
            {
              poolKey,
              dropped: dropConnectionOnClose,
              metrics: { ...metrics },
            },
          );
        }
      }
    }

    throw lastJobError;
  };
