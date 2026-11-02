import oracle from "oracledb";
import { clientLogger } from "../config/logger.js";
/**
 * Retrieves patient identity information from the database
 * @param {number} patientId - The patient ID to look up
 * @param {string} identityNo - The identity number to look up (optional, can be used for additional filtering if needed)
 * @param {oracledb.Connection} [connection] - Optional existing connection
 * @returns {Promise<PatientIdentityInfo>}
 */
export const getPatientIdentityInfoOld = async (
  patientId,
  identityNo,
  connection = null,
) => {
  let shouldCloseConnection = false;
  let conn = connection;

  try {
    if (!conn) {
      throw new Error("Oracle connection is not provided");
      shouldCloseConnection = true;
    }

    const bindVars = {
      p_patient_id: {
        dir: oracle.BIND_IN,
        val: Number(patientId),
        type: oracle.NUMBER,
      },
      p_identity_no: {
        dir: oracle.BIND_OUT,
        type: oracle.STRING,
        val: identityNo || null,
        maxSize: 32767,
      },
      p_identity_type: {
        dir: oracle.BIND_OUT,
        type: oracle.STRING,
        maxSize: 32767,
      },
      retval: {
        dir: oracle.BIND_OUT,
        type: oracle.NUMBER,
      },
    };

    const result = await conn.execute(
      `BEGIN
         :retval := DEVDBA.GET_PATIENT_IDENTITY_INFO(
           :p_patient_id,
           :p_identity_no,
           :p_identity_type
         );
       END;`,
      bindVars,
    );

    console.log({ result });

    return {
      success: result.outBinds.retval === 0,
      patientId,
      identityNo: result.outBinds.p_identity_no,
      identityType: result.outBinds.p_identity_type,
      returnCode: result.outBinds.retval,
    };
  } catch (error) {
    console.error("Error in getPatientIdentityInfo:", error);
    throw new Error(`fail to retrieve patient identity: ${error.message}`);
  } finally {
    if (conn && shouldCloseConnection) {
      try {
        await conn.close();
      } catch (err) {
        console.error("Error closing connection:", err);
      }
    }
  }
};
/**
 * @typedef {Object} PatientIdentityInfo
 * @property {boolean} success - Whether the operation was successful
 * @property {number} patientId - The patient ID
 * @property {string} identityNo - The identity number
 * @property {string} identityType - The identity type
 * @property {number} returnCode - The return code from the procedure
 */

// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================
// ===============================

export const getPatientIdentityInfo = async ({
  patientId,
  identityNo = null,
  connection,
}) => {
  let shouldCloseConnection = false;
  let conn = connection;

  try {
    if (!conn) {
      throw new Error("Oracle connection is not provided");
      shouldCloseConnection = true;
    }

    const patientIdNum = Number(patientId);
    if (isNaN(patientIdNum)) {
      throw new Error("Invalid patient ID");
    }

    const bindVars = {
      p_patient_id: {
        dir: oracle.BIND_IN,
        val: patientIdNum,
        type: oracle.NUMBER,
      },
      p_identity_no: {
        dir: oracle.BIND_OUT,
        type: oracle.STRING,
        maxSize: 4000,
      },
      p_identity_type: {
        dir: oracle.BIND_OUT,
        type: oracle.STRING,
        maxSize: 4000,
      },
      retval: {
        dir: oracle.BIND_OUT,
        type: oracle.NUMBER,
      },
    };

    const result = await conn.execute(
      `BEGIN
         :retval := DEVDBA.GET_PATIENT_IDENTITY_INFO(
           :p_patient_id,
           :p_identity_no,
           :p_identity_type
         );
       END;`,
      bindVars
    );

    clientLogger.debug(`DB GET_PATIENT_IDENTITY_INFO Return: ${JSON.stringify({
      retval: result.outBinds.retval,
      identityNo: result.outBinds.p_identity_no,
      identityType: result.outBinds.p_identity_type,
    })}`);
    

    return {
      success: result.outBinds.retval === 0,
      patientId: patientIdNum,
      identityNo: result.outBinds.p_identity_no || null,
      identityType: result.outBinds.p_identity_type || null,
      returnCode: result.outBinds.retval,
    };
  } catch (error) {
    console.error("Error in getPatientIdentityInfo:", error);
    throw new Error(`fail to retrieve patient identity: ${error.message}`);
  } finally {
    if (conn && shouldCloseConnection) {
      try {
        await conn.close();
      } catch (err) {
        console.error("Error closing connection:", err);
      }
    }
  }
};

/**
 * @typedef {Object} PatientIdentityInfo
 * @property {boolean} success - Whether the operation was successful
 * @property {number} patientId - The patient ID
 * @property {string|null} identityNo - The identity number
 * @property {string|null} identityType - The identity type
 * @property {number} returnCode - The return code from the procedure
 */
/**
 * @typedef {Object} PatientIdentityInfo
 * @property {boolean} success - Whether the operation was successful
 * @property {number} patientId - The patient ID
 * @property {string|null} identityNo - The identity number (IN OUT parameter - updated by procedure)
 * @property {string|null} identityType - The identity type (OUT parameter)
 * @property {number} returnCode - The return code from the procedure
 */
