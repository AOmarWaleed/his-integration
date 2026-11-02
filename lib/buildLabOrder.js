import { getExtCode } from "../util/getExtCode.js";

import { loadTemplate } from "../util/loadTemplates.js";
import { processTemplate } from "./processTemplate.js";
import { clientLogger } from "../config/logger.js";
import { insertApiMessage } from "../util/insertApiMsgs.js";
import { NPHIES_FAIL_ID } from "../util/constant.js";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
dayjs.extend(customParseFormat);

export async function generateLabOrderCdaSpecialSection(
  masterRow,
  connection,
  parentData,
) {
  // Implementation for generating CDA for lab order
  const cdaBodyTemplate = loadTemplate("labOrderCdaSpecialSection.xml");
  const cdaServiceEventTemplate = `
	<!--
			ServiceEvent 1 ordered: Laboratory Studies
	-->
	<documentationOf>
		<serviceEvent>
			<templateId root="2.16.840.1.113883.3.3731.1.105.21"/>
			<code code="{{DATA.DEPT_LOINC_CODE}}"
			      displayName="{{DATA.DEPT_LOINC_NAME}}"
			      codeSystem="2.16.840.1.113883.6.1"
			      codeSystemName="LOINC"/>
		</serviceEvent>
	</documentationOf>
  `;

  const specimen = await getExtCode({
    oasis_code: masterRow.SPECIMEN_CODE,
    mapping_type: "CODES",
    mapping_sub_type: "10045",
    source: "NPHIES CLINICAL",
    ext_type: "SPECIMEN TYPE",
    dbConn: connection,
  });

  const orderPriority = await getExtCode({
    oasis_code: masterRow.URGENT_FLAG,
    mapping_type: "CODES",
    mapping_sub_type: "458",
    source: "NPHIES CLINICAL",
    ext_type: "ORDER PRIORITIES",
    dbConn: connection,
  });

  const testLoinc = await getExtCode({
    oasis_code: masterRow.IOS,
    mapping_type: "LAB_TEST",
    source: "NPHIES CLINICAL",
    ext_type: "LOINC",
    dbConn: connection,
  });

  clientLogger.debug(
    `🗺️ 🔬 Test LOINC for IOS ${masterRow.IOS}: ${JSON.stringify(testLoinc)}`,
  );

  if (!testLoinc?.ext_code) {
    const errorMessage = `No LOINC mapping found for ,IOS : ${masterRow.IOS || "''"}.`;
    await insertApiMessage({
      apiTransId: masterRow.transactionId,
      errorMessage: errorMessage,
      errorId: NPHIES_FAIL_ID.MAP_LOINC_IOS,
    });

    clientLogger.debug(
      `⚠️ No LOINC mapping found for IOS ${masterRow.IOS || "''"}.`,
    );
  }

  const deptLoinc = await getExtCode({
    oasis_code: masterRow.DEPT_NO,
    mapping_type: "LAB_SEC",
    ext_type: "LABORATORY DEPARTMENT",
    source: "NPHIES CLINICAL",
    dbConn: connection,
  });

  clientLogger.debug(
    `🗺️ 🧪 Dept LOINC for DEPT_NO ${masterRow.DEPT_NO}: ${JSON.stringify(deptLoinc)}`,
  );

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
    SPECIMEN_COLLECTION_TIME: dayjs(masterRow.SPECIMEN_COLLECTION_TIME).format('YYYYMMDDHHmmss') || "",
    SPECIMEN_COLLECTION_TIME_HUMAN_READABLE: masterRow.SPECIMEN_COLLECTION_TIME
      ? dayjs(masterRow.SPECIMEN_COLLECTION_TIME).format(
          "MMMM D, YYYY [at] h:mm:ss A",
        )
      : "",
    SPECIMEN_TYPE_CODE: specimen.ext_code || "UNK",
    SPECIMEN_TYPE_DISPLAY_NAME: specimen.ext_desc || "UNK",
    SPECIMEN_TYPE_TAG :specimen.ext_desc  ?  `<item ID="order_specimen_1_1-type">${specimen.ext_desc }</item>` : `<item ID="order_specimen_1_1-type" />`,

    SPECIMEN_SOURCE: masterRow.SPECIMEN_SOURCE || "UNK",
    SPECIMEN_COLLECTION_METHOD: masterRow.SPECIMEN_COLLECTION_METHOD || "UNK",
    SPECIMEN_HANDLING: masterRow.SPECIMEN_HANDLING || "UNK",
    SPECIMEN_RISK: masterRow.SPECIMEN_RISK || "UNK",
    SPECIMEN_RISKCOMMENT: masterRow.SPECIMEN_RISKCOMMENT || "UNK",

    ORDER_PRIORITY_DESC: orderPriority?.description || "Routine", // DONE

    TEST_LOINC: testLoinc.ext_code,
    TEST_LOINC_DESC: testLoinc.ext_desc,

    DEPT_LOINC_CODE: deptLoinc.ext_code,
    DEPT_LOINC_NAME: deptLoinc.ext_desc,
  };

  const cdaBodySection = processTemplate({
    template: cdaBodyTemplate,
    data,
    templateName: "labOrderCdaSpecialSection.xml",
  });
  const cdaServiceEvent = processTemplate({
    template: cdaServiceEventTemplate,
    data,
    templateName: "labOrderServiceEvent",
  });

  return { cdaBodySection, cdaServiceEvent };
}

export async function generateLabOrderEnvelopeSpecialSection(
  masterRow,
  documentEntryId,
  connection,
  parentData,
) {
  // Implementation for generating SOAP message for lab order
  const soapTemplate = loadTemplate("labOrderEnvelopeSpecialSection.xml");

  const deptLoinc = await getExtCode({
    oasis_code: masterRow.DEPT_NO,
    mapping_type: "LAB_SEC",
    ext_type: "LABORATORY DEPARTMENT",
    source: "NPHIES CLINICAL",
    dbConn: connection,
  });

  clientLogger.debug(
    `🗺️ 🧪 Dept LOINC for DEPT_NO ${masterRow.DEPT_NO}: ${JSON.stringify(deptLoinc)}`,
  );

  if (!deptLoinc?.ext_code) {
    const errorMessage = `No LOINC mapping found for ,DEPT_NO : ${masterRow.DEPT_NO || "''"}.`;
    await insertApiMessage({
      apiTransId: masterRow.transactionId,
      errorMessage: errorMessage,
      errorId: NPHIES_FAIL_ID.MAP_LOINC_DEPT,
    });
    clientLogger.debug(
      `⚠️ No LOINC mapping found for DEPT_NO ${masterRow.DEPT_NO || "''"},  HIS Source: "LAB_SEC", NPHIES CS Type: "LABORATORY DEPARTMENT"`,
    );
  }

  const data = {
    ...parentData,
    DEPT_LOINC_CODE: deptLoinc.ext_code,
    DEPT_LOINC_NAME: deptLoinc.ext_desc,
  };

  const processedSoapTemplate = processTemplate({
    template: soapTemplate,
    data,
    templateName: "labOrderEnvelopeSpecialSection.xml",
  });

  return processedSoapTemplate;
}
