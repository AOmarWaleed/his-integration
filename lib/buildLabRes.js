import OracleDB from "oracledb";
import { loadTemplate } from "../util/loadTemplates.js";
import { processTemplate } from "./processTemplate.js";
import { removeElement } from "../util/xmlTemplateString.js";
import { executeSqlFile, getRelativePath } from "../util/runQueryFromFile.js";
import { clientLogger, DEBUG } from "../config/logger.js";
import { createAuthenticatorTag } from "./tags/createAuthenticatorTag.js";
import { createLegalAuthenticatorTag } from "./tags/createLegalAuthenticatorTag.js";
import { createInFulfillmentOF } from "./tags/createInFulfillmentOF.js";
import { getExtCode } from "../util/getExtCode.js";
import { insertApiMessage } from "../util/insertApiMsgs.js";
import { NPHIES_FAIL_ID } from "../util/constant.js";
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import dayjs from "dayjs";
dayjs.extend(customParseFormat);


async function fetchSubResults(orderLine, connection) {
  try {
    const path = getRelativePath("queries/labResult.sql");
    clientLogger.debug(
      `Executing SQL file: ${path} for ORDER_LINE=${orderLine}`,
    );
    const { rows } = await executeSqlFile(connection, path, {
      orderLine,
    });

    clientLogger.debug(
      `fetchSubResults returned ${rows?.length || 0} rows for ORDER_LINE=${orderLine}`,
    );
    return rows || [];
  } catch (err) {
    clientLogger.error(
      `fetchSubResults error ORDER_LINE=${orderLine}: ${err?.message}`,
    );
    return [];
  }
}

async function fetchOrganismDetails(labResultId, connection) {
  try {
    const path = getRelativePath("queries/labResultOrganism.sql");
    clientLogger.debug(
      `Executing SQL file: ${path} for LAB_RESULT_ID=${labResultId}`,
    );
    const { rows } = await executeSqlFile(connection, path, {
      labResultId,
    });

    clientLogger.debug(
      `fetchOrganismDetails returned ${rows?.length} rows for LAB_RESULT_ID=${labResultId}`,
    );
    return rows || [];
  } catch (err) {
    clientLogger.error(
      `fetchOrganismDetails error LAB_RESULT_ID=${labResultId}: ${err?.message}`,
    );
    return [];
  }
}

async function fetchSensitivityDetails(labResultId, organismId, connection) {
  try {
    const path = getRelativePath("queries/labResultSensitivity.sql");
    clientLogger.debug(
      `Executing SQL file: ${path} for LAB_RESULT_ID=${labResultId}, ORGANISM_ID=${organismId}`,
    );
    const { rows } = await executeSqlFile(connection, path, {
      labResultId,
      organismId,
    });
    clientLogger.debug(
      `fetchSensitivityDetails returned ${rows?.length || 0} rows for ORGANISM_ID=${organismId}`,
    );
    return rows || [];
  } catch (err) {
    clientLogger.error(
      `fetchSensitivityDetails error ORGANISM_ID=${organismId}: ${err?.message}`,
    );
    return [];
  }
}

