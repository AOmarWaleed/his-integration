import OracleDB from "oracledb";
import { clientLogger } from "../config/logger.js";
import dayjs from "dayjs";
import { getExtCode } from "./getExtCode.js";
import { getConfValue } from "./loadConf.js";
import { getPatientIdentityInfo } from "./getPatientIdentityInfo.js";
import { fetchSystemRule } from "./fetchSystemRule.js";
import axios from "axios";
import { searchPatients } from "../services/registry/patientsService.js";

/**
 * @typedef {Object} CodeMapping
 * @property {string} ext_code - External code from mapping table
 * @property {string} ext_desc - Description of the external code
 */

/**
 * @typedef {Object} PatientData
 * @property {string} MRN - Medical record number
 * @property {string} FIRST_NAME - Patient first name
 * @property {string} SECOND_NAME - Patient middle name
 * @property {string} THIRD_NAME - Patient third name
 * @property {string} LAST_NAME - Patient family name
 * @property {Date|string} DATE_OF_BIRTH - Date of birth
 * @property {string} BIRTH_TIME - Date of birth formatted as YYYYMMDD
 * @property {string} SEX - Gender code from database (F/M)
 * @property {string} GENDER_CODE - Gender description (male/female)
 * @property {string} GENDER_CODE_MAP - External gender code
 * @property {string} GENDER_MAP - External gender description
 * @property {string} GENDER_CODE_FHIR_MAP - FHIR gender code
 * @property {string} GENDER_FHIR_MAP - FHIR gender description
 * @property {string} NATIONALITY_CODE - Nationality code from database
 * @property {string} NATIONALITY_USER_CODE - Nationality user code
 * @property {string} NATIONALITY_CODE_MAP - External nationality code
 * @property {string} NATIONALITY_MAP - External nationality description
 * @property {string} MOBILE_NO - Mobile number
 * @property {string} MARITAL_CODE - Marital status code from database
 * @property {string} MARITAL_STATUS_CODE_MAP - External marital status code
 * @property {string} MARITAL_STATUS_MAP - External marital status description
 * @property {string} OCCUPATION_CODE - Occupation code
 * @property {string} PATIENT_CATEGORY - Patient category
 * @property {string} RELIGION_CODE - Religion code from database
 * @property {string} RELIGION_CODE_MAP - External religion code
 * @property {string} RELIGION_MAP - External religion description
 * @property {string} HEALTH_ID - Health ID (with default fallback)
 * @property {string} STREET - Street address
 * @property {string} CITY - City
 * @property {string} POSTAL_CODE - Postal code
 * @property {string} COUNTRY - Country
 * @property {string} DATE_OF_BIRTH_FORMATTED - Date of birth formatted as YYYY-MM-DD
 */

/**
 * Fetches patient data by patient ID
 * @param {Object} params - Parameters object
 * @param {number} params.patientId - Patient ID
 * @param {OracleDB.Connection} params.oracleConnection - Oracle database connection
 * @param {boolean} [params.defaultHealthId=false] - Whether to use a default health ID if none is found
 * @param {number} [params.facilityId=0] - Facility ID for fetching default health ID
 * @returns {Promise<PatientData>} Patient data object
 */
