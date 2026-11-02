import OracleDB from "oracledb";
import { CONST } from "./constant.js";
import { clientLogger } from "../config/logger.js";
import { fetchPhysician } from "./fetchPhysician.js";
import { getConfValue } from "./loadConf.js";

/**
 * Formats physician information for HL7 PV1.8 (Attending Doctor) field.
 * 
 * This function retrieves and formats doctor information from the database,
 * constructing a string that follows the HL7 XCN data type format.
 * 
 * **Format Pattern:** IDNumber^FamilyName^GivenName^SecondName^Suffix^^^AssigningAuthority^^^
 * 
 * **Note:** If NPHIES_CS_TEST_PRACTITIONER_ID is defined, it will override the actual
 * physician ID for testing purposes.
 * 
 * @async
 * @function formatDoctor
 * @param {string|number} consultantId - The staff ID of the consultant/physician
 * @param {Object} dbConn - OracleDB database connection object
 * @param {Object} data - Original query data containing fallback information
 * @param {string|number} [data.facilityId] - Facility ID for context
 * 
 * @returns {Promise<string>} Formatted doctor information string in HL7 XCN format:
 * - On success: `"IDNumber^FamilyName^GivenName^SecondName^^DR^^^&AssigningAuthority&ISO"`
 * - With test data: `"TEST_ID^^^^^^^^DR^^^&AssigningAuthority&ISO"`
 * - On failure or missing data: `""` (empty string)
 * 
 * @throws {Error} Logs errors but does not throw; returns empty string on failure
 * 
 * @example
 * // Successful retrieval
 * const doctorInfo = await formatDoctor('12345', dbConnection, { facilityId: 'FAC001' });
 * // Returns: "12345^Smith^John^Robert^^DR^^^&2.16.840.1.113883.3.123456&ISO"
 * 
 * @example
 * // With test data override
 * NPHIES_CS_TEST_PRACTITIONER_ID = '99999';
 * const doctorInfo = await formatDoctor('12345', dbConnection, {});
 * // Returns: "99999^^^^^DR^^^&2.16.840.1.113883.3.123456&ISO"
 * 
 * @example
 * // When consultantId is null or undefined
 * const doctorInfo = await formatDoctor(null, dbConnection, {});
 * // Returns: ""
 */
export const formatDoctor = async (consultantId, dbConn, data) => {
  // Early return if no consultant ID provided
  if (!consultantId) {
    clientLogger.debug('formatDoctor - No consultant ID provided, returning empty string');
    return "";
  }

  try {
    // Fetch physician details from database
    const physicianRecord = await fetchPhysician({
      connection: dbConn,
      staffId: consultantId,
      facilityId: data?.facilityId,
    });

    // If physician record found, format the doctor information
    if (physicianRecord) {
      // Get identifier number, with test data override if enabled
      let idNumber = physicianRecord.IDENTIFIER_NO;
      const NPHIES_CS_TEST_PRACTITIONER_ID = await getConfValue({
        facilityId: data?.facilityId,
        key: "NPHIES_CS_TEST_PRACTITIONER_ID",
      });
      if (NPHIES_CS_TEST_PRACTITIONER_ID) {
        idNumber = NPHIES_CS_TEST_PRACTITIONER_ID;
        clientLogger.debug(
          `formatDoctor - ID number overridden by NPHIES_CS_TEST_PRACTITIONER_ID: ${NPHIES_CS_TEST_PRACTITIONER_ID}`,
        );
      }

      // Extract name components
      const familyName = physicianRecord.LAST_NAME || "";
      const givenName = physicianRecord.FIRST_NAME || "";
      const secondName = physicianRecord.SEC_NAME || "";
      const suffix = physicianRecord.SUFFIX_NAME || "";

      clientLogger.debug(
        `formatDoctor - Consultant ID: ${consultantId}, ID Number: ${idNumber}, Family Name: ${familyName}, Given Name: ${givenName}, Second Name: ${secondName}, Suffix: ${suffix}`,
      );

      // Return formatted string if identifier exists
      if (idNumber) {
        return `${idNumber}^${familyName}^${givenName}^${secondName}^^DR^^^&${CONST.PROVIDER_ID_AUTHORITY}&ISO`;
      }
    }

    // Fallback: Return default doctor info with test identifier if available
    const NPHIES_CS_TEST_PRACTITIONER_ID = await getConfValue({
      facilityId: data?.facilityId,
      key: "NPHIES_CS_TEST_PRACTITIONER_ID",
    });
    if (NPHIES_CS_TEST_PRACTITIONER_ID) {
      clientLogger.debug(
        `formatDoctor - No valid physician record found for consultant ${consultantId}, using NPHIES_CS_TEST_PRACTITIONER_ID`,
      );
      return `${NPHIES_CS_TEST_PRACTITIONER_ID}^${""}^${""}^${""}^^DR^^^&${CONST.PROVIDER_ID_AUTHORITY}&ISO`;
    }

    // No valid data found
    clientLogger.debug(
      `formatDoctor - No physician record or test data found for consultant ${consultantId}, returning empty string`,
    );
    return "";

  } catch (error) {
    // Log error but don't throw - return empty string for robustness
    clientLogger.error(
      `formatDoctor - Error retrieving doctor info for consultant ${consultantId}: ${error.message}`
    );
    console.error("Error getting doctor info:", error);
    return "";
  }
};