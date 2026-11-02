import dayjs from "dayjs";
import { NPHIES_FAIL_ID } from "../util/constant.js";
import { getExtCode } from "../util/getExtCode.js";
import { insertApiMessage } from "../util/insertApiMsgs.js";
import { loadTemplate } from "../util/loadTemplates.js";
import { processTemplate } from "./processTemplate.js";
import { createAuthenticatorTag } from "./tags/createAuthenticatorTag.js";
import { createInFulfillmentOF } from "./tags/createInFulfillmentOF.js";
import { createLegalAuthenticatorTag } from "./tags/createLegalAuthenticatorTag.js";

function generateImagingServiceEvent({
  procedureCode,
  procedureDisplay,
  modalityCode,
  modalityDisplay,
  bodyRegionCode,
  bodyRegionDisplay,
}) {
  const xml = `<documentationOf>
		<serviceEvent>
			<templateId root="2.16.840.1.113883.3.3731.1.204.24" />
			<!-- Study Instance UID -->
			<id root="2.16.840.1.113883.3.3731.1.2.2.100.1.1.11000000002333.1.2.33333111.21" />
			<!-- Imaging Procedure Code and Description -->
			<code code="{{DATA.PROCEDURE_CODE}}" displayName="{{DATA.PROCEDURE_DISPLAY}}" codeSystem="2.16.840.1.113883.3.3731.1.204.15" codeSystemName="KSA Imaging Procedures" />
			<!-- Modality -->
			<nphies:modalityCode code="{{DATA.MODALITY_CODE}}" displayName="{{DATA.MODALITY_DISPLAY}}" codeSystem="1.2.840.10008.2.16.4" codeSystemName="DICOM Controlled Terminology" />
			<!-- Body Region -->
			<nphies:bodyRegionCode code="{{DATA.BODY_REGION_CODE}}" displayName="{{DATA.BODY_REGION_DISPLAY}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT" /> 
		</serviceEvent>
	</documentationOf>`;

  return processTemplate({
    template: xml,
    data: {
      PROCEDURE_CODE: procedureCode,
      PROCEDURE_DISPLAY: procedureDisplay,
      MODALITY_CODE: modalityCode,
      MODALITY_DISPLAY: modalityDisplay,
      BODY_REGION_CODE: bodyRegionCode,
      BODY_REGION_DISPLAY: bodyRegionDisplay,
    },
  });
}

