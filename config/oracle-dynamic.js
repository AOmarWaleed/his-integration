// config/oracle-dynamic.js
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = "64";
}

import oracle from "oracledb";
import { config } from "./index.js";
import { oracleLogger } from "./logger.js";
import { queryWithRetry } from "./pgDB.js";

const conf = config.oracle || {};

/**
 * All active Oracle connection pools, keyed by poolKey (e.g., "facility:<facilityId>").
 * Exactly one pool is created per facility upon the first job/request, and remains
 * open and reused for all subsequent jobs until explicitly closed on application shutdown
 * or recreated upon an unrecoverable timeout/error.
 *
 * @type {Record<string, oracle.Pool>}
 */
let pools = {};

/**
 * In-flight pool initializations to prevent duplicate pool creation when
 * multiple concurrent jobs for the same facility start at the same time.
 * @type {Record<string, Promise<oracle.Pool>>}
 */
let pendingPoolInitializations = {};

/**
 * In-flight pool recreations to serialize pool recreation across concurrent jobs.
 * @type {Record<string, Promise<oracle.Pool>>}
 */
let pendingPoolRecreations = {};

let isClientInitialized = false;

/**
 * Initialize Oracle Thick Client if required.
 */
function initOracleClient() {
  if (!isClientInitialized) {
    try {
      if (conf.libDir) {
        oracle.initOracleClient({ libDir: conf.libDir });
      } else {
        oracle.initOracleClient();
      }
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

/**
 * Build a canonical pool key per facility so all jobs for the same facility
 * share a single Oracle connection pool.
 *
 * @param {object} [params]
 * @param {string|number} [params.facilityId]
 * @param {string} [params.userParam]
 * @param {string} [params.connectStringParam]
 * @returns {string}
 */
export function getPoolKey({
  facilityId,
  userParam,
  connectStringParam,
} = {}) {
  if (facilityId !== undefined && facilityId !== null && facilityId !== "") {
    return `facility:${facilityId}`;
  }
  return `${userParam || conf.user}@${connectStringParam || conf.connectString}`;
}

/**
 * Check if an error indicates a broken, expired, or disconnected Oracle connection or pool.
 * Specifically ignores Axios and HTTP network errors so external API timeouts
 * do NOT mistakenly trigger Oracle pool recreations.
 *
 * @param {Error|object} error
 * @returns {boolean}
 */
export function isOracleConnectionOrPoolError(error) {
  if (!error) return false;

  // Ignore Axios / HTTP errors (e.g. timeouts or connection drops to NPHIES server)
  if (
    error.isAxiosError ||
    error.config ||
    error.response ||
    error.name === "AxiosError"
  ) {
    return false;
  }

  const code = String(error.code || "");
  const msg = String(error.message || "");

  const isOracleCode =
    code.startsWith("ORA-") ||
    code.startsWith("NJS-") ||
    code.startsWith("DPI-") ||
    code === "POOL_ACQUIRE_TIMEOUT";

  const hasOraclePattern = /ORA-\d{5}|NJS-\d{3}|DPI-\d{4}/i.test(msg);

  if (!isOracleCode && !hasOraclePattern && code !== "POOL_ACQUIRE_TIMEOUT") {
    return false;
  }

  const fatalPatterns = [
    /POOL_ACQUIRE_TIMEOUT/i,
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
  ];

  return fatalPatterns.some((re) => re.test(code) || re.test(msg));
}

/**
 * Initialize a single shared Oracle connection pool for a facility.
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
  connectTimeout = conf.connectTimeout ?? 20,
  userParam,
  passwordParam,
  connectStringParam,
  facilityId,
  poolScope = "job",
} = {}) {
  const poolKey = getPoolKey({ facilityId, userParam, connectStringParam });

  if (pools[poolKey]) {
    return pools[poolKey];
  }

  if (pendingPoolInitializations[poolKey]) {
    return await pendingPoolInitializations[poolKey];
  }

  const resolvedPoolMin =
    poolMin ?? (poolScope === "job" ? conf.jobPoolMin : conf.sharedPoolMin) ?? 0;
  const resolvedPoolMax = Math.max(
    poolMax ?? (poolScope === "job" ? conf.jobPoolMax : conf.sharedPoolMax) ?? 16,
    10,
  );
  const resolvedPoolIncrement =
    poolIncrement ??
    (poolScope === "job" ? conf.jobPoolIncrement : conf.sharedPoolIncrement) ??
    2;

  initOracleClient();

  pendingPoolInitializations[poolKey] = oracle
    .createPool({
      user: userParam || conf.user,
      password: passwordParam || conf.password,
      connectString: connectStringParam || conf.connectString,
      poolMin: resolvedPoolMin,
      poolMax: resolvedPoolMax,
      poolIncrement: resolvedPoolIncrement,
      poolTimeout: Number(poolTimeout) || 60,
      queueTimeout: Number(queueTimeout) || 60000,
      connectTimeout: Number(connectTimeout) || 20,
      enableStatistics: true,
    })
    .then((pool) => {
      pools[poolKey] = pool;
      oracleLogger.info(
        `✅ Oracle pool initialized for ${poolKey} (poolMax=${resolvedPoolMax}, poolMin=${resolvedPoolMin})`,
      );
      return pool;
    })
    .catch((error) => {
      oracleLogger.error(
        `Failed to create Oracle connection pool for ${poolKey}: ${error.message}`,
      );
      throw error;
    })
    .finally(() => {
      delete pendingPoolInitializations[poolKey];
    });

  return await pendingPoolInitializations[poolKey];
}

/**
 * Safely recreate the Oracle pool for a facility upon timeout or expired connection.
 * Concurrent requests await the same recreation promise.
 *
 * NOTE: The old pool is NOT force-closed immediately, so active in-flight queries
 * on other concurrent jobs for this facility can complete cleanly without NJS-003 errors.
 *
 * @param {object} [settings]
 * @param {string} [reason="unknown"]
 * @returns {Promise<oracle.Pool>}
 */
export async function recreateOraclePool(settings = {}, reason = "unknown") {
  const poolKey = getPoolKey(settings);

  if (pendingPoolRecreations[poolKey]) {
    return await pendingPoolRecreations[poolKey];
  }

  pendingPoolRecreations[poolKey] = (async () => {
    const oldPool = pools[poolKey];
    delete pools[poolKey];
    delete pendingPoolInitializations[poolKey];

    if (oldPool) {
      oracleLogger.warn(
        `Retiring old Oracle pool for ${poolKey} (reason: ${reason}). Existing in-flight connections will complete safely.`,
      );

      // Drain safely in background: wait until checked-out connections are returned
      // before closing, rather than force-killing active jobs.
      const closeWhenIdle = (poolToClose) => {
        const timer = setInterval(async () => {
          try {
            const inUse = poolToClose.connectionsInUse || 0;
            if (inUse === 0) {
              clearInterval(timer);
              await poolToClose.close(10);
              oracleLogger.debug(`Retired Oracle pool drained and closed for ${poolKey}`);
            }
          } catch (_) {
            clearInterval(timer);
          }
        }, 2000);
        if (typeof timer.unref === "function") timer.unref();

        // Fallback: close after 5 minutes if a connection leaked
        const hardTimeout = setTimeout(async () => {
          clearInterval(timer);
          try {
            await poolToClose.close(10);
          } catch (_) {}
        }, 5 * 60 * 1000);
        if (typeof hardTimeout.unref === "function") hardTimeout.unref();
      };

      closeWhenIdle(oldPool);
    }

    oracleLogger.info(`Recreating fresh Oracle pool for ${poolKey}...`);
    return await initOraclePool(settings);
  })().finally(() => {
    delete pendingPoolRecreations[poolKey];
  });

  return await pendingPoolRecreations[poolKey];
}

/**
 * Acquire a connection from the facility's pool.
 * Automatically initializes the pool on first request and recreates it if an
 * unrecoverable timeout or connection drop occurs.
 *
 * @param {object} [settings]
 * @param {number} [acquireTimeout=45000]
 * @param {object} [retryOptions]
 * @returns {Promise<oracle.Connection>}
 */
export async function getOracleConnection(
  settings = {},
  acquireTimeout = 45000,
  retryOptions = {},
) {
  const maxRetries = retryOptions.maxRetries ?? 2;
  const abortSignal = retryOptions.abortSignal ?? settings.abortSignal ?? null;
  const poolKey = getPoolKey(settings);

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (abortSignal?.aborted) {
      const abortErr = new Error(
        `Aborted before acquiring Oracle connection for ${poolKey}`,
      );
      abortErr.name = "AbortError";
      throw abortErr;
    }

    try {
      // 1. Ensure pool exists
      let pool = pools[poolKey];
      if (!pool) {
        pool = await initOraclePool(settings);
      }

      // 2. Acquire connection with timeout
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutErr = new Error(
            `Pool getConnection timeout after ${acquireTimeout}ms for ${poolKey}`,
          );
          timeoutErr.code = "POOL_ACQUIRE_TIMEOUT";
          reject(timeoutErr);
        }, acquireTimeout);
      });

      const connection = await Promise.race([
        pool.getConnection(),
        timeoutPromise,
      ]).finally(() => {
        clearTimeout(timeoutId);
      });

      return connection;
    } catch (error) {
      lastError = error;

      if (error?.name === "AbortError" || abortSignal?.aborted) {
        throw error;
      }

      const isConnOrPoolErr = isOracleConnectionOrPoolError(error);

      if (attempt >= maxRetries || !isConnOrPoolErr) {
        oracleLogger.error(
          `Failed to get Oracle connection for ${poolKey} (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`,
        );
        throw error;
      }

      const backoffMs = (attempt + 1) * 1500;
      oracleLogger.warn(
        `Oracle connection attempt ${attempt + 1}/${maxRetries + 1} failed for ${poolKey} (${error.message}). Recreating pool and retrying in ${backoffMs}ms...`,
      );

      // Recreate pool on acquire timeout or broken pool
      try {
        await recreateOraclePool(settings, error.code || "ACQUIRE_TIMEOUT");
      } catch (recErr) {
        oracleLogger.error(
          `Error recreating pool for ${poolKey}: ${recErr.message}`,
        );
      }

      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  throw lastError;
}

