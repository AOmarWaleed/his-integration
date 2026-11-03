import pLimit from "p-limit";
import { clientLogger } from "../config/logger.js";

/**
 * Runs the provided worker function on each item in the items array with a maximum concurrency limit.
 * @param {Object} options - The options object.
 * @param {Array} options.items - The array of items to process.
 * @param {number} [options.maxConcurrency=5] - The maximum number of concurrent worker executions.
 * @param {Function} options.worker - The async worker function to execute for each item. It receives the item and its index as arguments.
 * @param {AbortSignal} [options.abortSignal=null] - Optional signal used to stop starting new items.
 * @param {(error: Error) => boolean} [options.isFatalError=null] - Predicate that marks an error as fatal. When a fatal error is seen, no new items are started and the error is rethrown after the in-flight items settle.
 * @return {Promise<Array>} A promise that resolves to an array of results from the worker function.
 */
export async function runWithConcurrency({
  items,
  maxConcurrency = 5,
  worker,
  abortSignal = null,
  isFatalError = null,
}) {
  const limit = pLimit(maxConcurrency);
  let fatalError = null;

  const tasks = items.map((item, index) =>
    limit(async () => {
      try {
        if (abortSignal?.aborted) {
          return {
            aborted: true,
            index,
            message: "Aborted before processing",
          };
        }

        if (fatalError) {
          return {
            skipped: true,
            index,
            message: "Skipped after fatal error",
          };
        }

        return await worker(item, index);
      } catch (err) {
        clientLogger.error(`[runWithConcurrency] worker[${index}] threw:`, err);

        if (typeof isFatalError === "function" && isFatalError(err)) {
          if (!fatalError) {
            fatalError = err;
          }
        }

        return {
          error: true,
          index,
          message: err.message,
          code: err.code,
        };
      }
    }),
  );

  const results = await Promise.all(tasks);

  // Surface fatal errors so the caller (e.g. withOracleConnection) can retry
  // the whole job instead of silently reporting success for a dead connection.
  if (fatalError) {
    throw fatalError;
  }

  return results;
}
