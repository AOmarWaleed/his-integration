import https from "https";
import { fetchDosage } from "../../util/fetchDosage.js";
import { fetchDispenseLines } from "../../util/fetchDispenseLines.js";
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
import { getExtCode } from "../../util/getExtCode.js";
import { insertApiMessage } from "../../util/insertApiMsgs.js";
import { getExtDescription } from "../../util/getExtDescription.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import JSON5 from "json5";
import { NPHIES_FAIL_ID } from "../../util/constant.js";
import { fetchSystemRule } from "../../util/fetchSystemRule.js";
import { isOracleConnectionOrPoolError } from "../../config/oracle-dynamic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Saudi Arabia timezone (UTC+3)
const SAUDI_TZ = "Asia/Riyadh";

/**
 * Fetches all required data for a dispense
 *
 * @param {Object} params - Parameters for fetching dispense data
 * @param {Object} params.connection - Oracle database connection
 * @param {Object} params.request - Dispense request object
 * @param {string} params.pharmacyCategory - pharmacyCategory
 * @param {number} params.facilityId - Facility ID for configuration
 *@param {Object} params.params - Additional parameters for fetching prescription data
 * @param {string|null} params.params.startDate - Start date for filtering prescriptions
 * @param {string|null} params.params.endDate - End date for filtering prescriptions
 * @param {string|null} params.params.orderLine - Order line for filtering prescriptions
 * @param {string|null} params.params.publishDate - Publish date for filtering prescriptions
 * @param {string|null} params.params.status - Status for filtering prescriptions
 * @returns {Promise<Object>} Complete dispense data
 */
