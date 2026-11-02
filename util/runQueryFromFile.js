import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import oracledb from "oracledb";
import { clientLogger } from "../config/logger.js";

// get path from root of project
export const getRelativePath = (relativePath) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../", relativePath);
};

/**
 * Executes a SQL file with given binds and options
 * @param {oracledb.Connection} connection - OracleDB connection
 * @param {string} path - Path to the SQL file
 * @param {Object} [binds={}] - Bind parameters for the SQL query
 * @param {Object} [options={}] - Execution options for the query
 * @returns {Promise<oracledb.Result>} Result of the query execution
 */
export function executeSqlFile(connection, path, binds = {}, options = {}) {
  try {
    const sql = fs.readFileSync(path, "utf-8");

    return connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false,
      ...options,
    });
  } catch (error) {
    clientLogger.error({
      binds,
      options,
      path,
    });
    clientLogger.error("Error executing SQL file:", error);
    throw error;
  }
}
