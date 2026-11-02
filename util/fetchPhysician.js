import OracleDB from "oracledb";
import { clientLogger, MEDICATION_LOGGER } from "../config/logger.js";
import {  getConfValue } from "../util/loadConf.js";
import { getExtCode } from "../util/getExtCode.js";

/**
 * @typedef {Object} PhysicianData
  * @property {string} FIRST_NAME - Physician's first name
  * @property {string} SEC_NAME   - Physician's second name
  * @property {string} SUFFIX_NAME   - Physician's third name
  * @property {string} LAST_NAME - Physician's last name
  * @property {string} TITLE - Physician's title
  * @property {string} MOBILE_NO - Physician's mobile number
  * @property {string} EMAIL_ADDRESS - Physician's email address
  * @property {string} STAFF_ID - Physician's staff ID
  * @property {string|null} IDENTIFIER_NO - Physician's identifier document number (if available)
  * @property {string|null} IDENTIFIER_USER_CODE - Physician's identifier user code (if available)
  * @property {string|null} IDENTIFIER_DESCRIPTION - Physician's identifier description (if available)
 */

/**
 * Fetches physician/staff data including national ID, name, and specialty
 * @param {Object} params - Parameters for fetching physician data
 * @param {Object} params.connection - Oracle database connection
 * @param {number} params.staffId - Staff ID
 * @param {number} params.facilityId - Facility ID for configuration
 * @returns {Promise<PhysicianData>} Physician data object
 */
export async function fetchPhysician({ connection, staffId, facilityId }) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching physician data" + JSON.stringify({ staffId }),
    );




    // Get the priority order for identity types from config
    const identityPriority = await getConfValue({ key: "NPHIES_CS_PHYSICAIN_IDENTITY_USER_CODE", facilityId });
    const identityCodes = identityPriority?.split(',')?.map(code => code.trim()) || [];

    if (identityCodes.length === 0) {
      MEDICATION_LOGGER.warn('No identity codes configured for physician identifier');
    }

    // Query to fetch staff details and national ID
    const query = `
          SELECT 
            sm.staff_name_1 first_name,
            sm.staff_name_2 sec_name,
            sm.staff_name_3 suffix_name ,
            sm.staff_name_family last_name,
            '+966'||sm.mobile_no mobile_no,
            sm.email_address,
            sm.title,
            sm.staff_id,
            (SELECT MIN (d.service_dept)
          FROM staff_depts d
         WHERE     d.staff_id = sm.staff_id
               AND default_specialty = 'Y')
          specialty_dept_no
        FROM staff_master sm
        WHERE sm.staff_id = :staffId
        AND ROWNUM = 1
    `;

    const result = await connection.execute(
      query,
      {
        staffId: {
          dir: OracleDB.BIND_IN,
          type: OracleDB.STRING,
          val: String(staffId),
        },
      },
      { outFormat: OracleDB.OUT_FORMAT_OBJECT },
    );


    /**
     * @type {PhysicianData}
     */
    const physician = result.rows[0];
    if(!physician) return ;

    


    const specialty = await getExtCode({
      oasis_code: physician?.specialty_dept_no,
      mapping_type: "SPECIALTY",
      source: "NPHIES CLINICAL",
      ext_type: "HEALTHCARE SPECIALTY IDENTIFIER",
      dbConn: connection,
    })

    physician.SPECIALTY_CODE = specialty?.ext_code || "";
    physician.SPECIALTY_DESC = specialty?.ext_desc || "";

    if (physician && identityCodes.length > 0) {
      const identifierResult = await fetchPhysicianIdentifier({
        connection,
        staffId,
        identityCodes
      });

      // Merge the identifier into the physician object
      physician.IDENTIFIER_NO = identifierResult?.DOC_NUMBER;// TO_TEST

      const NPHIES_CS_TEST_PRACTITIONER_ID = await getConfValue({
        facilityId: facilityId,
        key: "NPHIES_CS_TEST_PRACTITIONER_ID",
      });
      if (NPHIES_CS_TEST_PRACTITIONER_ID) {
        physician.IDENTIFIER_NO = NPHIES_CS_TEST_PRACTITIONER_ID;
        clientLogger.debug(
          `fetchPhysician - ID number overridden by NPHIES_CS_TEST_PRACTITIONER_ID: ${NPHIES_CS_TEST_PRACTITIONER_ID}`,
        );
      }

      physician.IDENTIFIER_USER_CODE = identifierResult?.USER_CODE || null;
      physician.IDENTIFIER_DESCRIPTION = identifierResult?.DESCRIPTION || null;
    }

    return physician;
  } catch (error) {
    console.log({ error });

    MEDICATION_LOGGER.error(`Error fetching physician data for staff ID ${staffId}\n${JSON.stringify(error)}`);
    return {
      FIRST_NAME: "",
      LAST_NAME: "",
      TITLE: "Dr",
      MOBILE_NO: "",
      EMAIL_ADDRESS: "",
      STAFF_ID: staffId,
      IDENTIFIER_NO: null,
      IDENTIFIER_USER_CODE: null,
      IDENTIFIER_DESCRIPTION: null
    };
  }
}





// !!! 
/**
 * Fetch physician identifier based on user code configuration
 * @param {Object} params
 * @param {OracleDB.Connection} params.connection - Oracle database connection
 * @param {string} params.staffId - Staff ID
 * @param {string[]} params.identityCodes - Array of identity codes in priority order
 * @returns {Promise<Object|null>} - Identifier document info
 */
async function fetchPhysicianIdentifier({ connection, staffId, identityCodes }) {
  try {
    if (!identityCodes || identityCodes.length === 0) {
      MEDICATION_LOGGER.warn('No identity codes configured for physician identifier');
      return null;
    }

    // Build the IN clause with bind parameters
    const codePlaceholders = identityCodes.map((_, index) => `:code${index}`).join(',');

    const query = `
        SELECT 
            PD.DOC_NUMBER,
            C.DESCRIPTION,
            C.USER_CODE
        FROM personnel_documents pd 
        JOIN CODES C ON C.CODE = PD.DOC_TYPE
        WHERE Pd.staff_id = :staffId
            AND C.USER_CODE IN (${codePlaceholders})
            AND PD.DOC_NUMBER IS NOT NULL
        ORDER BY INSTR(',${identityCodes.join(',')},', ',' || C.USER_CODE || ',')
    `;

    // Build bind parameters
    const bindParams = {
      staffId: {
        dir: OracleDB.BIND_IN,
        type: OracleDB.STRING,
        val: String(staffId),
      }
    };

    // Add identity codes as bind parameters
    identityCodes.forEach((code, index) => {
      bindParams[`code${index}`] = {
        dir: OracleDB.BIND_IN,
        type: OracleDB.STRING,
        val: code,
      };
    });

    clientLogger.debug(`Executing query to fetch identifier for staff ${staffId} with identity codes: ${identityCodes.join(',')}`);
    const result = await connection.execute(
      query,
      bindParams,
      { outFormat: OracleDB.OUT_FORMAT_OBJECT }
    );

    if (result.rows && result.rows.length > 0) {
      MEDICATION_LOGGER.debug(`Found identifier for staff ${staffId}: ${JSON.stringify(result.rows)}`);
      return result.rows[0];
    }

    MEDICATION_LOGGER.warn(`No identifier found for staff ${staffId} with identity codes: ${identityCodes.join(',')}`);


    return null;
  } catch (error) {
    MEDICATION_LOGGER.error(`Error fetching identifier for staff ${staffId}\n${JSON.stringify(error)}`);
    return null;
  }
}