async function generateLabResults(
  { orderLine, transactionId },
  connection,
  parentData,
) {
  const resultsHumanTemplate = await loadTemplate("labResultCDArow.html");
  const resultsMachineTemplate = await loadTemplate("labResultCDAcomp.xml");

  let resultsHuman = "";
  let resultsMachine = "";

  const subRows = await fetchSubResults(orderLine, connection);

  if (!subRows?.length) {
    clientLogger.debug(`No sub results found for ORDER_LINE : ${orderLine}`);
    await insertApiMessage({
      apiTransId: transactionId,
      errorMessage: `No sub results found for ,ORDER_LINE : ${orderLine || "''"}.`,
      errorId: NPHIES_FAIL_ID.NO_SUB_RESULTS,
    });
    return { resultsHuman, resultsMachine };
  }

  clientLogger.debug(
    `generateLabResults processing ORDER_LINE : ${orderLine || "''"}: total subRows=${subRows.length}`,
  );

  let errors = [];

  for (const row of subRows) {
    try {
      // -- sub-result ios
      const loincService =
        (await getExtCode({
          oasis_code: row.IOS,
          mapping_type: "LAB_TEST",
          ext_type: "LOINC",
          source: "NPHIES CLINICAL",
          dbConn: connection,
        })) || {};

      if (!loincService || !loincService.ext_code) {
        clientLogger.debug(
          `No LOINC mapping found for IOS : ${row.IOS || "''"}`,
        );
        await insertApiMessage({
          apiTransId: transactionId,
          errorMessage: `No LOINC mapping found for ,IOS : ${row.IOS || "''"}.`,
          errorId: NPHIES_FAIL_ID.MAP_LOINC_RESULT,
        });
      }

      clientLogger.debug(
        `Fetched LOINC mapping (sub-results) for IOS=${row.IOS}: ${JSON.stringify(loincService)}`,
      );

      const uomResult = await getExtCode({
        oasis_code: row.UNIT_OF_MEASURE,
        mapping_type: "CODES",
        mapping_sub_type: "409",
        ext_type: "LAB OBSERVATION UNITS",
        source: "NPHIES CLINICAL",
        dbConn: connection,
      });

      const uomCode = uomResult.ext_code || "{count}"; // DONE
      const uomDesc = uomResult.ext_desc || "count"; // DONE
      const resultValue = escapeXml(normalizeDecimal(row.RESULT));
      const startNum = normalizeDecimal(row.START_NUMERIC_VALUE);
      const endNum = normalizeDecimal(row.END_NUMERIC_VALUE);

      if (!uomCode && startNum) {
        clientLogger.debug(
          `No UOM mapping found for UNIT_OF_MEASURE : ${row.UNIT_OF_MEASURE || "''"}, ORDER_LINE=${orderLine}`,
        );

        errors.push(
          `No UOM mapping found for UNIT_OF_MEASURE : ${row.UNIT_OF_MEASURE || "''"}, ORDER_LINE=${orderLine}`,
        );

        await insertApiMessage({
          apiTransId: transactionId,
          errorMessage: `No UOM mapping found for ,UNIT_OF_MEASURE : ${row.UNIT_OF_MEASURE || "''"}.`,
          errorId: NPHIES_FAIL_ID.MAP_UOM,
        });
      }

      clientLogger.debug(
        ` 🔍🔍🔍🔍🔍 Processing row TEST_IOS=${row.TEST_IOS}, ORDER_LINE=${orderLine}, resultType=${row.RESULT_TYPE}, resultValue=${resultValue}, unitDesc=${uomCode}, startNumericValue=${row.START_NUMERIC_VALUE}, serialNo=${row.SERIAL_NO}`,
      );
      let observationRangeText = "";
      const rangeDisplay =
        startNum && endNum
          ? `[ ${startNum} - ${endNum} ]`
          : startNum
            ? `[ &gt;= ${startNum} ]`
            : endNum
              ? `[ &lt;= ${endNum} ]`
              : escapeXml(row.REFERENCE_RANGE_TEXT || "");

      const resultDateHrs = row.RESULT_DATE_HOURS || "";
      let effectiveTime = "";
      if (!effectiveTime && resultDateHrs) effectiveTime = resultDateHrs;

      const refRangeValue = buildRefRangeValue({
        resultType: row.RESULT_TYPE,
        startNumericValue: row.START_NUMERIC_VALUE,
        endNumericValue: row.END_NUMERIC_VALUE,
        unitDesc: uomCode,
      });

      if (!refRangeValue) {
        observationRangeText = row.REFERENCE_RANGE_TEXT || "";
      }

      clientLogger.debug(
        `refRangeValue ${refRangeValue} REFERENCE_RANGE_TEXT: ${observationRangeText} `,
      );

      clientLogger.debug(
        `Building observation value for TEST_IOS=${row.TEST_IOS}, ORDER_LINE=${orderLine}, resultType=${row.RESULT_TYPE}, resultValue=${resultValue}, unitDesc=${uomCode}, startNumericValue=${row.START_NUMERIC_VALUE}, serialNo=${row.SERIAL_NO}`,
      );
      const observationValue = buildObservationValue({
        resultType: row.RESULT_TYPE,
        resultValue,
        unitDesc: uomCode,
        startNumericValue: row.START_NUMERIC_VALUE,
        serialNo: row.SERIAL_NO,
      });

       const interpretationMapped = await getExtCode({
        oasis_code: row.CONCLUSION,
        mapping_type: "CODES",
        mapping_sub_type: "10048",
        ext_type: "OBSERVATIONINTERPRET",
        source: "NPHIES CLINICAL",
        dbConn: connection,
      });


      clientLogger.debug(
          `interpretationMapped : ` , interpretationMapped
        );

      if(!interpretationMapped?.ext_code) {
        clientLogger.debug(
          `No interpretation mapping found for CONCLUSION : ${row.CONCLUSION || "''"}.`,
        );


        // await insertApiMessage({
        //   apiTransId: transactionId,
        //   errorMessage:  `No interpretation mapping found for CONCLUSION : ${row.CONCLUSION || "''"}.`,
        //   errorId: NPHIES_FAIL_ID.MAP_INTERPRETATION,
        // });
      }



      // const interpretationMap = { H: "High", L: "Low", N: "Normal" };
      // const conclusionUpper = "H".toUpperCase();
      // const interpretationCode = interpretationMap[conclusionUpper]
      //   ? conclusionUpper
      //   : "";
      // const interpretationDesc = interpretationMap[conclusionUpper] || "";

      const data = {
        ...parentData,
        OBS_ID: row.SERIAL_NO,
        SERVICE_CODE: loincService.ext_code,
        SERVICE_DESC: loincService.ext_desc || "",
        UOM_DESC: uomDesc,
        UOM_CODE: uomCode,
        RESULT_TYPE: row.RESULT_TYPE,
        RESULT_VALUE: resultValue,
        START_NUM: startNum,
        END_NUM: endNum,
        RANGE_DISPLAY: rangeDisplay || "NA",
        REF_RANGE_VALUE: rangeDisplay ? refRangeValue : "",
        OBSERVATION_VALUE: observationValue,
        OBSERVATION_RANGE_TEXT: observationRangeText,
        // VALUE_DISPLAY: valueDisplay,
        INTERPRETATION_CODE: escapeXml(interpretationMapped.ext_code),
        INTERPRETATION_DESC: interpretationMapped.ext_desc,
        RESULT_DATE: row.RESULT_DATE || "",
        RESULT_DATE_HRS: resultDateHrs,
      };

      resultsHuman += processTemplate({
        template: resultsHumanTemplate,
        data,
        templateName: "labResultCdaSpecialSection.xml",
      });
      let res = processTemplate({
        template: resultsMachineTemplate,
        data,
        templateName: "labResultCDAcomp.xml",
      });

      if (!refRangeValue) {
        res = res.replace(
          /<referenceRange[^>]*>[\s\S]*?<\/referenceRange>/,
          `<referenceRange typeCode="REFV">
            <observationRange classCode="OBS" moodCode="EVN.CRT">
              <text>
                <reference value="#obs${row.SERIAL_NO}-refrange" />
                ${escapeXml(observationRangeText)}
              </text>
              <interpretationCode code="N"
                codeSystem="2.16.840.1.113883.5.83"
                codeSystemName="HL7:ObservationInterpretation"
                displayName="Normal" />
            </observationRange>
          </referenceRange>`,
        );
      }

      resultsMachine += res;
    } catch (err) {
      clientLogger.error(
        `generateLabResults error processing row TEST_IOS=${row.TEST_IOS}, ORDER_LINE=${orderLine}: ${err?.message}`,
      );
      continue;
    }
  }

  if (errors.length > 0) {
    clientLogger.debug(
      `generateLabResults encountered ${errors.length} errors for ORDER_LINE=${orderLine}: ${errors.join("; ")}`,
    );
  }

  clientLogger.debug(
    `generateLabResults summary ORDER_LINE=${orderLine}: total=${subRows.length}, humanLen=${resultsHuman.length}, machineLen=${resultsMachine.length}`,
  );
  return { resultsHuman, resultsMachine };
}

