import { query } from "../config/pgDB.js";
import { clientLogger } from "../config/logger.js";

/**
 * Inserts an error message into api_message table and returns the inserted row
 * @param {Object} params - Parameters for the insertion
 * @param {number} params.apiTransId - The api_trans_id to associate with the error
 * @param {string} params.errorMessage - The error message to insert
 * @param {number|null} [params.errorId=null] - Optional error ID to associate with the message
 * @returns {Promise<Object|null>} - The inserted row or null if fail
 */
export async function insertApiMessage({apiTransId, errorMessage , errorId = null}) {
    try {
        clientLogger.verbose({ apiTransId, errorMessage }, "Inserting API message");
        if (!apiTransId || !errorMessage) {
            throw new Error("apiTransId and errorMessage are required");
        }

        const result = await query(
            `INSERT INTO api_message (
                api_trans_id,
                nphies_message,
                nphies_message_id 
            ) VALUES ($1, $2, $3) 
            RETURNING *`,
            [apiTransId, errorMessage, errorId]
        );


        if (!result || !result.rows || result.rows.length === 0) {
            clientLogger.error("fail to insert API message: No rows returned");
            return null;
        }else {
            clientLogger.debug(`Successfully inserted API message for api_trans_id ${apiTransId}`);
        }

        return result.rows[0] || null;
    } catch (error) {
        clientLogger.error("Error inserting api_message:", error.message);
        return null;
    }
}