function generateRadiologyReportBody() {
  return `		<component>
				<section>
				<templateId root="2.16.840.1.113883.3.3731.1.204.34" />
				<code code="57832-8" displayName="Prescription for diagnostic or specialist care" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" />
				<title>Radiology Order Section</title>
				<text>
					<paragraph styleCode="Bold">Additional Order Information</paragraph>
					<table>
						<thead>
							<tr>
								<th>Type</th>
								<th>Value</th>
							</tr>
						</thead>
						<tbody>
							<tr ID="order_addinfo_1_1">
								<td>50373000, Body Height Measure</td>
								<td>170 cm</td>
							</tr>
							<tr ID="order_addinfo_1_2">
								<td>16985007, Fasting</td>
								<td>true</td>
							</tr>
						</tbody>
					</table>
				</text>
				<!-- 
						Additional Order Information
				-->
				<entry>
					<organizer classCode="CLUSTER"
								moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.67"/>
						<statusCode code="completed"/>
						<component>
							<observation classCode="OBS"
											moodCode="EVN">
								<templateId root="2.16.840.1.113883.3.3731.1.210.100.68"/>
								<code code="50373000"
										displayName="Body Height Measure"
										codeSystem="2.16.840.1.113883.6.96"
										codeSystemName="SNOMED CT"/>
								<text>
									<reference value="#order_addinfo_1_1"/>
								</text>
								<value xsi:type="PQ"
										value="170"
										unit="cm"/>
							</observation>
						</component>
						<component>
							<observation classCode="OBS"
											moodCode="EVN">
								<templateId root="2.16.840.1.113883.3.3731.1.210.100.68"/>
								<code code="16985007"
										displayName="Fasting"
										codeSystem="2.16.840.1.113883.6.96"
										codeSystemName="SNOMED CT"/>
								<text>
									<reference value="#order_addinfo_1_2"/>
								</text>
								<value xsi:type="BL"
										value="true"/>
							</observation>
						</component>
					</organizer>
				</entry>
				<!--
						*************************************************
						Sub-Section: Request
						*************************************************
				-->
				<component>
					<section>
						<templateId root="2.16.840.1.113883.3.3731.1.204.35" />
						<code code="55115-0" displayName="Requested imaging studies information" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" />
						<title>Request</title>
						<text>
							<table>
								<thead>
									<tr>
										<th>Procedure</th>
										<th>Modality</th>
										<th>Body Region</th>
									</tr>
								</thead>
								<tbody>
									<tr ID="order_imgproc-1">
										<td ID="order_imgproc-1_procedure">{{DATA.PROCEDURE_DISPLAY}}</td>
										<td ID="order_imgproc-1_modality">{{DATA.MODALITY_DISPLAY}}</td>
										<td ID="order_imgproc-1_bodyregion">{{DATA.BODY_REGION_DISPLAY}}</td>
									</tr>
								</tbody>
							</table>
						</text>
						<!--
								Imaging Procedure Entry
						-->
						<entry typeCode="DRIV">
							<procedure classCode="PROC" moodCode="EVN">
								<templateId root="2.16.840.1.113883.3.3731.1.204.38" />
								<code code="{{DATA.PROCEDURE_CODE}}" displayName="{{DATA.PROCEDURE_DISPLAY}}" codeSystem="2.16.840.1.113883.3.3731.1.204.15" codeSystemName="KSA Imaging Procedures">
									<originalText>
										<reference value="#order_imgproc-1_procedure" />
									</originalText>
								</code>
								<text>
									<reference value="#order_imgproc-1" />
								</text>
								<statusCode code="completed" />
								<methodCode code="{{DATA.MODALITY_CODE}}" displayName="{{DATA.MODALITY_DISPLAY}}" codeSystem="1.2.840.10008.2.16.4" codeSystemName="DICOM Controlled Terminology">
									<originalText>
										<reference value="#order_imgproc-1_modality" />
									</originalText>
								</methodCode>
								<targetSiteCode code="{{DATA.BODY_REGION_CODE}}" displayName="{{DATA.BODY_REGION_DISPLAY}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
									<originalText>
										<reference value="#order_imgproc-1_bodyregion" />
									</originalText>
								</targetSiteCode>
							</procedure>
						</entry>
					</section>
				</component>
				<!--
						*************************************************
						Sub-Section: Procedure Indications
						*************************************************
				-->
				<component>
					<section>
						<templateId root="2.16.840.1.113883.3.3731.1.204.36" />
						<code code="59768-2" displayName="Procedure Indications" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" />
						<title>Procedure Indications</title>
						<!-- <text> Patient feels pressure on the lungs </text> -->
						<text> {{DATA.PROCEDURE_INDICATIONS}} </text>
					</section>
				</component>
				<!--
						*************************************************
						Sub-Section: Medical (General) History
						*************************************************
				-->
				<component>
					<section>
						<templateId root="2.16.840.1.113883.3.3731.1.204.37" />
						<code code="11329-0" displayName="History General" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" />
						<title>Medical (General) History</title>
						<!-- <text> No Information </text> -->
						<text> {{DATA.MEDICAL_HISTORY}} </text>
					</section>
				</component>
			</section>
			</component>			
			`;
}