async function fetchDispenseMedicationData({
  connection,
  request,
  facilityId,
  params,
  apiTransId,
  pharmacyCategory
}) {
  const { PATIENT_ID, EPISODE_NO, ENCOUNTER_TYPE } = request;
  MEDICATION_LOGGER.debug(
    "Fetching dispense data" +
      JSON.stringify({
        patientId: PATIENT_ID,
        episodeNo: EPISODE_NO,
        encounterType: ENCOUNTER_TYPE,
      }),
  );

  const patient = await fetchPatientById({
    patientId: PATIENT_ID,
    oracleConnection: connection,
    facilityId,
  });
  const prescriptionLines = await fetchDispenseLines({
    deliveryLine: params.deliveryLine || request.DELIVERY_LINE || null,
    status: params.status || null,
    pharmacyCategory : pharmacyCategory ,
    oracleConnection: connection,
  });
  const physician = await fetchPhysician({
    staffId: request.ORDERER_STAFF_ID,
    connection,
    facilityId: facilityId,
  });

  if (!physician.IDENTIFIER_NO) {
    await insertApiMessage({
      apiTransId: apiTransId,
      errorMessage: `Identifier No missing for Physician with ,Staff ID : ${request.ORDERER_STAFF_ID || "''"} ,Facility: ${facilityId || "''"}`,
      errorId: NPHIES_FAIL_ID.PHYSICIAN_IDENTIFIER_NO,
    });
  }

  if (!patient?.HEALTH_ID) {
    await insertApiMessage({
      apiTransId: apiTransId,
      errorMessage: `Health ID missing for ,Patient ID : ${PATIENT_ID || "''"} ,Facility : ${facilityId || "''"}, NOT found using ,Birth Date : ${patient?.getHealthIdInfo?.dob || "''"} ,ID-No : ${patient?.getHealthIdInfo?.identityNo || "''"} ,Type : ${patient?.getHealthIdInfo?.identityType || "''"}`,

      errorId: NPHIES_FAIL_ID.HEALTH_ID,
    });
  }

  // Fetch dosage for each prescription line
  const MEDICATION_DISPENSE = [];
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

    MEDICATION_LOGGER.silly(
      `🛜 Route of Administration : ${JSON.stringify({ routeOfAdmin })}`,
    );

    if (!routeOfAdmin?.ext_code) {
      MEDICATION_LOGGER.debug(
        `🗺️⛔ Mapping Error for MED ROUTE OF ADMINISTRATION: ${dosage?.ROUTE} `,
      );
      await insertApiMessage({
        apiTransId,
        errorMessage: `No route mapping found for ,DOSAGE.ROUTE : ${dosage?.ROUTE || "''"}.`,
        errorId: NPHIES_FAIL_ID.MAP_ROUTE,
      });
    }

    const medApproachSite = {}; //DONE NA
    // const medApproachSite = await getExtCode({
    //   oasis_code: dosage?.ROUTE, //
    //   mapping_type: "MED_APPROACH_SITE",
    //   source: "NPHIES CLINICAL",
    //   ext_type: "MEDICATION APPROACH SITE",
    //   dbConn: connection,
    // });

    const medDoseForm = {}; //DONE NA
    // const medDoseForm = await getExtCode({
    //   oasis_code: dosage?.DOSE_FORM,
    //   mapping_type: "CODES",
    //   mapping_sub_type: "375",
    //   source: "NPHIES CLINICAL",
    //   ext_type: "MED_DOSE_FORM",
    //   dbConn: connection,
    // });

    const medQuantityUnit = await getExtCode({
      oasis_code: dosage?.UOM, //DONE MAPPING
      mapping_type: "MED_QUANTITY_UNIT",
      source: "NPHIES CLINICAL",
      ext_type: "MED QUANTITY UNIT",
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
      ext_type: "MRID_BRAND",
      dbConn: connection,
    });

    if (!MRID?.ext_code) {
      MEDICATION_LOGGER.debug(
        `🗺️⛔ Mapping Error for ${line?.PRODUCT_CODE} :  MRID.ext_code is null for order line ${line?.ORDER_LINE} and NATIONAL_DRUG_CODING ${line?.NATIONAL_DRUG_CODING} `,
      );
      await insertApiMessage({
        apiTransId,
        errorMessage: `No MRID_BRAND mapping found for ,SPDA : ${line?.NATIONAL_DRUG_CODING || "''"},PRODUCT_CODE : ${line?.PRODUCT_CODE},ITEM_DESCRIPTION : ${line?.DESCRIPTION}`,
        errorId: NPHIES_FAIL_ID.MAP_MRID_BRAND,
      });
    }

    const medPackageForm = await getExtDescription({
      ext_code: MRID?.ext_code?.split("-")?.pop(),
      ext_type: "MED_PACKAGE_FORM",
      source: "NPHIES CLINICAL",
      dbConn: connection,
    });

    MEDICATION_LOGGER.debug(
      `🗺️ Mapping medPackageForm :  MRID.ext_code (LAST_PART) is ${MRID?.ext_code?.split("-")?.pop()}  , medPackageForm =  ${JSON.stringify(medPackageForm)} `,
    );
    // if (!medPackageForm.ext_desc) {
    //   MEDICATION_LOGGER.error(
    //    `No PACKAGING_DISPLAY mapping found for ,CODE : ${MRID?.ext_code?.split("-")?.pop() || "''"},PRODUCT_CODE : ${line?.PRODUCT_CODE}`,
    //   );

    //   await insertApiMessage({
    //     apiTransId,
    //     errorMessage: `No PACKAGING_DISPLAY mapping found for ,CODE : ${MRID?.ext_code?.split("-")?.pop() || "''"},PRODUCT_CODE : ${line?.PRODUCT_CODE}`,
    //     errorId: NPHIES_FAIL_ID.MAP_PACKAGING_DISPLAY,
    //   });

    // }

    if (!medDoseForm?.ext_code) {
      MEDICATION_LOGGER.debug(
        `medDoseForm.ext_code is null for order line ${line?.ORDER_LINE} and DOSE_FORM ${dosage?.DOSE_FORM}`,
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
        `medDoseForm.ext_desc is null for order line ${line?.ORDER_LINE} and DOSE_FORM ${dosage?.DOSE_FORM}`,
      );
      medDoseForm.ext_desc = "na";
      medDoseForm.ext_code = "9999";
    }

    MEDICATION_DISPENSE.push({
      ORDER_LINE: line?.ORDER_LINE,
      DELIVERY_LINE: line?.DELIVERY_LINE,
      PRESCRIPTION_STATUS: line?.PRESCRIPTION_STATUS,
      CATEGORY_DISPLAY: line?.MEDICATION_CATEGORY_DESC || "Uncontrolled", // DONE ( need default ? )
      MEDICATION_DISPENSE_ID: generateUUID(),
      DISPENSE_ITEM_TYPE: line?.DISPENSE_ITEM_TYPE || "FFP", // DONE ( need default ? )
      DISPENSE_ITEM_TYPE_DISPLAY:
        line?.DISPENSE_ITEM_TYPE == "FFC"
          ? "First Fill – Complete"
          : line?.DISPENSE_ITEM_TYPE == "FFP"
            ? "First Fill – Part Fill"
            : "First Fill",

      AUTHORIZING_PRESCRIPTION_ID: line?.ORDER_LINE,
      DAYS_SUPPLY_VALUE: dosage?.NO_OF_DAYS,
      DAYS_SUPPLY_CODE: "d",
      DAYS_SUPPLY_UNIT: "day(s)",
      REFILLS_REMAINING: "", // DONE
      QUANTITY:
        dosage?.ADMIN_QTY && Number.parseFloat(dosage?.ADMIN_QTY)?.toFixed(2),
      QUANTITY_TOTAL: Number.parseFloat(
        dosage?.ADMIN_QTY * dosage?.TIMES * dosage?.NO_OF_DAYS,
      ).toFixed(2),
      QUANTITY_UNIT: medQuantityUnit?.ext_code || "{tablet}",
      WHEN_HANDED_OVER: dayjs(request.DELIVERY_DATE)
        .tz(SAUDI_TZ)
        .format("YYYY-MM-DDThh:mm:ssZ"),
      ENCOUNTER_TYPE_CODE:
        line?.ENCOUNTER_TYPE_DESC?.toLowerCase() || "outpatient", // DONE
      ENCOUNTER_TYPE_DISPLAY: line?.ENCOUNTER_TYPE_DESC || "Outpatient", // DONE
      TEXT_XHTML_NARRATIVE: MRID?.ext_desc + " " + line?.DOSAGE_DESC,

      CONTAINED: {
        MED_MRID_CODE: MRID?.ext_code || "",
        DESCRIPTION: line?.DESCRIPTION || "",
        MEDICATION_DOSE_FORM_CODE: medDoseForm?.ext_code,
        MEDICATION_DOSE_FORM_DISPLAY: medDoseForm?.ext_desc,

        BATCH_LOT_NUMBER: "", // TODO CHECK
        BATCH_EXPIRATION_DATE: "", // TODO CHECK
        PACKAGING_CODE: MRID?.ext_code?.split("-")?.pop()
          ? Number(MRID?.ext_code?.split("-")?.pop())
          : "", // todo walid : get code and diaply from external_codes of last section -99 'MED_PACKAGE_FORM' of 'NPHIES CLINICAL'
        PACKAGING_DISPLAY: medPackageForm.ext_desc, // todo walid : get code and diaply from external_codes of last section -99
        PACKAGING_QUANTITY: Number.parseFloat(
          dosage?.ADMIN_QTY * dosage?.TIMES * dosage?.NO_OF_DAYS,
        ).toFixed(2), // todo walid total as done with prescription
        PACKAGING_UNIT: medQuantityUnit?.ext_code, // DONE fail if null
      },
      DOSAGE: {
        PER_DESCRIPTION: dosage?.PER_DESCRIPTION || "",
        NO_OF_PERIODS: dosage?.NO_OF_PERIODS || 0, // TODO CHECK (need default ? )
        TIMES: dosage?.TIMES || 0, // TODO CHECK (need default ? )

        BOUNDS_PERIOD_START: dosage?.DOSAGE_START_DATETIME
          ? dayjs(dosage?.DOSAGE_START_DATETIME).format("YYYY-MM-DD")
          : "",
        BOUNDS_PERIOD_END: dosage?.DOSAGE_START_DATETIME
          ? dayjs(dosage?.DOSAGE_START_DATETIME)
              .add(dosage?.NO_OF_DAYS, "day")
              .format("YYYY-MM-DD")
          : "",
        ROUTE_CODE: routeOfAdmin?.ext_code, // TODO CHECK
        ROUTE_DISPLAY: routeOfAdmin?.ext_desc || routeOfAdmin?.ext_code, // TODO CHECK
        PATIENT_INSTRUCTION: dosage?.NOTES || "",

        SITE_CODE: medApproachSite?.ext_code || "", // DONE NA
        SITE_DISPLAY: medApproachSite?.ext_desc || "", // DONE NA
        ADDITIONAL_INSTRUCTION_CODE: "311502001", // TODO CHECK
        ADDITIONAL_INSTRUCTION_DISPLAY:
          "an hour before food (or on an empty stomach)", // TODO CHECK
        AS_NEEDED_BOOLEAN: dosage?.AS_NEEDED === "Y" ? "true" : "false", // TODO CHECK (Not Exist at fetch dosage)
        TIMING_CODE: "422114001", // TODO CHECK
        TIMING_DISPLAY: "Once", // TODO CHECK
      },
      DISPENSE_REQUEST: {
        QUANTITY:
          dosage?.ADMIN_QTY && Number.parseFloat(dosage?.ADMIN_QTY).toFixed(2),
        QUANTITY_UNIT: medQuantityUnit?.ext_code || "{tablet}",
        EXPECTED_SUPPLY_DURATION_CODE: "d",
      },
    });
  }

  MEDICATION_LOGGER.debug(`physician data: ${JSON.stringify(physician)}`);
  // Build the complete data object
  return {
    BUNDLE_ID: generateUUID(),
    MESSAGE_HEADER_ID: generateUUID(),
    ORGANIZATION_ID: generateUUID(),

    TIMESTAMP: new Date().toISOString().replace(/\.\d{3}Z$/, "+03:00"),
    DELIVERY_LINE: MEDICATION_DISPENSE[0]?.DELIVERY_LINE,
    REQ_NO: request.REQ_NO,

    MASTER_NO: request.MASTER_NO,

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

      ADDRESS: "", // TODO CHECK
      ADDRESS_LINE: "", // TODO CHECK
      CITY: "", // TODO CHECK
      POSTAL_CODE: "", // TODO CHECK
      COUNTRY: "", // TODO CHECK

      CODE: "100000003",
      DISPLAY: "Medicine and Surgery",
      SPECIALTY_CODE:
        physician?.SPECIALTY_CODE || "049E7C6B-62F9-E811-B80F-005056AD2FD8", // TODO CHECK (need default value ?)
      SPECIALTY_DISPLAY: physician?.SPECIALTY_DESC || "General Practice", // TODO CHECK (need default value ?)
    },

    ENCOUNTER: {
      ENCOUNTER_ID: generateUUID(),
      ENCOUNTER_IDENTIFIER: request.ENCOUNTER_IDENTIFIER,
      PERIOD_START: request.START_DATE
        ? dayjs(request.START_DATE).format("YYYY-MM-DD")
        : "",
      ENCOUNTER_CLASS_CODE: ENCOUNTER_TYPE,
      ENCOUNTER_CLASS_DISPLAY: ENCOUNTER_TYPE,
    },

    MEDICATION_DISPENSE: MEDICATION_DISPENSE || [],
  };
}