/**
 * Build standard pool settings object for a facility record.
 *
 * @param {object} facility
 * @param {AbortSignal} [abortSignal]
 * @returns {object}
 */
export function getFacilityPoolSettings(facility, abortSignal = null) {
  const facilityId = facility?.facility_id ?? facility?.facilityId ?? null;

  return {
    facilityId,
    poolScope: "job",
    userParam: facility?.his_db_username,
    passwordParam: facility?.his_db_password,
    connectStringParam: `${facility?.his_db_host}:${facility?.his_db_port}/${facility?.his_db_name}`,
    abortSignal,
  };
}

/**
 * Wrap a job handler so that:
 * 1. Fetches facility settings from PostgreSQL.
 * 2. Uses the shared pool for this facility (creates lazily once, reuses forever).
 * 3. Acquires a connection and executes the job.
 * 4. Automatically retries once if connection is lost.
 * 5. Guarantees connection is returned to pool in finally.
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

    const poolSettings = getFacilityPoolSettings(facility, abortSignal);
    const maxJobRetries = 1;
    let lastJobError = null;

    for (let jobAttempt = 0; jobAttempt <= maxJobRetries; jobAttempt++) {
      if (abortSignal?.aborted) {
        const abortErr = new Error(
          `[cron] Job aborted for facility ${facilityId}`,
        );
        abortErr.name = "AbortError";
        throw abortErr;
      }

      let connection = null;
      let dropConnectionOnClose = false;

      try {
        connection = await getOracleConnection(poolSettings, 45000, {
          maxRetries: 2,
          abortSignal,
        });

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

        if (!isConnErr || jobAttempt >= maxJobRetries || abortSignal?.aborted) {
          throw jobError;
        }

        oracleLogger.warn(
          `[cron] Job for facility ${facilityId} encountered an Oracle connection error ` +
            `(attempt ${jobAttempt + 1}/${maxJobRetries + 1}): ${jobError.message}. ` +
            `Retrying with fresh connection in 2000ms...`,
        );

        if (connection) {
          try {
            await connection.close({ drop: true });
          } catch (_) {}
          connection = null;
        }

        await new Promise((r) => setTimeout(r, 2000));
      } finally {
        if (connection) {
          try {
            await connection.close(
              dropConnectionOnClose ? { drop: true } : undefined,
            );
            oracleLogger.debug(
              `[cron] Connection released back to pool for facility ${facilityId}`,
            );
          } catch (closeErr) {
            oracleLogger.debug(
              `[cron] Error closing connection for facility ${facilityId}: ${closeErr.message}`,
            );
          }
        }
      }
    }

    throw lastJobError;
  };

/**
 * Close a specific Oracle connection pool.
 *
 * @param {number} [drainTime=5]
 * @param {string} [poolKey]
 * @returns {Promise<void>}
 */
