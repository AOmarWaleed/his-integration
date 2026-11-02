// Models/appJobModel.js
import { query } from "../config/pgDB.js";
import { clientLogger } from "../config/logger.js";

/**
 * Columns returned by scheduling-related queries.
 * Kept in one place to avoid drift between SELECTs.
 */
const JOB_SELECT_COLUMNS = `
  job_id,
  job_name,
  job_action,
  enabled,
  repeat_minutes,
  facility_id,
  start_date,
  next_run_date,
  last_start_date,
  creation_date
`;

/**
 * Job names excluded from scheduling and listing.
 * These jobs exist in app_job but must not be picked up by the
 * scheduler or returned by job-listing queries.
 * @type {ReadonlyArray<string>}
 */
const EXCLUDED_JOB_NAMES = Object.freeze(["Import Prescription"]);

/**
 * Build a SQL fragment that excludes EXCLUDED_JOB_NAMES from a query.
 *
 * Uses positional placeholders ($N) instead of a single array parameter
 * because node-postgres does not serialize JS arrays into PostgreSQL
 * array literals automatically for `<> ALL(...)` comparisons.
 *
 * @param {string} [column="job_name"] - Column to apply the exclusion to.
 * @param {number} [startIndex=1] - First positional parameter index to use.
 * @returns {{ clause: string, values: string[] }}
 */
function buildExclusionFilter(column = "job_name", startIndex = 1) {
  if (!EXCLUDED_JOB_NAMES.length) {
    return { clause: "", values: [] };
  }
  const placeholders = EXCLUDED_JOB_NAMES.map(
    (_, i) => `$${startIndex + i}`,
  ).join(", ");
  return {
    clause: ` AND ${column} NOT IN (${placeholders})`,
    values: [...EXCLUDED_JOB_NAMES],
  };
}

/**
 * Build a SQL fragment that excludes rows whose job_name is in
 * EXCLUDED_JOB_NAMES, using a NOT EXISTS subquery.
 *
 * Behaviour:
 *  - If the referenced job does not exist in app_job, the row is NOT
 *    excluded (so orphaned logs are still cleaned up).
 *  - If the referenced job exists and its name is excluded, the row IS
 *    excluded (left untouched).
 *
 * @param {string} [jobIdColumn="l.job_id"] - Column holding the job id.
 * @param {number} [startIndex=2] - First positional parameter index to use.
 * @returns {{ clause: string, values: string[] }}
 */
function buildExclusionSubquery(jobIdColumn = "l.job_id", startIndex = 2) {
  if (!EXCLUDED_JOB_NAMES.length) {
    return { clause: "", values: [] };
  }
  const placeholders = EXCLUDED_JOB_NAMES.map(
    (_, i) => `$${startIndex + i}`,
  ).join(", ");
  return {
    clause: ` AND NOT EXISTS (
      SELECT 1 FROM app_job j
      WHERE j.job_id = ${jobIdColumn}
        AND j.job_name IN (${placeholders})
    )`,
    values: [...EXCLUDED_JOB_NAMES],
  };
}

/**
 * Get a single job by name.
 * Returns null when the job is excluded.
 * @param {string} jobName
 * @returns {Promise<object|null>}
 */
export async function getJobByName(jobName) {
  try {
    if (EXCLUDED_JOB_NAMES.includes(jobName)) {
      return null;
    }
    const result = await query(
      `SELECT ${JOB_SELECT_COLUMNS}
       FROM app_job
       WHERE job_name = $1`,
      [jobName],
    );
    return result.rows?.[0] || null;
  } catch (error) {
    clientLogger.error(`Error getting job by name: ${error.message}`);
    throw error;
  }
}

/**
 * Get all jobs with a given name.
 * Excluded job names are filtered out.
 * @param {string} jobName
 * @returns {Promise<Array<object>>}
 */
export async function getAllJobsByName(jobName) {
  try {
    if (EXCLUDED_JOB_NAMES.includes(jobName)) {
      return [];
    }
    const result = await query(
      `SELECT ${JOB_SELECT_COLUMNS}
       FROM app_job
       WHERE job_name = $1`,
      [jobName],
    );
    return result.rows || [];
  } catch (error) {
    clientLogger.error(`Error getting jobs by name: ${error.message}`);
    throw error;
  }
}

/**
 * Get all jobs with a given action.
 * Excluded job names are filtered out.
 * @param {string} jobAction
 * @returns {Promise<Array<object>>}
 */
export async function getAllJobsByAction(jobAction) {
  try {
    const { clause, values } = buildExclusionFilter("job_name", 2);
    const result = await query(
      `SELECT ${JOB_SELECT_COLUMNS}
       FROM app_job
       WHERE job_action = $1${clause}`,
      [jobAction, ...values],
    );
    return result.rows || [];
  } catch (error) {
    clientLogger.error(`Error getting jobs by action: ${error.message}`);
    throw error;
  }
}

