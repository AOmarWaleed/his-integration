import https from "https";
import { fetchDosage } from "../../util/fetchDosage.js";
import { fetchPrescriptionLines } from "../../util/fetchPrescriptionLines.js";
import { clientLogger, MEDICATION_LOGGER } from "../../config/logger.js";
import axios from "axios";
import { query } from "../../config/pgDB.js";
import { getConfValue } from "../../util/loadConf.js";
import { extractFieldAndValue } from "../../util/extractFieldAndValue.js";
import {
  executeSqlFile,
  getRelativePath,
} from "../../util/runQueryFromFile.js";
import { loadTemplate } from "../../util/loadTemplates.js";
import { processTemplate } from "../../lib/processTemplate.js";
import { generateUUID } from "../../util/generateUUID.js";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { fetchPatientById } from "../../util/fetchPatient.js";
import { fetchPhysician } from "../../util/fetchPhysician.js";
import { Logger } from "winston";
import { getExtCode } from "../../util/getExtCode.js";
import { getExtDescription } from "../../util/getExtDescription.js";
import { insertApiMessage } from "../../util/insertApiMsgs.js";
import { fetchEpisodeVitalSign } from "../../util/fetchEpisodeVitalSign.js";
import { fetchEpisodeDiagnosis } from "../../util/fetchEpisodeDiagnosis.js";
import { convertVitalSignsToObservations } from "../../util/convertVitalSignsToObservations.js";
import JSON5 from "json5";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { NPHIES_FAIL_ID } from "../../util/constant.js";
import { fetchSystemRule } from "../../util/fetchSystemRule.js";
import { isOracleConnectionOrPoolError } from "../../config/oracle-dynamic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Fetches all required data for a prescription
 *
 * @param {Object} params - Parameters for fetching prescription data
 * @param {Object} params.connection - Oracle database connection
 * @param {Object} params.request - Prescription request object
 * @param {number} params.facilityId - Facility ID for configuration
 * @param {string} params.pharmacyCategory - pharmacyCategory
 * @param {Object} params.params - Additional parameters for fetching prescription data
 * @param {string|null} params.params.startDate - Start date for filtering prescriptions
 * @param {string|null} params.params.endDate - End date for filtering prescriptions
 * @param {string|null} params.params.orderLine - Order line for filtering prescriptions
 * @param {string|null} params.params.publishDate - Publish date for filtering prescriptions
 * @param {string|null} params.params.status - Status for filtering prescriptions
 * @param {string|null} params.apiTransId - API transaction ID for logging
 * @returns {Promise<Object>} Complete prescription data
 */
