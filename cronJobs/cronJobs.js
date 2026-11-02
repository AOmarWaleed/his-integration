// cronJobs/cronJobs.js
import dt, { TIMEZONES } from "../lib/dayjs/datetime.js";
import * as appJobModel from "../Models/appJobModel.js";
import { JobOperation, JobLogStatus } from "../enums/job.enum.js";
import { clientLogger } from "../config/logger.js";
import { COLOR } from "../util/constant.js";

/**
 * Timezone used for log rendering and wall-clock interpretation.
 * Falls back to the IANA name if the shared constant is unavailable.
 */
const SAUDI_TZ = TIMEZONES?.SAUDI || "Asia/Riyadh";

/**
 * Job names excluded from scheduling.
 * Mirrors EXCLUDED_JOB_NAMES in appJobModel for defense in depth.
 * @type {Set<string>}
 */
const EXCLUDED_JOB_NAMES = new Set(["Import Prescription"]);

/**
 * Maximum wall-clock time a single job execution is allowed to run before
 * being aborted so a hung socket / DB call can never leave `isRunning = true` forever.
 */
const MAX_JOB_EXECUTION_MS = 20 * 60 * 1000; // 20 minutes

/**
 * All currently registered cron jobs.
 * Key: `${jobAction}|${facilityId}`
 * Value: {
 *   jobId, jobAction, facilityId, repeatMinutes, startDate,
 *   nextRunDate, isRunning, abortController, timeoutHandle
 * }
 * @type {Map<string, object>}
 */
const runningJobs = new Map();

/**
 * Job handlers registry.
 * Key: jobAction
 * Value: async (repeatMinutes, facilityId, abortSignal) => Promise<void>
 * @type {Map<string, Function>}
 */
const jobHandlers = new Map();

let syncTimer = null;
let isStopping = false;

/**
 * Register a handler for a jobAction.
 * @param {string} jobAction
 * @param {Function} handler
 */
export function registerJobHandler(jobAction, handler) {
  jobHandlers.set(jobAction, handler);
}

/**
 * Register multiple handlers from a definitions array.
 * @param {Array<{ jobAction:string, processFunction:Function }>} definitions
 */
export function registerJobHandlers(definitions) {
  for (const def of definitions) {
    jobHandlers.set(def.jobAction, def.processFunction);
  }
}

/**
 * Compute the next run date anchored on startDate and repeatMinutes.
 *
 * Formula:
 *   k = ceil((from - startDate) / repeatMinutes)
 *   next = startDate + k * repeatMinutes
 *   if next <= from -> next += repeatMinutes
 *
 * All arithmetic is performed in absolute (UTC) milliseconds,
 * so the result is timezone-independent.
 *
 * @param {object} params
 * @param {Date} params.startDate
 * @param {number} params.repeatMinutes
 * @param {Date} [params.from=new Date()]
 * @returns {Date}
 */
function computeNextRunDate({ startDate, repeatMinutes, from = new Date() }) {
  const startMs = startDate.getTime();
  const fromMs = from.getTime();
  const stepMs = repeatMinutes * 60 * 1000;

  const k = Math.ceil((fromMs - startMs) / stepMs);
  let nextMs = startMs + k * stepMs;

  if (nextMs <= fromMs) {
    nextMs += stepMs;
  }

  return new Date(nextMs);
}

/**
 * Resolve a job's next run date from the DB row.
 * Rules:
 *  - If repeat_minutes is null/0 -> return null (job cannot be scheduled).
 *  - If start_date is null -> use now as anchor (not persisted).
 *  - If next_run_date exists and is in the future -> use it.
 *  - Otherwise compute it from startDate + repeatMinutes.
 *
 * @param {object} job
 * @returns {{ nextRunDate: Date|null, computed: boolean }}
 */
function resolveNextRunDate(job) {
  const repeatMinutes = Number(job.repeat_minutes);

  if (!Number.isFinite(repeatMinutes) || repeatMinutes <= 0) {
    return { nextRunDate: null, computed: false };
  }

  const startDate = job.start_date ? new Date(job.start_date) : new Date();
  const now = new Date();

  if (job.next_run_date) {
    const existing = new Date(job.next_run_date);
    if (existing.getTime() > now.getTime()) {
      return { nextRunDate: existing, computed: false };
    }
  }

  const computed = computeNextRunDate({
    startDate,
    repeatMinutes,
    from: now,
  });

  return { nextRunDate: computed, computed: true };
}