async function generateMicrobiologyBody(connection, parentData) {
  let microbioTemplate = await loadTemplate("labResultMbCdaSection.xml");
  const subResults = await fetchSubResults(parentData.ORDER_LINE, connection);
  if (subResults.length === 0) {
    clientLogger.debug(
      `No sub-results found for ORDER_LINE=${parentData.ORDER_LINE}`,
    );

    await insertApiMessage({
      apiTransId: parentData.transactionId,
      errorMessage: `No sub-results found for ,ORDER_LINE : ${parentData.ORDER_LINE || "''"}`,
      errorId: NPHIES_FAIL_ID.SUB_RESULTS,
    });
  }
  let organismSection = "";
  let sensitivitySection = "";
  let sensitivityRowsSection = "";
  let organismRowsSection = "";
  for (const subRow of subResults) {
    const {
      organismComponents,
      organismRows,
      sensitivityComponents,
      sensitivityRows,
    } = await generateOrganismSections(
      subRow.LAB_RESULT,
      connection,
      parentData,
      parentData.transactionId,
    );
    organismSection += organismComponents;
    sensitivitySection += sensitivityComponents;
    sensitivityRowsSection += sensitivityRows;
    organismRowsSection += organismRows;
  }
  const mainSectionData = {
    ...parentData,
    ORGANISM_COMPONENTS: organismSection,
    ORGANISM_ROWS: organismRowsSection,
    SENSITIVITY_COMPONENTS: sensitivitySection,
    SENSITIVITY_ROWS: sensitivityRowsSection,
  };

  if (!mainSectionData.ORGANISM_COMPONENTS) {
    clientLogger.debug(
      `No organism components found for ORDER_LINE=${parentData.ORDER_LINE}`,
    );
  }

  const conditionalSoapElements = [
    {
      field: "SENSITIVITY_COMPONENTS",
      path: "/component/section/entry[0]/act/entryRelationship/organizer/component",
    },
    {
      field: "SENSITIVITY_ROWS",
      path: "/component/section/text/paragraph[2]",
    },
    {
      field: "SENSITIVITY_ROWS",
      path: "/component/section/text/table[1]",
    },
  ];

  for (const { field, path } of conditionalSoapElements) {
    if (!mainSectionData[field]) {
      clientLogger.verbose(
        `Removing element for field ${field} as it has no data`,
      );
      microbioTemplate = removeElement(microbioTemplate, path);
    } else {
      clientLogger.verbose(`Keeping element for field ${field} as it has data`);
    }
  }

  const microbioSection = processTemplate({
    template: microbioTemplate,
    data: mainSectionData,
    templateName: "labResultMbCdaSection.xml",
  });
  return microbioSection;
}