async function fetchPrescriptionData({
  connection,
  request,
  facilityId,
  params,
  apiTransId,
  pharmacyCategory
}) {
  const { PATIENT_ID, EPISODE_NO, ENCOUNTER_TYPE } = request;
  MEDICATION_LOGGER.debug(
    "Fetching prescription data" +
      JSON.stringify({
        patientId: PATIENT_ID,
        episodeNo: EPISODE_NO,
        encounterType: ENCOUNTER_TYPE,
        masterOrderNo: request.MASTER_NO,
        pharmacyCategory : pharmacyCategory
      }),
  );

  const patient = await fetchPatientById({
    patientId: PATIENT_ID,
    oracleConnection: connection,
    facilityId,
  });
  const prescriptionLines = await fetchPrescriptionLines({
    orderNo: request.MASTER_NO,
    status: params.status,
    orderLine: params.orderLine || request.ORDER_LINE,
    pharmacyCategory : pharmacyCategory,
    oracleConnection: connection,
  });
  const physician = await fetchPhysician({
    staffId: request.ORDERER_STAFF_ID,
    connection,
    facilityId: facilityId,
  });
  const episodeVitalSign = await fetchEpisodeVitalSign({
    patientId: PATIENT_ID,
    episodeNo: EPISODE_NO,
    oracleConnection: connection,
  });
  const episodeDiagnosis = await fetchEpisodeDiagnosis({
    patientId: PATIENT_ID,
    episodeNo: EPISODE_NO,
    oracleConnection: connection,
    patientDiagnosisId: request.PATIENT_DIAGNOSIS_ID || null,
  });

  if (!physician.IDENTIFIER_NO) {
    await insertApiMessage({
      apiTransId: apiTransId,
      errorMessage: `IdentifierNo missing for Physician with ,Staff ID : ${request.ORDERER_STAFF_ID || "''"} ,Facility : ${facilityId || "''"}`,
      errorId: NPHIES_FAIL_ID.PHYSICIAN_IDENTIFIER_NO,
    });
  }

  if (!patient?.HEALTH_ID) {
    await insertApiMessage({
      apiTransId: apiTransId,
      errorMessage: `Health ID missing for ,Patient ID:${PATIENT_ID || "''"} ,Facility: ${facilityId || "''"}, NOT found using ,Birth Date : ${patient?.getHealthIdInfo?.dob || "''"} ,ID-No : ${patient?.getHealthIdInfo?.identityNo || "''"} ,Type : ${patient?.getHealthIdInfo?.identityType || "''"}`,
      errorId: NPHIES_FAIL_ID.HEALTH_ID,
    });
  }

  const observations = convertVitalSignsToObservations(
    episodeVitalSign,
    PATIENT_ID,
    EPISODE_NO,
  );

  if (observations.length < 2) {
    MEDICATION_LOGGER.debug(
      `Less than 2 vital sign observations found for ,patient : ${PATIENT_ID || "''"} ,episode : ${EPISODE_NO || "''"}`,
    );

    await insertApiMessage({
      apiTransId,
      errorMessage: `Less than 2 vital sign observations found for ,patient : ${PATIENT_ID || "''"} ,episode ${EPISODE_NO || "''"}`,
      errorId: NPHIES_FAIL_ID.VITAL_SIGN,
    });
  }

  // ! check about reason code (episodeDiagnosis)
  if (episodeDiagnosis.length === 0) {
    MEDICATION_LOGGER.debug(
      `No episode diagnosis found for ,patient : ${PATIENT_ID || "''"} ,episode : ${EPISODE_NO || "''"}`,
    );

    await insertApiMessage({
      apiTransId,
      errorMessage: `No episode diagnosis found for ,patient : ${PATIENT_ID || "''"} ,episode : ${EPISODE_NO || "''"}`,
      errorId: NPHIES_FAIL_ID.DIAGNOSIS,
    });
  }

  //! check if (wight and height) are missing (50373000 , 363808001)
  const hasWeight = observations.some(
    (obs) => obs.OBSERVATION_CODE === "363808001",
  );
  const hasHeight = observations.some(
    (obs) => obs.OBSERVATION_CODE === "50373000",
  );

  if (!hasWeight || !hasHeight) {
    MEDICATION_LOGGER.debug(
      `Missing vital sign observations for ,patient : ${PATIENT_ID || "''"} ,episode : ${EPISODE_NO || "''"}: ` +
        `${!hasWeight ? "Weight " : ""}${!hasHeight ? "Height" : ""}`,
    );

    await insertApiMessage({
      apiTransId,
      errorMessage:
        `Missing vital sign observations for ,patient : ${PATIENT_ID || "''"} ,episode : ${EPISODE_NO || "''"}: ` +
        `${!hasWeight ? "Weight " : ""}${!hasHeight ? "Height" : ""}`,
      errorId: NPHIES_FAIL_ID.HEIGHT_WEIGHT,
    });
  } else {
    const wightValue = observations.find(
      (obs) => obs.OBSERVATION_CODE === "363808001",
    )?.CODABLE_CONCEPT_CODE;
    const heightValue = observations.find(
      (obs) => obs.OBSERVATION_CODE === "50373000",
    )?.CODABLE_CONCEPT_CODE;

    if (wightValue <= 0 || hasHeight <= 0) {
      await insertApiMessage({
        apiTransId,
        errorMessage: `Invalid vital sign observations for ,patient : ${PATIENT_ID || "''"} ,episode : ${EPISODE_NO || "''"}`,
        errorId: NPHIES_FAIL_ID.HEIGHT_WEIGHT,
      });
    }
  }

  const MEDICATION_REQUEST = [];
  for (const line of prescriptionLines) {
    MEDICATION_LOGGER.verbose(
      `⚕️⚕️ Prescription Line : ${JSON.stringify({ line })}`,
    );

    const dosage = await fetchDosage({
      orderLine: line?.ORDER_LINE,
      iosMain: line?.IOS_MAIN,
      oracleConnection: connection,
    });

    MEDICATION_LOGGER.verbose(`💊💊 Dosage : ${JSON.stringify({ dosage })}`);

    const routeOfAdmin = await getExtCode({
      oasis_code: dosage?.ROUTE,
      mapping_type: "CODES",
      mapping_sub_type: "375",
      source: "NPHIES CLINICAL",
      ext_type: "MED ROUTE OF ADMINISTRATION",
      dbConn: connection,
    });
    if (!routeOfAdmin?.ext_code) {
      MEDICATION_LOGGER.debug(
        `🗺️💊⛔routeOfAdmin.ext_code is null for order line ${line?.ORDER_LINE} - DOSAGE.ROUTE (oasis_code: ${dosage?.ROUTE})`,
      );
      await insertApiMessage({
        apiTransId,
        errorMessage: `No route mapping found for ,DOSAGE.ROUTE : ${dosage?.ROUTE || "''"}.`,
        errorId: NPHIES_FAIL_ID.MAP_ROUTE,
      });
    }

    MEDICATION_LOGGER.silly(
      `🛜 Route of Administration : ${JSON.stringify({ routeOfAdmin })}`,
    );

    const medApproachSite = await getExtCode({
      oasis_code: dosage?.ROUTE,
      mapping_type: "MED_APPROACH_SITE",
      source: "NPHIES CLINICAL",
      ext_type: "MEDICATION APPROACH SITE", // TODO CHECK
      dbConn: connection,
    });

    const medQuantityUnit = await getExtCode({
      oasis_code: dosage?.UOM,
      mapping_type: "MED_QUANTITY_UNIT",
      ext_type: "MED QUANTITY UNIT",

      source: "NPHIES CLINICAL",
      dbConn: connection,
    });

    if (!medQuantityUnit?.ext_code) {
      MEDICATION_LOGGER.debug(
        `medQuantityUnit.ext_code is null for order line ${line?.ORDER_LINE} and  dosage?.UOM ${dosage?.UOM}`,
      );
      await insertApiMessage({
        apiTransId,
        errorMessage: `No MED_QUANTITY_UNIT mapping found for ,UNIT_OF_MEASURE : ${dosage?.UOM || "''"}`,
        errorId: NPHIES_FAIL_ID.MAP_UOM,
      });
    }

    const MRID = await getExtCode({
      oasis_code: line?.NATIONAL_DRUG_CODING,
      mapping_type: "DRUG_SFDA",
      source: "NPHIES CLINICAL",
      ext_type: "MRID_GENERIC",
      dbConn: connection,
    });

    const medDoseForm = await getExtCode({
      oasis_code: dosage?.DOSE_FORM, //TODO CHECK
      mapping_type: "CODES",
      mapping_sub_type: "375",
      source: "NPHIES CLINICAL",
      ext_type: "MED_DOSE_FORM",
      dbConn: connection,
    });

    if (!MRID?.ext_code) {
      MEDICATION_LOGGER.debug(
        `🗺️💊⛔MRID.ext_code is null for order line ${line?.ORDER_LINE} - Product Code ${line?.PRODUCT_CODE} - SFDA ${line?.NATIONAL_DRUG_CODING}`,
      );
      await insertApiMessage({
        apiTransId,
        errorMessage: `No MRID_GENERIC mapping found for ,SFDA : ${line?.NATIONAL_DRUG_CODING || "''"}, PRODUCT_CODE : ${line?.PRODUCT_CODE},ITEM_DESCRIPTION : ${line?.DESCRIPTION}`,
        errorId: NPHIES_FAIL_ID.MAP_MRID_GENERIC,
      });
    }

    if (!medDoseForm?.ext_code) {
      MEDICATION_LOGGER.debug(
        `medDoseForm.ext_code is null for order line ${line?.ORDER_LINE} and DOSE_FORM ${dosage?.DOSE_FORM}
        get Dose Form 💊 from MRID ${MRID?.ext_code}`,
      );
      const res = await getExtDescription({
        ext_code: MRID?.ext_code?.split("-")[2],
        ext_type: "MED_DOSE_FORM",
        source: "NPHIES CLINICAL",
        dbConn: connection,
      });
      medDoseForm.ext_desc = res?.ext_desc || null;
      medDoseForm.ext_code = MRID?.ext_code?.split("-")[2] || null;
    }

    if (!medDoseForm?.ext_desc) {
      MEDICATION_LOGGER.debug(
        `medDoseForm.ext_desc is null for order line ${line?.ORDER_LINE} Product Code ${line?.PRODUCT_CODE} - SFDA ${line?.NATIONAL_DRUG_CODING} and DOSE_FORM ${dosage?.DOSE_FORM}`,
      );
      medDoseForm.ext_desc = "solution/ drops";
      medDoseForm.ext_code = "5406";
    }

    MEDICATION_LOGGER.silly(`👨‍⚕️ physician : ${JSON.stringify({ physician })}`);

    const totalQuantity = Number.parseFloat(
      dosage?.ADMIN_QTY * dosage?.TIMES * dosage?.NO_OF_DAYS,
    )?.toFixed(2);
    MEDICATION_LOGGER.debug(`totalQuantity : ${totalQuantity}`);

    MEDICATION_REQUEST.push({
      ORDER_LINE: line?.ORDER_LINE,
      MEDICATION_REQUEST_ID: generateUUID(),
      CATEGORY_CODE: line?.MEDICATION_CATEGORY_CODE || "U", // TODO CHECK ( need default ? )
      CATEGORY_DISPLAY: line?.MEDICATION_CATEGORY_DESC || "Uncontrolled", // TODO CHECK ( need default ? )
      ENCOUNTER_TYPE_CODE:
        line?.ENCOUNTER_TYPE_DESC?.toLowerCase() || "outpatient", // TODO CHECK ( need default ? )
      ENCOUNTER_TYPE_DISPLAY: line?.ENCOUNTER_TYPE_DESC || "Outpatient", // TODO CHECK ( need default ? )

      TEXT_XHTML_NARRATIVE: MRID?.ext_desc + " " + line?.DOSAGE_DESC,
      URGENT_FLAG: line?.URGENT_FLAG || "N", // TODO CHECK ( need default ? )
      PRESCRIPTION_STATUS: line?.PRESCRIPTION_STATUS || "active", // TODO CHECK ( need default ? )
      GROUP_IDENTIFIER: request?.MASTER_NO,
      NOTE: line?.DOSAGE_NARRATIVE || "NA",
      REASON_CODE: episodeDiagnosis[0]?.ICD_CODE || "",
      REASON_DISPLAY: episodeDiagnosis[0]?.DESCRIPTION || "",
      CONTAINED: {
        MED_MRID_CODE: MRID.ext_code,
        DESCRIPTION: MRID?.ext_desc || "",
        MEDICATION_DOSE_FORM_CODE: medDoseForm?.ext_code || "", //TODO CHECK
        MEDICATION_DOSE_FORM_DISPLAY: medDoseForm?.ext_desc || "", //TODO CHECK
      },
      DOSAGE_DESC: line?.DOSAGE_DESC || "",
      DOSAGE: {
        PER_DESCRIPTION: dosage?.PER_DESCRIPTION || "",
        NO_OF_PERIODS: dosage?.NO_OF_PERIODS || 0,
        TIMES: dosage?.TIMES || 0,

        BOUNDS_PERIOD_START: dosage?.DOSAGE_START_DATETIME
          ? dayjs(dosage?.DOSAGE_START_DATETIME).format("YYYY-MM-DD")
          : "",
        BOUNDS_PERIOD_END: dosage?.DOSAGE_START_DATETIME
          ? dayjs(dosage?.DOSAGE_START_DATETIME)
              .add(dosage?.NO_OF_DAYS, "day")
              .format("YYYY-MM-DD")
          : "",

        ROUTE_CODE: routeOfAdmin?.ext_code || "",
        ROUTE_DISPLAY: routeOfAdmin?.ext_desc || routeOfAdmin?.ext_code,
        PATIENT_INSTRUCTION: dosage?.NOTES || "",

        SITE_CODE: medApproachSite?.ext_code || "", //TODO CHECK
        SITE_DISPLAY: medApproachSite?.ext_desc || "", //TODO CHECK
        ADDITIONAL_INSTRUCTION_CODE: "422135004", // TODO CHECK Mapping Med Frequency Precondition
        ADDITIONAL_INSTRUCTION_DISPLAY: "as directed", //TODO CHECK
        ADDITIONAL_INSTRUCTION_TEXT: dosage?.NOTES || "",
        AS_NEEDED_BOOLEAN: dosage?.AS_NEEDED === "Y" ? "true" : "false",
        TIMING_CODE: "422114001", // TODO CHECK Mapping
        TIMING_DISPLAY: "Once", // TODO CHECK Mapping
      },
      DISPENSE_REQUEST: {
        VALIDITY_PERIOD_START: dayjs(line.LINE_ORDER_DATE).format("YYYY-MM-DD"),
        VALIDITY_PERIOD_END: dayjs(line.LINE_EXPIRY_DATE).format("YYYY-MM-DD"),
        NUMBER_OF_REPEATS_ALLOWED: 0, // TODO CHECK
        QUANTITY: dosage?.ADMIN_QTY
          ? Number.parseFloat(dosage?.ADMIN_QTY).toFixed(2)
          : "",
        QUANTITY_TOTAL: totalQuantity,
        QUANTITY_UNIT: medQuantityUnit?.ext_code || "{tablet}",
        EXPECTED_SUPPLY_DURATION: dosage?.NO_OF_DAYS,
        EXPECTED_SUPPLY_DURATION_UNIT: "day(s)", // TODO CHECK
        EXPECTED_SUPPLY_DURATION_CODE: "d", // TODO CHECK
      },
    });
  }

  // Build the complete data object
  return {
    BUNDLE_ID: generateUUID(),
    MESSAGE_HEADER_ID: generateUUID(),
    ORGANIZATION_ID: generateUUID(),

    TIMESTAMP: new Date().toISOString().replace(/\.\d{3}Z$/, "+03:00"),
    ORDER_LINE: MEDICATION_REQUEST[0]?.ORDER_LINE,
    REQ_NO: request.REQ_NO,
    MASTER_NO: request.MASTER_NO,
    REQ_CREATION_DATE: dayjs(request.REQ_CREATION_DATE).format("YYYY-MM-DD"),
    ATTENDANCE_TYPE: request.ATTENDANCE_TYPE,
    EPISODE_NO: request.EPISODE_NO,
    PURCHASER_CODE: request.PURCHASER_CODE,
    orderer_staff_id: request.orderer_staff_id,

    PATIENT: {
      ...patient,
      PATIENT_ID: generateUUID(),
      MOBILE_NO:
        (patient?.MOBILE_NO?.startsWith("0")
          ? `+966${patient?.MOBILE_NO?.substring(1)}`
          : patient?.MOBILE_NO) || "",
    },
    PRACTITIONER: {
      ...physician,

      PRACTITIONER_ROLE_ID: generateUUID(),
      PRACTITIONER_ID: generateUUID(),
      ADDRESS: "",
      ADDRESS_LINE: "",
      CITY: "",
      POSTAL_CODE: "",
      COUNTRY: "",
      CODE: "100000003",
      DISPLAY: "Medicine and Surgery",
      SPECIALTY_DISPLAY: physician?.SPECIALTY_DESC || "General Practice", // TODO CHECK ( need default ?)
      SPECIALTY_CODE:
        physician?.SPECIALTY_CODE || "049E7C6B-62F9-E811-B80F-005056AD2FD8", // TODO CHECK ( need default ?)
    },

    ENCOUNTER: {
      ENCOUNTER_ID: generateUUID(),
      ENCOUNTER_IDENTIFIER: request.ENCOUNTER_IDENTIFIER,
      PERIOD_START: request.START_DATE
        ? dayjs(request.START_DATE).format("YYYY-MM-DD")
        : "",
      ENCOUNTER_CLASS_CODE: request.ENCOUNTER_TYPE,
      ENCOUNTER_CLASS_DISPLAY: request.ENCOUNTER_TYPE_DESC,
    },

    OBSERVATIONS: observations,

    MEDICATION_REQUEST: MEDICATION_REQUEST || [],
  };
}