/**
 * Format a Date for logs using Riyadh wall-clock time.
 * @param {Date|string|null|undefined} value
 * @returns {string}
 */
function formatForLog(value) {
  if (!value) return "null";
  const formatted = dt.formatDateTime(value, { tz: SAUDI_TZ });
  return formatted || "invalid";
}

/**
 * Compute the delay in milliseconds until the given date.
 * Clamped to >= 0.
 * @param {Date} date
 * @returns {number}
 */
function delayUntil(date) {
  return Math.max(0, date.getTime() - Date.now());
}

/**
 * Schedule the next execution for a job entry.
 * If the entry is currently running, skip this tick, log it,
 * and reschedule for the next slot.
 * @param {string} key
 */
function scheduleNext(key) {
  const entry = runningJobs.get(key);
  if (!entry || isStopping) return;

  if (entry.isRunning) {
    const reason = `still_running; scheduled_at=${formatForLog(entry.nextRunDate)}`;
    clientLogger.warn(
      `${COLOR.yellow}[cronJobs] SKIP ${key} | jobId=${entry.jobId} | facilityId=${entry.facilityId} | ${reason}${COLOR.reset}`,
    );
    appJobModel.logSkippedJob(entry.jobId, reason).catch((e) =>
      clientLogger.warn(
        `${COLOR.yellow}[cronJobs] ${key} failed to log skip: ${e.message}${COLOR.reset}`,
      ),
    );

    const next = computeNextRunDate({
      startDate: entry.startDate,
      repeatMinutes: entry.repeatMinutes,
      from: new Date(),
    });
    entry.nextRunDate = next;
    setEntryTimeout(key, next);
    return;
  }

  setEntryTimeout(key, entry.nextRunDate);
}

/**
 * Create the setTimeout for the given entry and next date.
 * @param {string} key
 * @param {Date} nextDate
 */
function setEntryTimeout(key, nextDate) {
  const entry = runningJobs.get(key);
  if (!entry) return;

  if (entry.timeoutHandle) {
    clearTimeout(entry.timeoutHandle);
    entry.timeoutHandle = null;
  }

  if (!nextDate || Number.isNaN(nextDate.getTime())) {
    clientLogger.warn(
      `${COLOR.yellow}[cronJobs] ${key} has no valid next run date; not scheduling${COLOR.reset}`,
    );
    return;
  }

  const delay = delayUntil(nextDate);

  clientLogger.info(
    `${COLOR.cyan}[cronJobs] SCHEDULE ${key} | jobId=${entry.jobId} | facilityId=${entry.facilityId} | repeat=${entry.repeatMinutes}m | next_run_at=${formatForLog(nextDate)} | in_ms=${delay}${COLOR.reset}`,
  );

  entry.timeoutHandle = setTimeout(() => {
    runJob(key).catch((e) =>
      clientLogger.error(
        `${COLOR.red}[cronJobs] ${key} run error: ${e.message}${COLOR.reset}`,
      ),
    );
  }, delay);

  // Allow the process to exit even if a timer is pending.
  if (typeof entry.timeoutHandle.unref === "function") {
    entry.timeoutHandle.unref();
  }
}

/**
 * Run a job once, guarding against overlapping executions.
 * Updates app_job_log and app_job counters, then schedules the next run.
 * @param {string} key
 */