async function generateOrganismSections(
  labResultId,
  connection,
  mainSectionData,
  apiTransId,
) {
  const organismRowsTemplate = `
                        <td id="obs2_{{DATA.OBS_ID}}-pathogen"> {{DATA.ORGANISM_DESC}} </td>
                        <td id="obs2_{{DATA.OBS_ID}}-method"> {{DATA.CULTURE_CODE}} </td>`;
  const organismTemplate = `
                            <specimen typeCode="SPC">
                                <specimenRole classCode="SPEC">
                                    <specimenPlayingEntity classCode="MIC">
                                        <code code="{{DATA.ORGANISM_LOINC_CODE}}"
                                              codeSystem="2.16.840.1.113883.6.96"
                                              codeSystemName="SNOMED CT"
                                              displayName="{{DATA.ORGANISM_DESCRIPTION}}">
                                            <originalText>
                                                <reference value="#obs2_{{DATA.SERIAL_NO}}-organism" />
                                            </originalText>
                                        </code>
                                    </specimenPlayingEntity>
                                </specimenRole>
                            </specimen>
                            <!-- Method and Value  -->
                            <component typeCode="COMP">
                                <observation classCode="OBS"
                                             moodCode="EVN">
                                    <templateId root="2.16.840.1.113883.3.3731.1.105.18" />
                                    <templateId root="1.3.6.1.4.1.19376.1.3.1.6" />
                                    <code code="11475-1"
                                          codeSystem="2.16.840.1.113883.6.1"
                                          codeSystemName="LOINC"
                                          displayName="Microorganism identified in Specimen by Culture">
                                        <originalText>
                                            <reference value="#obs2_{{DATA.SERIAL_NO}}-organism" />
                                        </originalText>
                                    </code>
                                    <statusCode code="completed" />
                                </observation>
                            </component>`;

  const orgDetails = await fetchOrganismDetails(labResultId, connection);

  let organismComponents = "";
  let organismRows = "";
  let sensitivityComponents = "";
  let sensitivityRows = "";

  if (orgDetails.length === 0) {
    clientLogger.debug(
      `No organism details found for LAB_RESULT_ID=${labResultId}`,
    );
    await insertApiMessage({
      apiTransId,
      errorMessage: `No organism details found for ,LAB_RESULT_ID : ${labResultId || "''"}`,
      errorId: NPHIES_FAIL_ID.ORGANISM,
    });
  }

  for (const row of orgDetails) {
    const organismLoinc = await getExtCode({
      oasis_code: row.ORGANISM_ID,
      mapping_type: "LAB_ORGANISMS",
      ext_type: "ORGANISM",
      source: "NPHIES CLINICAL",
      dbConn: connection,
    });

    row.ORGANISM_LOINC_CODE = organismLoinc.ext_code || "";
    row.ORGANISM_LOINC_DESC = organismLoinc.ext_desc || "";

    const organismData = {
      ...mainSectionData,
      ...row,
    };

    const organismSection = processTemplate({
      template: organismTemplate,
      data: organismData,
      templateName: "labResultCDAmicrobiology.xml",
    });
    organismComponents += organismSection;

    const organismRow = processTemplate({
      template: organismRowsTemplate,
      data: organismData,
      templateName: "labResultCDAmicrobiology.xml",
    });
    organismRows += organismRow;

    const sensitivityResult = await fetchSensitivityDetails(
      labResultId,
      row.ORGANISM_ID,
      connection,
    );

    if (sensitivityResult.length > 0) {
      const result = await generateSensitivitySections(
        sensitivityResult,
        organismData,
        connection,
        apiTransId,
      );
      sensitivityComponents += result.sensitivityComponents;
      sensitivityRows += result.sensitivityRows;
    } else {
      clientLogger.debug(
        `No sensitivity results found for ORGANISM_ID=${row.ORGANISM_ID}, LAB_RESULT_ID=${labResultId}`,
      );
    }
  }

  return {
    organismComponents,
    sensitivityComponents,
    sensitivityRows,
  };
}