/**
 * Main function to export prescription to NPHIES format
 * @param {Object} connection - Oracle database connection
 * @param {Object} params - Export parameters
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @param {number|null} params.patientId - Patient ID filter
 * @param {number|null} params.episodeNo - Episode number filter
 * @param {number} params.requestUrl - Original request URL for logging
 * @param {Object} params.facility - Facility information
 * @param {string|null} params.status - Status filter
 * @param {number|null} params.orderLine - Order line filter
 * @returns {Promise<{exportedCount: number, failedCount: number, exportedBundles: Array, failedRequests: Array}>} Export result with counts of successfully processed and failed requests
 * @property {number} exportedCount - Number of successfully processed requests
 * @property {number} failedCount - Number of failed requests
 * @property {Array} exportedBundles - Array of successfully processed bundles
 * @property {Array} failedRequests - Array of failed requests
 * @property {string} message - Summary message of the export result
 *
 */
export const medicationPrescriptionToNPHIES = async (connection, params) => {
  const {
    startDate = null,
    endDate = null,
    patientId = null,
    episodeNo = null,
    status = null,
    orderLine = null,
    facility,
    abortSignal,
  } = params;
  let { requestUrl } = params;
  const facilityId = facility?.facility_id || null;
  let orderLineToUse = orderLine;

  MEDICATION_LOGGER.debug(
    "🔰⚕️Starting prescription export to NPHIES" +
      JSON.stringify({
        startDate,
        endDate,
        patientId,
        episodeNo,
        requestUrl,
        facilityId,
        status,
        orderLine,
        facilityName: facility?.name,
        status,
      }),
  );

  try {
    MEDICATION_LOGGER.debug(
      "Fetching prescription requests from database" +
        JSON.stringify({
          patientId,
          episodeNo,
          startDate,
          endDate,
          status,
          orderLine,
        }),
    );

    let publishDate = await getConfValue({
      facilityId: facilityId,
      key: "NPHIES_CS_MEDICATION_START_SEND",
    });

    if (!publishDate) {
      MEDICATION_LOGGER.error(
        `NPHIES_CS_MEDICATION_START_SEND is not configured for facilityId: ${facilityId}`,
      );
      throw new Error(
        `NPHIES_CS_MEDICATION_START_SEND is not configured for facilityId: ${facilityId}`,
      );
    }

    if (startDate && dayjs(startDate).isBefore(dayjs(publishDate))) {
      MEDICATION_LOGGER.debug(
        `Start date ${startDate} is before publish date ${publishDate}, using start date`,
      );
      publishDate = dayjs(startDate, "YYYY-MM-DD", "DD-MM-YYYY").format(
        "DD-MMM-YYYY",
      );
    }

    if (!requestUrl) {
      requestUrl = `/api/v1/hl7/medication-request?facilityId=${facilityId || ""}&startDate=${publishDate || ""}`;
    }

    if (params.startDate) {
      params.startDate = dayjs(
        params.startDate,
        "DD-MM-YYYY",
        "YYYY-MM-DD",
      ).format("YYYY-MM-DDTHH:mm:ss");
    }

    // TIMING: preprocess starts here — fetching rows from Oracle
    const preprocessStart = process.hrtime.bigint();

    const PHARMACY_CATEGORY = await fetchSystemRule({
      oracleConnection: connection,
      defaultType: "PHARMACYCATEGORY",
    });

    const PHARMACY_CATEGORY_WITH_COMMA = `,${PHARMACY_CATEGORY || ""},`;

    clientLogger.debug(
      "PHARMACY_CATEGORY_WITH_COMMA " + PHARMACY_CATEGORY_WITH_COMMA,
    );

    const sqlFilePath = getRelativePath("queries/medicationRequest.sql");
    const { rows: prescriptionRequests } = await executeSqlFile(
      connection,
      sqlFilePath,
      {
        p_patient_id: patientId,
        p_episode_no: episodeNo,
        p_start_date: startDate,
        p_end_date: endDate,
        p_status: status,
        p_publish_date: publishDate,
        p_order_line: orderLine,
        p_pharmacy_category: PHARMACY_CATEGORY_WITH_COMMA,
      },
    );

    const preprocessEnd = process.hrtime.bigint();
    const preprocessTimeMs = Number(preprocessEnd - preprocessStart) / 1e6;

    if (!prescriptionRequests || prescriptionRequests.length === 0) {
      MEDICATION_LOGGER.debug(
        "No prescription requests found for the given criteria " +
          JSON.stringify({
            startDate,
            endDate,
            patientId,
            episodeNo,
            status,
            publishDate,
            facilityId,
            orderLine,
            PHARMACY_CATEGORY_WITH_COMMA
          }),
      );
      // throw new Error("No prescription requests found for the given criteria");
    }

    MEDICATION_LOGGER.info(
      `Found ${prescriptionRequests.length} prescription request(s)`,
    );

    const exportedBundles = [];
    const failedRequests = [];

    const count = {
      failCount: 0,
      successCount: 0,
      errorCount: 0,
    };

    for (const request of prescriptionRequests) {
      if (abortSignal?.aborted) {
        MEDICATION_LOGGER.warn(
          `[medicationPrescriptionToNPHIES]❌❌❌❌❌ Aborted by signal. Stopped before request ${request.MASTER_NO}`,
        );
        break;
      } else {
        MEDICATION_LOGGER.debug(
          `[medicationPrescriptionToNPHIES] ✅✅✅✅✅ NOT Aborted by signal. abortSignal?.aborted ${abortSignal?.aborted}`,
        );
      }

      const recordStart = process.hrtime.bigint();
      let api_trans_id = null;
      // TIMING: axios (response) time per record, defaults to 0
      let response_time_ms = 0;

      try {
        MEDICATION_LOGGER.debug(
          `🔰🔰🔰⚕️✍️ Processing prescription request with ORDER_NO: ${request.MASTER_NO}`,
        );

        const {
          rows: [transaction],
        } = await query(
          `INSERT INTO api_transaction (
          trans_date,
          patient_id,episode_no, 
          api_provider , api_function , status , api_name ,  transaction_id , facility_id
      ) VALUES ( $9, $1, $2, $3 ,$4 , $5, $6 , $7, $8 ) 
        returning *`,

          [
            request.PATIENT_ID || null,
            request.EPISODE_NO || null,
            "NPHIES_CS",
            "PRESCRIPTION",
            "FAIL",
            "MEDICATION",
            request.MASTER_NO,
            facilityId || null,
            request?.TRANS_DATE,
          ],
        );

        api_trans_id = transaction?.api_trans_id || null;

        const data = await fetchPrescriptionData({
          connection,
          request,
          facilityId,
          params,
          apiTransId: api_trans_id,
          pharmacyCategory : PHARMACY_CATEGORY_WITH_COMMA
        });

        if (data.MEDICATION_REQUEST.length === 0) {
          MEDICATION_LOGGER.debug(
            `No medication requests found for prescription request ${request.MASTER_NO}. Skipping this request.`,
          );
          await insertApiMessage({
            apiTransId: api_trans_id,
            errorMessage: `No medication requests found for ,prescription request : ${request.MASTER_NO || "''"}.`,
            errorId: NPHIES_FAIL_ID.INVALID_MEDICATION_REQUEST_DATA,
          });
        }

        orderLineToUse = data.ORDER_LINE || orderLine;

        data.ORGANIZATION_NAME = facility ? facility.name : "Unknown Facility";
        data.NPHIES_CS_ORG_ID = facility
          ? facility.nphies_cs_org_id
          : "Unknown License";

        data.NPHIES_CS_OID = await getConfValue({
          facilityId: facility.facility_id,
          key: "NPHIES_CS_OID",
        });

        if (!data.NPHIES_CS_OID) {
          MEDICATION_LOGGER.error(
            `NPHIES_CS_OID is not configured for facilityId: ${facility.facility_id || "''"}`,
          );
          await insertApiMessage({
            apiTransId: api_trans_id,
            errorMessage: `NPHIES_CS_OID is not configured for ,facilityId : ${facility.facility_id || "''"}`,
            errorId: NPHIES_FAIL_ID.NPHIES_CS_OID,
          });
        }

        const NPHIES_CS_TEST_ORG_ID = await getConfValue({
          facilityId: facilityId,
          key: "NPHIES_CS_TEST_ORG_ID",
        });
        if (NPHIES_CS_TEST_ORG_ID) {
          data.NPHIES_CS_ORG_ID = NPHIES_CS_TEST_ORG_ID;
          clientLogger.debug(
            `MEDICATION_PRESCRIPTION - ID number overridden by NPHIES_CS_TEST_ORG_ID: ${NPHIES_CS_TEST_ORG_ID}`,
          );
        }

        MEDICATION_LOGGER.silly(`Building FHIR bundle`);
        const medicationTemplate = loadTemplate("medication.json");

        const observationTemplate = JSON.stringify(
          JSON.parse(medicationTemplate).entry.find(
            (entry) => entry.resource.resourceType === "Observation",
          ),
        );
        const medicationRequestTemplate = JSON.stringify(
          JSON.parse(medicationTemplate).entry.find(
            (entry) => entry.resource.resourceType === "MedicationRequest",
          ),
        );

        const bundle = processTemplate({
          template: medicationTemplate,
          data,
        });
        let parsedBundle;

        try {
          parsedBundle = JSON.parse(bundle);
        } catch (error) {
          parsedBundle = JSON5.parse(bundle);
        }

        parsedBundle.entry = parsedBundle.entry.filter(
          (entry) =>
            entry.resource.resourceType !== "MedicationRequest" &&
            entry.resource.resourceType !== "Observation",
        );

        let observationsReferences = [];

        for (const observation of data.OBSERVATIONS) {
          const observationBundle = processTemplate({
            template: observationTemplate,
            data: observation,
          });
          const parsedObservation = JSON.parse(observationBundle);
          parsedBundle.entry.push(parsedObservation);
          observationsReferences.push({
            reference: `Observation/${observation.OBSERVATION_ID}`,
          });
        }

        const focus = [];
        for (const medicationRequest of data.MEDICATION_REQUEST) {
          MEDICATION_LOGGER.debug(
            "Processing medication request for template replacement" +
              JSON.stringify({
                medicationRequestId: medicationRequest.MEDICATION_REQUEST_ID,
              }),
          );

          focus.push({
            identifier: [
              {
                system: `${data.NPHIES_CS_OID}`,
                value: `${medicationRequest.ORDER_LINE}`,
              },
            ],
          });

          const medicationRequestBundle = processTemplate({
            template: medicationRequestTemplate,
            data: {
              ...data,
              MEDICATION_REQUEST: medicationRequest,
            },
          });

          let parsedMedicationRequest = null;
          try {
            parsedMedicationRequest = JSON.parse(medicationRequestBundle);
          } catch (error) {
            MEDICATION_LOGGER.error(
              `fail to parse medication request bundle for medication request ${medicationRequest.MEDICATION_REQUEST_ID}: ${error.message}`,
            );
            try {
              parsedMedicationRequest = JSON5.parse(medicationRequestBundle);
            } catch (json5Error) {
              MEDICATION_LOGGER.error(
                `fail to parse medication request bundle using JSON5 for medication request ${medicationRequest.MEDICATION_REQUEST_ID}: ${json5Error.message}`,
              );
              await insertApiMessage({
                apiTransId: api_trans_id,
                errorMessage: `fail to parse medication request bundle for ,medication request : ${medicationRequest.MEDICATION_REQUEST_ID || "''"}: ${error.message}`,
                errorId: NPHIES_FAIL_ID.JSON5_PARSE_ERROR,
              });
              continue;
            }
          }

          parsedMedicationRequest.resource.supportingInformation =
            observationsReferences;
          parsedMedicationRequest.resource.dosageInstruction.forEach(
            (dosage) => {
              if (!dosage?.site?.coding?.[0]?.code) {
                delete dosage.site;
              }

              if (!dosage?.additionalInstruction?.text) {
                delete dosage?.additionalInstruction?.text;
              }

              if (!dosage?.additionalInstruction?.coding?.[0]?.code) {
                delete dosage?.additionalInstruction;
              }
            },
          );

          parsedBundle.entry.push(parsedMedicationRequest);
        }

        const patientResource = parsedBundle.entry.find(
          (entry) => entry.resource.resourceType === "Patient",
        );

        parsedBundle.entry[0].resource.focus = focus;

        if (
          !patientResource.resource?.address?.[0]?.text &&
          !patientResource.resource?.address?.[0]?.line &&
          !patientResource.resource?.address?.[0]?.city &&
          !patientResource.resource?.address?.[0]?.postalCode &&
          !patientResource.resource?.address?.[0]?.country
        ) {
          MEDICATION_LOGGER.debug(
            "No address information found for patient, removing address field from resource",
          );
          delete patientResource.resource.address;
        } else {
          !patientResource.resource?.address?.[0]?.text &&
            delete patientResource.resource.address[0].text;
          !patientResource.resource?.address?.[0]?.line &&
            delete patientResource.resource.address[0].line;
          !patientResource.resource?.address?.[0]?.city &&
            delete patientResource.resource.address[0].city;
          !patientResource.resource?.address?.[0]?.postalCode &&
            delete patientResource.resource.address[0].postalCode;
          !patientResource.resource?.address?.[0]?.country &&
            delete patientResource.resource.address[0].country;
        }

        const practitionerResource = parsedBundle.entry.find(
          (entry) => entry.resource.resourceType === "Practitioner",
        );
        if (
          !practitionerResource.resource?.address?.[0]?.text &&
          !practitionerResource.resource?.address?.[0]?.line &&
          !practitionerResource.resource?.address?.[0]?.city &&
          !practitionerResource.resource?.address?.[0]?.postalCode &&
          !practitionerResource.resource?.address?.[0]?.country
        ) {
          MEDICATION_LOGGER.debug(
            "No address information found for practitioner, removing address field from resource",
          );
          delete practitionerResource.resource.address;
        } else {
          !practitionerResource.resource?.address?.[0]?.text &&
            delete practitionerResource.resource.address[0].text;
          !practitionerResource.resource?.address?.[0]?.line &&
            delete practitionerResource.resource.address[0].line;
          !practitionerResource.resource?.address?.[0]?.city &&
            delete practitionerResource.resource.address[0].city;
          !practitionerResource.resource?.address?.[0]?.postalCode &&
            delete practitionerResource.resource.address[0].postalCode;
          !practitionerResource.resource?.address?.[0]?.country &&
            delete practitionerResource.resource.address[0].country;
        }

        const nphiesUrl = await getConfValue({
          key: "NPHIES_CS_MEDICATION_REQUEST_URL",
          facilityId,
        });

        await query(
          `UPDATE api_transaction SET
          trans_date = NOW(),
          patient_id = $1,
          episode_no = $2,
          api_provider = $3,
          api_function = $4,
          status = $5,
          api_name = $6,
          request = $7,
          url = $8,
          dest_url = $9,
          transaction_id = $10,
          bundle_count = $11,
          preprocess_time_ms = $13,
          outcome = $14,
          bundle_id = $15
        WHERE api_trans_id = $12
        returning *`,

          [
            request.PATIENT_ID || null,
            request.EPISODE_NO || null,
            "NPHIES_CS",
            data?.MEDICATION_REQUEST?.[0]?.CATEGORY_DISPLAY?.toUpperCase() ==
            "CONTROLLED"
              ? "PRESCRIPTION_C"
              : "PRESCRIPTION",
            "FAIL",
            "MEDICATION",

            JSON.stringify(parsedBundle),
            requestUrl,
            nphiesUrl,

            request.MASTER_NO,
            data.MEDICATION_REQUEST?.length || 0,
            api_trans_id,
            Math.trunc(preprocessTimeMs || 0),
            data?.MEDICATION_REQUEST?.[0]?.PRESCRIPTION_STATUS,
            data.BUNDLE_ID,
          ],
        );

        MEDICATION_LOGGER.debug(
          `Inserted transaction record with ID ${api_trans_id} for prescription request ${request.MASTER_NO}`,
        );

        const { rows: apiMessages } = await query(
          `SELECT * FROM api_message WHERE api_trans_id = $1`,
          [api_trans_id],
        );
        if (apiMessages.length > 0) {
          count.failCount++;
          MEDICATION_LOGGER.error(
            `Found ${apiMessages.length} error message(s) for transaction ID ${api_trans_id}. Not sending request to NPHIES API for prescription request ${request.MASTER_NO}`,
          );
          failedRequests.push({
            masterNo: request.MASTER_NO,
            api_trans_id,
            message: apiMessages.map((msg) => msg.nphies_message).join("; "),
          });

          await connection.execute(
            `UPDATE order_lines 
              SET nphies_cs_sent = CASE 
                ${data.MEDICATION_REQUEST.map(
                  (r, index) =>
                    `WHEN order_line = :order_line_${index} THEN 
                    CASE status 
                      WHEN 'C' THEN 'CF' 
                      WHEN 'D' THEN 'DF'  
                      ELSE 'F' 
                    END`,
                ).join(" ")}
            END 
            WHERE order_line IN (${data.MEDICATION_REQUEST.map((r, index) => `:order_line_${index}`).join(", ")})`,
            data.MEDICATION_REQUEST.reduce((acc, r, index) => {
              acc[`order_line_${index}`] = r.ORDER_LINE;
              return acc;
            }, {}),
          );
          await connection.commit();

          // TIMING: compute elapsed/local even when skipping NPHIES
          const endTime = process.hrtime.bigint();
          const elapsed_time_ms = Number(endTime - recordStart) / 1e6;
          const local_api_time_ms = Math.max(
            elapsed_time_ms  - response_time_ms,
            0,
          );

          await query(
            `UPDATE api_transaction SET 
              response_time_ms = $2,
              elapsed_time_ms = $3,
              local_api_time_ms = $4
            WHERE api_trans_id = $1`,
            [
              api_trans_id,
              Math.trunc(response_time_ms || 0),
              Math.trunc(elapsed_time_ms || 0),
              Math.trunc(local_api_time_ms || 0),
            ],
          );

          continue;
        }

        let nphiesResponse = null;
        let apiEndTime;
        let apiStartTime;

        try {
          MEDICATION_LOGGER.info(
            `📨⚕️Sending request ${request.MASTER_NO} to NPHIES API at ${nphiesUrl}`,
          );

          if (!nphiesUrl) {
            MEDICATION_LOGGER.error(
              "NPHIES_CS_MEDICATION_REQUEST_URL is not configured",
            );
            throw new Error(
              "NPHIES_CS_MEDICATION_REQUEST_URL is not configured",
            );
          }

          apiStartTime = process.hrtime.bigint();
          const isONA = nphiesUrl && nphiesUrl.includes("ona");

          let agent = null;
          if (!isONA) {
            try {
              const certPath = path.join(
                __dirname,
                "../../certs",
                "_.cs-stg.nphies.sa.crt",
              );
              const cert = fs.readFileSync(certPath);
              agent = new https.Agent({
                ca: cert,
                rejectUnauthorized: false,
              });
              MEDICATION_LOGGER.debug(
                `Using stg or live with certificate for URL: ${nphiesUrl}`,
              );
            } catch (error) {
              MEDICATION_LOGGER.debug(
                `Certificate not found, using self-signed certificate acceptance for HTTPS: ${error.message}`,
              );
              agent = new https.Agent({ rejectUnauthorized: false });
            }
          } else {
            agent = new https.Agent({ rejectUnauthorized: false });
            MEDICATION_LOGGER.debug(
              `Using ona (no certificate) for URL: ${nphiesUrl}`,
            );
          }

          const response = await axios.post(
            nphiesUrl,
            parsedBundle,
            {
              httpsAgent: agent,
              headers: {
                "Content-Type": "application/json",
              },
            },
            {
              timeout: 10000,
            },
          );

          apiEndTime = process.hrtime.bigint();
          response_time_ms = Number(apiEndTime - apiStartTime) / 1e6;

          MEDICATION_LOGGER.info(
            `status code for request ${request.MASTER_NO} from NPHIES API: ${response.status}`,
          );

          nphiesResponse = response.data;
          await query(
            `UPDATE api_transaction SET response = $2, status = $3 WHERE api_trans_id = $1`,
            [api_trans_id, JSON.stringify(nphiesResponse), "SUCCESS"],
          );

          await connection.execute(
            `UPDATE order_lines 
              SET nphies_cs_sent = CASE 
                ${data.MEDICATION_REQUEST.map(
                  (r, index) =>
                    `WHEN order_line = :order_line_${index} THEN 
                    CASE status 
                      WHEN 'C' THEN 'CS' 
                      WHEN 'D' THEN 'DS' 
                      ELSE 'S' 
                    END`,
                ).join(" ")}
              END 
              WHERE order_line IN (${data.MEDICATION_REQUEST.map((r, index) => `:order_line_${index}`).join(", ")})`,
            data.MEDICATION_REQUEST.reduce((acc, r, index) => {
              acc[`order_line_${index}`] = r.ORDER_LINE;
              return acc;
            }, {}),
          );
          await connection.commit();

          count.successCount++;

          exportedBundles.push({
            reqNo: request.REQ_NO,
            bundle: parsedBundle,
            nphiesResponse: nphiesResponse,
            api_trans_id,
          });
        } catch (apiError) {
          failedRequests.push({
            reqNo: request.REQ_NO,
            bundle: parsedBundle,
            message: apiError.message || "",
            api_trans_id,
          });

          MEDICATION_LOGGER.debug(
            apiError,
            `Error sending request ${request.MASTER_NO} to NPHIES API`,
          );
          apiEndTime = process.hrtime.bigint();
          response_time_ms = Number(apiEndTime - apiStartTime) / 1e6;

          if (apiError.response) {
            count.errorCount++;

            await connection.execute(
              `UPDATE order_lines 
                SET nphies_cs_sent = CASE 
                  ${data.MEDICATION_REQUEST.map((r, index) => {
                    return `WHEN order_line = :order_line_${index} THEN 
                      CASE status 
                        WHEN 'C' THEN 'CE' 
                        WHEN 'D' THEN 'DE' 
                        ELSE 'E' 
                      END`;
                  }).join(" ")}
                END 
                WHERE order_line IN (${data.MEDICATION_REQUEST.map((r, index) => `:order_line_${index}`).join(", ")})`,
              data.MEDICATION_REQUEST.reduce((acc, r, index) => {
                acc[`order_line_${index}`] = r.ORDER_LINE;
                return acc;
              }, {}),
            );
            await connection.commit();

            MEDICATION_LOGGER.error(
              `response status code for request ${request.MASTER_NO} from NPHIES API: ${apiError.response.status}`,
            );
            nphiesResponse = {
              status: apiError.response.status,
              data: apiError.response.data,
            };

            await query(
              `UPDATE api_transaction SET response = $2, status = $3 , res_identifier = $4 WHERE api_trans_id = $1`,
              [
                api_trans_id,
                JSON.stringify(nphiesResponse),
                "ERROR",
                apiError?.response?.data?.issue?.[0]?.diagnostics || null,
              ],
            );

            if (apiError.response?.data?.issue) {
              let issueCount = 0;
              for (const issue of apiError.response.data.issue) {
                const { field, value, isValid } = extractFieldAndValue(
                  issue.details?.text,
                );
                await query(
                  `INSERT INTO api_message (api_trans_id, error_element , element_value , nphies_message_id , nphies_message) VALUES ($1, $2, $3, $4, $5)
                  returning *`,
                  [api_trans_id, field, value, issue.code, issue.details?.text],
                );

                issueCount++;
              }

              MEDICATION_LOGGER.debug(
                `📨Extracted and stored ${issueCount} issue(s) from NPHIES API response for request ${request.MASTER_NO}`,
              );
            } else {
              MEDICATION_LOGGER.error(
                `❌📨Error sending request ${request.MASTER_NO} to NPHIES API: ` +
                  JSON.stringify({
                    message: apiError.message,
                    stack: apiError.stack,
                  }),
              );
              nphiesResponse = {
                message: apiError.message,
                stack: apiError.stack,
              };

              await query(
                `UPDATE api_transaction SET response = $2, status = $3 WHERE api_trans_id = $1`,
                [api_trans_id, JSON.stringify(nphiesResponse), "FAIL"],
              );
            }
          } else {
            count.failCount++;

            await connection.execute(
              `UPDATE order_lines 
                SET nphies_cs_sent = CASE 
                  ${data.MEDICATION_REQUEST.map(
                    (r, index) =>
                      `WHEN order_line = :order_line_${index} THEN 
                      CASE status 
                        WHEN 'C' THEN 'CF' 
                        WHEN 'D' THEN 'DF' 
                        ELSE 'F' 
                      END`,
                  ).join(" ")}
                END 
                WHERE order_line IN (${data.MEDICATION_REQUEST.map((r, index) => `:order_line_${index}`).join(", ")})`,
              data.MEDICATION_REQUEST.reduce((acc, r, index) => {
                acc[`order_line_${index}`] = r.ORDER_LINE;
                return acc;
              }, {}),
            );
            await connection.commit();

            MEDICATION_LOGGER.error(
              `❌📨Error sending request ${request.MASTER_NO} to NPHIES API: ` +
                JSON.stringify({
                  message: apiError.message,
                  stack: apiError.stack,
                }),
            );
            nphiesResponse = {
              message: apiError.message,
              stack: apiError.stack,
            };
          }
        }

        // TIMING: elapsed from preprocessStart, local = elapsed - preprocess - response
        const endTime = process.hrtime.bigint();
        const elapsed_time_ms = Number(endTime - recordStart) / 1e6;
        const local_api_time_ms = Math.max(
          elapsed_time_ms  - response_time_ms,
          0,
        );

        await query(
          `UPDATE api_transaction SET 
            response_time_ms = $2,
            elapsed_time_ms = $3,
            local_api_time_ms = $4
          WHERE api_trans_id = $1`,
          [
            api_trans_id,
            Math.trunc(response_time_ms || 0),
            Math.trunc(elapsed_time_ms || 0),
            Math.trunc(local_api_time_ms || 0),
          ],
        );

        MEDICATION_LOGGER.debug(
          `🔚 ⚕️ End Send Prescription: ${request.MASTER_NO}` +
            JSON.stringify({
              bundleId: parsedBundle.id,
              entryCount: parsedBundle.entry?.length || 0,
            }),
        );
      } catch (error) {
        if (isOracleConnectionOrPoolError(error)) {
          MEDICATION_LOGGER.error(
            `Fatal Oracle connection error during prescription processing: ${error.message}. Aborting batch so connection and pool can be refreshed cleanly.`,
          );
          throw error;
        }
        count.failCount++;
        MEDICATION_LOGGER.error(
          `Error details while processing prescription for request ${request.MASTER_NO}: ` +
            JSON.stringify({
              message: error.message,
              stack: error.stack,
            }),
        );

        await query(
          `UPDATE api_transaction SET response = $2, status = $3 WHERE api_trans_id = $1`,
          [
            api_trans_id,
            JSON.stringify({ error: error.message, stack: error.stack }),
            "FAIL",
          ],
        );

        // TIMING: compute and persist times even on failure
        const endTime = process.hrtime.bigint();
        const elapsed_time_ms = Number(endTime - recordStart) / 1e6;
        const local_api_time_ms = Math.max(
          elapsed_time_ms  - response_time_ms,
          0,
        );

        await query(
          `UPDATE api_transaction SET 
            response_time_ms = $2,
            elapsed_time_ms = $3,
            local_api_time_ms = $4
          WHERE api_trans_id = $1`,
          [
            api_trans_id,
            Math.trunc(response_time_ms || 0),
            Math.trunc(elapsed_time_ms || 0),
            Math.trunc(local_api_time_ms || 0),
          ],
        );

        failedRequests.push({
          reqNo: request.REQ_NO,
          message: error.message,
          stack: error.stack,
          api_trans_id,
        });
      }
    }

    MEDICATION_LOGGER.debug(
      "Prescription export completed" +
        JSON.stringify({
          totalRequests: prescriptionRequests.length,
          exportedCount: exportedBundles.length,
          failedCount: failedRequests.length,
        }),
    );

    return {
      // message:
      //   prescriptionRequests.length == 0
      //     ? `No prescription requests found for the given criteria.`
      //     : `successfully processed ${exportedBundles.length} prescription request(s) and fail ${failedRequests.length} request(s)`,

      message: `Total Transactions: : ${prescriptionRequests.length} - FAIL:${count?.failCount},  SUCCESS:${count?.successCount} , ERROR:${count?.errorCount}.`,

      exportedCount: exportedBundles.length,
      failedCount: failedRequests.length,
      exportedBundles: exportedBundles,
      failedRequests: failedRequests,
      count: count,
    };
  } catch (error) {
    MEDICATION_LOGGER.error(
      "Error in exportPrescriptionToNPHIES " + error.message,
      // JSON.stringify({
      //   error: error.message,
      //   stack: error.stack,
      //   patientId,
      //   episodeNo,
      // }),
    );
    throw error;
  }
};