async function runJob(key) {
  const entry = runningJobs.get(key);
  if (!entry || isStopping) return;

  if (entry.isRunning) {
    const reason = `still_running; scheduled_at=${formatForLog(entry.nextRunDate)}`;
    clientLogger.warn(
      `${COLOR.yellow}[cronJobs] SKIP ${key} | jobId=${entry.jobId} | facilityId=${entry.facilityId} | ${reason}${COLOR.reset}`,
    );
    appJobModel.logSkippedJob(entry.jobId, reason).catch((e) =>
      clientLogger.warn(
        `${COLOR.yellow}[cronJobs] ${key} failed to log skip: ${e.message}${COLOR.reset}`,
      ),
    );
    scheduleNext(key);
    return;
  }

  const handler = jobHandlers.get(entry.jobAction);
  if (!handler) {
    clientLogger.warn(
      `${COLOR.yellow}[cronJobs] No handler for ${entry.jobAction}${COLOR.reset}`,
    );
    return;
  }

  entry.isRunning = true;
  entry.abortController = new AbortController();
  const runAbortController = entry.abortController;
  const startTime = Date.now();
  const scheduledAt = entry.nextRunDate;

  let logId = null;
  let success = false;
  let failureMessage = null;
  let summary = {};
  let executionTimeoutId = null;

  try {
    try {
      logId = await appJobModel.startJobLog(
        entry.jobId,
        JobOperation.CRON_JOB_HL7,
        entry.facilityId,
      );
      await appJobModel.updateJobLastRun(entry.jobId);
    } catch (logError) {
      clientLogger.error(
        `${COLOR.red}[cronJobs] ${key} failed to open log: ${logError.message}${COLOR.reset}`,
      );
    }

    clientLogger.info(
      `${COLOR.green}${COLOR.bold}[cronJobs] START ${key} | jobId=${entry.jobId} | facilityId=${entry.facilityId} | repeat=${entry.repeatMinutes}m | scheduled_at=${formatForLog(scheduledAt)} | started_at=${formatForLog(new Date())}${COLOR.reset}`,
    );

    summary = await Promise.race([
      handler(
        entry.repeatMinutes,
        entry.facilityId,
        runAbortController.signal,
      ),
      new Promise((_, reject) => {
        executionTimeoutId = setTimeout(() => {
          try {
            runAbortController.abort();
          } catch (_) {
            // ignore abort error
          }
          reject(
            new Error(
              `Job execution timed out after ${Math.round(MAX_JOB_EXECUTION_MS / 60000)} minutes`,
            ),
          );
        }, MAX_JOB_EXECUTION_MS);
        if (typeof executionTimeoutId.unref === "function") {
          executionTimeoutId.unref();
        }
      }),
    ]);

    clientLogger.info(`[CRON JOB SUMMARY]`, JSON.stringify(summary));

    success = true;
  } catch (error) {
    failureMessage = error.message;
    clientLogger.error(
      `${COLOR.red}${COLOR.bold}[cronJobs] FAIL ${key} | jobId=${entry.jobId} | facilityId=${entry.facilityId} | error=${error.message}${COLOR.reset}`,
    );
  } finally {
    if (executionTimeoutId) {
      clearTimeout(executionTimeoutId);
      executionTimeoutId = null;
    }
    const runSeconds = (Date.now() - startTime) / 1000;
    const runMs = Date.now() - startTime;
    const finishedAt = new Date();

    // Compute next_run_date:
    //  - finished before the scheduled slot -> now + repeatMinutes
    //  - finished at/after the slot -> recompute from now
    let nextRunDate = null;
    if (entry.repeatMinutes > 0) {
      const scheduledMs = scheduledAt ? scheduledAt.getTime() : 0;
      if (finishedAt.getTime() < scheduledMs) {
        nextRunDate = new Date(
          finishedAt.getTime() + entry.repeatMinutes * 60 * 1000,
        );
      } else {
        nextRunDate = computeNextRunDate({
          startDate: entry.startDate,
          repeatMinutes: entry.repeatMinutes,
          from: finishedAt,
        });
      }
    }

    entry.nextRunDate = nextRunDate;

    if (logId) {
      try {
        await appJobModel.endJobLog(
          logId,
          success ? JobLogStatus.SUCCESS : JobLogStatus.FAIL,
          Math.trunc(runSeconds),
          success ? (summary ? (summary?.message || "Completed successfully") : "Completed successfully") : `Error: ${failureMessage}`,
        );
      } catch (logError) {
        clientLogger.error(
          `${COLOR.red}[cronJobs] ${key} failed to close log: ${logError.message}${COLOR.reset}`,
        );
      }
    }

    try {
      if (success) {
        await appJobModel.markJobSuccess(
          entry.jobId,
          runSeconds,
          nextRunDate,
        );
      } else {
        await appJobModel.markJobFailure(
          entry.jobId,
          runSeconds,
          nextRunDate,
        );
      }
    } catch (dbError) {
      clientLogger.error(
        `${COLOR.red}[cronJobs] ${key} failed to update counters: ${dbError.message}${COLOR.reset}`,
      );
    }

    if (success) {
      clientLogger.debug(
        `${COLOR.green}${COLOR.bold}[cronJobs] DONE ${key} | jobId=${entry.jobId} | facilityId=${entry.facilityId} | run_ms=${runMs} | run_seconds=${Math.trunc(runSeconds)} | next_run_at=${formatForLog(nextRunDate)}${COLOR.reset}`,
      );
    } else {
      clientLogger.error(
        `${COLOR.red}${COLOR.bold}[cronJobs] FAILED ${key} | jobId=${entry.jobId} | facilityId=${entry.facilityId} | run_ms=${runMs} | run_seconds=${Math.trunc(runSeconds)} | next_run_at=${formatForLog(nextRunDate)} | error=${failureMessage}${COLOR.reset}`,
      );
    }

    entry.isRunning = false;

    if (!isStopping) {
      scheduleNext(key);
    }
  }
}

