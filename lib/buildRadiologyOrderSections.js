import { clientLogger } from "../config/logger.js";
import { NPHIES_FAIL_ID } from "../util/constant.js";
import { getExtCode } from "../util/getExtCode.js";
import { insertApiMessage } from "../util/insertApiMsgs.js";
import { loadTemplate } from "../util/loadTemplates.js";
import { processTemplate } from "./processTemplate.js";

async function processRowDetails(masterRows, connection) {
  if (!Array.isArray(masterRows)) masterRows = [masterRows];

  const rows = await Promise.all(
    masterRows.map(async (masterRow = {}, index) => {
      let procedure = await getExtCode({
        oasis_code: masterRow.IOS,
        mapping_type: "IMAGING_PROCEDURE",
        source: "NPHIES CLINICAL",
        ext_type: "IMAGING PROCEDURE",
        dbConn: connection,
      });

      let modality = await getExtCode({
        oasis_code: masterRow.MODALITY,
        mapping_type: "MODALITIES",
        source: "NPHIES CLINICAL",
        ext_type: "MODALITIES",
        dbConn: connection,
      });

      if (!procedure?.ext_code) {
        clientLogger.debug(
          `No mapping found for IMAGING code: ${masterRow.IOS}, mappingType: IMAGING_PROCEDURE`,
        );

        await insertApiMessage({
          apiTransId: masterRow.transactionId,
          errorMessage: `No mapping found for ,IMAGING PROCEDURE : ${masterRow.IOS|| "''"}.`,
          errorId: NPHIES_FAIL_ID.MAP_PROCEDURE_CODE,
        });
      }

      if (!modality?.ext_code) {
        clientLogger.debug(
          `No mapping found for modality code: ${masterRow.MODALITY || "''"}.`,
        );
        await insertApiMessage({
          apiTransId: masterRow.transactionId,
          errorMessage: `No mapping found for ,modality code : ${masterRow.MODALITY || "''"}.`,
          errorId: NPHIES_FAIL_ID.MAP_MODALITY,
        });
      }

      const procedureCode = procedure?.ext_code;
      const procedureDisplay = procedure?.ext_desc;

      const modalityCode = modality?.ext_code;
      const modalityDisplay = modality?.ext_desc;

      const bodyRegionCode = "243928005";
      const bodyRegionDisplay = "entire body region";

      if (!bodyRegionCode) {
        clientLogger.debug(
          `No body region code provided for order line: ${masterRow.ORDER_LINE}`,
        );

        await insertApiMessage({
          apiTransId: masterRow.transactionId,
          errorMessage: `No mapping found for ,body region code : ${bodyRegionCode} ,order line : ${masterRow.ORDER_LINE}`,
          errorId: NPHIES_FAIL_ID.MAP_BODY_REGION,
        });
      }

      return {
        orderLine: masterRow.ORDER_LINE,
        rowId: `order_imgproc-${index + 1}`,
        procedureCode,
        procedureDisplay,
        modalityCode,
        modalityDisplay,
        bodyRegionCode,
        bodyRegionDisplay,
      };
    }),
  );

  return rows;
}

// CDA
/**
 * @description Builds the radiology order section for a CDA document based on the provided master row data. It processes the details of the master row to extract relevant information about the imaging procedure, modality, and body region, and then uses this information to populate a predefined CDA template.
 * @param {object} masterRow - An object containing the details of the radiology order, including procedure codes and descriptions.
 * @returns {Promise<{enrichedSection: string, enrichedServiceEvent: string}>} - A promise that resolves to an object containing the enriched CDA section and service event XML strings.
 */
export async function generateRadiologyOrderCdaSpecialSection(
  masterRow,
  connection,
) {
  // supports only one row as of now
  const rows = await processRowDetails(masterRow, connection);

  const serviceEventTemplate = `
    <documentationOf>
      <serviceEvent>
        <templateId root="2.16.840.1.113883.3.3731.1.204.33" />
        <code code="{{DATA.PROCEDURE_CODE}}" displayName="{{DATA.PROCEDURE_DISPLAY}}"
          codeSystem="2.16.840.1.113883.3.3731.1.204.15"
          codeSystemName="KSA Imaging Procedures" />
        <!-- Modality -->
        <nphies:modalityCode code="{{DATA.MODALITY_CODE}}"
          displayName="{{DATA.MODALITY_DISPLAY}}" codeSystem="1.2.840.10008.2.16.4"
          codeSystemName="DICOM Controlled Terminology" />
        <!-- Body Region -->
        <nphies:bodyRegionCode code="{{DATA.BODY_REGION_CODE}}"
          displayName="{{DATA.BODY_REGION_DISPLAY}}" codeSystem="2.16.840.1.113883.6.96"
          codeSystemName="SNOMED CT" />
      </serviceEvent>
    </documentationOf>`;

  const sectionTemplate = loadTemplate("radiologyOrderCdaSpecialSection.xml");

  const data = {
    PROCEDURE_CODE: rows[0]?.procedureCode,
    PROCEDURE_DISPLAY: rows[0]?.procedureDisplay,
    MODALITY_CODE: rows[0]?.modalityCode,
    MODALITY_DISPLAY: rows[0]?.modalityDisplay,
    BODY_REGION_CODE: rows[0]?.bodyRegionCode || "243928005",
    BODY_REGION_DISPLAY: rows[0]?.bodyRegionDisplay || "entire body region",
  };
  const enrichedServiceEvent = processTemplate({
    template: serviceEventTemplate,
    data: data,
  });
  const enrichedBodySection = processTemplate({
    template: sectionTemplate,
    data: data,
  });

  return {
    cdaBodySection: enrichedBodySection,
    cdaServiceEvent: enrichedServiceEvent,
  };
}

// SOAP
/**
 * @param {Array} masterRows - Array of radiology order detail rows, each containing information about a specific imaging procedure.
 * @param {string} documentEntryId - The unique identifier for the document entry to which the radiology order sections will be associated.
 * @param {object} connection - An optional database connection object used to fetch additional details for each procedure code.
 * @returns {Promise<string>} - A promise that resolves to a string containing the concatenated XML sections for all radiology orders, ready to be included in a SOAP message.
 * @description This function processes an array of master rows, each representing a radiology order, to generate XML sections for a SOAP message. It retrieves necessary details for each procedure code, populates a predefined XML template for each order, and concatenates the results into a single string that can be included in the SOAP message.
 */
export async function generateRadiologyOrderEnvelopeSpecialSection(
  masterRows,
  documentEntryId,
  connection,
  parentData = {},
) {
  const rows = await processRowDetails(masterRows, connection);
  
  const sectionTemplate = loadTemplate(
    "radiologyOrderEnvelopeSpecialSection.xml",
  );
  let sections = "";

  for (const row of rows) {
    const data = {
      ...parentData,
      DOCUMENT_ENTRY_ID: documentEntryId,
      PROCEDURE_CODE: row?.procedureCode,
      PROCEDURE_DISPLAY: row?.procedureDisplay,
      MODALITY_CODE: row?.modalityCode,
      MODALITY_DISPLAY: row?.modalityDisplay,
      BODY_REGION_CODE: row?.bodyRegionCode,
      BODY_REGION_DISPLAY: row?.bodyRegionDisplay,
    };
    const enrichedSection = processTemplate({
      template: sectionTemplate,
      data: data,
    });

    sections += enrichedSection;
  }
  return sections;
}