async function generateSensitivitySections(
  sensitivityResults,
  data,
  connection,
  apiTransId,
) {
  const sensitivityComponentTemplate = `
                                          <component typeCode="COMP"> 
                                            <observation classCode="OBS"
                                                         moodCode="EVN">
                                                <templateId root="2.16.840.1.113883.3.3731.1.105.20" />
                                                <templateId root="1.3.6.1.4.1.19376.1.3.1.6" />
                                                <!-- Antimicrobial HERE -->
                                                <code code="{{DATA.ANTI_BIOTIC_LOINC_CODE}}"
                                                      codeSystem="2.16.840.1.113883.6.88"
                                                      codeSystemName="KSA Antimicrobial"
                                                      displayName="{{DATA.ORGANISM_DESCRIPTION}}">
                                                    <originalText>
                                                        <reference value="#obs2_1_ab-{{DATA.OBS_ID}}-actsubst" />
                                                    </originalText>
                                                </code>
                                                <statusCode code="completed" />
                                                <interpretationCode code="{{DATA.SENSITIVITY_RESULT_CODE}}"
                                                                    codeSystem="2.16.840.1.113883.5.83"
                                                                    codeSystemName="HL7 ObservationInterpretation"
                                                                    displayName="{{DATA.SENSTIVITY_RESULT_DESC}}">
                                                    <originalText>
                                                        <reference value="#obs2_1_ab-{{DATA.OBS_ID}}-susceptibility" />
                                                    </originalText>
                                                </interpretationCode>
                                            </observation>
                                        </component>`;
  const sensitivityRowTemplate = `
                            <tr>
                                <td id="obs2_1_ab-{{DATA.OBS_ID}}-actsubst"> {{DATA.ORGANISM_SHORT_NAME}} </td>
                                <td id="obs2_1_ab-{{DATA.OBS_ID}}-susceptibility"> {{DATA.SENSITIVITY_RESULT_CODE}} </td>
                                <td />
                            </tr>`;

  let sensitivityComponents = "";
  let sensitivityRows = "";

  for (const sensRow of sensitivityResults) {
    const sensResultMap = {
      RESISTANCE: "R",
      SENSITIVE: "S",
      INTERMEDIATE: "I",
    };
    const sensitytResultCode =
      sensResultMap[sensRow.SENSTIVITY_RESULT_DESC.toUpperCase()] || "I";

    const sensData = {
      ...data,
      ...sensRow,
      SENSITIVITY_RESULT_CODE: sensitytResultCode,
    };

    const antiCode = await getExtCode({
      oasis_code: sensData.ANTI_BIOTIC_ID,
      mapping_type: "ANTIMICROBIAL",
      ext_type: "ANTIMICROBIAL",
      source: "NPHIES CLINICAL",
      dbConn: connection,
    });

    clientLogger.debug(
      `ANTIMICROBIAL: fetched ANTIMICROBIAL mapping for ANTI_BIOTIC_ID=${sensData.ANTI_BIOTIC_ID}: ${JSON.stringify(
        antiCode,
      )}`,
    );

    sensData.ANTI_BIOTIC_LOINC_CODE = antiCode.ext_code;
    if (!sensData.ANTI_BIOTIC_LOINC_CODE) {
      clientLogger.debug(
        `No code found for ANTI_BIOTIC_ID=${sensData.ANTI_BIOTIC_ID}`,
      );
      await insertApiMessage({
        apiTransId: apiTransId,
        errorMessage: `No ANTIMICROBIAL mapping found for ,ANTI_BIOTIC_ID : ${sensData.ANTI_BIOTIC_ID || "''"}.`,
        errorId: NPHIES_FAIL_ID.MAP_ANTIMICROBIAL,
      });
    }

    const sensitivityRow = processTemplate({
      template: sensitivityRowTemplate,
      data: sensData,
      templateName: "labResultCDAmicrobiology.xml",
    });
    const sensitivityComponent = processTemplate({
      template: sensitivityComponentTemplate,
      data: sensData,
      templateName: "labResultCDAmicrobiology.xml",
    });
    sensitivityRows += sensitivityRow;
    sensitivityComponents += sensitivityComponent;
  }

  return { sensitivityComponents, sensitivityRows };
}

