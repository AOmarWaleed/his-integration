import fs from "fs";
import path from "path";
import { clientLogger, MEDICATION_LOGGER } from "../../config/logger.js";
import { processTemplate } from "../../lib/processTemplate.js";
import { loadTemplate } from "../../util/loadTemplates.js";
import { query } from "../../config/pgDB.js";
import { getConfValue } from "../../util/loadConf.js";
import { fetchPatientById } from "../../util/fetchPatient.js";
import { fetchPhysician } from "../../util/fetchPhysician.js";

import { generateUUID } from "../../util/generateUUID.js";
import { parseAndInsertXmlErrors } from "../../util/parseXmlErrors.js";

import crypto from "crypto";
import axios from "axios";
import https from "https";
import dayjs from "dayjs";
import e from "cors";

import {
  executeSqlFile,
  getRelativePath,
} from "../../util/runQueryFromFile.js";
import { runWithConcurrency } from "../../util/runWithConcurrency.js";
import {
  getOracleConnection,
  getFacilityPoolSettings,
  isOracleConnectionOrPoolError,
} from "../../config/oracle-dynamic.js";

import {
  removeElement,
  removeElementByAttributes,
  updateElementAttributes,
} from "../../util/xmlTemplateString.js";

import {
  generateRadiologyOrderEnvelopeSpecialSection,
  generateRadiologyOrderCdaSpecialSection,
} from "../../lib/buildRadiologyOrderSections.js";
import {
  generateRadiologyResultCdaSpecialSection,
  generateRadiologyResultEnvelopeSpecialSection,
} from "../../lib/buildRadiologyResultSections.js";
import {
  generateLabOrderCdaSpecialSection,
  generateLabOrderEnvelopeSpecialSection,
} from "../../lib/buildLabOrder.js";
import {
  generateLabResultCdaSpecialSection,
  generateLabResultEnvelopeSpecialSection,
} from "../../lib/buildLabRes.js";
import {
  generateClinicalNotesCdaSpecialSection,
  generateClinicalNotesEnvelopeSpecialSection,
} from "../../lib/buildClinicalNotes.js";

// ============================================================
// NEW IMPORTS FOR DISCHARGE SUMMARY
// ============================================================

import { fetchPractitioner } from "../../util/fetchPractitioner.js";
import { getExtCode } from "../../util/getExtCode.js";
import { insertApiMessage } from "../../util/insertApiMsgs.js";
import { fileURLToPath } from "url";
import { NPHIES_FAIL_ID } from "../../util/constant.js";
import { STATUS } from "../../enums/job.enum.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const setId = "11856";
const nextOrderLine = "11857";

const DEFAULT_HEALTH_CARE_ID = "CE9D7C6B-62F9-E811-B80F-005056AD2FD8";
const DOC_VERSION = "1";
const DOCUMENT_STATUS_DISPLAY = {
  registered: "Registered",
  preliminary: "Preliminary",
  final: "Final",
  amended: "Amended",
  corrected: "Corrected",
  cancelled: "Cancelled",
  "entered-in-error": "Entered in Error",
  unknown: "Unknown",
};

/** * Handler for processing a single doc order and sending to NPHIES
 *
 * ⚠️ CONNECTION MANAGEMENT: This function receives a connection as a parameter.
 * The CALLER is responsible for closing the connection in a finally block:
 *
 * USAGE PATTERN:
 * let connection;
 * try {
 *   connection = await getOracleConnection(settings);
 *   const results = await handleDocOrderRequest({
 *     params: {...},
 *     facility: {...},
 *     connection
 *   });
 * } finally {
 *   if (connection) {
 *     try {
 *       await connection.close();
 *     } catch (err) {
 *       logger.error("Connection close error:", err);
 *     }
 *   }
 * }
 *
 * Steps:
 * 1. Fetch patient and physician data
 * 2. Map HIS order status and other fields to NPHIES codes
 * 3. Process CDA template with data and generate final CDA XML
 * 4. Compute CDA metadata (size, hash) and generate UUIDs for envelope
 * 5. Process SOAP envelope template with CDA and metadata
 * 6. Send SOAP envelope to NPHIES and handle response
 * @param {Object} params - Parameters for processing the doc order
 * @param {string} params.patientId - Patient ID for fetching master order data
 * @param {string} params.episodeNo - Episode number for fetching master order data
 * @param {string} params.startDate - Start date for fetching master order data
 * @param {string} params.endDate - End date for fetching master order data
 * @param {string} params.isCancel - Flag indicating if the order is a cancellation
 * @param {Object} connection - OracleDB connection (MUST be closed by caller)
 * @param {Object} facility - Facility information for organization details
 * @param {string} requestUrl - The original request URL for logging purposes
 * @return {{exportedCount: number, failedCount: number, exportedBundles: Array, failedRequests: Array}}
 * @property {number} exportedCount - Number of successfully exported bundles
 * @property {number} failedCount - Number of failed requests
 * @property {Array} exportedBundles - Array of successfully exported bundles
 * @property {Array} failedRequests - Array of failed requests
 * @example
 * const result = await handleDocOrderRequest({ params, facility, connection, requestUrl });
 * console.log(result.exportedCount, result.failedCount);
 * console.log(result.exportedBundles, result.failedRequests);
 * console.log(result);
 * console.log(result.exportedBundles.length, result.failedRequests.length);
 * console.log(result.exportedCount, result.failedCount);
 * console.log(result.exportedBundles.map(b => b.masterOrderNo));
 * console.log(result.failedRequests.map(r => r.masterOrderNo));
 */