export async function closeOraclePool(drainTime = 5, poolKey) {
  const targetPoolKey =
    poolKey || Object.keys(pools).find((k) => Boolean(pools[k]));
  if (!targetPoolKey) return;

  const pool = pools[targetPoolKey];
  if (pool) {
    try {
      delete pools[targetPoolKey];
      delete pendingPoolInitializations[targetPoolKey];
      delete pendingPoolRecreations[targetPoolKey];
      await pool.close(drainTime);
      oracleLogger.info(`✅ Oracle pool closed successfully: ${targetPoolKey}`);
    } catch (error) {
      oracleLogger.error(
        `Error closing Oracle pool ${targetPoolKey}: ${error.message}`,
      );
    }
  }
}

/**
 * Close all active Oracle connection pools (used on application/worker shutdown).
 *
 * @param {number} [drainTime=5]
 * @returns {Promise<void>}
 */
export async function closeAllOraclePools(drainTime = 5) {
  const poolKeys = Object.keys(pools);
  if (poolKeys.length === 0) return;

  oracleLogger.info(`Closing all Oracle pools (${poolKeys.length} active)...`);
  await Promise.all(poolKeys.map((key) => closeOraclePool(drainTime, key)));
  oracleLogger.info("✅ All Oracle pools closed");
}