/**
 * Main function to export medication dispense to NPHIES format
 * @param {Object} connection - Oracle database connection
 * @param {Object} params - Export parameters
 * @param {Date} params.startDate - Start date
 * @param {Date} params.endDate - End date
 * @param {number|null} params.patientId - Patient ID filter
 * @param {number|null} params.episodeNo - Episode number filter
 * @param {number} params.requestUrl - Original request URL for logging
 * @param {Object} params.facility - Facility information
 * @param {string} params.status - Status filter
 * @param {number} params.deliveryLine - Delivery line filter
 * @returns {Promise<{exportedBundles: Array, failedRequests: Array, message: string, failedCount: number, exportedCount: number}>} Export result with bundle and status
 * @property {Array} exportedBundles - Array of successfully exported bundles
 * @property {Array} failedRequests - Array of failed requests
 * @property {string} message - Export result message
 * @property {number} failedCount - Count of failed requests
 * @property {number} exportedCount - Count of successfully exported bundles
 */
export const medicationDispenseToNPHIES = async (connection, params) => {
  const {
    startDate = null,
    endDate = null,
    patientId = null,
    episodeNo = null,
    status = null,
    facility,
    deliveryLine = null,
    abortSignal,
  } = params;
  let { requestUrl } = params;

  const facilityId = facility?.facility_id || null;
  let deliveryLineToUse = deliveryLine;

  MEDICATION_LOGGER.debug(
    "Starting medication dispense export to NPHIES" +
      JSON.stringify({
        startDate,
        endDate,
        patientId,
        episodeNo,
        requestUrl,
        status,
        deliveryLine,
        facilityName: facility?.name,
      }),
  );

  try {
    MEDICATION_LOGGER.debug(
      "Fetching medication dispense requests from database" +
        JSON.stringify({
          patientId,
          episodeNo,
          startDate,
          endDate,
          status,
          deliveryLine,
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
      requestUrl = `/api/v1/hl7/medication-dispense?facilityId=${facilityId || ""}&startDate=${publishDate || ""}`;
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

    const sqlFilePath = getRelativePath("queries/medicationDispense.sql");
    const { rows: medicationDispenseRequests } = await executeSqlFile(
      connection,
      sqlFilePath,
      {
        p_patient_id: patientId,
        p_episode_no: episodeNo,
        p_start_date: startDate,
        p_end_date: endDate,
        p_status: status,
        p_publish_date: publishDate,
        p_delivery_line: deliveryLine,
        p_pharmacy_category: PHARMACY_CATEGORY_WITH_COMMA,
      },
    );

    const preprocessEnd = process.hrtime.bigint();
    const preprocessTimeMs = Number(preprocessEnd - preprocessStart) / 1e6;

    if (
      !medicationDispenseRequests ||
      medicationDispenseRequests.length === 0
    ) {
      MEDICATION_LOGGER.debug(
        "No medication dispense requests found for the given criteria " +
          JSON.stringify({
            startDate,
            endDate,
            patientId,
            episodeNo,
            status,
            publishDate,
            facilityId,
            deliveryLine,
            PHARMACY_CATEGORY_WITH_COMMA
          }),
      );
    }

    MEDICATION_LOGGER.info(
      `Found ${medicationDispenseRequests.length} medication dispense request(s)`,
    );

    const exportedBundles = [];
    const failedRequests = [];

    const count = {
      failCount: 0,
      successCount: 0,
      errorCount: 0,
    };

    for (const request of medicationDispenseRequests) {
      if (abortSignal?.aborted) {
        MEDICATION_LOGGER.debug(
          `[medicationDispenseToNPHIES] Aborted by signal. Stopped before ${request.MASTER_NO}`,
        );
        break;
      }
      let api_trans_id = null;
      // TIMING: axios (response) time per record, defaults to 0
      let response_time_ms = 0;

      const recordStart = process.hrtime.bigint();

      try {
        MEDICATION_LOGGER.debug(
          `🔰💉Processing medication dispense request with Order No: ${request.MASTER_NO}, Order Line: ${request.ORDER_LINE}, Delivery Line: ${request.DELIVERY_LINE}`,
        );

        const {
          rows: [transaction],
        } = await query(
          `INSERT INTO api_transaction (
          trans_date,
          patient_id,episode_no, 
          api_provider , api_function , status , api_name ,  transaction_id , facility_id
      ) VALUES ( $9 , $1, $2, $3 ,$4 , $5, $6 , $7, $8 ) 
        returning *`,

          [
            request.PATIENT_ID || null,
            request.EPISODE_NO || null,
            "NPHIES_CS",
            "DISPENSE",
            "FAIL",
            "MEDICATION",
            request.DELIVERY_LINE || null,
            facilityId || null,

            request?.TRANS_DATE,
          ],
        );
        api_trans_id = transaction.api_trans_id;

        const data = await fetchDispenseMedicationData({
          connection,
          request,
          facilityId,
          params,
          apiTransId: api_trans_id,
          pharmacyCategory : PHARMACY_CATEGORY_WITH_COMMA
        });

        if (
          !data ||
          !data.MEDICATION_DISPENSE ||
          data.MEDICATION_DISPENSE.length === 0 ||
          data.MEDICATION_DISPENSE.length > 1
        ) {
          MEDICATION_LOGGER.error(
            `Invalid medication dispense data for Order No: ${request.MASTER_NO}. Expected exactly one medication dispense line, but found ${data?.MEDICATION_DISPENSE?.length || 0}`,
          );

          await insertApiMessage({
            apiTransId: api_trans_id,
            errorMessage: `Invalid medication dispense data for ,Order No : ${request.MASTER_NO || "''"}. Expected exactly one medication dispense line, but found ${data?.MEDICATION_DISPENSE?.length || 0}`,
            errorId: NPHIES_FAIL_ID.INVALID_MEDICATION_DISPENSE_DATA,
          });
        }

        deliveryLineToUse = data.DELIVERY_LINE || deliveryLine;

        data.ORGANIZATION_NAME = facility ? facility.name : "Unknown Facility";
        const NPHIES_CS_TEST_ORG_ID = await getConfValue({
          facilityId: facility.facility_id,
          key: "NPHIES_CS_TEST_ORG_ID",
        });

        data.NPHIES_CS_ORG_ID = facility.nphies_cs_org_id;
        data.NPHIES_CS_OID = await getConfValue({
          facilityId: facility.facility_id,
          key: "NPHIES_CS_OID",
        });

        if (!data.NPHIES_CS_OID) {
          MEDICATION_LOGGER.error(
            `NPHIES_CS_OID is not configured for facilityId: ${facility.facility_id}`,
          );
          await insertApiMessage({
            apiTransId: api_trans_id,
            errorMessage: `NPHIES_CS_OID is not configured for ,facilityId : ${facility.facility_id || "''"}`,
            errorId: NPHIES_FAIL_ID.NPHIES_CS_OID,
          });
        }

        if (NPHIES_CS_TEST_ORG_ID) {
          data.NPHIES_CS_ORG_ID = NPHIES_CS_TEST_ORG_ID;
          MEDICATION_LOGGER.debug(
            `NPHIES_CS_ORG_ID overridden by NPHIES_CS_TEST_ORG_ID: ${NPHIES_CS_TEST_ORG_ID}`,
          );
        }

        MEDICATION_LOGGER.debug(
          `facility info added to data: ${JSON.stringify({ ORGANIZATION_NAME: data.ORGANIZATION_NAME, NPHIES_CS_ORG_ID: data.NPHIES_CS_ORG_ID })}`,
        );

        MEDICATION_LOGGER.silly(`Building FHIR bundle`);
        const medicationTemplate = loadTemplate("dispense.json");

        const medicationDispenseTemplate = JSON.stringify(
          JSON.parse(medicationTemplate).entry.find(
            (entry) => entry.resource.resourceType === "MedicationDispense",
          ),
        );

        const parseTemplate = JSON.parse(medicationTemplate);
        parseTemplate.entry = parseTemplate.entry.filter(
          (entry) => entry.resource.resourceType !== "MedicationDispense",
        );
        const bundleTemplate = JSON.stringify(parseTemplate);

        const bundle = processTemplate({
          template: bundleTemplate,
          data,
        });
        let parsedBundle;

        try {
          parsedBundle = JSON.parse(bundle);
        } catch (error) {
          parsedBundle = JSON5.parse(bundle);
        }

        const focus = [];
        for (const line of data.MEDICATION_DISPENSE) {
          MEDICATION_LOGGER.debug(
            "Processing medication dispense for template replacement" +
              JSON.stringify({
                medicationDispenseId: line.MEDICATION_DISPENSE_ID,
              }),
          );

          focus.push({
            identifier: [
              {
                system: `${data.NPHIES_CS_OID}`,
                value: `${line.DELIVERY_LINE}`,
              },
            ],
          });

          const medicationDispenseBundle = processTemplate({
            template: medicationDispenseTemplate,
            data: {
              ...data,
              MEDICATION_DISPENSE: line,
            },
          });
          let parsedMedicationDispense;
          try {
            parsedMedicationDispense = JSON5.parse(medicationDispenseBundle);
          } catch (json5Error) {
            MEDICATION_LOGGER.error(
              `fail to parse medication dispense bundle using JSON5 for medication dispense ${line.MEDICATION_DISPENSE_ID}: ${json5Error.message}`,
            );
            await insertApiMessage({
              apiTransId: api_trans_id,
              errorMessage: `fail to parse medication dispense bundle for ,medication dispense : ${line.MEDICATION_DISPENSE_ID || "''"} : ${json5Error.message}`,
              errorId: NPHIES_FAIL_ID.JSON5_PARSE_ERROR,
            });
            continue;
          }

          parsedMedicationDispense.resource.dosageInstruction.forEach(
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

              if (!dosage?.asNeededBoolean) {
                delete dosage?.asNeededBoolean;
              }
            },
          );

          parsedBundle.entry.push(parsedMedicationDispense);
        }

        const patientResource = parsedBundle.entry.find(
          (entry) => entry.resource.resourceType === "Patient",
        );
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
          key: "NPHIES_CS_MEDICATION_DISPENSE_URL",
          facilityId: facility?.facility_id || null,
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
          bundle_id = $14
      where api_trans_id = $12`,

          [
            request.PATIENT_ID || null,
            request.EPISODE_NO || null,
            "NPHIES_CS",
            data?.MEDICATION_DISPENSE?.[0]?.CATEGORY_DISPLAY?.toUpperCase() ==
            "CONTROLLED"
              ? "DISPENSE_C"
              : "DISPENSE",

            "FAIL",
            "MEDICATION",
            JSON.stringify(parsedBundle),
            requestUrl,
            nphiesUrl,
            request.DELIVERY_LINE || null,
            data.MEDICATION_DISPENSE.length || 0,

            api_trans_id,
            Math.trunc(preprocessTimeMs || 0),
            data.BUNDLE_ID,
          ],
        );

        MEDICATION_LOGGER.debug(
          `Inserted transaction record with ID ${api_trans_id} for dispense request ${request.MASTER_NO}`,
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
            `UPDATE delivery_lines dl
   SET dl.nphies_cs_sent = CASE 
     ${data.MEDICATION_DISPENSE.map(
       (r, index) =>
         `WHEN dl.delivery_line = :delivery_line_${index} THEN 
         (SELECT CASE 
            WHEN ol.status = 'C' THEN 'CF' 
            ELSE 'F' 
          END
          FROM order_lines ol
          WHERE ol.order_line = dl.order_line)`,
     ).join(" ")}
   END 
   WHERE dl.delivery_line IN (${data.MEDICATION_DISPENSE.map((r, index) => `:delivery_line_${index}`).join(", ")})`,
            data.MEDICATION_DISPENSE.reduce((acc, r, index) => {
              acc[`delivery_line_${index}`] = r.DELIVERY_LINE;
              return acc;
            }, {}),
          );
          await connection.commit();

          MEDICATION_LOGGER.debug(
            `Updated delivery lines status for transaction ID ${api_trans_id} by using delivery lines: ${data.MEDICATION_DISPENSE.map((l) => l.DELIVERY_LINE).join(", ")}`,
          );

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
            `Sending request ${request.MASTER_NO} to NPHIES API at ${nphiesUrl}`,
          );
          if (!nphiesUrl) {
            MEDICATION_LOGGER.error(
              "NPHIES_CS_MEDICATION_DISPENSE_URL is not configured",
            );
            throw new Error(
              "NPHIES_CS_MEDICATION_DISPENSE_URL is not configured",
            );
          }
          apiStartTime = process.hrtime.bigint();
          const isHttps = nphiesUrl && nphiesUrl.startsWith("https://");
          let agent = null;
          if (isHttps) {
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
                `Using HTTPS with certificate for URL: ${nphiesUrl}`,
              );
            } catch (error) {
              MEDICATION_LOGGER.warn(
                `Certificate not found, using self-signed certificate acceptance for HTTPS: ${error.message}`,
              );
              agent = new https.Agent({ rejectUnauthorized: false });
            }
          } else {
            agent = new https.Agent({ rejectUnauthorized: false });
            MEDICATION_LOGGER.debug(
              `Using HTTP (no certificate) for URL: ${nphiesUrl}`,
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
            `UPDATE delivery_lines dl
   SET dl.nphies_cs_sent = CASE 
     ${data.MEDICATION_DISPENSE.map(
       (r, index) =>
         `WHEN dl.delivery_line = :delivery_line_${index} THEN 
         (SELECT CASE 
            WHEN ol.status = 'C' THEN 'CS' 
            ELSE 'S' 
          END
          FROM order_lines ol
          WHERE ol.order_line = dl.order_line)`,
     ).join(" ")}
   END 
   WHERE dl.delivery_line IN (${data.MEDICATION_DISPENSE.map((r, index) => `:delivery_line_${index}`).join(", ")})`,
            data.MEDICATION_DISPENSE.reduce((acc, r, index) => {
              acc[`delivery_line_${index}`] = r.DELIVERY_LINE;
              return acc;
            }, {}),
          );
          await connection.commit();

          exportedBundles.push({
            deliveryLine: deliveryLineToUse,
            bundle: parsedBundle,
            nphiesResponse: nphiesResponse,
            api_trans_id,
          });
          count.successCount++;
        } catch (apiError) {
          failedRequests.push({
            deliveryLine: deliveryLineToUse,
            bundle: parsedBundle,
            message: apiError?.message || "",
            api_trans_id,
          });

          apiEndTime = process.hrtime.bigint();
          response_time_ms = Number(apiEndTime - apiStartTime) / 1e6;

          if (apiError.response) {
            count.errorCount++;

            await connection.execute(
              `UPDATE delivery_lines dl
   SET dl.nphies_cs_sent = CASE 
     ${data.MEDICATION_DISPENSE.map(
       (r, index) =>
         `WHEN dl.delivery_line = :delivery_line_${index} THEN 
         (SELECT CASE 
            WHEN ol.status = 'C' THEN 'CE' 
            ELSE 'E' 
          END
          FROM order_lines ol
          WHERE ol.order_line = dl.order_line)`,
     ).join(" ")}
   END 
   WHERE dl.delivery_line IN (${data.MEDICATION_DISPENSE.map((r, index) => `:delivery_line_${index}`).join(", ")})`,
              data.MEDICATION_DISPENSE.reduce((acc, r, index) => {
                acc[`delivery_line_${index}`] = r.DELIVERY_LINE;
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
              `UPDATE api_transaction SET response = $2, status = $3,res_identifier = $4 WHERE api_trans_id = $1`,
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
                `Extracted and stored ${issueCount} issue(s) from NPHIES API response for request ${request.MASTER_NO}`,
              );
            } else {
              MEDICATION_LOGGER.error(
                `Error sending request ${request.MASTER_NO} to NPHIES API: ` +
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
              `UPDATE delivery_lines dl
   SET dl.nphies_cs_sent = CASE 
     ${data.MEDICATION_DISPENSE.map(
       (r, index) =>
         `WHEN dl.delivery_line = :delivery_line_${index} THEN 
         (SELECT CASE 
            WHEN ol.status = 'C' THEN 'CF' 
            ELSE 'F' 
          END
          FROM order_lines ol
          WHERE ol.order_line = dl.order_line)`,
     ).join(" ")}
   END 
   WHERE dl.delivery_line IN (${data.MEDICATION_DISPENSE.map((r, index) => `:delivery_line_${index}`).join(", ")})`,
              data.MEDICATION_DISPENSE.reduce((acc, r, index) => {
                acc[`delivery_line_${index}`] = r.DELIVERY_LINE;
                return acc;
              }, {}),
            );
            await connection.commit();
            MEDICATION_LOGGER.error(
              `Error sending request ${request.MASTER_NO} to NPHIES API: ` +
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
          `🔚☑️Successfully processed prescription Order No: ${request.MASTER_NO}` +
            JSON.stringify({
              bundleId: parsedBundle.id,
              entryCount: parsedBundle.entry?.length || 0,
            }),
        );
      } catch (error) {
        if (isOracleConnectionOrPoolError(error)) {
          MEDICATION_LOGGER.error(
            `Fatal Oracle connection error during dispense processing: ${error.message}. Aborting batch so connection and pool can be refreshed cleanly.`,
          );
          throw error;
        }
        count.failCount++;
        MEDICATION_LOGGER.error(
          `🔚❌Error details while processing prescription Order No: ${request.MASTER_NO}: ` +
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
          elapsed_time_ms - response_time_ms,
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

    return {
      // message: medicationDispenseRequests.length == 0 ? `No medication dispense requests found for the given criteria.` :`successfully processed ${exportedBundles.length} dispense request(s) and fail ${failedRequests.length} request(s)`,
      message: `Total Transactions: : ${medicationDispenseRequests.length} - FAIL:${count?.failCount},  SUCCESS:${count?.successCount} , ERROR:${count?.errorCount}.`,
      exportedCount: exportedBundles.length,
      failedCount: failedRequests.length,
      exportedBundles: exportedBundles,
      failedRequests: failedRequests,
      count: count,
    };
  } catch (error) {
    MEDICATION_LOGGER.error(
      "Error in exportDispenseToNPHIES" +
        JSON.stringify({
          error: error.message,
          // stack: error.stack,
          // patientId,
          // episodeNo,
        }),
    );
    throw error;
  }
};