function buildRefRangeValue({
  resultType,
  startNumericValue,
  endNumericValue,
  unitDesc,
}) {
  const isNumeric = resultType === "N" || resultType === "I";
  const startValue = String(startNumericValue || "").trim();
  const endValue = String(endNumericValue || "").trim();
  const unitValue = String(unitDesc || "").trim();

  if (!isNumeric || !startValue) {
    return "";
  }

  if (unitValue) {
    return `<value xsi:type="IVL_PQ">
  ${startValue ? `<low value="${startValue}" unit="${unitValue}"/>` : ""}
  ${endValue ? `<high value="${endValue}" unit="${unitValue}"/>` : ""}
</value>`;
  }

  return `<value xsi:type="IVL_PQ">
  ${startValue ? `<low value="${startValue}"/>` : ""}
  ${endValue ? `<high value="${endValue}"/>` : ""}
</value>`;
}

function buildObservationValue({
  resultType,
  resultValue,
  unitDesc,
  startNumericValue,
  serialNo,
}) {
  const normalizedStart = normalizeDecimal(startNumericValue || "");
  const normalizedValue = normalizeDecimal(resultValue || "");
  const normalizedUnit = String(unitDesc || "").trim();

  const isNumeric = resultType === "N" || resultType === "I";
  const hasUnit = normalizedUnit !== "";

  if (isNumeric && normalizedStart !== "") {
    return `<value xsi:type="PQ" value="${normalizedValue}" unit="${normalizedUnit}"/>`;
  }

  return `<value xsi:type="ED"><reference value="#obs${serialNo}-value"></reference></value>`;
}