/**
 * Return all enabled jobs with a valid facility_id.
 * This is the source of truth for the periodic sync loop.
 * Excluded job names are filtered out.
 * @returns {Promise<{rows: Array<object>}>}
 */
export async function getAllEnabledJobs() {
  try {
    const { clause, values } = buildExclusionFilter("job_name", 1);
    return await query(
      `SELECT ${JOB_SELECT_COLUMNS}
       FROM app_job
       WHERE enabled = 'true'
         AND facility_id IS NOT NULL${clause}`,
      values,
    );
  } catch (error) {
    clientLogger.error(`Error getting enabled jobs: ${error.message}`);
    throw error;
  }
}

/**
 * Open a job log entry with status RUNNING.
 * @param {number} jobId
 * @param {string} operation
 * @param {string|number|null} [facilityId=null]
 * @returns {Promise<number|null>} The new log_id, or null on failure.
 */
export async function startJobLog(jobId, operation, facilityId = null) {
  try {
    const result = await query(
      `INSERT INTO app_job_log
         (job_id, operation, status, actual_start, facility_id)
       VALUES
         ($1, $2, 'running', CURRENT_TIMESTAMP, $3)
       RETURNING log_id`,
      [jobId, operation, facilityId],
    );
    return result.rows[0].log_id;
  } catch (error) {
    clientLogger.error(`Error starting job log: ${error.message}`);
    throw error;
  }
}

/**
 * Close a job log entry with a final status.
 * @param {number} logId
 * @param {"success"|"fail"|"cancelled"} status
 * @param {number} runSeconds
 * @param {string|null} [message=null]
 * @returns {Promise<boolean>}
 */
export async function endJobLog(logId, status, runSeconds, message = null) {
  try {
    await query(
      `UPDATE app_job_log
         SET status = $1,
             log_date = CURRENT_TIMESTAMP,
             run_seconds = $2,
             notes = $3,
             modification_date = CURRENT_TIMESTAMP
       WHERE log_id = $4`,
      [status, runSeconds, message, logId],
    );
    return true;
  } catch (error) {
    clientLogger.error(`Error ending job log: ${error.message}`);
    throw error;
  }
}

/**
 * Mark a job as started (updates last_start_date).
 * @param {number} jobId
 * @returns {Promise<void>}
 */
export async function updateJobLastRun(jobId) {
  try {
    await query(
      `UPDATE app_job
         SET last_start_date = CURRENT_TIMESTAMP,
             modification_date = CURRENT_TIMESTAMP
       WHERE job_id = $1`,
      [jobId],
    );
  } catch (error) {
    clientLogger.error(`Error updating job last run: ${error.message}`);
    throw error;
  }
}

/**
 * Record a successful run and persist the next scheduled run time
 * in a single UPDATE.
 * @param {number} jobId
 * @param {number} runSeconds
 * @param {Date} nextRunDate
 * @returns {Promise<void>}
 */
export async function markJobSuccess(jobId, runSeconds, nextRunDate) {
  try {
    await query(
      `UPDATE app_job
         SET run_count = COALESCE(run_count, 0) + 1,
             last_run_seconds = $2,
             last_start_date = CURRENT_TIMESTAMP,
             next_run_date = $3,
             modification_date = CURRENT_TIMESTAMP
       WHERE job_id = $1`,
      [jobId, Math.trunc(runSeconds), nextRunDate],
    );
  } catch (error) {
    clientLogger.error(`Error marking job success: ${error.message}`);
    throw error;
  }
}

/**
 * Record a failed run and persist the next scheduled run time
 * in a single UPDATE.
 * @param {number} jobId
 * @param {number} runSeconds
 * @param {Date} nextRunDate
 * @returns {Promise<void>}
 */
export async function markJobFailure(jobId, runSeconds, nextRunDate) {
  try {
    await query(
      `UPDATE app_job
         SET failure_count = COALESCE(failure_count, 0) + 1,
             last_run_seconds = $2,
             last_start_date = CURRENT_TIMESTAMP,
             next_run_date = $3,
             modification_date = CURRENT_TIMESTAMP
       WHERE job_id = $1`,
      [jobId, Math.trunc(runSeconds), nextRunDate],
    );
  } catch (error) {
    clientLogger.error(`Error marking job failure: ${error.message}`);
    throw error;
  }
}

/**
 * Persist the next scheduled run time for a job.
 * @param {number} jobId
 * @param {Date} nextRunDate
 * @returns {Promise<void>}
 */
export async function setNextRunDate(jobId, nextRunDate) {
  try {
    await query(
      `UPDATE app_job
         SET next_run_date = $2,
             modification_date = CURRENT_TIMESTAMP
       WHERE job_id = $1`,
      [jobId, nextRunDate],
    );
  } catch (error) {
    clientLogger.error(`Error setting next run date: ${error.message}`);
    throw error;
  }
}