/**
 * Add a new job to the registry and schedule it.
 * If next_run_date is missing or in the past, it is recomputed and persisted.
 * Excluded job names are ignored.
 * @param {object} job - DB row from app_job
 */
async function addJob(job) {
  const jobAction = job.job_action;
  const facilityId = String(job.facility_id);
  const key = `${jobAction}|${facilityId}`;

  if (runningJobs.has(key)) return;

  if (EXCLUDED_JOB_NAMES.has(job.job_name)) {
    clientLogger.info(
      `${COLOR.yellow}[cronJobs] Skipping excluded job ${key} (job_name=${job.job_name})${COLOR.reset}`,
    );
    return;
  }

  if (!jobHandlers.has(jobAction)) {
    clientLogger.warn(
      `${COLOR.yellow}[cronJobs] Cannot add ${key}: no handler registered${COLOR.reset}`,
    );
    return;
  }

  const repeatMinutes = Number(job.repeat_minutes);
  if (!Number.isFinite(repeatMinutes) || repeatMinutes <= 0) {
    clientLogger.warn(
      `${COLOR.yellow}[cronJobs] Cannot add ${key}: invalid repeat_minutes=${job.repeat_minutes}; clearing next_run_date${COLOR.reset}`,
    );
    try {
      await appJobModel.clearNextRunDate(job.job_id);
    } catch (e) {
      clientLogger.warn(
        `${COLOR.yellow}[cronJobs] ${key} failed to clear next_run_date: ${e.message}${COLOR.reset}`,
      );
    }
    return;
  }

  const startDate = job.start_date ? new Date(job.start_date) : new Date();
  const { nextRunDate, computed } = resolveNextRunDate(job);

  const entry = {
    jobId: job.job_id,
    jobAction,
    facilityId,
    repeatMinutes,
    startDate,
    nextRunDate,
    isRunning: false,
    abortController: new AbortController(),
    timeoutHandle: null,
  };

  runningJobs.set(key, entry);

  clientLogger.debug(
    `${COLOR.green}${COLOR.bold}[cronJobs] ADDED ${key} | jobId=${entry.jobId} | facilityId=${entry.facilityId} | repeat=${repeatMinutes}m | start_date=${formatForLog(startDate)} | next_run_at=${formatForLog(nextRunDate)} | computed=${computed}${COLOR.reset}`,
  );

  if (computed && nextRunDate) {
    try {
      await appJobModel.setNextRunDate(job.job_id, nextRunDate);
    } catch (e) {
      clientLogger.warn(
        `${COLOR.yellow}[cronJobs] ${key} failed to persist next_run_date: ${e.message}${COLOR.reset}`,
      );
    }
  }

  setEntryTimeout(key, nextRunDate);
}

/**
 * Remove a job from the registry, clear its timer, abort any in-flight
 * execution, and clear next_run_date in the DB.
 * @param {string} key
 */
function removeJob(key) {
  const entry = runningJobs.get(key);
  if (!entry) return;

  if (entry.timeoutHandle) {
    try {
      clearTimeout(entry.timeoutHandle);
    } catch (e) {
      clientLogger.warn(
        `${COLOR.yellow}[cronJobs] Failed to clear timer for ${key}: ${e.message}${COLOR.reset}`,
      );
    }
    entry.timeoutHandle = null;
  }

  try {
    entry.abortController.abort();
  } catch (e) {
    clientLogger.warn(
      `${COLOR.yellow}[cronJobs] Failed to abort ${key}: ${e.message}${COLOR.reset}`,
    );
  }

  runningJobs.delete(key);

  clientLogger.warn(
    `${COLOR.red}${COLOR.bold}[cronJobs] REMOVED ${key} | jobId=${entry.jobId} | facilityId=${entry.facilityId}${COLOR.reset}`,
  );

  appJobModel.clearNextRunDate(entry.jobId).catch((e) =>
    clientLogger.warn(
      `${COLOR.yellow}[cronJobs] ${key} failed to clear next_run_date: ${e.message}${COLOR.reset}`,
    ),
  );
}

/**
 * Fetch the desired state from the DB.
 * @returns {Promise<Map<string, object>>}
 */
