import { query } from "../config/pgDB.js";
import { clientLogger } from "../config/logger.js";





/**
 * Get configuration value for a specific key and facility
 * @param {Object} params - Parameters
 * @param {string} params.key - Configuration key
 * @param {number} params.facilityId - Facility ID
 * @returns {Promise<string|null>} - Configuration value or null if not found
 */
export async function getConfValue({ key, facilityId }) {
  try {
    if (!key) {
      clientLogger.error("getConfValue requires a key argument");
      return null;
    }

    const res = await query(
      `SELECT conf_value FROM conf WHERE conf_key = $1 AND facility_id = $2 `,
      [key?.toUpperCase(), facilityId],
    );

    if (res.rows.length === 0) {
      clientLogger.verbose(
        `Config key "${key}" not found for facility "${facilityId}"`,
      );
      // try to get the default (facility = 0)
      const defaultRes = await query(
        `SELECT conf_value FROM conf WHERE conf_key = $1 AND (facility_id = 0 OR facility_id IS NULL)`,
        [key?.toUpperCase()],
      );
      if (defaultRes.rows.length === 0) {
        clientLogger.verbose(`Config key "${key}" not found for default facility 0 or NULL`);
        return null;
      }
      return defaultRes.rows[0].conf_value;
    }

    return res.rows[0].conf_value;
  } catch (error) {
    clientLogger.error(
      `Error fetching config value for key "${key}" and facility "${facilityId}": ${error.message}`,
    );
    return null;
  }
}