export async function handleDocOrderRequest({
  params,
  facility,
  connection,
  requestUrl,
  abortSignal,
}) {
  let DOC = {};
  let UniqueData = {};
  const facilityId = facility?.facility_id || null;
  DOC.isCancel = params.isCancel == "1";

  switch (params.docType) {
    case "lab-order":
      DOC.PREFIX = "LO";
      DOC.SET_ID = ".1";
      DOC.ORDER_ID = ".2";

      DOC.p_publish_date = await getConfValue({
        key: "NPHIES_CS_LABORATORY_ORDER_START_SEND",
        facilityId: facilityId,
      });
      DOC.HEALTH_DISPLAY_NAME = "Laboratory - Microbiology";
      DOC.queryFile = "labOrder";
      DOC.nphiesUrl = `NPHIES_CS_LAB_ORDER_URL`;
      DOC.physicianSpecialty = `Obstetrics and Gynecology`;
      DOC.docTitle = `Laboratory Order`;
      DOC.attName = "xmlns:lab";
      DOC.attValue = "urn:oid:1.3.6.1.4.1.19376.1.3.2";
      DOC.templateID = "105.1";
      DOC.HEADER_TEMPLATE_ID = `
      	<templateId root="2.16.840.1.113883.3.3731.1.${"105.1"}" />
	<templateId root="1.3.6.1.4.1.19376.1.3.3"/>
      
      `;

      DOC.code = "57832-8";
      DOC.codeDisplay = "Prescription for diagnostic or specialist care";
      DOC.formatCode = `urn:ksa-ehealth:lab:order:2013`;
      DOC.formatCodeSchema = `2.16.840.1.113883.3.3731.1.203.14`;
      DOC.physicianSpecialtyCode = `${DEFAULT_HEALTH_CARE_ID}`;

      DOC.HEALTHCARE_FACILITY_TYPE_CODE = "AP5";
      DOC.HEALTHCARE_FACILITY_TYPE_DISPLAY = "Primary Healthcare";
      DOC.PRACTICE_SETTING_CODE = "MJ1";
      DOC.PRACTICE_SETTING_DISPLAY = "MJ1";

      DOC.generateEnvelopeSpecialSectionFn =
        generateLabOrderEnvelopeSpecialSection;
      DOC.generateCdaSpecialSectionFn = generateLabOrderCdaSpecialSection;
      DOC.apiName = "LAB";
      DOC.apiFunction = "ORDER";
      DOC.class_code = "ORDER";
      UniqueData.FUNCTION_CODE_SYSTEM = "6.96";
      UniqueData.FUNCTION_CODE_NAME = "SNOMED CT";
      DOC.REFERENCE_ID_LIST_2_URN = "ihe:iti:xds:2013:order";
      DOC.ORDERING_PROVIDER_PARTICIPANT_TEMPLATE_ID_2 =
        '<templateId root="1.3.6.1.4.1.19376.1.3.3.1.6" />';
      DOC.table_to_update = "lab_test";
      DOC.column_to_update = "int_sent";
            DOC.column_to_filter = "order_line";


      break;

    case "lab-report":
      DOC.PREFIX = "LR";
      DOC.SET_ID = ".3";
      DOC.ORDER_ID = ".4";
      DOC.SUFFIX_ORDER = ".1";

      DOC.p_publish_date = await getConfValue({
        key: "NPHIES_CS_LABORATORY_REPORT_START_SEND",
        facilityId: facilityId,
      });
      DOC.HEALTH_DISPLAY_NAME = "Laboratory - Microbiology";
      DOC.queryFile = "labReport";
      DOC.nphiesUrl = `NPHIES_CS_LAB_RESULT_URL`;
      DOC.physicianSpecialty = `Obstetrics and Gynecology`;
      DOC.docTitle = `Laboratory Report`;
      DOC.attName = "xmlns:lab";
      DOC.attValue = "urn:oid:1.3.6.1.4.1.19376.1.3.2";
      DOC.templateID = "105.33";
      DOC.HEADER_TEMPLATE_ID = `
      	<templateId root="2.16.840.1.113883.3.3731.1.${"105.33"}" />
	<templateId root="1.3.6.1.4.1.19376.1.3.3"/>
      
      `;

      DOC.code = "11502-2";
      DOC.codeDisplay = "LABORATORY REPORT.TOTAL";
      DOC.formatCode = `urn:ihe:lab:xd-lab:2008`;
      DOC.formatCodeSchema = `1.3.6.1.4.1.19376.1.2.3`;
      DOC.physicianSpecialtyCode = `${DEFAULT_HEALTH_CARE_ID}`;

      DOC.HEALTHCARE_FACILITY_TYPE_CODE = "AP5";
      DOC.HEALTHCARE_FACILITY_TYPE_DISPLAY = "Primary Healthcare";
      DOC.PRACTICE_SETTING_CODE = "MJ1";
      DOC.PRACTICE_SETTING_DISPLAY = "MJ1";

      UniqueData.LEGAL_AUTH = true;
      UniqueData.FUNCTION_CODE_SYSTEM = "3.3731.1.202.1";
      UniqueData.FUNCTION_CODE_NAME = "KSA Individual Provider Type";

      DOC.apiName = "LAB";
      DOC.apiFunction = "RESULT";
      DOC.class_code = "RESULT";
      DOC.placer_order_template_id = "105.5";
      DOC.generateEnvelopeSpecialSectionFn =
        generateLabResultEnvelopeSpecialSection;
      DOC.generateCdaSpecialSectionFn = generateLabResultCdaSpecialSection;
      DOC.REFERENCE_ID_LIST_2_URN = "ihe:iti:xds:2013:order";
      DOC.ORDERING_PROVIDER_PARTICIPANT_TEMPLATE_ID_2 =
        '<templateId root="1.3.6.1.4.1.19376.1.3.3.1.6" />';

      DOC.table_to_update = "lab_test";
      DOC.column_to_update = "int_sent";
            DOC.column_to_filter = "order_line";

      break;

    case "radiology-order":
      DOC.PREFIX = "RO";
      DOC.SET_ID = ".4";
      DOC.ORDER_ID = ".5";

      DOC.p_publish_date = await getConfValue({
        key: "NPHIES_CS_RADIOLOGY_ORDER_START_SEND",
        facilityId: facilityId,
      });

      DOC.HEALTH_DISPLAY_NAME = "Obstetrics and Gynecology";
      DOC.queryFile = "radiologyOrder";
      DOC.nphiesUrl = `NPHIES_CS_RADIOLOGY_ORDER_URL`;
      DOC.physicianSpecialty = `Radiology`;
      DOC.docTitle = `Radiology Order`;
      DOC.attName = "xmlns:ps3-20";
      DOC.attValue = "urn:dicom-org:ps3-20";
      DOC.templateID = "204.32";
      DOC.HEADER_TEMPLATE_ID = `
      	<templateId root="2.16.840.1.113883.3.3731.1.${"204.32"}" />

      
      `;

      DOC.code = "57832-8";
      DOC.codeDisplay = "Prescription for diagnostic or specialist care";
      DOC.formatCode = `urn:ksa-ehealth:radio:order:2013`;
      DOC.formatCodeSchema = `1.3.6.1.4.1.19376.1.2.3`;
      DOC.physicianSpecialtyCode = `179D7C6B-62F9-E811-B80F-005056AD2FD8`;
      DOC.HEALTHCARE_FACILITY_TYPE_CODE = "AP5";
      DOC.HEALTHCARE_FACILITY_TYPE_DISPLAY = "Primary Healthcare";
      DOC.PRACTICE_SETTING_CODE = "MJ1";
      DOC.PRACTICE_SETTING_DISPLAY = "MJ1";
      DOC.referenceDocType = ".1.2.3&amp;ISO^urn:ihe:iti:xds:2013:order";
      DOC.apiName = "RADIOLOGY";
      DOC.apiFunction = "ORDER";
      DOC.class_code = "ORDER";
      DOC.generateEnvelopeSpecialSectionFn =
        generateRadiologyOrderEnvelopeSpecialSection;
      DOC.generateCdaSpecialSectionFn = generateRadiologyOrderCdaSpecialSection;
      UniqueData.FUNCTION_CODE_SYSTEM = "6.96";
      UniqueData.FUNCTION_CODE_NAME = "SNOMED CT";
      DOC.REFERENCE_ID_LIST_2_URN = "ihe:iti:xds:2013:order";
      DOC.SERVICE_EVENT_ROOT_POSTFIX = ".1.2.3";
      DOC.ORDERING_PROVIDER_PARTICIPANT_TEMPLATE_ID_2 =
        '<templateId root="1.3.6.1.4.1.19376.1.3.3.1.6" />';

      DOC.table_to_update = "order_lines";
      DOC.column_to_update = "nphies_cs_sent";
      DOC.column_to_filter = "order_line";
      break;

    case "radiology-report":
      DOC.PREFIX = "RR";
      DOC.SET_ID = ".7";
      DOC.ORDER_ID = ".8";
      DOC.SUFFIX_ORDER = ".5";

      DOC.p_publish_date = await getConfValue({
        key: "NPHIES_CS_RADIOLOGY_REPORT_START_SEND",
        facilityId: facilityId,
      });

      DOC.HEALTH_DISPLAY_NAME = "Diagnostic Radiology";
      DOC.queryFile = "radiologyReport";
      DOC.nphiesUrl = `NPHIES_CS_RADIOLOGY_RESULT_URL`;
      DOC.physicianSpecialty = `Radiology`;
      DOC.docTitle = `Radiology Result`;
      DOC.attName = "xmlns:ps3-20";
      DOC.attValue = "urn:dicom-org:ps3-20";
      DOC.templateID = "204.21";
      DOC.HEADER_TEMPLATE_ID = `
      	<templateId root="2.16.840.1.113883.3.3731.1.${"204.21"}" />  
        `;

      DOC.code = "43468-8";
      DOC.codeDisplay = "X-Ray Report";
      DOC.referenceDocType = ".1&amp;ISO^urn:ihe:iti:xds:2013:accession";
      DOC.formatCode = `urn:ksa-ehealth:rad:basic-structured:2013`;
      DOC.formatCodeSchema = `2.16.840.1.113883.3.3731.1.203.14`;
      DOC.physicianSpecialtyCode = `${DEFAULT_HEALTH_CARE_ID}`;
      DOC.HEALTHCARE_FACILITY_TYPE_CODE = "AM1";
      DOC.HEALTHCARE_FACILITY_TYPE_DISPLAY = "X Ray";
      DOC.PRACTICE_SETTING_CODE = "MK1";
      DOC.PRACTICE_SETTING_DISPLAY = "Body Imaging Department";
      DOC.placer_order_template_id = "204.23";
      DOC.apiName = "RADIOLOGY";
      DOC.apiFunction = "RESULT";
      DOC.class_code = "RESULT";
      DOC.generateEnvelopeSpecialSectionFn =
        generateRadiologyResultEnvelopeSpecialSection;
      DOC.generateCdaSpecialSectionFn =
        generateRadiologyResultCdaSpecialSection;
      UniqueData.FUNCTION_CODE_SYSTEM = "3.3731.1.202.1";
      UniqueData.FUNCTION_CODE_NAME = "KSA Individual Provider Type";
      UniqueData.LEGAL_AUTH = true;
      DOC.REFERENCE_ID_LIST_2_URN = "ihe:iti:xds:2013:accession";
      DOC.table_to_update = "xy_reports";
      DOC.column_to_update = "nphies_cs_sent";
      DOC.column_to_filter = 'report_id'
      break;

    case "clinical-notes":
      DOC.PREFIX = "CN";
      DOC.SET_ID = ".9";
      DOC.ORDER_ID = ".10";

      DOC.p_publish_date = await getConfValue({
        key: "NPHIES_CS_CLINICAL_NOTES_START_SEND",
        facilityId: facilityId,
      });
      DOC.queryFile = "clinicalDoc";
      DOC.nphiesUrl = `NPHIES_CS_CLINICAL_NOTES_URL`;

      DOC.apiName = "CLINICAL NOTES";
      DOC.generateEnvelopeSpecialSectionFn =
        generateClinicalNotesEnvelopeSpecialSection;
      DOC.generateCdaSpecialSectionFn = generateClinicalNotesCdaSpecialSection;

      DOC.table_to_update = "documents";
      DOC.column_to_update = "nphies_cs_sent";
      DOC.column_to_filter = "document_id";

      break;

    default:
      break;
  }

  if (!DOC.p_publish_date) {
    MEDICATION_LOGGER.error(
      `❌❌❌ NPHIES CS publish date not configured for docType=${params.docType} facilityId=${facilityId}`,
    );
    throw new Error(
      `NPHIES CS publish date not configured for docType=${params.docType} facilityId=${facilityId}`,
    );
  }

  if (!requestUrl) {
    requestUrl = `/api/v1/hl7/doc?facilityId=${facilityId || ""}&docType=${
      params.docType || ""
    }&startDate=${DOC.p_publish_date || ""}`;
  }

  const masterSqlPath = getRelativePath(`queries/${DOC.queryFile}.sql`);

  // TIMING: preprocess starts here — fetching master rows from Oracle
  const preprocessStart = process.hrtime.bigint();

  const NPHIES_CS_TEST_ORG_ID = await getConfValue({
    facilityId: facilityId,
    key: "NPHIES_CS_TEST_ORG_ID",
  });
  if (NPHIES_CS_TEST_ORG_ID) {
    facility.NPHIES_CS_ORG_ID = NPHIES_CS_TEST_ORG_ID;
    facility.nphies_cs_org_id = NPHIES_CS_TEST_ORG_ID;

    clientLogger.debug(
      `handleDocOrderRequest - ID number overridden by NPHIES_CS_TEST_ORG_ID: ${NPHIES_CS_TEST_ORG_ID}`,
    );
  }

  const FULL_ORG_ID = await getConfValue({
    facilityId: facilityId,
    key: "NPHIES_CS_OID",
  });
  const NPHIES_CS_ROW_LIMIT =
    (await getConfValue({
      key: "NPHIES_CS_ROW_LIMIT",
      facilityId,
    })) || 100;

  DOC.FULL_ORG_ID = FULL_ORG_ID;

  if (DOC.isCancel) {
    DOC.RELATED_DOCUMENT = `
    <relatedDocument typeCode="RPLC">
    <parentDocument>
        <id root="2.16.840.1.113883.3.3731.1.2.2.100.1.1.${facility.NPHIES_CS_ORG_ID}.100.1" 
            extension="${setId}" /> 
            <!-- old document ID -->
    </parentDocument>
</relatedDocument>
    `;
  }

  if (params.startDate) {
    clientLogger.debug(
      `Overriding publish date with startDate: ${params.startDate}, with formate DD-MM-YYYY using dayjs library`,
    );
    DOC.p_publish_date = params.startDate;
    params.startDate = dayjs(
      params.startDate,
      "DD-MM-YYYY",
      "YYYY-MM-DD",
    ).format("YYYY-MM-DDTHH:mm:ss");
  }
  if (params.endDate) {
    params.endDate = dayjs(params.endDate, "DD-MM-YYYY", "YYYY-MM-DD").format(
      "YYYY-MM-DDTHH:mm:ss",
    );
  }

  const sqlParams = {
    p_patient_id: params.patientId || null,
    p_episode_no: params.episodeNo || null,
    p_start_date: params.startDate || null,
    p_end_date: params.endDate || null,
    p_publish_date: DOC.p_publish_date || undefined,
    p_status: params.status || null,

    ...([
      "lab-order",
      "lab-report",
      "radiology-order",
      "radiology-report",
    ].includes(params.docType)
      ? {
          p_order_line: params.orderLine || null,
        }
      : {}),

    ...(params.docType == "clinical-notes"
      ? {
          p_document_id: params.documentId || null,
          rownum_max: NPHIES_CS_ROW_LIMIT,
        }
      : {}),
  };

  clientLogger.verbose("Executing SQL file:", masterSqlPath);
  clientLogger.verbose("Executing SQL params:", sqlParams);

  const { rows: masterRows } = await executeSqlFile(
    connection,
    masterSqlPath,
    sqlParams,
  );

  clientLogger.verbose(
    `Fetched ${masterRows.length} master rows for docType=${
      params.docType
    } patientId=${params.patientId || ""} episodeNo=${
      params.episodeNo || ""
    } startDate=${params.startDate || ""} endDate=${
      params.endDate || ""
    } facilityId=${facilityId || ""} publish_date=${
      DOC.p_publish_date || ""
    } and  params.orderLine ${params.orderLine}`,
  );

  const preprocessEnd = process.hrtime.bigint();
  const preprocessTimeMs = Number(preprocessEnd - preprocessStart) / 1e6;

  if (!masterRows || masterRows.length === 0) {
    clientLogger.verbose(`No ${params.docType} master data found`);
  } else {
    clientLogger.verbose(
      `Fetched ${masterRows.length} doc order master rows in ${(
        preprocessTimeMs / 1000
      ).toFixed(3)}s for patientId=${params.patientId || ""} episodeNo=${
        params.episodeNo || ""
      } startDate=${params.startDate || ""} endDate=${
        params.endDate || ""
      } facilityId=${facilityId || ""} publish_date=${DOC.p_publish_date || ""}`,
    );
  }

  const failedRequests = [];
  const exportedBundles = [];

  const count = {
    failCount: 0,
    successCount: 0,
    errorCount: 0,
  };

  if (masterRows.length) {
    await runWithConcurrency({
      items: masterRows,
      maxConcurrency: 2,
      abortSignal,
      // A dead Oracle connection means the rest of this batch would only produce
      // misleading validation errors (missing health ID / LOINC mappings).
      // Stop the batch and let withOracleConnection() retry with a fresh pool.
      isFatalError: isOracleConnectionOrPoolError,
      worker: async (masterRow, index) => {
        let workerConnection = null;
        let dropOnClose = false;
        try {
          clientLogger.info(
            `Send To Nphies for index=${index} Document ID =${masterRow.ORDER_LINE}`,
          );

          const recordStart = process.hrtime.bigint();

          // Give each concurrent worker its own connection. Sharing one
          // connection across workers interleaves commits and means a single
          // connection problem kills every in-flight row at once.
          workerConnection = await getOracleConnection(
            getFacilityPoolSettings(facility, abortSignal),
            45000,
            { abortSignal },
          );

          const res = await prepareSingleDocSendToNphies({
            masterOrder: masterRow,
            connection: workerConnection,
            facility,
            DOC: { ...DOC },
            UniqueData: { ...UniqueData },
            requestUrl,
            recordStart,
            preprocessTimeMs,
          });

          switch (res.status) {
            case STATUS.ERROR:
              count.errorCount++;
              break;
            case STATUS.SUCCESS:
              count.successCount++;
              break;
            case STATUS.FAIL:
              count.failCount++;
              break;

            default:
              break;
          }

          if (!res.success) {
            failedRequests.push({
              masterOrderNo: masterRow.ORDER_LINE,
              message: res.message,
              api_trans_id: res.api_trans_id,
            });
          } else {
            exportedBundles.push({
              masterOrderNo: masterRow.ORDER_LINE,
              api_trans_id: res.api_trans_id,
            });
          }
          return res;
        } catch (err) {
          if (isOracleConnectionOrPoolError(err)) {
            dropOnClose = true;
          }
          clientLogger.error(
            `😩😩 Send To Nphies fail for index=${index} Document ID =${masterRow.ORDER_LINE} : ⛔ ${err.message}`,
            err,
          );
          throw err;
        } finally {
          if (workerConnection) {
            try {
              if (dropOnClose) {
                await workerConnection.close({ drop: true });
              } else {
                await workerConnection.close();
              }
            } catch (closeErr) {
              clientLogger.warn(
                `Error closing Oracle connection for index=${index} Document ID =${masterRow.ORDER_LINE}: ${closeErr.message}`,
              );
            }
          }
        }
      },
    });
  }

  return {
    // message:
    // masterRows?.length == 0
    //   ? `No ${params.docType} master data found`
    //   : `Exported ${exportedBundles.length} bundles, Failed ${failedRequests.length} requests`,
    message: `Total Transactions: : ${masterRows?.length} - FAIL:${count?.failCount},  SUCCESS:${count?.successCount} , ERROR:${count?.errorCount}.`,
    exportedCount: exportedBundles.length,
    failedCount: failedRequests.length,
    exportedBundles,
    failedRequests,
    count: count,
  };
}