/**
 * Get statistics of a pool.
 *
 * @param {object|string} [settings]
 * @returns {object|null}
 */
export function getPoolStatistics(settings = {}) {
  const poolKey =
    typeof settings === "string" ? settings : getPoolKey(settings);
  const pool = pools[poolKey];
  if (!pool) return null;
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
 * Get statistics of all pools.
 * @returns {Record<string, object>}
 */
export function getAllPoolStatistics() {
  const result = {};
  for (const key of Object.keys(pools)) {
    result[key] = getPoolStatistics(key);
  }
  return result;
}

/**
 * Diagnostics snapshot helper.
 *
 * @param {string|object} [poolKeyOrSettings={}]
 * @returns {object}
 */
export function getPoolDiagnostics(poolKeyOrSettings = {}) {
  const poolKey =
    typeof poolKeyOrSettings === "string"
      ? poolKeyOrSettings
      : getPoolKey(poolKeyOrSettings);
  return {
    poolKey,
    stats: getPoolStatistics(poolKey),
    hasPool: Boolean(pools[poolKey]),
    isInitializing: Boolean(pendingPoolInitializations[poolKey]),
    isRecreating: Boolean(pendingPoolRecreations[poolKey]),
  };
}

/**
 * Diagnostics snapshot helper for all known pools.
 * @returns {Record<string, object>}
 */
export function getAllPoolDiagnostics() {
  const result = {};
  const allKeys = new Set([
    ...Object.keys(pools),
    ...Object.keys(pendingPoolInitializations),
    ...Object.keys(pendingPoolRecreations),
  ]);
  for (const key of allKeys) {
    result[key] = getPoolDiagnostics(key);
  }
  return result;
}

/**
 * Health check on a pool by executing a lightweight SELECT 1 FROM DUAL.
 *
 * @param {string} poolKey
 * @returns {Promise<boolean>}
 */
export async function checkOraclePoolHealth(poolKey) {
  const pool = pools[poolKey];
  if (!pool) return false;
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.execute("SELECT 1 FROM DUAL");
    return Boolean(result?.rows?.length);
  } catch (error) {
    return false;
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (_) {}
    }
  }
}
