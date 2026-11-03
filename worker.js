// worker.js
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = "64";
}

import { clientLogger } from "./config/logger.js";
import {
  checkDatabaseConnection,
  closeDatabasePool,
  configureDatabasePool,
} from "./config/pgDB.js";
import { closeAllOraclePools } from "./config/oracle-dynamic.js";
import * as appJobModel from "./Models/appJobModel.js";
import {
  registerJobHandlers,
  startSyncLoop,
  stopAll,
} from "./cronJobs/cronJobs.js";
import { getThirdPartyJobDefinitions } from "./cronJobs/index.js";

let shuttingDown = false;

/**
 * Graceful shutdown.
 * Closes cron jobs, all active Oracle facility pools, and PostgreSQL connection pool.
 *
 * @param {string} signal
 */
async function shutdown(signal = "shutdown") {
  if (shuttingDown) {
    clientLogger.warn(`Shutdown already in progress (${signal}); forcing exit`);
    process.exit(0);
  }

  shuttingDown = true;
  clientLogger.info(`Worker shutdown started (${signal})`);

  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  const forceExitTimer = setTimeout(() => {
    clientLogger.error("Shutdown timeout (6s); forcing exit");
    process.exit(1);
  }, 6000);
  forceExitTimer.unref();

  try {
    await stopAll();
  } catch (error) {
    clientLogger.warn(`Error stopping cron jobs: ${error.message}`);
  }

  try {
    await Promise.race([
      closeAllOraclePools(3),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch (error) {
    clientLogger.error(`Error closing Oracle pools: ${error.message}`);
  }

  try {
    await Promise.race([
      closeDatabasePool(),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
    clientLogger.info("PostgreSQL pool closed");
  } catch (error) {
    clientLogger.error(`Error closing PostgreSQL pool: ${error.message}`);
  }

  clientLogger.info("Worker stopped");
  clearTimeout(forceExitTimer);
  process.exit(0);
}

/**
 * Bootstrap the worker:
 *  1. Configure DB and verify connectivity.
 *  2. Clean up orphaned RUNNING logs from previous runs.
 *  3. Register all job handlers.
 *  4. Start the periodic sync loop (immediate first tick).
 * @returns {Promise<void>}
 */
async function startWorker() {
  try {
    configureDatabasePool({ role: "worker" });

    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      throw new Error("PostgreSQL connection failed");
    }

    const cleaned = await appJobModel.cleanupOrphanedRunningLogs(15);
    if (cleaned > 0) {
      clientLogger.warn(
        `[worker] Cleaned up ${cleaned} orphaned RUNNING log row(s)`,
      );
    }

    const definitions = getThirdPartyJobDefinitions();
    registerJobHandlers(definitions);
    clientLogger.info(
      `[worker] Registered ${definitions.length} job handlers`,
    );

    startSyncLoop(30_000);

    clientLogger.info("[worker] Started");
  } catch (error) {
    clientLogger.error(`[worker] Startup failed: ${error.message}`);
    await shutdown("startup-failure");
  }
}

process.on("SIGTERM", () => {
  clientLogger.debug("CLOSING (SIGTERM) >>>>>>>>>>>>>>>>");
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  clientLogger.debug("CLOSING (SIGINT) >>>>>>>>>>>>>>>>");
  shutdown("SIGINT");
});

process.on("unhandledRejection", (reason) => {
  clientLogger.error(`Unhandled Rejection: ${reason?.stack || reason}`);
});

process.on("uncaughtException", (error) => {
  clientLogger.error(`Uncaught Exception: ${error?.stack || error}`);
});

startWorker();