/**
 *
 * Prepares and sends a single document to NPHIES.
 * This function takes in the necessary data for a single document, constructs the appropriate request, and sends it to the NPHIES system. It handles the preparation of the SOAP envelope, manages API transaction IDs, and logs the process.
 * @param {Object} param0 - The parameters for sending a single document to NPHIES.
 * @param {Object} param0.masterOrder - The master order data for the document.
 * @param {Object} param0.connection - The database connection object.
 * @param {Object} param0.facility - The facility information.
 * @param {Object} param0.DOC - The document data.
 * @param {Object} param0.UniqueData - Unique data required for the document.
 * @param {string} param0.requestUrl - The URL of the request.
 * @returns {{api_trans_id: string|null, success: boolean, message: string, masterOrderNo: string|null,status : string}} The result of the document send operation.
 */
async function prepareSingleDocSendToNphies({
  masterOrder,
  connection,
  facility,
  DOC,
  UniqueData,
  requestUrl,
  recordStart,
  preprocessTimeMs,
}) {
  let apiTransId = null;
  masterOrder.transactionId = null;

  let queryResults = null;
  let nphiesRepositoryUrl = null;
  let facilityId = facility?.facility_id || null;
  let soapEnvelope = null;
  const CURRENT_DATE_TIME =
    dayjs(new Date()).format("YYYYMMDDHHmmss") + "+0300";
  const unknown = "UNK";
  let nphiesResponse = null;
  let startAxios = null;

  let preprocessEnd = null;
  let recordPreprocessMs = preprocessTimeMs || 0;

  // TIMING: response time per record, defaults to 0
  let response_time_ms = 0;

  try {
    switch (masterOrder.CLINICAL_NOTE_TITLE) {
      case "Discharge Summary":
        DOC.PREFIX = "DS";

        DOC.HEALTH_DISPLAY_NAME = "Obstetrics and Gynecology";
        DOC.HEADER_TEMPLATE_ID = `
      	<templateId root="2.16.840.1.113883.3.3731.1.210.2"/>
  `;
        DOC.physicianSpecialty = `NA`;
        DOC.docTitle = `Discharge Summary`;
        DOC.attName = "NA";
        DOC.attValue = "NA";
        DOC.templateID = "210.2";
        DOC.code = "18842-5";
        DOC.codeDisplay = "Discharge Summary";
        DOC.formatCode = `urn:ihe:pcc:xds-ms:2007`;
        DOC.formatCodeSchema = `1.3.6.1.4.1.19376.1.2.3`;
        DOC.physicianSpecialtyCode = `${DEFAULT_HEALTH_CARE_ID}`;
        DOC.PHARM_NAMESPACE = `urn:hl7-org:pharm`;

        DOC.HEALTHCARE_FACILITY_TYPE_CODE = "AP5";
        DOC.HEALTHCARE_FACILITY_TYPE_DISPLAY = "Primary Healthcare";
        DOC.PRACTICE_SETTING_CODE = "MJ1";
        DOC.PRACTICE_SETTING_DISPLAY = "MJ1";

        UniqueData.LEGAL_AUTH = true;
        UniqueData.FUNCTION_CODE_SYSTEM = "6.96";
        UniqueData.FUNCTION_CODE_NAME = "Medicine and Surgery";

        DOC.apiFunction = "DISCHARGE SUMMARY";
        DOC.class_code = "SUMMARIES";
        DOC.placer_order_template_id = "NA";

        DOC.REFERENCE_ID_LIST_2_URN = "ksa-ehealth:document:setId:2023";
        DOC.ORDERING_PROVIDER_PARTICIPANT_TEMPLATE_ID_2 =
          '<templateId root="1.3.6.1.4.1.19376.1.3.3.1.6" />';
        break;

      case "Operative Notes":
        DOC.PREFIX = "ON";

        DOC.HEALTH_DISPLAY_NAME = "Obstetrics and Gynecology";
        DOC.physicianSpecialty = `NA`;
        DOC.docTitle = `Operative Notes`;
        DOC.attName = "NA";
        DOC.attValue = "NA";
        DOC.templateID = "210.5";
        DOC.HEADER_TEMPLATE_ID = `
      <templateId root="2.16.840.1.113883.3.3731.1.210.5"/>
      `;
        DOC.code = "11504-8";
        DOC.codeDisplay = "Surgical operation note";
        DOC.formatCode = `urn:ihe:pcc:xds-ms:2007`;
        DOC.formatCodeSchema = `1.3.6.1.4.1.19376.1.2.3`;
        DOC.physicianSpecialtyCode = `${DEFAULT_HEALTH_CARE_ID}`;
        DOC.HEALTHCARE_FACILITY_TYPE_CODE = "AP5";
        DOC.HEALTHCARE_FACILITY_TYPE_DISPLAY = "Primary Healthcare";
        DOC.PRACTICE_SETTING_CODE = "MJ1";
        DOC.PRACTICE_SETTING_DISPLAY = "MJ1";

        UniqueData.LEGAL_AUTH = true;
        UniqueData.FUNCTION_CODE_SYSTEM = "6.96";
        UniqueData.FUNCTION_CODE_NAME = "Medicine and Surgery";

        DOC.apiFunction = "OPERATIVE NOTES";
        DOC.class_code = "NOTES";
        DOC.placer_order_template_id = "NA";
        DOC.ORDERING_PROVIDER_PARTICIPANT_TEMPLATE_ID_2 =
          '<templateId root="1.3.6.1.4.1.19376.1.3.3.1.6" />';
        break;
      case "Outpatient Encounter Summary":
        DOC.PREFIX = "OES";
        DOC.HEALTH_DISPLAY_NAME = "Obstetrics and Gynecology";
        DOC.physicianSpecialty = `NA`;
        DOC.docTitle = `Outpatient Encounter Summary`;
        DOC.attName = "NA";
        DOC.attValue = "NA";
        DOC.templateID = "210.5";
        DOC.HEADER_TEMPLATE_ID = `
      <templateId root="2.16.840.1.113883.3.3731.1.210.1"/>
      `;
        DOC.code = "96345-4";
        DOC.codeDisplay = "Surgical operation note";
        DOC.formatCode = `urn:ihe:pcc:xds-ms:2007`;
        DOC.formatCodeSchema = `1.3.6.1.4.1.19376.1.2.3`;
        DOC.physicianSpecialtyCode = `${DEFAULT_HEALTH_CARE_ID}`;
        DOC.HEALTHCARE_FACILITY_TYPE_CODE = "AP5";
        DOC.HEALTHCARE_FACILITY_TYPE_DISPLAY = "Primary Healthcare";
        DOC.PRACTICE_SETTING_CODE = "MJ1";
        DOC.PRACTICE_SETTING_DISPLAY = "MJ1";

        UniqueData.LEGAL_AUTH = true;
        UniqueData.FUNCTION_CODE_SYSTEM = "6.96";
        UniqueData.FUNCTION_CODE_NAME = "Medicine and Surgery";

        DOC.apiFunction = "OUTPATIENT ENCOUNTER SUMMARY";
        DOC.class_code = "SUMMARY";
        DOC.placer_order_template_id = "NA";
        DOC.ORDERING_PROVIDER_PARTICIPANT_TEMPLATE_ID_2 =
          '<templateId root="1.3.6.1.4.1.19376.1.3.3.1.6" />';
        break;

      default:
        break;
    }

    nphiesRepositoryUrl = await getConfValue({
      key: DOC.nphiesUrl,
      facilityId,
    });

    const {
      rows: [transactionData],
    } = await query(
      `INSERT INTO api_transaction (trans_date,
                           
                             patient_id,
                             episode_no,
                             api_provider,
                             api_name,
                             api_function,
                             status,
                             dest_url,
                             transaction_id,
                             url,
                             facility_id)
     VALUES ($11,
            
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8,
             $9,
             $10)
  RETURNING *`,
      [
        masterOrder.PATIENT_ID,
        masterOrder.EPISODE_NO,
        "NPHIES_CS",
        DOC.apiName,
        DOC.apiFunction,
        "FAIL",
        nphiesRepositoryUrl,
        masterOrder.ORDER_LINE || null,
        requestUrl,
        facilityId,

        masterOrder?.TRANS_DATE,
      ],
    );
    apiTransId = transactionData.api_trans_id;
    masterOrder.transactionId = apiTransId;

    clientLogger.verbose(
      `API transaction inserted with ID: ${apiTransId}  for patientId=${masterOrder.PATIENT_ID} episodeNo=${masterOrder.EPISODE_NO}`,
    );

    const patientData = await fetchPatientById({
      oracleConnection: connection,
      patientId: masterOrder.PATIENT_ID,
      facilityId,
      defaultHealthId: process.env.TEST_NPHIES_CS === "true",
    });

    if (!patientData?.HEALTH_ID) {
      await insertApiMessage({
        apiTransId: apiTransId,
        errorMessage: `Health ID missing for ,Patient ID:${
          masterOrder.PATIENT_ID || "''"
        } ,Facility: ${facilityId || "''"}, NOT found using ,Birth Date : ${
          patientData?.getHealthIdInfo?.dob || "''"
        } ,ID-No : ${
          patientData?.getHealthIdInfo?.identityNo || "''"
        } ,Type : ${patientData?.getHealthIdInfo?.identityType || "''"}`,

        errorId: NPHIES_FAIL_ID.HEALTH_ID,
      });
    }

    if (!DOC.FULL_ORG_ID) {
      await insertApiMessage({
        apiTransId: apiTransId,
        errorMessage: `ORG_ID is missing for ,facility : ${facilityId || "''"}`,
        errorId: NPHIES_FAIL_ID.ORG_ID,
      });
    }

    let physicianData;
    if (DOC.apiName == "RADIOLOGY" && DOC.apiFunction == "RESULT") {
      // verified_staff_id
      physicianData = await fetchPhysician({
        connection,
        staffId: masterOrder.VERIFIED_STAFF_ID,
        facilityId: facilityId,
      });
    } else if (masterOrder.ORDERER_STAFF_ID || masterOrder.author) {
      physicianData = await fetchPhysician({
        connection,
        staffId: masterOrder.ORDERER_STAFF_ID || masterOrder.author,
        facilityId: facilityId,
      });
    } else {
      physicianData = await fetchPractitioner({
        patientId: masterOrder.PATIENT_ID,
        episodeNo: masterOrder.EPISODE_NO,
        oracleConnection: connection,
        facilityId: facilityId,
      });
    }

    if (!physicianData?.IDENTIFIER_NO) {
      await insertApiMessage({
        apiTransId: apiTransId,
        errorMessage: `Physician IDENTIFIER_NO is missing for ,staffId : ${
          masterOrder.ORDERER_STAFF_ID || masterOrder.author || "''"
        }`,
        errorId: NPHIES_FAIL_ID.CONSULTANT_ID,
      });
    }

    const documentStatusCode = DOC.isCancel
      ? "amended"
      : (await getExtCode({
          oasis_code: masterOrder.ORDER_STATUS,
          mapping_type: "DIAGNOSTIC_REPORT_STATUS",
          source: "NPHIES CLINICAL",
          dbConn: connection,
        })?.ext_code) || "final";

    const documentStatusDisplay = DOC.isCancel
      ? DOCUMENT_STATUS_DISPLAY["amended"]
      : DOCUMENT_STATUS_DISPLAY[documentStatusCode] || "Final";

    const DEFAULT_DEPARTMENT_NAME = await getConfValue({
      key: "DEFAULT_DEPARTMENT_NAME",
      facilityId,
    });

    const data = {
      ...UniqueData,
      PHARM_NAMESPACE: DOC.PHARM_NAMESPACE,
      DOC_TITLE: DOC.docTitle,
      CLASS_CODE: mapClassCode(DOC.class_code) || "REPORTS",
      CLASS_CODE_UPPER_CASE: (
        mapClassCode(DOC.class_code) || "REPORTS"
      ).toUpperCase(),
      TEMPLATE_ID: DOC.templateID,
      CODE: DOC.code,
      CODE_DISPLAY_NAME: DOC.codeDisplay,
      FORMAT_CODE: DOC.formatCode,
      FORMAT_CODE_SCHEMA: DOC.formatCodeSchema,
      FORMAT_CODE_DISPLAY: DOC.docTitle,
      HEALTH_CARE_ID: DOC.physicianSpecialtyCode,
      HEALTH_DISPLAY_NAME: DOC.HEALTH_DISPLAY_NAME,
      HEALTHCARE_FACILITY_TYPE_CODE: DOC.HEALTHCARE_FACILITY_TYPE_CODE,
      PRACTICE_SETTING_CODE: DOC.PRACTICE_SETTING_CODE,
      HEALTHCARE_FACILITY_TYPE_DISPLAY: DOC.HEALTHCARE_FACILITY_TYPE_DISPLAY,
      PRACTICE_SETTING_DISPLAY: DOC.PRACTICE_SETTING_DISPLAY,
      REFERENCE_DOC_TYPE: DOC.referenceDocType,
      SERVICE_EVENT_ROOT_POSTFIX: DOC.SERVICE_EVENT_ROOT_POSTFIX || "",
      PREFIX: DOC.PREFIX || "",
      SET_ID: DOC.SET_ID,
      ORDER_ID: DOC.ORDER_ID,
      SUFFIX_ORDER: DOC.SUFFIX_ORDER,

      placer_order_template_id: DOC.placer_order_template_id,
      HEADER_TEMPLATE_ID: DOC.HEADER_TEMPLATE_ID,
      RELATED_DOCUMENT: DOC.RELATED_DOCUMENT,
      FULL_ORG_ID: DOC.FULL_ORG_ID,

      ORDER_LINE: DOC?.isCancel ? nextOrderLine : masterOrder.ORDER_LINE,
      CURRENT_DATE_TIME: CURRENT_DATE_TIME,
      VERSION: DOC.isCancel ? "2" : DOC_VERSION,
      REFERENCE_ID_LIST_2_URN: DOC.REFERENCE_ID_LIST_2_URN,

      ACCESSION_NO: masterOrder.REPORT_ID || "156465478",

      FACILITY: {
        ...facility,
        COUNTRY_CODE: "Saudi Arabia",
      },
      PATIENT: patientData,
      PHYSICIAN: physicianData,
      ORDERING_PROVIDER: physicianData,
      LEGAL_AUTH: UniqueData.LEGAL_AUTH ? physicianData : null,
      DOCUMENT_STATUS_CODE: documentStatusCode,
      DOCUMENT_STATUS_DISPLAY: documentStatusDisplay,

      LAB_STATUS: masterOrder.LAB_STATUS,

      MASTER_ORDER_NO: masterOrder.MASTER_ORDER_NO,
      ORDER_STATUS_CODE:
        DOC.apiFunction === "ORDER"
          ? getOrderStatusCode(masterOrder.ORDER_STATUS)
          : null,
      ORDER_STATUS_DISPLAY:
        DOC.apiFunction === "ORDER"
          ? getOrderStatusDisplay(masterOrder.ORDER_STATUS)
          : null,
      ORDER_EFFECTIVE_LOW: masterOrder.ORDER_DATE
        ? `${masterOrder.ORDER_DATE}+0300`
        : CURRENT_DATE_TIME,
      ORDER_EFFECTIVE_HIGH: CURRENT_DATE_TIME,

      VISIT_NO: masterOrder.VISIT_NO || "12345678",
      ATTENDANCE_TYPE: masterOrder.ATTENDANCE_TYPE || "I",
      ATTENDANCE_TYPE_DESC: masterOrder.ATTENDANCE_TYPE_DESC || "Inpatient",
      ENCOUNTER_START: masterOrder.SAMPLE_DATE
        ? `${masterOrder.SAMPLE_DATE}+0300`
        : CURRENT_DATE_TIME,
      DEPARTMENT_NAME: DEFAULT_DEPARTMENT_NAME || unknown,
      SAMPLE_DATE: masterOrder.SAMPLE_DATE,
      CREATION_DATE:
        dayjs(masterOrder.CREATION_DATE).format("YYYYMMDDHHmmss") + "+0300",
    };

    const {
      cdaBodySection,
      cdaServiceEvent,
      authenticatorTag,
      legalAuthenticatorTag,
      inFulfillmentOFTag,
      performerTag,
      newTitle,
      newCode,
      codeDisplay,

      queryResults: queryResultsFromCdaFn,
    } = await DOC.generateCdaSpecialSectionFn(
      { ...data, ...masterOrder, transactionId: apiTransId },
      connection,
      data,
    );

    queryResults = queryResultsFromCdaFn;

    data.UNIQUE_BODY_SECTION = cdaBodySection;
    data.UNIQUE_SERVICE_EVENT = cdaServiceEvent;
    data.AUTHENTICATOR = authenticatorTag;
    data.LEGAL_AUTHENTICATOR = legalAuthenticatorTag;
    data.IN_FULFILLMENT_OF = inFulfillmentOFTag;
    data.PERFORMER = performerTag;
    if (newTitle) {
      data.DOC_TITLE = newTitle;
    }
    if (newCode) {
      data.CODE = newCode;
    }
    if (codeDisplay) {
      data.CODE_DISPLAY_NAME = codeDisplay;
    }

    const cdaTemplate = loadTemplate("docCDA.xml");
    let finalCdaXml = cdaTemplate;

    const conditionalElements = [
      { field: "LEGAL_AUTH", path: "/ClinicalDocument/legalAuthenticator" },
      {
        field: "ORDER_STATUS_CODE",
        path: "/ClinicalDocument/documentationOf[0]",
      },
      { field: "ORDERING_PROVIDER", path: "/ClinicalDocument/participant[1]" },
      {
        field: "ORDERING_PROVIDER",
        path: "/ClinicalDocument/inFulfillmentOf[0]",
      },
    ];

    for (const { field, path } of conditionalElements) {
      if (!data[field]) {
        MEDICATION_LOGGER.verbose(
          `Removing CDA element at path ${path} due to missing data field ${field}`,
        );
        finalCdaXml = removeElement(finalCdaXml, path);
      } else {
        MEDICATION_LOGGER.verbose(
          `Retaining CDA element at path ${path} with data field ${field} value ${data[field]}`,
        );
      }
    }

    finalCdaXml = updateElementAttributes(finalCdaXml, "/ClinicalDocument", {
      [DOC.attName]: DOC.attValue,
    });

    finalCdaXml = processTemplate({
      template: finalCdaXml,
      data,
      templateName: "docCDA.xml",
    });

    const cdaBuffer = Buffer.from(finalCdaXml, "utf-8");
    const base64Cda = cdaBuffer.toString("base64");
    const cdaSize = String(cdaBuffer.byteLength);
    const cdaHash = crypto
      .createHash("sha1")
      .update(finalCdaXml, "utf-8")
      .digest("hex");

    const messageId = generateUUID();
    const documentEntryId = generateUUID();
    const submissionSetId = generateUUID();

    const submissionSetUniqueId = process.env.TEST_NPHIES_CS
      ? `2.16.840.1.113883.3.3731.1.2.2.100.1.1.${facility?.nphies_cs_org_id}.300.${apiTransId}`
      : (await getConfValue({
          facilityId: facility?.facility_id,
          key: "NPHIES_CS_OID",
        })) + `.300.${apiTransId}`;

    const submissionSetSourceId = process.env.TEST_NPHIES_CS
      ? `2.16.840.1.113883.3.3731.5.1.${facility?.nphies_cs_org_id}`
      : await getConfValue({
          facilityId: facility?.facility_id,
          key: "NPHIES_CS_OID",
        });

    if (!submissionSetSourceId) {
      MEDICATION_LOGGER.error(
        `NPHIES_CS_OID is not configured for facilityId: ${facility?.facility_id}`,
      );
      await insertApiMessage({
        apiTransId: apiTransId,
        errorMessage: `NPHIES_CS_OID is not configured for ,facilityId : ${
          facility?.facility_id || "''"
        }`,
        errorId: NPHIES_FAIL_ID.NPHIES_CS_OID,
      });
    }

    const envelopeData = {
      ...data,

      MESSAGE_ID: messageId,
      DOCUMENT_ENTRY_ID: documentEntryId,
      SUBMISSION_SET_ID: submissionSetId,
      BASE64_CDA: base64Cda,
      CDA_SIZE: cdaSize,
      CDA_HASH: cdaHash,

      REFERENCE_DOC_TYPE: DOC.referenceDocType,
      ACCESSION_NO: masterOrder.REPORT_ID || "156465478",

      SERVICE_STOP_TIME: data.CURRENT_DATE_TIME,
      SUBMISSION_TIME: data.CURRENT_DATE_TIME,

      SUBMISSION_SET_UNIQUE_ID: submissionSetUniqueId,
      SUBMISSION_SET_SOURCE_ID: submissionSetSourceId,
      NPHIES_REPOSITORY_URL: nphiesRepositoryUrl,
    };

    const envelopeSpecialSection = await DOC.generateEnvelopeSpecialSectionFn(
      masterOrder,
      documentEntryId,
      connection,
      envelopeData,
    );

    envelopeData.ENVELOPE_SPECIAL_SECTION = envelopeSpecialSection;

    envelopeData.REFERENCE_ID_LIST_1 = `<rim:Value>${data.PREFIX}S-${data.ORDER_LINE}^^^&amp;${data.FULL_ORG_ID}${data.SET_ID}&amp;ISO^urn:ksa-ehealth:document:setId:2023</rim:Value>`;
    envelopeData.REFERENCE_ID_LIST_2 = `<rim:Value>${data.PREFIX}-${data.ORDER_LINE}^^^&amp;${data.FULL_ORG_ID}${data.ORDER_ID}&amp;ISO^urn:ihe:iti:xds:2013:order</rim:Value>`;

    if (DOC.apiFunction == "RESULT" && DOC.apiName == "RADIOLOGY") {
      envelopeData.REFERENCE_ID_LIST_3 = `<rim:Value>${data.ACCESSION_NO}^^^&amp;${data.FULL_ORG_ID}.9&amp;ISO^urn:ihe:iti:xds:2013:accession</rim:Value>`;
    }

    if (DOC.apiName == "CLINICAL NOTES") {
      envelopeData.REFERENCE_ID_LIST_3 = ``;
      envelopeData.REFERENCE_ID_LIST_2 = ``;
      envelopeData.REFERENCE_ID_LIST_1 = `<rim:Value>${data.PREFIX}S-${data.ORDER_LINE}^^^&amp;${data.FULL_ORG_ID}${data.SET_ID}&amp;ISO^urn:ksa-ehealth:document:setId:2023</rim:Value>`;
    }

    if (DOC.isCancel) {
      envelopeData.REPLACE_ASSOCIATIONS = `
      <rim:Association associationType="urn:oasis:names:tc:ebxml-regrep:AssociationType:RPLC" id="as02" sourceObject="urn:uuid:${envelopeData.DOCUMENT_ENTRY_ID}" targetObject="urn:uuid:6f525ce5-c6bd-4873-85b0-224aeaf50c10">
						<rim:Slot name="SubmissionSetStatus">
							<rim:ValueList>
								<rim:Value>Original</rim:Value>
							</rim:ValueList>
						</rim:Slot>
					</rim:Association>
      
      `;
    }

    const envelopeTemplate = loadTemplate("envelope.xml");
    soapEnvelope = envelopeTemplate;

    soapEnvelope = processTemplate({
      template: soapEnvelope,
      data: envelopeData,
      templateName: "envelope.xml",
    });

    const conditionalSoapElements = [
      {
        field: "ORDER_STATUS_CODE",
        attributes: {
          id: "cl07a",
        },
        tag: "Classification",
      },
    ];

    for (const { field, attributes, tag } of conditionalSoapElements) {
      if (!envelopeData[field]) {
        MEDICATION_LOGGER.verbose(
          `Removing SOAP element with attributes ${JSON.stringify(
            attributes,
          )} due to missing data field ${field}`,
        );
        soapEnvelope = removeElementByAttributes(soapEnvelope, attributes, tag);
      } else {
        MEDICATION_LOGGER.verbose(
          `Retaining SOAP element  with attributes ${JSON.stringify(
            attributes,
          )} with data field ${field} value ${envelopeData[field]}`,
        );
      }
    }

    

    await query(
      `UPDATE api_transaction SET bundle_id = $2,request = $3, transaction_id = $4 WHERE api_trans_id = $1`,
      [
        apiTransId,
        envelopeData.MESSAGE_ID,
        soapEnvelope,
        masterOrder.ORDER_LINE,
      ],
    );

    const { rows: errorRows } = await query(
      `select nphies_message from api_message where api_trans_id = $1 `,
      [apiTransId],
    );

    if (errorRows.length > 0) {
      // TIMING: use batch-level preprocess, compute elapsed/local for skip path
      const endTime = process.hrtime.bigint();
      const elapsed_time_ms = Number(endTime - recordStart) / 1e6;
      const local_api_time_ms = Math.max(
        elapsed_time_ms  - response_time_ms,
        0,
      );

      MEDICATION_LOGGER.error(
        `Errors found in master order data for apiTransId ${apiTransId} OrderLine ${
          masterOrder.ORDER_LINE
        }: ${JSON.stringify(errorRows.map((row) => row.nphies_message))}`,
      );
      await query(
        `UPDATE api_transaction SET status = $2, error_message = $3, preprocess_time_ms = $4, elapsed_time_ms = $5, local_api_time_ms = $6, response_time_ms = $7 WHERE api_trans_id = $1`,
        [
          apiTransId,
          "FAIL",
          JSON.stringify(errorRows.map((row) => row.nphies_message)),
          Math.trunc(recordPreprocessMs || 0),
          Math.trunc(elapsed_time_ms || 0),
          Math.trunc(local_api_time_ms || 0),
          Math.trunc(response_time_ms || 0),
        ],
      );

      // RADIOLOGY || cLINICAL  ==> F
      // LAB  ==> E

      await connection.execute(
       `UPDATE ${DOC.table_to_update} SET ${
        DOC.column_to_update
      } = :p_status WHERE ${
        DOC.column_to_filter
      } = :p_value_to_update_status`,
        {
          p_status: DOC.apiName == "LAB" ? "E" : "F",
          p_value_to_update_status: masterOrder.VALUE_TO_UPDATE_STATUS,
        },
      );
      await connection.commit();
      return {
        success: false,
        status: STATUS.FAIL,
        message: errorRows.map((row) => row.nphies_message).join(";\n"),
        masterOrderNo: masterOrder.MASTER_ORDER_NO,
        api_trans_id: apiTransId,
      };
    }

    startAxios = process.hrtime.bigint();

    const isHttps =
      nphiesRepositoryUrl && nphiesRepositoryUrl.startsWith("https://");

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
        clientLogger.debug(
          `Using HTTPS with certificate for URL: ${nphiesRepositoryUrl}`,
        );
      } catch (error) {
        clientLogger.warn(
          `Certificate not found, using self-signed certificate acceptance for HTTPS: ${error.message}`,
        );
        agent = new https.Agent({ rejectUnauthorized: false });
      }
    } else {
      agent = new https.Agent({ rejectUnauthorized: false });
      clientLogger.debug(
        `Using HTTP (no certificate) for URL: ${nphiesRepositoryUrl}`,
      );
    }
    clientLogger.debug(
      `📨📨 Sending to NPHIES ${DOC.apiName} ${DOC.apiFunction} Document ID/Order Line ${masterOrder.ORDER_LINE} with apiTransId ${apiTransId} `,
    );

    const response = await axios.post(nphiesRepositoryUrl, soapEnvelope, {
      httpsAgent: agent,
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        SOAPAction:
          "urn:oasis:names:tc:ebxml-regrep:xsd:lcm:3.0:xdsrepositoryb:ProvideAndRegisterDocumentSetRequest",
      },
      timeout: 150_000,
    });
    const endAxios = process.hrtime.bigint();
    response_time_ms = Number(endAxios - startAxios) / 1e6;
    clientLogger.debug(
      `📨📨 Finish send to  NPHIES after ${response_time_ms} `,
    );

    nphiesResponse = response.data;

    // TIMING: elapsed from preprocessStart, local = elapsed - preprocess - response
    const endTotal = process.hrtime.bigint();
    const elapsed_time_ms = Number(endTotal - recordStart) / 1e6;
    const local_api_time_ms = Math.max(
      elapsed_time_ms - response_time_ms,
      0,
    );

    let hasError = isNphiesErrorResponse(nphiesResponse);
    let responseStatus = hasError ? "ERROR" : "SUCCESS";

    const prettyResponse =
      typeof nphiesResponse === "string"
        ? nphiesResponse
        : JSON.stringify(nphiesResponse);
    await query(
      `UPDATE api_transaction SET response = $2, status = $3, elapsed_time_ms = $4, local_api_time_ms = $5, response_time_ms = $6, preprocess_time_ms = $7
       WHERE api_trans_id = $1`,
      [
        apiTransId,
        prettyResponse,
        responseStatus,
        Math.trunc(elapsed_time_ms || 0),
        Math.trunc(local_api_time_ms || 0),
        Math.trunc(response_time_ms || 0),
        Math.trunc(recordPreprocessMs || 0),
      ],
    );

    await connection.execute(
      `UPDATE ${DOC.table_to_update} SET ${
        DOC.column_to_update
      } = :p_status WHERE ${
        DOC.column_to_filter
      } = :p_value_to_update_status`,
      { p_status: hasError ? "E" : "S", p_value_to_update_status: masterOrder.VALUE_TO_UPDATE_STATUS },
    );
    await connection.commit();

    MEDICATION_LOGGER.debug("update order status " + (hasError ? "E" : "S"));
    MEDICATION_LOGGER.info(
      `UPDATE ${DOC.table_to_update} SET ${
        DOC.column_to_update
      } = :p_status WHERE ${
        DOC.column_to_filter
      } = :p_value_to_update_status`,
    );

    if (hasError) {
      MEDICATION_LOGGER.error(
        `NPHIES API returned error apiTransId ${apiTransId} OrderLine ${masterOrder.ORDER_LINE} `,
      );
      await parseAndInsertXmlErrors(nphiesResponse, apiTransId);
    } else {
      MEDICATION_LOGGER.debug(
        `NPHIES API successful response apiTransId ${apiTransId} OrderLine ${masterOrder.ORDER_LINE} `,
      );
    }

    return {
      success: !hasError,
      status: !hasError ? STATUS.SUCCESS : STATUS.FAIL,

      message: hasError ? "Error in nphies response" : "Success",
      masterOrderNo: masterOrder.MASTER_ORDER_NO,
      api_trans_id: apiTransId,
    };
  } catch (error) {
    if (error.response) {
      const endAxios = process.hrtime.bigint();
      response_time_ms = Number(endAxios - startAxios) / 1e6;
      const endTotal = process.hrtime.bigint();
      const elapsed_time_ms = Number(endTotal - recordStart) / 1e6;
      const local_api_time_ms = Math.max(
        elapsed_time_ms  - response_time_ms,
        0,
      );

      MEDICATION_LOGGER.error(
        `NPHIES API error  ` +
          JSON.stringify({
            status: error.response.status,
            data: error.response.data,
          }),
      );
      nphiesResponse = error.response.data || {
        message: error.message,
        stack: error.stack,
      };

      let nphiesErrorsRows = [];
      if (isNphiesErrorResponse(nphiesResponse)) {
        const res = await parseAndInsertXmlErrors(nphiesResponse, apiTransId);
        nphiesErrorsRows = res.errors;
      }

      let status = "ERROR";

      await query(
        `UPDATE api_transaction SET response = $2, status = $3, elapsed_time_ms = $4, local_api_time_ms = $5, response_time_ms = $6, error_message = $7, preprocess_time_ms = $8 WHERE api_trans_id = $1`,
        [
          apiTransId,
          typeof nphiesResponse === "string"
            ? nphiesResponse
            : JSON.stringify(nphiesResponse),
          status,
          Math.trunc(elapsed_time_ms || 0),
          Math.trunc(local_api_time_ms || 0),
          Math.trunc(response_time_ms || 0),
          nphiesErrorsRows.length > 0
            ? nphiesErrorsRows?.map((r) => r.message)?.join(" ,")
            : JSON.stringify(error.response.data),
          Math.trunc(recordPreprocessMs || 0),
        ],
      );
    } else {
      const isTimeout =
        error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT" ||
        (typeof error.message === "string" &&
          error.message.toLowerCase().includes("timeout"));

      if (isTimeout) {
        await insertApiMessage({
          apiTransId: apiTransId,
          errorMessage: "TIMEOUT while calling nphies",
          errorId: "TIMEOUT",
        });
      }

      // TIMING: compute and persist times even on failure
      const endTotal = process.hrtime.bigint();
      const elapsed_time_ms = Number(endTotal - recordStart) / 1e6;
      const local_api_time_ms = Math.max(
        elapsed_time_ms  - response_time_ms,
        0,
      );

      MEDICATION_LOGGER.error(
        `Error sending request to NPHIES API: ` +
          JSON.stringify({
            message: error.message,
            stack: error.stack,
          }),
      );
      nphiesResponse = {
        message: error.message,
        stack: error.stack,
      };

      await query(
        `UPDATE api_transaction SET response = $2, status = $3, error_message = $4, preprocess_time_ms = $5, elapsed_time_ms = $6, local_api_time_ms = $7, response_time_ms = $8 WHERE api_trans_id = $1`,
        [
          apiTransId,
          typeof nphiesResponse === "string"
            ? nphiesResponse
            : JSON.stringify(nphiesResponse),
          "FAIL",
          error.message,
          Math.trunc(recordPreprocessMs || 0),
          Math.trunc(elapsed_time_ms || 0),
          Math.trunc(local_api_time_ms || 0),
          Math.trunc(response_time_ms || 0),
        ],
      );
    }

    await connection.execute(
      `UPDATE ${DOC.table_to_update} SET ${
        DOC.column_to_update
      } = :p_status WHERE ${
        DOC.column_to_filter
      } = :p_value_to_update_status`,
      { p_status: "E", p_value_to_update_status: masterOrder.VALUE_TO_UPDATE_STATUS },
    );
    await connection.commit();

    return {
      success: false,
      status: STATUS.ERROR,
      message: "Error sending request to NPHIES API",
      masterOrderNo: masterOrder.MASTER_ORDER_NO,
      api_trans_id: apiTransId,
    };
  }
}