async function fetchDesiredState() {
  const { rows } = await appJobModel.getAllEnabledJobs();
  const desired = new Map();
  for (const row of rows) {
    const key = `${row.job_action}|${String(row.facility_id)}`;
    desired.set(key, row);
  }
  return desired;
}

/**
 * Reconcile the running registry with the DB.
 */
async function sync() {
  if (isStopping) return;

  const startedAt = Date.now();
  clientLogger.debug(
    `${COLOR.cyan}${COLOR.bold}[cronJobs] TICK — checking...${COLOR.reset}`,
  );

  const desired = await fetchDesiredState();
  const current = new Set(runningJobs.keys());
  const desiredKeys = new Set(desired.keys());

  let added = 0;
  let removed = 0;
  let rescheduled = 0;

  for (const key of current) {
    if (!desiredKeys.has(key)) {
      removeJob(key);
      removed++;
    }
  }

  for (const [key, row] of desired) {
    const entry = runningJobs.get(key);

    if (!entry) {
      await addJob(row);
      added++;
      continue;
    }

    const newRepeat = Number(row.repeat_minutes);
    const repeatChanged = newRepeat !== entry.repeatMinutes;

    if (repeatChanged) {
      clientLogger.warn(
        `${COLOR.yellow}[cronJobs] Interval changed for ${key}: ${entry.repeatMinutes}m -> ${newRepeat}m; rescheduling${COLOR.reset}`,
      );
      removeJob(key);
      // Force recompute: pass next_run_date = null so addJob recomputes
      // from start_date + new repeat_minutes.
      await addJob({ ...row, next_run_date: null });
      rescheduled++;
    }
  }

  const tookMs = Date.now() - startedAt;
  if (added === 0 && removed === 0 && rescheduled === 0) {
    clientLogger.debug(
      `${COLOR.cyan}[cronJobs] TICK — no changes (${desiredKeys.size} active) in ${tookMs}ms${COLOR.reset}`,
    );
  } else {
    clientLogger.info(
      `${COLOR.magenta}${COLOR.bold}[cronJobs] TICK — +${added} added, -${removed} removed, ~${rescheduled} rescheduled in ${tookMs}ms${COLOR.reset}`,
    );
  }
}

/**
 * Start the periodic sync loop.
 * @param {number} [intervalMs=30000]
 */
export function startSyncLoop(intervalMs = 30_000) {
  if (syncTimer) return;

  syncTimer = setInterval(() => {
    setImmediate(() => {
      sync().catch((e) =>
        clientLogger.error(
          `${COLOR.red}[cronJobs] Sync error: ${e.message}${COLOR.reset}`,
        ),
      );
    });
  }, intervalMs);

  clientLogger.debug(
    `${COLOR.blue}${COLOR.bold}[cronJobs] Sync loop started (${intervalMs / 1000}s)${COLOR.reset}`,
  );

  // Run one immediate cycle so enabled jobs start right away.
  setImmediate(() => {
    sync().catch((e) =>
      clientLogger.error(
        `${COLOR.red}[cronJobs] Initial sync error: ${e.message}${COLOR.reset}`,
      ),
    );
  });
}

/**
 * Stop the sync loop and all scheduled jobs.
 */
export function stopAll() {
  isStopping = true;

  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }

  for (const [key, entry] of runningJobs.entries()) {
    if (entry.timeoutHandle) {
      try {
        clearTimeout(entry.timeoutHandle);
      } catch (e) {
        clientLogger.warn(
          `${COLOR.yellow}[cronJobs] Failed to clear timer for ${key}: ${e.message}${COLOR.reset}`,
        );
      }
      entry.timeoutHandle = null;
    }
    try {
      entry.abortController?.abort();
    } catch (e) {
      clientLogger.warn(
        `${COLOR.yellow}[cronJobs] Failed to abort ${key}: ${e.message}${COLOR.reset}`,
      );
    }
  }

  runningJobs.clear();

  clientLogger.info(
    `${COLOR.blue}${COLOR.bold}[cronJobs] All jobs stopped${COLOR.reset}`,
  );
}

/**
 * Return a snapshot of the current registry (for diagnostics).
 * @returns {Array<object>}
 */
export function getStatus() {
  const out = [];
  for (const [key, entry] of runningJobs.entries()) {
    out.push({
      key,
      jobId: entry.jobId,
      jobAction: entry.jobAction,
      facilityId: entry.facilityId,
      repeatMinutes: entry.repeatMinutes,
      startDate: entry.startDate,
      nextRunDate: entry.nextRunDate,
      isRunning: entry.isRunning,
    });
  }
  return out;
}