export async function generateLabResultCdaSpecialSection(
  masterRow,
  connection,
  parentData,
) {
  const orderLine = masterRow.ORDER_LINE;

  // master row IOS mapping
  const batteryCode = await getExtCode({
    oasis_code: masterRow.IOS || "",
    mapping_type: "LAB_TEST",
    ext_type: "LOINC",
    source: "NPHIES CLINICAL",
    dbConn: connection,
  });

  if (!batteryCode?.ext_code) {
    const errorMessage = `No LOINC mapping (master) found for IOS : ${masterRow.IOS || "''"}.`;
    await insertApiMessage({
      apiTransId: masterRow.transactionId,
      errorMessage: errorMessage,
      errorId: NPHIES_FAIL_ID.MAP_LOINC_IOS,
    });

    clientLogger.debug(
      `⚠️ No LOINC mapping found for IOS : ${masterRow.IOS || "''"}.`,
    );
  }

  clientLogger.debug(
    `generateLabResultCdaSpecialSection: fetched batteryCode for IOS=${masterRow.IOS}: ${JSON.stringify(
      batteryCode,
    )}`,
  );

  const deptLoinc = await getExtCode({
    oasis_code: masterRow.DEPT_NO,
    mapping_type: "LAB_SEC",
    ext_type: "LABORATORY DEPARTMENT",
    source: "NPHIES CLINICAL",
    dbConn: connection,
  });

  if (!deptLoinc?.ext_code) {
    const errorMessage = `No LOINC mapping found for ,DEPT_NO : ${masterRow.DEPT_NO || "''"}.`;
    await insertApiMessage({
      apiTransId: masterRow.transactionId,
      errorMessage: errorMessage,
      errorId: NPHIES_FAIL_ID.MAP_LOINC_DEPT,
    });

    clientLogger.debug(
      `⚠️ No LOINC mapping found for DEPT_NO : ${masterRow.DEPT_NO || "''"}.`,
    );
  }

  const SPECIMEN_TYPE = await getExtCode({
    source: "NPHIES CLINICAL",
    ext_type: "SPECIMEN TYPE",
    mapping_type: "CODES",
    mapping_sub_type: "10045",
    dbConn: connection,
    oasis_code: masterRow.SPECIMEN_CODE,
  });

  clientLogger.debug(
    `generateLabResultCdaSpecialSection: fetched SPECIMEN_TYPE for specimen_code=${masterRow.SPECIMEN_CODE}: ${JSON.stringify(
      SPECIMEN_TYPE,
    )}`,
  );

   if (!masterRow.SPECIMEN_COLLECTION_TIME) {
    const errorMessage = `No SPECIMEN_COLLECTION_TIME found for ,order_line : ${masterRow.ORDER_LINE || "''"}.`;
    await insertApiMessage({
      apiTransId: masterRow.transactionId,
      errorMessage: errorMessage,
      errorId: NPHIES_FAIL_ID.SPECIMEN_COLLECTION_TIME,
    });
  }
  
  const data = {
    ...parentData,
SPECIMEN_COLLECTION_TIME_HUMAN_READABLE: masterRow.SPECIMEN_COLLECTION_TIME
  ? dayjs(masterRow.SPECIMEN_COLLECTION_TIME).format("MMMM D, YYYY [at] h:mm:ss A")
  : "",    //Done REMOVE UNK FAIL IF NULL
    SPECIMEN_TYPE: masterRow.SPECIMEN_TYPE || "UNK", // todo REMOVE UNK close tag if null
    SPECIMEN_TYPE_TAG: masterRow.SPECIMEN_TYPE ? `<item ID="specimen1-type">${masterRow.SPECIMEN_TYPE}</item>`:  `<item ID="specimen1-type" />`, // todo REMOVE UNK close tag if null
    SPECIMEN_SOURCE: masterRow.SPECIMEN_SOURCE || "UNK",
    SPECIMEN_COLLECTION_METHOD: masterRow.SPECIMEN_COLLECTION_METHOD || "UNK",
    SPECIMEN_HANDLING: masterRow.SPECIMEN_HANDLING || "UNK",
    SPECIMEN_RISK: masterRow.SPECIMEN_RISK || "UNK",
    SPECIMEN_RISKCOMMENT: masterRow.SPECIMEN_RISKCOMMENT || "UNK",
    BATTERY_CODE: batteryCode.ext_code || "", 
    BATTERY_DESCRIPTION: batteryCode.ext_desc || "", 

    DEPT_LOINC_CODE: deptLoinc.ext_code,
    DEPT_LOINC_NAME: deptLoinc.ext_desc,

    transactionId: masterRow.transactionId,
   CREATION_DATE_FORMATTED : dayjs(masterRow.CREATION_DATE) .format('YYYYMMDDHHmmssZ').replace(':', '')
  };
  let cdaBodySection = "";

  if (masterRow.DEPT_NO != "MB") {
    const labResults = await generateLabResults(
      { orderLine, transactionId: masterRow.transactionId },
      connection,
      data,
    );

    data.LAB_RESULTS_HUMAN = labResults.resultsHuman;
    data.LAB_RESULTS_MACHINE = labResults.resultsMachine;

    clientLogger.debug(
      `Generating CDA sections for non-microbiology department DEPT_NO=${masterRow.DEPT_NO}`,
    );
    const cdaSectionsTemplate = await loadTemplate(
      "labResultCdaSpecialSection.xml",
    );
    cdaBodySection = processTemplate({
      template: cdaSectionsTemplate,
      data,
      templateName: "labResultCdaSpecialSection.xml",
    });
  } else {
    clientLogger.debug(
      `Generating CDA sections for microbiology department DEPT_NO=${masterRow.DEPT_NO}`,
    );
    cdaBodySection = await generateMicrobiologyBody(connection, data);
  }

  const cdaServiceEventTemplate = `<!--
			ServiceEvent 1: Laboratory Specialty "Hematology Studies"
	-->
	<documentationOf>
		<serviceEvent>
			<templateId root="2.16.840.1.113883.3.3731.1.105.6"/>
			<code code="{{DATA.DEPT_LOINC_CODE}}" displayName="{{DATA.DEPT_LOINC_NAME}}" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC"/>
		</serviceEvent>
	</documentationOf>
	<!--
			ServiceEvent 3: Battery code "Leukocyte morphology panel – Blood"
	-->
	<documentationOf>
		<serviceEvent>
			<templateId root="2.16.840.1.113883.3.3731.1.105.22"/>
			<code code="{{DATA.BATTERY_CODE}}" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" displayName="{{DATA.BATTERY_DESCRIPTION}}"/>
		</serviceEvent>
	</documentationOf>`;

  const cdaServiceEvent = processTemplate({
    template: cdaServiceEventTemplate,
    data,
    templateName: "labResultCdaSpecialSection.xml",
  });

  // create AUTHENTICATOR

  const authenticatorTag = createAuthenticatorTag(data);
  const legalAuthenticatorTag = createLegalAuthenticatorTag(data);

  const inFulfillmentOFTag = createInFulfillmentOF({
    ...data,
    ORDER_LINE_BLOCK: `<id extension="${data.PREFIX}-${data.ORDER_LINE}" root="${data.FULL_ORG_ID}${data.ORDER_ID}"/>`,
    PLACER_ORDER_BLOCK: `			 <id extension="LO-${data.ORDER_LINE}" root="${data.FULL_ORG_ID}${data.SUFFIX_ORDER}" />`,
  });

  return {
    inFulfillmentOFTag,
    cdaBodySection,
    cdaServiceEvent,
    authenticatorTag,
    legalAuthenticatorTag,
  };
}