async function processRowDetails(masterRows, connection) {
  if (!Array.isArray(masterRows)) masterRows = [masterRows];

  const rows = await Promise.all(
    masterRows.map(async (masterRow = {}, index) => {
      const procedure = await getExtCode({
        oasis_code: masterRow.IOS,
        mapping_type: "IMAGING_PROCEDURE",
        source: "NPHIES CLINICAL",
        ext_type: "IMAGING PROCEDURE",
        dbConn: connection,
      });

      if (!procedure?.ext_code) {
        clientLogger.debug(
          `No mapping found for IMAGING code: ${masterRow.IOS}`,
        );
        await insertApiMessage({
          apiTransId: masterRow.transactionId,
          errorMessage: `No mapping found for ,IMAGING PROCEDURE : ${masterRow.IOS || "''"}.`,
          errorId: NPHIES_FAIL_ID.MAP_PROCEDURE_CODE,
        });
      }

      const modality = await getExtCode({
        oasis_code: masterRow.MODALITY,
        mapping_type: "MODALITIES",
        source: "NPHIES CLINICAL",
        ext_type: "MODALITIES",
        dbConn: connection,
      });

      if (!modality?.ext_code) {
        clientLogger.debug(
          `No mapping found for modality code: ${masterRow.MODALITY}`,
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
          errorMessage: `No mapping found for ,body region code : ${bodyRegionCode || "''"} ,order line : ${masterRow.ORDER_LINE || "''"}`,
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

export async function generateRadiologyResultCdaSpecialSection(
  masterRow,
  connection,
) {
  const rows = await processRowDetails(masterRow, connection);

  const serviceEvent = generateImagingServiceEvent({
    procedureCode: rows[0].procedureCode,
    procedureDisplay: rows[0].procedureDisplay,
    modalityCode: rows[0].modalityCode,
    modalityDisplay: rows[0].modalityDisplay,
    bodyRegionCode: rows[0].bodyRegionCode,
    bodyRegionDisplay: rows[0].bodyRegionDisplay,
  });

  const reportBody = generateRadiologyReportBody();
  const enrichedReportBody = processTemplate({
    template: reportBody,
    data: {
      PROCEDURE_CODE: rows[0].procedureCode,
      PROCEDURE_DISPLAY: rows[0].procedureDisplay,
      MODALITY_CODE: rows[0].modalityCode,
      MODALITY_DISPLAY: rows[0].modalityDisplay,
      BODY_REGION_CODE: rows[0].bodyRegionCode,
      BODY_REGION_DISPLAY: rows[0].bodyRegionDisplay,
      PROCEDURE_INDICATIONS: "Patient feels pressure on the lungs",
      MEDICAL_HISTORY: "No Information",
    },
  });

  const authenticatorTag = createAuthenticatorTag({
    ...masterRow,
    CREATION_DATE_FORMATTED: dayjs(masterRow.CREATION_DATE).format(
      "YYYYMMDDHHmmssZ",
    ).replace(':', '')
  });
  const legalAuthenticatorTag = createLegalAuthenticatorTag({
    ...masterRow,
    CREATION_DATE_FORMATTED: dayjs(masterRow.CREATION_DATE).format(
      "YYYYMMDDHHmmssZ",
    ).replace(':', '')
  });

  //   masterRow.ACCESSION_BLOCK = ` <ps3-20:accessionNumber extension="${masterRow.ACCESSION_NO}" root="2.16.840.1.113883.3.3731.1.2.2.100.1.1.${masterRow.FACILITY.nphies_cs_org_id}.1" />  `;
  masterRow.ACCESSION_BLOCK = ` <ps3-20:accessionNumber extension="${masterRow.ACCESSION_NO}" root="${masterRow.FULL_ORG_ID}.9" />  `;

  const inFulfillmentOFTag = createInFulfillmentOF({
    ...masterRow,
    ORDER_LINE_BLOCK: `<id extension="${masterRow.PREFIX}-${masterRow.ORDER_LINE}" root="${masterRow.FULL_ORG_ID}${masterRow.ORDER_ID}"/>`,
  });

  return {
    cdaServiceEvent: serviceEvent,
    cdaBodySection: enrichedReportBody,
    authenticatorTag: authenticatorTag,
    legalAuthenticatorTag: legalAuthenticatorTag,
    inFulfillmentOFTag: inFulfillmentOFTag,
  };
}

export async function generateRadiologyResultEnvelopeSpecialSection(
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