export async function fetchPatientById({
  patientId,
  oracleConnection,
  defaultHealthId = false,
  facilityId = 0,
}) {
  try {
    clientLogger.verbose(
      "Fetching patient by ID" + JSON.stringify({ patientId }),
    );

    const query = `
        SELECT 
            pm.patient_id,
            pat.get_patient_file_id(pm.patient_id) mrn,
            pm.pat_name_1 first_name,
            pm.pat_name_2 second_name,
            pm.pat_name_3 third_name,
            pm.pat_name_family last_name,
            pm.mothers_name_1 AS mother_name,
            pm.scnd_pat_name_1 || DECODE(pm.scnd_pat_name_2, NULL, '', ' ') || pm.scnd_pat_name_2 || DECODE(pm.scnd_pat_name_3, NULL, '', ' ') || pm.scnd_pat_name_3 || DECODE(pm.scnd_pat_name_family, NULL, '', ' ') || pm.scnd_pat_name_family AS pat_name_ar,
            pm.scnd_pat_name_1 AS pat_name_1_a,
            pm.scnd_pat_name_2 AS pat_name_others_a,
            pm.scnd_pat_name_3 AS pat_name_suffix_a,
            pm.scnd_pat_name_family AS pat_name_family_a,
            pm.date_of_birth,
            TO_CHAR(pm.date_of_birth, 'YYYYMMDD') birth_time,
            pm.sex,
            DECODE(pm.sex, 'F', 'female', 'male') gender_code,
            pm.nationality_code,
            pm.mobile_no,
            pm.phone_1 AS business_phone,
            pm.phone_2 AS home_phone,
            pm.marital_code,
            pm.occupation_code,
            pm.patient_category,
            pm.registration_type,
            
            pm.religion_code,
            TRIM (pm.healthid) as health_id,
            nat.user_code AS nationality_user_code
        FROM patient_master_data pm
        LEFT JOIN codes_data nat ON nat.code = pm.nationality_code
        WHERE pm.patient_id = :patientId
    `;

    const result = await oracleConnection.execute(
      query,
      { patientId },
      {
        outFormat: OracleDB.OUT_FORMAT_OBJECT,
      },
    );

    const patient = result.rows[0] || null;
    clientLogger.silly(
      "Fetched patient by ID" + JSON.stringify({ patientId, found: !!patient }),
    );

    const NPHIES_CS_TEST_HEALTH_ID = await getConfValue({
      facilityId: facilityId,
      key: "NPHIES_CS_TEST_HEALTH_ID",
    });
    if (NPHIES_CS_TEST_HEALTH_ID) {
      patient.HEALTH_ID = NPHIES_CS_TEST_HEALTH_ID;
      clientLogger.debug(
        `fetch patient health id overwrite by NPHIES_CS_TEST_HEALTH_ID: ${NPHIES_CS_TEST_HEALTH_ID}`,
      );
    }

    if (patient) {
      const nationality = await getExtCode({
        oasis_code: patient?.NATIONALITY_CODE,
        mapping_type: "CODES",
        mapping_sub_type: "5",
        ext_type: "NATIONALITY",
        source: "NPHIES CLINICAL",
        dbConn: oracleConnection,
      });

      const gender = await getExtCode({
        oasis_code: patient?.sex,
        mapping_type: "CODES",
        mapping_sub_type: "3",
        ext_type: "GENDER",
        source: "NPHIES CLINICAL",
        dbConn: oracleConnection,
      });
      const genderFhir = await getExtCode({
        oasis_code: patient?.sex,
        mapping_type: "USER_CODES",
        mapping_sub_type: "3",
        ext_type: "GENDER_FHIR",
        source: "NPHIES CLINICAL",
        dbConn: oracleConnection,
      });
      const religion = await getExtCode({
        oasis_code: patient?.RELIGION_CODE,
        mapping_type: "CODES",
        mapping_sub_type: "1",
        ext_type: "RELIGION",
        source: "NPHIES CLINICAL",
        dbConn: oracleConnection,
      });
      const maritalStatus = await getExtCode({
        oasis_code: patient?.MARITAL_CODE,
        mapping_type: "CODES",
        mapping_sub_type: "2",
        ext_type: "MARITAL STATUS",
        source: "NPHIES CLINICAL",
        dbConn: oracleConnection,
      });

      patient.NATIONALITY_CODE_MAP = nationality.ext_code;
      patient.NATIONALITY_MAP = nationality.ext_desc;
      patient.GENDER_CODE_FHIR_MAP = genderFhir.ext_code || "unknown"; // tocheck mapping
      patient.GENDER_FHIR_MAP = genderFhir.ext_desc || "Unknown"; //tocheck mapping
      patient.GENDER_CODE_MAP = gender.ext_code || "K";
      patient.GENDER_MAP = gender.ext_desc || "Unknown";
      patient.RELIGION_CODE_MAP = religion.ext_code || "99";
      patient.RELIGION_MAP = religion.ext_desc || "Not Mentioned";
      patient.MARITAL_STATUS_CODE_MAP = maritalStatus.ext_code || "U";
      patient.MARITAL_STATUS_MAP = maritalStatus.ext_desc || "Unknown";

      clientLogger.silly(
        "all patient mapping " +
          JSON.stringify({
            nationality,
            gender,
            genderFhir,
            religion,
            maritalStatus,
          }),
      );

      patient.STREET = "UNK";
      patient.CITY = "UNK";
      patient.POSTAL_CODE = "UNK";
      patient.COUNTRY = "Saudi Arabia";

      // need this formate (YYYY-MM-DD)  for dispense and medication_request template
      patient.DATE_OF_BIRTH_FORMATTED = dayjs(patient.DATE_OF_BIRTH).format(
        "YYYY-MM-DD",
      );

      if (!patient.HEALTH_ID) {
        const healthIdData = await fetchPatientHealthId({
          patientData: patient,
          oracleConnection: oracleConnection,
          useRegister: true,
          facilityId: facilityId,
        });
        if (healthIdData?.healthId) {
          patient.HEALTH_ID = healthIdData.healthId;
        }
        if (healthIdData?.getHealthIdInfo) {
          patient.getHealthIdInfo = healthIdData.getHealthIdInfo;
        }
      }

      if (defaultHealthId) {
        const defaultHealthIdValue = await getConfValue({
          key: "NPHIES_CS_TEST_HEALTH_ID",
          facilityId: facilityId,
        });
        if (defaultHealthIdValue) {
          clientLogger.info(
            `Using default health ID value: ${defaultHealthIdValue}`,
          );
          patient.HEALTH_ID = defaultHealthIdValue;
        }
      }
    }
    return patient;
  } catch (error) {
    clientLogger.error("Error fetching patient by ID", { error });
    console.error("Error fetching patient by ID", error);
    return null;
  }
}

