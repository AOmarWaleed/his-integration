import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * Fetches the default variable value for a given default type
 * @param {object} params - Parameters for fetching system rule
 * @param {string} params.defaultType - Default type to look up (e.g., 'NHICWEBSERVURL')
 * @param {object} params.oracleConnection - Oracle DB connection for query execution
 * @returns {Promise<string|null>} The default variable value or null if not found
 */
export async function fetchSystemRule({ defaultType, oracleConnection }) {
    try {
        MEDICATION_LOGGER.debug('Fetching system rule' + JSON.stringify({ defaultType }));

        const query = `
            SELECT R.DEFAULT_VARIABLE
            FROM maps011_data r
            WHERE r.default_type = :defaultType
        `;

        const result = await oracleConnection.execute(query, { 
            defaultType 
        }, {
            outFormat: OracleDB.OUT_FORMAT_OBJECT
        });

        MEDICATION_LOGGER.debug('Fetched system rule' + JSON.stringify({ 
            defaultType, 
            found: result.rows.length > 0 
        }));

        // Return the default variable value or null if not found
        return result.rows.length > 0 ? result.rows[0].DEFAULT_VARIABLE : null;
    } catch (error) {
        MEDICATION_LOGGER.error('Error fetching system rule', error);
        return null;
    }
}