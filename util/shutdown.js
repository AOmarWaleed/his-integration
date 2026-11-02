import { clientLogger } from "../config/logger.js";
import { COLOR } from "./constant.js";



/**
 * Default timeouts used by the shutdown sequence (ms).
 * Every step has a hard cap so a single hung resource cannot block exit.
 */
const DEFAULT_TIMEOUTS = {
  httpServer: 1_500,
  database: 1_000,
  oracle: 1_000,
  jobs: 2_000,
  total: 5_000,
};

/**
 * Create a shutdown handler usable by both the API and the worker.
 *
 * Behavior:
 *  - Idempotent: the first call runs the full sequence; any further call
 *    (e.g. a second SIGINT) forces an immediate exit with code 0.
 *  - Every cleanup step runs in its own try/catch with its own timeout.
 *    A failing or slow step never blocks the remaining steps.
 *  - A global force-exit timer guarantees the process always terminates,
 *    even if a step hangs.
 *  - Any in-flight async work that keeps the event loop alive is
 *    intentionally abandoned; `process.exit()` is called explicitly.
 *
 * @param {object} options
 * @param {object|null} [options.server=null] - Node HTTP server (API only).
 * @param {Function|null} [options.stopJobs=null] - Cron-jobs cleanup (worker only).
 * @param {Function} options.closeDatabasePool - Required. Closes the PostgreSQL pool.
 * @param {Function} options.closeOraclePools - Required. Closes all Oracle pools.
 * @param {object} [options.timeouts] - Override default timeouts (ms).
 * @param {object} [options.labels] - Custom labels shown in logs (e.g. `{ process: "worker" }`).
 * @returns {(signal?: string) => Promise<void>}
 */
export function createShutdownHandler({
  server = null,
  stopJobs = null,
  closeDatabasePool,
  closeOraclePools,
  timeouts = {},
  labels = {},
} = {}) {
  if (typeof closeDatabasePool !== "function") {
    throw new Error("createShutdownHandler: closeDatabasePool is required");
  }
  if (typeof closeOraclePools !== "function") {
    throw new Error("createShutdownHandler: closeOraclePools is required");
  }

  const T = { ...DEFAULT_TIMEOUTS, ...timeouts };
  const processName = labels.process || "process";

  let shuttingDown = false;

  /**
   * Run a cleanup step with a hard timeout.
   * Never throws; logs the outcome.
   *
   * @param {string} label
   * @param {Function} fn
   * @param {number} timeoutMs
   * @returns {Promise<boolean>} true if the step completed cleanly.
   */
  async function runStep(label, fn, timeoutMs) {
    if (typeof fn !== "function") {
      return true;
    }

    const startedAt = Date.now();
    try {
      await Promise.race([
        Promise.resolve().then(fn),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ]);
      const took = Date.now() - startedAt;
      clientLogger.info(
        `${COLOR.green}[shutdown:${processName}] ${label} closed (${took}ms)${COLOR.reset}`,
      );
      return true;
    } catch (error) {
      const took = Date.now() - startedAt;
      clientLogger.error(
        `${COLOR.red}[shutdown:${processName}] ${label} failed after ${took}ms: ${error.message}${COLOR.reset}`,
      );
      return false;
    }
  }

  /**
   * The actual shutdown routine.
   * @param {string} [signal="shutdown"]
   */
  return async function shutdown(signal = "shutdown") {
    if (shuttingDown) {
      clientLogger.warn(
        `${COLOR.yellow}[shutdown:${processName}] Already in progress (${signal}); forcing exit${COLOR.reset}`,
      );
      process.exit(0);
    }

    shuttingDown = true;
    const startedAt = Date.now();

    clientLogger.info(
      `${COLOR.cyan}${COLOR.bold}[shutdown:${processName}] Started (${signal})${COLOR.reset}`,
    );

    // Block any further SIGINT/SIGTERM from re-entering the sequence.
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.on("SIGINT", () => process.exit(0));
    process.on("SIGTERM", () => process.exit(0));

    // Global safety net: if the whole sequence takes too long, exit anyway.
    const forceExitTimer = setTimeout(() => {
      clientLogger.error(
        `${COLOR.red}${COLOR.bold}[shutdown:${processName}] Total timeout (${T.total}ms); forcing exit${COLOR.reset}`,
      );
      process.exit(1);
    }, T.total);
    forceExitTimer.unref();

    // 1) HTTP server (API only)
    if (server) {
      await runStep(
        "HTTP server",
        () =>
          new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
        T.httpServer,
      );
    }

    // 2) Cron jobs (worker only)
    if (stopJobs) {
      await runStep("Cron jobs", stopJobs, T.jobs);
    }

    // 3) PostgreSQL pool
    await runStep("PostgreSQL pool", closeDatabasePool, T.database);

    // 4) Oracle pools
    await runStep("Oracle pools", closeOraclePools, T.oracle);

    const totalMs = Date.now() - startedAt;
    clientLogger.info(
      `${COLOR.green}${COLOR.bold}[shutdown:${processName}] Complete in ${totalMs}ms${COLOR.reset}`,
    );

    clearTimeout(forceExitTimer);

    // Force-exit: any pending async work (e.g. an in-flight loop) is abandoned.
    process.exit(0);
  };
}