/**
 * Clear the next scheduled run time for a job.
 * @param {number} jobId
 * @returns {Promise<void>}
 */
export async function clearNextRunDate(jobId) {
  try {
    await query(
      `UPDATE app_job
         SET next_run_date = NULL,
             modification_date = CURRENT_TIMESTAMP
       WHERE job_id = $1`,
      [jobId],
    );
  } catch (error) {
    clientLogger.error(`Error clearing next run date: ${error.message}`);
    throw error;
  }
}

/**
 * Insert a SKIPPED row into app_job_log when an execution is skipped
 * (e.g. because the previous run is still in progress).
 * @param {number} jobId
 * @param {string} reason
 * @returns {Promise<void>}
 */
export async function logSkippedJob(jobId, reason) {
  try {
    await query(
      `INSERT INTO app_job_log
         (job_id, operation, status, actual_start, notes)
       VALUES
         ($1, 'CRON_SKIP', 'cancelled', CURRENT_TIMESTAMP, $2)`,
      [jobId, reason],
    );
  } catch (error) {
    clientLogger.warn(`Could not log skipped job: ${error.message}`);
  }
}

/**
 * Fetch the execution history for a given job.
 * @param {number} jobId
 * @param {number} [limit=10]
 * @returns {Promise<Array<object>>}
 */
export async function getJobHistory(jobId, limit = 10) {
  try {
    const result = await query(
      `SELECT
         log_id,
         operation,
         status,
         actual_start,
         log_date,
         run_seconds,
         notes
       FROM app_job_log
       WHERE job_id = $1
       ORDER BY actual_start DESC
       LIMIT $2`,
      [jobId, limit],
    );
    return result.rows;
  } catch (error) {
    clientLogger.error(`Error getting job history: ${error.message}`);
    throw error;
  }
}

/**
 * Return aggregated statistics for a given job over the last 30 days.
 * @param {number} jobId
 * @returns {Promise<object>}
 */
export async function getJobStats(jobId) {
  try {
    const result = await query(
      `SELECT
         COUNT(*) AS total_runs,
         COUNT(*) FILTER (WHERE status = 'success') AS successful_runs,
         COUNT(*) FILTER (WHERE status = 'fail') AS failed_runs,
         AVG(run_seconds) FILTER (WHERE status = 'success') AS avg_duration,
         MAX(run_seconds) AS max_duration,
         MIN(run_seconds) FILTER (WHERE status = 'success') AS min_duration
       FROM app_job_log
       WHERE job_id = $1
         AND actual_start > CURRENT_TIMESTAMP - INTERVAL '30 days'`,
      [jobId],
    );
    return result.rows[0];
  } catch (error) {
    clientLogger.error(`Error getting job stats: ${error.message}`);
    throw error;
  }
}

/**
 * Enable or disable a job.
 * When disabling, next_run_date is cleared so the scheduler
 * does not pick it up again.
 * @param {number} jobId
 * @param {"true"|"false"} enabled
 * @returns {Promise<boolean>}
 */
export async function toggleJob(jobId, enabled) {
  try {
    if (enabled === "false") {
      await query(
        `UPDATE app_job
           SET enabled = $1,
               next_run_date = NULL,
               modification_date = CURRENT_TIMESTAMP
         WHERE job_id = $2`,
        [enabled, jobId],
      );
    } else {
      await query(
        `UPDATE app_job
           SET enabled = $1,
               modification_date = CURRENT_TIMESTAMP
         WHERE job_id = $2`,
        [enabled, jobId],
      );
    }
    return true;
  } catch (error) {
    clientLogger.error(`Error toggling job: ${error.message}`);
    throw error;
  }
}

/**
 * Mark orphaned RUNNING log rows as FAIL. Intended to be called once at
 * worker startup so that rows left behind by a previous crash do not stay
 * in the RUNNING state forever.
 *
 * Excluded job names are skipped: their RUNNING rows are left untouched
 * so another worker (or manual trigger) can still complete them.
 *
 * @param {number} [staleMinutes=15]
 * @returns {Promise<number>} Number of rows updated.
 */
export async function cleanupOrphanedRunningLogs(staleMinutes = 15) {
  try {
    const { clause, values } = buildExclusionSubquery("l.job_id", 2);
    const result = await query(
      `UPDATE app_job_log l
         SET status = 'fail',
             notes = 'Orphaned - worker restarted',
             modification_date = CURRENT_TIMESTAMP
       WHERE l.status = 'running'
         AND l.actual_start < CURRENT_TIMESTAMP - ($1 || ' minutes')::interval${clause}`,
      [String(staleMinutes), ...values],
    );
    return result.rowCount || 0;
  } catch (error) {
    clientLogger.error(
      `Error cleaning up orphaned running logs: ${error.message}`,
    );
    return 0;
  }
}