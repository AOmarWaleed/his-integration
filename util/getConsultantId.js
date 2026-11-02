import OracleDB  from "oracledb";
import { insertApiMessage } from "./insertApiMsgs.js";
import { NPHIES_FAIL_ID } from "./constant.js";

/**
 * Retrieves the consultant ID and attendance type for a specific patient episode
 * from the patient_eligibility table.
 * 
 * This function is used to fetch consultant information for ADT message generation
 * when the consultant ID is not directly available from the main query tables.
 * 
 * @param {Object} params - The function parameters
 * @param {Object} params.connection - Oracle database connection object
 * @param {string|number} params.patientId - The patient's unique identifier
 * @param {string|number} params.episodeNo - The patient's episode number
 * @param {Object} params.options - Optional configuration
 * @param {boolean} params.options.throwOnNotFound - If true, throws error when no record found (default: true)
 * @param {string} params.options.status - Filter by eligibility status (default: 'O')
 * @param {string} params.apiTransId - The API transaction ID for logging and error tracking
 * 
 * @returns {Promise<any>} Returns an object containing consultant_id and attendance_type
 * @returns {string|number} returns.consultant_id - The consultant's ID
 * @returns {string} returns.attendance_type - The attendance type (e.g., 'I', 'O', 'E')
 * 
 * @throws {Error} Throws error when no record found and throwOnNotFound is true
 * 
 * @example
 * // Basic usage
 * const result = await getConsultantId({
 *   connection: dbConnection,
 *   patientId: 12345,
 *   episodeNo: 1
 * });
 * console.log(result.consultant_id); // 67890
 * console.log(result.attendance_type); // 'I'
 * 
 * @example
 * // With options
 * const result = await getConsultantId({
 *   connection: dbConnection,
 *   patientId: 12345,
 *   episodeNo: 1,
 *   options: {
 *     throwOnNotFound: false,
 *     status: 'A'
 *   }
 * });
 * // Returns {} if not found instead of throwing error
 */
export async function getConsultantId({ 
  connection, 
  patientId, 
  episodeNo,
  options = {},
  apiTransId = null
}) {
  // Destructure options with defaults
  const { 
    throwOnNotFound = false,
    status = 'O'
  } = options;

  // Input validation
  if (!connection) {
    throw new Error('Database connection is required');
  }
  if (!patientId) {
      await insertApiMessage({
        apiTransId,
        errorMessage: "Patient ID is required to get consultant ID",
        errorId: NPHIES_FAIL_ID.PATIENT_ID,
      });
  }
  if (!episodeNo) {
    await insertApiMessage({
      apiTransId,
      errorMessage: "Episode number is required to get consultant ID",
      errorId: NPHIES_FAIL_ID.EPISODE_NO,
    });
  }

  try {
    const { rows } = await connection.execute(
      `
      SELECT 
        pe.consultant_id,
        pe.attendance_type,
        pe.eligibility_status,
        pe.responsibility
      FROM patient_eligibility pe
      WHERE pe.eligibility_status = :status
        AND pe.responsibility = 1
        AND pe.patient_id = :patientId
        AND pe.episode_no = :episodeNo
      `,
      {
        status,
        patientId: patientId || null,
        episodeNo: episodeNo || null
      },
      {
        outFormat:OracleDB.OUT_FORMAT_OBJECT
      }
    );

    // Handle no results
    if (rows.length === 0) {
      if (throwOnNotFound) {
        throw new Error(
          `No active eligibility record found for patient ID ${patientId} and episode no ${episodeNo} with status '${status}'`
        );
      }
      return {};
    }

    // Return the result
    const result = rows[0];
    return {
      consultant_id: result.CONSULTANT_ID,
      attendance_type: result.ATTENDANCE_TYPE,
      eligibility_status: result.ELIGIBILITY_STATUS,
      responsibility: result.RESPONSIBILITY
    };

  } catch (error) {
    // Enhance error with context
    const enhancedError = new Error(
      `fail to get consultant ID for patient ${patientId}, episode ${episodeNo}: ${error.message}`
    );
    enhancedError.originalError = error;
    enhancedError.patientId = patientId;
    enhancedError.episodeNo = episodeNo;
    throw enhancedError;
  }
}