export async function generateLabResultEnvelopeSpecialSection(
  masterRow,
  documentEntryId,
  connection,
  parentData,
) {
  const soapTemplate = loadTemplate("labResultEnvelopeSpecialSection.xml");

  const deptLoinc = await getExtCode({
    oasis_code: masterRow.DEPT_NO,
    mapping_type: "LAB_SEC",
    ext_type: "LABORATORY DEPARTMENT",
    source: "NPHIES CLINICAL",
    dbConn: connection,
  });

  const loincResult = await getExtCode({
    oasis_code: masterRow.IOS,
    mapping_type: "LAB_TEST",
    ext_type: "LOINC",
    source: "NPHIES CLINICAL",
    dbConn: connection,
  });

  if (!loincResult) {
    clientLogger.debug(
      `No LOINC mapping found for IOS : ${masterRow.IOS || "''"}.`,
    );
  }

  const data = {
    ...parentData,
    BATTERY_CODE: loincResult?.ext_code, 
    BATTERY_DESCRIPTION: loincResult?.ext_desc, 
    DEPT_LOINC_CODE: deptLoinc.ext_code,
    DEPT_LOINC_NAME: deptLoinc.ext_desc,
  };

  const processedSoapTemplate = processTemplate({
    template: soapTemplate,
    data,
    templateName: "labResultEnvelopeSpecialSection.xml",
  });

  return processedSoapTemplate;
}

function normalizeDecimal(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (/^\.\d+$/.test(str)) {
    return "0" + str;
  }
  return str;
}

/**
 * Escape XML special characters
 */
function escapeXml(value) {
  if (typeof value === "string") {
    return value
      .replace(/^\uFEFF/, "")
      .replace(/\uFFFD/g, "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/[\uFFFE\uFFFF]/g, "")
      .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(escapeXml);
  }

  const result = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      result[key] = escapeXml(value[key]);
    }
  }
  return result;
}