/**
 * Helper function to get order status code for NPHIES
 * Maps HIS status to HL7 ActStatus codes
 */
function getOrderStatusCode(orderStatus) {
  const statusMap = {
    A: "new",
    P: "new",
    C: "completed",
    X: "cancelled",
    H: "held",
  };
  return statusMap[orderStatus] || "new";
}

/**
 * Helper function to get order status display name
 */
function getOrderStatusDisplay(orderStatus) {
  const displayMap = {
    A: "Order has been created",
    P: "Order has been created",
    C: "Order has been completed",
    X: "Order has been cancelled",
    H: "Order is on hold",
  };
  return displayMap[orderStatus] || "Order has been created";
}

function mapClassCode(classCode) {
  const classCodeMap = {
    ORDER: "PRESCRIPTIONS",
    RESULT: "REPORTS",
    SUMMARIES: "Summaries",
    PRESCRIPTIONS: "SUMMARIES",
  };
  return classCodeMap[classCode] || "REPORTS";
}

/**
 * Check if NPHIES SOAP response contains error indicators
 * @param {string|Object} response - NPHIES response (XML string or parsed object)
 * @returns {boolean} - true if response contains errors
 */
function isNphiesErrorResponse(response) {
  if (!response) return false;

  const responseStr =
    typeof response === "string" ? response : JSON.stringify(response);

  // Check for IHE XDS.b error indicators
  if (
    responseStr.includes("ResponseStatusType:Failure") ||
    responseStr.includes("ResponseStatusType:fail")
  ) {
    return true;
  }

  if (
    responseStr.includes("<RegistryError") ||
    responseStr.includes(":RegistryError")
  ) {
    return true;
  }

  if (
    responseStr.includes("<soap:Fault") ||
    responseStr.includes("<SOAP-ENV:Fault") ||
    responseStr.includes("faultcode") ||
    responseStr.includes("soapenv:Fault")
  ) {
    return true;
  }

  if (
    typeof response === "object" &&
    (response.status >= 400 || response.error || response.message)
  ) {
    return true;
  }

  return false;
}
