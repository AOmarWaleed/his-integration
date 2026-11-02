import axios from "axios";
import { getAccessToken, clearToken } from "./token.js";
import { REGISTRY_LOGGER } from "../../config/logger.js";
import {  query } from "../../config/pgDB.js";
import {
  getOracleConnection,
  
} from "../../config/oracle-dynamic.js";
import OracleDB from "oracledb";
import { getPatientIdentityInfo } from "../../util/getPatientIdentityInfo.js";
import { getConfValue } from "../../util/loadConf.js";

/**
 *
 * @param {object} params
 * @param {string} params.nid
 * @param {string} params.nidType
 * @param {string} params.dob
 * @param {string} params.patientId
 * @param {string} params.facilityId
 * @param {object} params.oracleConnection
 * @param {boolean} params.closeConnection - Whether to close the Oracle connection after the operation
 * @returns {object} The search result containing patient information
 */
export const searchPatients = async ({closeConnection = true, ...params}) => {
  
  let dbConnect = params.oracleConnection || null;
  let nid = params.nid ? String(params.nid)?.trim() : null;
  let nidType =  params.nidType ? String(params.nidType)?.trim() : null;
  let dob = params.dob ? String(params.dob)?.trim() : null;
  let patientId = params.patientId ? String(params.patientId)?.trim() : null;
  let facilityId = params.facilityId ? String(params.facilityId)?.trim() : null;
  let facility;
  try {
    // Validate required parameters
    // should have either nid and dob or (patientId and facilityId)
    if ((!nid || !dob) && (!patientId || !facilityId)) {
      throw new Error(
        "Patients search requires either nid and dob or (patientId and facilityId)",
      );
    }

    if (!nid || !dob) {
      REGISTRY_LOGGER.debug(
        `Searching patient with Patient ID: ${patientId} and Facility ID: ${facilityId}`,
      );

      const { rows: facilityRows } = await query(
        `SELECT 
                nphies_cs_org_id ,
                his_db_username, 
                his_db_password, 
                his_db_host, 
                his_db_port,
                his_db_name ,
                facility_id 
              FROM facility WHERE facility_id = $1`,
        [facilityId],
      );
      if (facilityRows.length === 0) {
        throw new Error("Facility not found " + facilityId);
      }

      facility = facilityRows[0];
      if (!dbConnect) {
        dbConnect = await getOracleConnection({
          facilityId,
          poolScope: "api",
          userParam: facility.his_db_username,
          passwordParam: facility.his_db_password,
          connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
        });
      }

      const result = await dbConnect.execute(
        `SELECT pmd.healthid , pmd.patient_id  , TO_CHAR(pmd.DATE_OF_BIRTH, 'DD/MM/YYYY') AS DATE_OF_BIRTH FROM patient_master_data pmd
            WHERE pmd.PATIENT_ID = :patientId
                  `,
        { patientId },
        { outFormat: OracleDB.OUT_FORMAT_OBJECT },
      );

      if (result.rows.length === 0) {
        throw new Error(
          `Patient not found for patientId: ${patientId} in facility_id: ${facility.facility_id}`,
        );
      }

      dob = result.rows[0].DATE_OF_BIRTH;

      const patientIdentityInfo = await getPatientIdentityInfo({
        patientId: patientId,
        connection: dbConnect,
      });

      nid = patientIdentityInfo.identityNo;
      nidType = patientIdentityInfo.identityType;
      if (!nid) {
        throw new Error(
          `Patient identity number not found for patientId: ${patientId} in facility_id: ${facility.facility_id}`,
        );
      }
    } else if (facilityId) {
      // If caller passed nid + dob + facilityId, fetch facility row (useful for Organization-ID header)
      const { rows: facilityRows } = await query(
        `SELECT nphies_cs_org_id, facility_id FROM facility WHERE facility_id = $1`,
        [facilityId],
      );
      if (facilityRows.length > 0) {
        facility = facilityRows[0];
      }
    }

    REGISTRY_LOGGER.debug(`Searching patient with NID: ${nid} and DOB: ${dob}`);

    // Get access token for the "patient" type (per facility)
    const { token } = await getAccessToken("patient", facilityId || null);
    REGISTRY_LOGGER.debug(`Access token obtained for patient search: ${token}`);

    const baseUrl = await getConfValue({
      key: "NHIC_URL",
      facilityId: facilityId,
    });

    const patientsEndpoint = "/patients-registry/patients/healthid";

    REGISTRY_LOGGER.debug(
      `Making request to ${baseUrl}${patientsEndpoint} with params: ${JSON.stringify(params)}`,
    );
    REGISTRY_LOGGER.debug(
      `Request headers: Authorization: Bearer ${token}, Accept: application/json, Organization-ID: ${facility?.nphies_cs_org_id || "''"}`,
    );

    REGISTRY_LOGGER.debug(`Request prepared for patient search with NID: ${ nid.startsWith('P') ? nid.slice(1) : nid} and DOB: ${dob}`);
    // Send request
    const response = await axios({
      method: "GET",
      url: `${baseUrl}${patientsEndpoint}`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      params: {
        idNumber: nid.startsWith('P') ? nid.slice(1) : nid,
        dateOfBirth: dob,
        idType: nidType,
      },
    });

    REGISTRY_LOGGER.debug("Patient found successfully");

    return {
      success: true,
      registryType: "patients",
      data: response.data,
      patientData: {
        nid: nid,
        dob: dob,
        nidType: nidType,
        patientId: patientId || null,
        facilityId: facilityId || null,
      },
    };
  } catch (error) {
    // Retry once if token is invalid
    if (
      error.response?.status === 403 &&
      error.response?.data?.fault?.faultstring?.includes("Invalid Access Token") &&
      !params._tokenRetried
    ) {
      REGISTRY_LOGGER.debug("Token invalid, clearing cache and retrying...");
      clearToken("patient", facilityId || null);
      return searchPatients({
        ...params,
        closeConnection: false,
        oracleConnection: dbConnect,
        _tokenRetried: true,
      });
    }

    if(!closeConnection) {
      return {
        success: false,
        patientData: {
          nid: nid,
          dob: dob,
          nidType: nidType,
          patientId: patientId || null,
          facilityId: facilityId || null,
        },
        data: null,
        error: {
          message: error.message,
        },
      };
    }

    throw error;
  } finally {
    if (dbConnect && closeConnection) {
      try {
        await dbConnect.close();
        REGISTRY_LOGGER.info("Oracle connection closed successfully");
      } catch (closeError) {
        REGISTRY_LOGGER.error(
          `Error closing Oracle connection: ${closeError.message}`,
        );
      }
    }
  }
};