//!
// function to fetch patient HealthID
/**
 *
 * @param {object} param
 * @param {object} param.patientData
 * @param {object} param.oracleConnection
 * @param {boolean} param.useRegister
 * @param {string} param.facilityId
 * @returns {object|null} data object containing healthId and getHealthIdInfo if found, otherwise null
 */
async function fetchPatientHealthId({
  patientData,
  oracleConnection,
  useRegister,
  facilityId,
}) {
  try {
    let data = null;
    clientLogger.verbose(
      "Fetching patient HealthID by ID" +
        JSON.stringify({ patientId: patientData?.PATIENT_ID, facilityId }),
    );

    if (useRegister) {
      try {
        const searchResult = await searchPatients({
          patientId: String(patientData?.PATIENT_ID),
          oracleConnection: oracleConnection,
          facilityId: facilityId,
          closeConnection: false,
        });

        // console.log(searchResult, "searchResult");

        data = {
          healthId: searchResult?.data?.data?.HealthId,
          getHealthIdInfo: {
            identityNo: searchResult?.patientData?.nid,
            identityType: searchResult?.patientData?.nidType,
            dob: searchResult?.patientData?.dob,
          },
        };
      } catch (error) {
        clientLogger.error(
          `Error fetching healthId from register for patientId: ${patientData?.PATIENT_ID}: ${error.message}`,
        );
        clientLogger.error(error.stack);
      }
    } else {
      clientLogger.warn(
        `✖️ Health ID not found for Patient Id: ${patientData?.PATIENT_ID}  and Birth Date ${dayjs(
          patientData?.DATE_OF_BIRTH,
        ).format("DD/MM/YYYY")} `,
      );

      const patientIdentityInfo = await getPatientIdentityInfo({
        patientId: patientData?.PATIENT_ID,
        connection: oracleConnection,
      });

      const NHICWEBSERVURL = await fetchSystemRule({
        oracleConnection: oracleConnection,
        defaultType: "NHICWEBSERVURL",
      });

      // ! fetch healthId from NHIC web service
      data.getHealthIdInfo = {
        identityNo: patientIdentityInfo?.identityNo,
        identityType: patientIdentityInfo?.identityType,
        dob: dayjs(patientData?.DATE_OF_BIRTH).format("DD/MM/YYYY"),
      };
      const nhicUrl = `${NHICWEBSERVURL}nid=${patientIdentityInfo.identityNo}&providerType=NHIC&dob=${dayjs(
        patientData?.DATE_OF_BIRTH,
      ).format("DD/MM/YYYY")}`;
      clientLogger.info(
        `Fetching healthId from NHIC web service for patientId: ${patientData.PATIENT_ID} using URL: ${nhicUrl}`,
      );

      try {
        const { data } = await axios.get(nhicUrl);
        clientLogger.info(
          `Fetched data from NHIC web service for patientId: ${patientData.PATIENT_ID}: ${JSON.stringify(data)}|||||| nhicUrl : ${nhicUrl}`,
        );

        if (data?.HealthId) {
          clientLogger.info(
            `✅✅✅✅✅ Fetched healthId: ${data?.HealthId} from NHIC web service for patientId: ${patientData.PATIENT_ID}`,
          );
          data.healthId = data?.HealthId;
        } else {
          clientLogger.warn(
            `⚠️⚠️⚠️⚠️ HealthId not found from NHIC web service for patientId: ${patientData.PATIENT_ID}`,
          );
        }
      } catch (error) {
        clientLogger.error(
          `Error fetching healthId from NHIC web service for patientId: ${patientData.PATIENT_ID}: ${error.message}`,
        );
      }
    }

    return data;
  } catch (error) {
    clientLogger.error("Error fetching patient HealthID by ID", { error });
    console.error("Error fetching patient HealthID by ID", error);
    return null;
  }
}
