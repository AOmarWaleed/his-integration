import pLimit from "p-limit";
import { clientLogger } from "../config/logger.js";

/**
 * Runs the provided worker function on each item in the items array with a maximum concurrency limit.
 * @param {Object} options - The options object.
 * @param {Array} options.items - The array of items to process.
 * @param {number} [options.maxConcurrency=5] - The maximum number of concurrent worker executions.
 * @param {Function} options.worker - The async worker function to execute for each item. It receives the item and its index as arguments.
 * @return {Promise<Array>} A promise that resolves to an array of results from the worker function.
 */
export async function runWithConcurrency({
  items,
  maxConcurrency = 5,
  worker,
  abortSignal = null,
}) {
  const limit = pLimit(maxConcurrency);

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

        return await worker(item, index);
      } catch (err) {
        clientLogger.error(`[runWithConcurrency] worker[${index}] threw:`, err);
        return {
          error: true,
          index,
          message: err.message,
        };
      }
    }),
  );

  return Promise.all(tasks);
}
