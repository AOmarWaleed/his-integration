import { loadTemplate } from "../util/loadTemplates.js";
import { executeSqlFile, getRelativePath } from "../util/runQueryFromFile.js";
import { escapeXml, processTemplate } from "./processTemplate.js";
import { CLINICAL_NOTES_LOGGER } from "../config/logger.js";
import { createPerformerTag } from "./tags/createPerformerTag.js";
import { createLegalAuthenticatorTag } from "./tags/createLegalAuthenticatorTag.js";
import oracledb from "oracledb";
import { query } from "../config/pgDB.js";
import { insertApiMessage } from "../util/insertApiMsgs.js";
import { fetchDosage } from "../util/fetchDosage.js";
import { getExtCode } from "../util/getExtCode.js";
import { getExtDescription } from "../util/getExtDescription.js";
import { NPHIES_FAIL_ID } from "../util/constant.js";
import dayjs from "dayjs";

const operativeNotesSectionPlaceholders = [
  {
    key: "PREOPERATIVE_DIAGNOSIS",
    title: "Preoperative Diagnosis",
    isLoop: true,
  },
  {
    key: "POSTPROCEDURE_DIAGNOSIS",
    title: "Postprocedure Diagnosis",
    isLoop: true,
  },
  {
    key: "OPERATIVE_NOTE_SURGICAL_PROCEDURE",
    title: "Operative Note Surgical Procedure",
  },
  { key: "PROCEDURE_FINDINGS", title: "Procedure Findings" },
  { key: "SURGICAL_DRAINS", title: "Surgical Drains" },
  { key: "PROCEDURE_SPECIMENS_TAKEN", title: "Procedure Specimens Taken" },
  { key: "COMPLICATIONS", title: "Complications" },
  { key: "ANESTHESIA", title: "Anesthesia" },
  { key: "ESTIMATED_BLOOD_LOSS", title: "Estimated Blood Loss" },
  { key: "OPERATIVE_NOTE_FLUIDS", title: "Operative Note Fluids" },
  { key: "PROCEDURE_DESCRIPTION", title: "Procedure Description" },
  { key: "ACTIVE_PROBLEMS", title: "Active problems", isLoop: true },
  {
    key: "VISIBLE_IMPLANTED_MEDICAL_DEVICES",
    title: "Visible Implanted Medical Devices",
  },
  {
    key: "HISTORY_OF_BLOOD_TRANSFUSION",
    title: "History of Blood Transfusion",
  },
  { key: "ACUITY_ASSESSMENT", title: "Acuity Assessment" },
  { key: "CARE_PLAN", title: "Care Plan" },
  {
    key: "POSTOPERATIVE_DIAGNOSIS",
    title: "Postoperative Diagnosis",
    isLoop: true,
  },
  { key: "PLANNED_PROCEDURE", title: "Planned Procedure", isLoop: true },
  { key: "PROCEDURE_DISPOSITION", title: "Procedure Disposition" },
];

const outpatientEncounterSummarySectionPlaceholders = [
  {
    key: "CHIEF_COMPLAINT",
    title: "Chief Complaint",
  },
  //   Reason for Referral
  {
    key: "REASON_FOR_REFERRAL",
    title: "Reason for Referral",

    isLoop: true,
  },
  {
    key: "HISTORY_OF_PRESENT_ILLNESS",
    title: "History of Present Illness",
  },
  //    Allergies and Adverse Reactions Section
  {
    key: "ALLERGIES_AND_ADVERSE_REACTIONS",
    title: "Allergies and Adverse Reactions",
    isLoop: true,
  },
  //   Active Problems
  {
    key: "ACTIVE_PROBLEMS",
    title: "Active Problems",
    isLoop: true,
  },
  //    Medications Section
  {
    key: "MEDICATIONS",
    title: "Medications List",
    isLoop: true,
  },
  //    List of Surgeries
  {
    key: "LIST_OF_SURGERIES",
    title: "List of Surgeries",
  },
  //   Surgical Drains
  {
    key: "SURGICAL_DRAINS",
    title: "Surgical Drains",
  },
  //   Blood Group Coded Results
  {
    key: "BLOOD_GROUP_CODED_RESULTS",
    title: "Blood Group Test Results",
    isLoop: true,
  },
  //   Immunizations
  {
    key: "IMMUNIZATIONS",
    title: "Immunizations",
    isLoop: true,
  },
  //   Vital Signs
  {
    key: "VITAL_SIGNS",
    title: "Vital Signs",
    isLoop: true,
  },
  //   Physical Examination
  {
    key: "PHYSICAL_EXAMINATION",
    title: "Physical Examination",
  },
  //   Visible Implanted Medical Devices
  {
    key: "VISIBLE_IMPLANTED_MEDICAL_DEVICES",
    title: "Visible Implanted Medical Devices",
  },
  //   Assessment and Plan
  {
    key: "ASSESSMENT_AND_PLAN",
    title: "Assessment and Plan",
  },
  //   Care Plan
  {
    key: "CARE_PLAN",
    title: "Care Plan",
  },
];
const dischargeSummarySectionPlaceholders = [
  {
    key: "CHIEF_COMPLAINT",
    title: "Chief Complaint",
  },
  //   Reason for Referral
  {
    key: "ADMITTING_DIAGNOSIS",
    title: "Admitting Diagnosis",

    isLoop: true,
  },
  {
    key: "HISTORY_OF_PRESENT_ILLNESS",
    title: "History of Present Illness",
  },
  //    Allergies and Adverse Reactions Section
  {
    key: "ALLERGIES_AND_ADVERSE_REACTIONS",
    title: "Allergies and Adverse Reactions",
    isLoop: true,
    // isRequired : true
  },
  //   Active Problems
  {
    key: "ACTIVE_PROBLEMS",
    title: "Active Problems",
    isLoop: true,
  },
  //    Medications Section
  {
    key: "MEDICATIONS_HISTORY_ON_ADMISSION",
    title: "Medications History on Admission",
    isLoop: true,
  },
  //    List of Surgeries
  {
    key: "BLOOD_GROUP_CODED_RESULTS",
    title: "Blood Group Test Results",
    isLoop: true,
  },
  //   Hospital Course
  {
    key: "HOSPITAL_COURSE",
    title: "Hospital Course",
  },
  //   List of Surgeries
  {
    key: "LIST_OF_SURGERIES",
    title: "List of Surgeries",
    isLoop: true,
  },
  //   Surgical Drains
  {
    key: "SURGICAL_DRAINS",
    title: "Surgical Drains",
  },
  //   Medications Administered
  {
    key: "MEDICATIONS_ADMINISTERED",
    title: "Medications Administered",
    isLoop: true,
  },
  //   Immunizations
  {
    key: "IMMUNIZATIONS",
    title: "Immunizations",
    isLoop: true,
  },
  //   Vital Signs
  {
    key: "VITAL_SIGNS",
    title: "Vital Signs",
    isLoop: true,
  },
  //   Physical Examination
  {
    key: "PHYSICAL_EXAMINATION",
    title: "Physical Examination",
  },
  //   Visible Implanted Medical Devices
  {
    key: "VISIBLE_IMPLANTED_MEDICAL_DEVICES",
    title: "Visible Implanted Medical Devices",
  },
  // Hospital Discharge Medications
  {
    key: "HOSPITAL_DISCHARGE_MEDICATIONS",
    title: "Hospital Discharge Medications",
    isLoop: true,
  },

  // CARE_PLAN
  {
    key: "CARE_PLAN",
    title: "Care Plan",
  },

  // Discharge Diagnosis
  {
    key: "DISCHARGE_DIAGNOSIS",
    title: "Discharge Diagnosis",
    isLoop: true,
  },

  // Discharge Disposition
  {
    key: "DISCHARGE_DISPOSITION",
    title: "Discharge Disposition",
  },
];

const dischargeSummaryNewBornSectionPlaceholders = [
  {
    title: "Newborn Screening Test Results",
    key: "NEWBORN_SCREENING_TEST_RESULTS",
    isLoop: true,
  },
];
const dischargeSummaryMaternalSectionPlaceholders = [
  { title: "Pregnancy History", key: "PREGNANCY_HISTORY", isLoop: true },
  {
    title: "Labor and Delivery Events",
    key: "LABOR_AND_DELIVERY_EVENTS",
    isLoop: true,
  },
  {
    title: "Delivery Event Outcome",
    key: "DELIVERY_EVENT_OUTCOME",
    isLoop: true,
  },
  {
    title: "Newborn Status at Maternal Discharge",
    key: "NEWBORN_STATUS_AT_MATERNAL_DISCHARGE",
    isLoop: true,
  },
];

export async function generateClinicalNotesCdaSpecialSection(
  masterRow,
  connection,
  parentData,
) {
  let newTitle = "";
  let newCode = "";
  let codeDisplay = "";
  const preOpDiagTemplate = `<tr ID="preopdiag-{{DATA.INDEX}}">
								<td ID="preopdiag-{{DATA.INDEX}}_diagnosis">{{DATA.ICD_CODE}}, {{DATA.DESCRIPTION}}</td>
								<td>{{DATA.DATE_RECORDED_FORMATTED}}</td>
								<td>{{DATA.END_DATE_FORMATTED}}</td>
								<td>{{DATA.STATUS}}</td>
							</tr>`;

  const preOpDiagEntryTemplate = `<entry typeCode="DRIV">
					<act classCode="ACT" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.43"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.1"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.2"/>
						<templateId root="2.16.840.1.113883.10.20.1.27"/>
						<id nullFlavor="NI"/>
						<code nullFlavor="NA"/>
						<statusCode code="active"/>
						<effectiveTime>
							<low value="{{DATA.DATE_RECORDED_COMPACT}}"/>
							{{DATA.HIGH_DATE_TAG}}
						</effectiveTime>
						<entryRelationship typeCode="SUBJ" inversionInd="false">
							<observation classCode="OBS" moodCode="EVN">
								<templateId root="2.16.840.1.113883.3.3731.1.210.100.44"/>
								<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5"/>
								<templateId root="2.16.840.1.113883.10.20.1.28"/>
								<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
								<code code="282291009" displayName="Diagnosis" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT"/>
								<text>
									<reference value="#preopdiag-{{DATA.INDEX}}"/>
								</text>
								<statusCode code="completed"/>
								<effectiveTime>
									<low value="{{DATA.DATE_RECORDED_COMPACT}}"/>
								</effectiveTime>
								<value xsi:type="CD" code="{{DATA.ICD_CODE}}" displayName="{{DATA.DESCRIPTION}}" codeSystem="2.16.840.1.113883.6.135" codeSystemName="ICD10-AM">
									<originalText>
										<reference value="#preopdiag-{{DATA.INDEX}}_diagnosis"/>
									</originalText>
								</value>
							</observation>
						</entryRelationship>
					</act>
				</entry>`;

  const postProcDiagTemplate = `<tr ID="postprocdiag-{{DATA.INDEX}}">
								<td ID="postprocdiag-{{DATA.INDEX}}_diagnosis">{{DATA.ICD_CODE}}, {{DATA.DESCRIPTION}}</td>
								<td>{{DATA.DATE_RECORDED_FORMATTED}}</td>
								<td>{{DATA.END_DATE_FORMATTED}}</td>
								<td>{{DATA.STATUS}}</td>
							</tr>`;

  const postProcDiagEntryTemplate = `<entry typeCode="DRIV">
					<act classCode="ACT" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.43"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.1"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.2"/>
						<templateId root="2.16.840.1.113883.10.20.1.27"/>
						<id nullFlavor="NI"/>
						<code nullFlavor="NA"/>
						<statusCode code="active"/>
						<effectiveTime>
							<low value="{{DATA.DATE_RECORDED_COMPACT}}"/>
							{{DATA.HIGH_DATE_TAG}}
						</effectiveTime>
						<entryRelationship typeCode="SUBJ" inversionInd="false">
							<observation classCode="OBS" moodCode="EVN">
								<templateId root="2.16.840.1.113883.3.3731.1.210.100.44"/>
								<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5"/>
								<templateId root="2.16.840.1.113883.10.20.1.28"/>
								<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
								<code code="282291009" displayName="Diagnosis" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT"/>
								<text>
									<reference value="#postprocdiag-{{DATA.INDEX}}"/>
								</text>
								<statusCode code="completed"/>
								<effectiveTime>
									<low value="{{DATA.DATE_RECORDED_COMPACT}}"/>
								</effectiveTime>
								<value xsi:type="CD" code="{{DATA.ICD_CODE}}" displayName="{{DATA.DESCRIPTION}}" codeSystem="2.16.840.1.113883.6.135" codeSystemName="ICD10-AM">
									<originalText>
										<reference value="#postprocdiag-{{DATA.INDEX}}_diagnosis"/>
									</originalText>
								</value>
							</observation>
						</entryRelationship>
					</act>
				</entry>`;

  const activeProblemsTemplate = `<tr ID="actproblem-{{DATA.INDEX}}">
								<td ID="actproblem-{{DATA.INDEX}}_diagnosis">{{DATA.ICD_CODE}}, {{DATA.DESCRIPTION}}</td>
								<td>{{DATA.START_DATE_FORMATTED}}</td>
								<td>{{DATA.END_DATE_FORMATTED}}</td>
								<td>{{DATA.STATUS}}</td>
							</tr>`;

  const activeProblemsEntryTemplate = `<entry typeCode="DRIV">
					<act classCode="ACT" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.43"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.1"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.2"/>
						<templateId root="2.16.840.1.113883.10.20.1.27"/>
						<id nullFlavor="NI"/>
						<code nullFlavor="NA"/>
						<statusCode code="completed"/>
						<effectiveTime nullFlavor="NA">
							<low nullFlavor="UNK"/>
							<high nullFlavor="UNK"/>
						</effectiveTime>
						<entryRelationship typeCode="SUBJ" inversionInd="false">
							<observation classCode="OBS" moodCode="EVN">
								<templateId root="2.16.840.1.113883.3.3731.1.210.100.44"/>
								<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5"/>
								<templateId root="2.16.840.1.113883.10.20.1.28"/>
								<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
								<code code="282291009" displayName="Diagnosis" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT"/>
								<text>
									<reference value="#actproblem-{{DATA.INDEX}}"/>
								</text>
								<statusCode code="completed"/>
								<effectiveTime nullFlavor="NA">
									<low nullFlavor="UNK"/>
									<high nullFlavor="UNK"/>
								</effectiveTime>
								<value xsi:type="CD" code="{{DATA.ICD_CODE}}" displayName="{{DATA.DESCRIPTION}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
									<originalText>
										<reference value="#actproblem-{{DATA.INDEX}}_diagnosis"/>
									</originalText>
								</value>
							</observation>
						</entryRelationship>
					</act>
				</entry>`;

  const postOpDiagTemplate = `<tr ID="postopdiag-{{DATA.INDEX}}">
								<td ID="postopdiag-{{DATA.INDEX}}_diagnosis">{{DATA.ICD_CODE}}, {{DATA.DESCRIPTION}}</td>
								<td>{{DATA.DATE_RECORDED_FORMATTED}}</td>
								<td>{{DATA.END_DATE_FORMATTED}}</td>
								<td>{{DATA.STATUS}}</td>
							</tr>`;

  const postOpDiagEntryTemplate = `<entry typeCode="DRIV">
					<act classCode="ACT" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.43"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.1"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.2"/>
						<templateId root="2.16.840.1.113883.10.20.1.27"/>
						<id nullFlavor="NI"/>
						<code nullFlavor="NA"/>
						<statusCode code="active"/>
						<effectiveTime>
							<low value="{{DATA.DATE_RECORDED_COMPACT}}"/>
							{{DATA.END_DATE_TAG}}
						</effectiveTime>
						<entryRelationship typeCode="SUBJ" inversionInd="false">
							<observation classCode="OBS" moodCode="EVN">
								<templateId root="2.16.840.1.113883.3.3731.1.210.100.44"/>
								<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5"/>
								<templateId root="2.16.840.1.113883.10.20.1.28"/>
								<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
								<code code="282291009" displayName="Diagnosis" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT"/>
								<text>
									<reference value="#postopdiag-{{DATA.INDEX}}"/>
								</text>
								<statusCode code="completed"/>
								<effectiveTime>
									<low value="{{DATA.DATE_RECORDED_COMPACT}}"/>
								</effectiveTime>
								<value xsi:type="CD" code="{{DATA.ICD_CODE}}" displayName="{{DATA.DESCRIPTION}}" codeSystem="2.16.840.1.113883.6.135" codeSystemName="ICD10-AM">
									<originalText>
										<reference value="#postopdiag-{{DATA.INDEX}}_diagnosis"/>
									</originalText>
								</value>
							</observation>
						</entryRelationship>
					</act>
				</entry>`;

  const plannedProcTemplate = `<tr ID="plannedproc-{{DATA.INDEX}}">
								<td ID="plannedproc-{{DATA.INDEX}}_procedure">{{DATA.PROC_CODE}}, {{DATA.PROC_DESC}}</td>
								<td>{{DATA.PROC_DATE}}</td>
								<td ID="plannedproc-{{DATA.INDEX}}_priority">{{DATA.PRIORITY}}</td>
							</tr>`;

  const plannedProcEntryTemplate = `<entry typeCode="DRIV">
					<procedure classCode="PROC" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.53"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.19"/>
						<templateId root="2.16.840.1.113883.10.20.1.29"/>
						<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
						<code code="{{DATA.PROC_CODE}}" displayName="{{DATA.PROC_DESC}}" codeSystem="2.16.840.1.113883.3.3731.50.2" codeSystemName="ACHI">
							<originalText>
								<reference value="#plannedproc-{{DATA.INDEX}}_procedure"/>
							</originalText>
						</code>
						<text>
							<reference value="#plannedproc-{{DATA.INDEX}}"/>
						</text>
						<statusCode code="active"/>
						<effectiveTime>
							<low value="{{DATA.PROC_DATE_GREGORIAN}}"/>
						</effectiveTime>
						<priorityCode code="{{DATA.PRIORITY_CODE}}" displayName="{{DATA.PRIORITY}}" codeSystem="2.16.840.1.113883.5.7">
							<originalText>
								<reference value="#plannedproc-{{DATA.INDEX}}_priority"/>
							</originalText>
						</priorityCode>
					</procedure>
				</entry>`;

  const medicationRowTemplate = `
   <table ID="medications-{{DATA.INDEX}}">
				<tbody>
       <tr>
                        <td>Medication Item</td>
                        <td>{{DATA.INDEX}}</td>
                    </tr>
                    <tr>
                        <td>Medication ID</td>
                        <!-- CE1215CD-69EC-4C7B-805F-569233C5E159 -->
                        <td>{{DATA.MEDICATION_ID}}</td>
                    </tr>
                    <tr>
                        <td>Medication Name</td>
                        <td>{{DATA.MEDICATION_NAME}}</td>
                    </tr>
                    <tr>
                        <td>Medication Code</td>
                        <td>
                            <content ID="medadmission-{{DATA.INDEX}}_prodcode">{{DATA.MED_CODE}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Pharmaceutical Dose Form</td>
                        <td>
                            <content ID="medadmission-{{DATA.INDEX}}_doseform">{{DATA.DOSE_FORM}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Start / End / Duration of treatment</td>
                        <td>{{DATA.MED_DURATION}}</td>
                    </tr>
                    <tr>
                        <td>Dose / Frequency</td>
                        <td>
                            <content ID="medadmission-{{DATA.INDEX}}_dose">{{DATA.DOSE}}</content> / {{DATA.FREQUENCY}}
                        </td>
                    </tr>
                    <tr>
                        <td>Route of Administration</td>
                        <td>
                            <content ID="medadmission-{{DATA.INDEX}}_route">{{DATA.ROUTE}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Approach Site</td>
                         <!--TODO CHECK WALID-->
                        <td>{{DATA.APPROACH_SITE#-}}</td>
                    </tr>
                    <tr>
                        <td>Patient Medication Instructions</td>
                        <td>
                             <!--TODO CHECK WALID-->
                            <content ID="medadmission-{{DATA.INDEX}}_pinstruct">{{DATA.INSTRUCTIONS#-}}</content>
                        </td>
                    </tr>

   </tbody>
   </table>
   `;

  const medicationEntryTemplate = `
    <entry typeCode="DRIV">
    <substanceAdministration classCode="SBADM" moodCode="INT">
        <templateId root="2.16.840.1.113883.3.3731.1.210.100.45"/>
        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7"/>
        <templateId root="2.16.840.1.113883.10.20.1.24"/>
        <templateId root="2.16.840.1.113883.3.3731.1.210.100.46"/>
        <templateId root="1.3.6.1.4.1.19376.1.9.1.3.6"/>
        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7.1"/>
        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.21"/>
        <id root="{{DATA.MEDICATION_ID}}"/>
        <text>
            <reference value="#medadmission-{{DATA.INDEX}}"/>
        </text>
        <statusCode code="completed"/>
        <effectiveTime xsi:type="IVL_TS">
            <width value="{{DATA.MED_DURATION_VALUE}}" unit="{{DATA.MED_DURATION_UNIT}}"/>
        </effectiveTime>
        <effectiveTime xsi:type="PIVL_TS" operator="A" institutionSpecified="true">
            <period value="{{DATA.FREQUENCY_VALUE}}" unit="{{DATA.FREQUENCY_UNIT}}"/>
        </effectiveTime>
        <routeCode code="{{DATA.ROUTE_CODE}}" displayName="{{DATA.ROUTE}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
            <originalText>
                <reference value="#medadmission-{{DATA.INDEX}}_route"/>
            </originalText>
        </routeCode>
        <doseQuantity value="{{DATA.DOSE_VALUE}}" unit="{{DATA.DOSE_UNIT}}">
            <translation>
                <originalText>
                    <reference value="#medadmission-{{DATA.INDEX}}_dose"/>
                </originalText>
            </translation>
        </doseQuantity>
        <consumable>
            <manufacturedProduct classCode="MANU">
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7.2"/>
                <templateId root="2.16.840.1.113883.10.20.1.53"/>
                <manufacturedMaterial classCode="MMAT" determinerCode="KIND">
                    <code code="{{DATA.MED_CODE}}" displayName="{{DATA.MEDICATION_NAME}}" codeSystem="2.16.840.1.113883.3.3731.1.205.2" codeSystemName="KSA Dispensation Pharmacy Item Name">
                        <originalText>
                            <reference value="#medadmission-{{DATA.INDEX}}_prodcode"/>
                        </originalText>
                    </code>
                    <name>{{DATA.MEDICATION_NAME}}</name>
                    <pharm:formCode code="{{DATA.DOSE_FORM_CODE}}" displayName="{{DATA.DOSE_FORM}}" codeSystem="2.16.840.1.113883.3.3731.1.205.8" codeSystemName="KSA Medication Pharmaceutical Dose Form">
                        <originalText>
                            <reference value="#medadmission-{{DATA.INDEX}}_doseform"/>
                        </originalText>
                    </pharm:formCode>
                    <pharm:ingredient classCode="ACTI">
                        <pharm:quantity>
                            <numerator xsi:type="PQ" value="{{DATA.DOSE_VALUE}}" unit="{{DATA.DOSE_UNIT}}"/>
                            <denominator xsi:type="INT" value="1"/>
                        </pharm:quantity>
                    </pharm:ingredient>
                </manufacturedMaterial>
            </manufacturedProduct>
        </consumable>
        <entryRelationship typeCode="SUBJ" inversionInd="true">
            <act classCode="ACT" moodCode="INT">
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.3"/>
                <templateId root="2.16.840.1.113883.10.20.1.49"/>
                <code code="PINSTRUCT" codeSystem="1.3.6.1.4.1.19376.1.5.3.2" codeSystemName="IHEActCode"/>
                <text>
                    <reference value="#medadmission-{{DATA.INDEX}}_pinstruct"/>
                </text>
                <statusCode code="completed"/>
            </act>
        </entryRelationship>
    </substanceAdministration>
</entry> 
   `;

  const sectionsHaveRowsEntry = {
    PREOPERATIVE_DIAGNOSIS: {
      row: preOpDiagTemplate,
      entry: preOpDiagEntryTemplate,
    },
    POSTPROCEDURE_DIAGNOSIS: {
      row: postProcDiagTemplate,
      entry: postProcDiagEntryTemplate,
    },
    // OPERATIVE_NOTE_SURGICAL_PROCEDURE
    // PROCEDURE_FINDINGS
    // SURGICAL_DRAINS
    // PROCEDURE_SPECIMENS_TAKEN
    // COMPLICATIONS
    // ANESTHESIA
    // ESTIMATED_BLOOD_LOSS
    // OPERATIVE_NOTE_FLUIDS
    // PROCEDURE_DESCRIPTION
    ACTIVE_PROBLEMS: {
      row: activeProblemsTemplate,
      entry: activeProblemsEntryTemplate,
    },
    // VISIBLE_IMPLANTED_MEDICAL_DEVICES
    // HISTORY_OF_BLOOD_TRANSFUSION
    // ACUITY_ASSESSMENT
    // CARE_PLAN
    POSTOPERATIVE_DIAGNOSIS: {
      row: postOpDiagTemplate,
      entry: postOpDiagEntryTemplate,
    },
    PLANNED_PROCEDURE: {
      row: plannedProcTemplate,
      entry: plannedProcEntryTemplate,
    },
    // PROCEDURE_DISPOSITION

    // !!! DISCHARGE_SUMMARY sections

    ADMITTING_DIAGNOSIS: {
      row: `
       <tr ID="admdiag-{{DATA.INDEX}}">
                        <td ID="admdiag-{{DATA.INDEX}}_diagnosis">{{DATA.ICD_CODE}} ,{{DATA.DESCRIPTION}}</td>
                        <td>{{DATA.DATE_RECORDED_FORMATTED}}</td>
                        <td>{{DATA.END_DATE_FORMATTED#-}}</td>
                        <td>Active</td>
                    </tr>
      `,

      entry: ` <entry typeCode="DRIV">
            <act classCode="ACT" moodCode="EVN">
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.43"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.1"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.2"/>
                <templateId root="2.16.840.1.113883.10.20.1.27"/>
                <id nullFlavor="NI"/>
                <code nullFlavor="NA"/>
                <statusCode code="active"/>
                <effectiveTime>
                    <low value="{{DATA.DATE_RECORDED_COMPACT}}"/>
                </effectiveTime>
                <entryRelationship typeCode="SUBJ" inversionInd="false">
                    <observation classCode="OBS" moodCode="EVN">
                        <templateId root="2.16.840.1.113883.3.3731.1.210.100.44"/>
                        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5"/>
                        <templateId root="2.16.840.1.113883.10.20.1.28"/>
                        <id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
                        <code code="282291009" displayName="Diagnosis" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT"/>
                        <text>
                            <reference value="#admdiag-{{DATA.INDEX}}"/>
                        </text>
                        <statusCode code="completed"/>
                        <effectiveTime>
                            <low value="{{DATA.DATE_RECORDED_COMPACT}}"/>
                        </effectiveTime>
                        <value xsi:type="CD" code="{{DATA.ICD_CODE}}" displayName="{{DATA.DESCRIPTION}}" codeSystem="2.16.840.1.113883.6.135" codeSystemName="ICD10-AM">
                            <originalText>
                                <reference value="#admdiag-{{DATA.INDEX}}_diagnosis"/>
                            </originalText>
                        </value>
                    </observation>
                </entryRelationship>
            </act>
        </entry>`,
    },
    MEDICATIONS_LIST: {
      row: medicationRowTemplate,
      entry: medicationEntryTemplate,
    },

    ALLERGIES_AND_ADVERSE_REACTIONS: {
      row: `
        <tr ID="allergy-{{DATA.INDEX}}">
                        <td ID="allergy-{{DATA.INDEX}}_type">{{DATA.ALLERGYTYPE}}</td>
                        <td ID="allergy-{{DATA.INDEX}}_substance">{{DATA.ALLERGYSUBTYPE}}</td>
                        <td>{{DATA.ADDED_DATE_FORMATTED}}</td>
                        <td>{{DATA.REMOVED_DATE_FORMATTED}}</td>
                        <td>Active</td>
                    </tr>
      `,
      entry: `
      <entry typeCode="DRIV">
            <act classCode="ACT" moodCode="EVN">
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.51"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.1"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.3"/>
                <templateId root="2.16.840.1.113883.10.20.1.27"/>
                <id nullFlavor="NI"/>
                <code nullFlavor="NA"/>
                <statusCode code="active"/>
                <effectiveTime>
                    <low nullFlavor="UNK"/>
                </effectiveTime>
                <entryRelationship typeCode="SUBJ" inversionInd="false">
                    <observation classCode="OBS" moodCode="EVN">
                        <templateId root="2.16.840.1.113883.3.3731.1.210.100.52"/>
                        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5"/>
                        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.6"/>
                        <templateId root="2.16.840.1.113883.10.20.1.18"/>
                        <id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
                        <code code="ALG" displayName="Allergy" codeSystem="2.16.840.1.113883.5.4" codeSystemName="HL7 ActCodes">
                            <originalText>
                                <reference value="#allergy-{{DATA.INDEX}}_type"/>
                            </originalText>
                        </code>
                        <text>
                            <reference value="#allergy-{{DATA.INDEX}}"/>
                        </text>
                        <statusCode code="completed"/>
                        <effectiveTime>
                            <low nullFlavor="UNK"/>
                        </effectiveTime>
                        <value xsi:type="CD" nullFlavor="NA"/>
                        <participant typeCode="CSM">
                            <participantRole classCode="MANU">
                                <playingEntity classCode="MMAT">
                                    <code code="{{DATA.ALLERGYCODE}}" displayName="{{DATA.ALLERGYDESCRIPTION}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
                                        <originalText>
                                            <reference value="#allergy-{{DATA.INDEX}}_substance"/>
                                        </originalText>
                                    </code>
                                </playingEntity>
                            </participantRole>
                        </participant>
                    </observation>
                </entryRelationship>
            </act>
        </entry>
      `,
    },

    //     SELECT DISTINCT IMN.PRODUCT_CODE,
    //                 IMN.IOS_MAIN,
    //                 IMN.DESCRIPTION,
    //                 IMN.NATIONAL_DRUG_CODING SFDA,
    //                 ORDER_UTL.GET_MEDICATION_ORDER_DESC (OL.ORDER_LINE) DOSAGE_DESC,
    //                 OL.LINE_ORDER_DATE,
    //                 OM.MASTER_ORDER_NO ORDER_NO,
    //                 OL.ORDER_LINE,
    //                 OL.STATUS ORDER_STATUS,
    //                 OM.PATIENT_ID,
    //                 OM.EPISODE_NO,
    //                 OM.ATTENDANCE_TYPE AS ENCOUNTER_TYPE,
    //                 OM.ADMISSION_NO ENCOUNTER_ID,
    //                 OM.HL7_ENCOUNTER AS ENCOUNTER_IDENTIFIER,
    //                 PE.START_DATE EPISODE_START_DATE,
    //                 PE.END_DATE EPISODE_END_DATE
    //   FROM ORDER_LINES OL
    //        JOIN IOS_MASTER_DATA IMS ON OL.IOS = IMS.IOS
    //        JOIN IOS_MAIN_DATA IMN ON IMN.IOS_MAIN = IMS.IOS_MAIN
    //        JOIN ORDERS_MASTER OM ON OM.MASTER_ORDER_NO = OL.MASTER_ORDER_NO
    //        JOIN PH_IOS_MEDICINE M ON M.IOS_MAIN = IMN.IOS_MAIN
    //        JOIN PATIENT_EPISODES PE
    //           ON     PE.PATIENT_ID = OM.PATIENT_ID
    //              AND PE.EPISODE_NO = OM.EPISODE_NO
    //  WHERE     1 = 1
    //        AND OL.STATUS IN ('D', 'R')
    //        AND OM.PATIENT_ID = :P_PATIENT_ID
    //        AND OM.EPISODE_NO = :P_EPISODE_NO

    MEDICATIONS_HISTORY_ON_ADMISSION: {
      row: medicationRowTemplate,
      entry: medicationEntryTemplate,
      DEFAULT: {
        row: `
        <tr ID="medications-{{DATA.INDEX}}">
									<td ID="medications-{{DATA.INDEX}}_code">{{DATA.MED_CODE}}</td>
									<td>{{DATA.DESCRIPTION}}</td>
								</tr>
        `,
        entry: `
        <entry typeCode="DRIV">
						<!--
							=====================================================================
								No medication
							=====================================================================
						-->
						<substanceAdministration classCode="SBADM"
						                         moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.45"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7"/>
							<templateId root="2.16.840.1.113883.10.20.1.24"/>
							<!-- Medication Item ID -->
							<id root="CE1215CD-69EC-4C7B-805F-569233C5E1510"/>
							<code code="{{DATA.MED_CODE}}"
							      displayName="{{DATA.DESCRIPTION}}"
							      codeSystem="2.16.840.1.113883.6.96"
							      codeSystemName="SNOMED CT">
								<originalText>
									<reference value="#medications-{{DATA.INDEX}}_code"/>
								</originalText>
							</code>
							<text>
								<reference value="#medications-{{DATA.INDEX}}"/>
							</text>
							<statusCode code="completed"/>
							<!-- Medication -->
							<consumable>
								<manufacturedProduct classCode="MANU">
									<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7.2"/>
									<templateId root="2.16.840.1.113883.10.20.1.53"/>
									<manufacturedMaterial classCode="MMAT"
									                      determinerCode="KIND"
									                      nullFlavor="NI"/>
								</manufacturedProduct>
							</consumable>
						</substanceAdministration>
					</entry>
        `,
      },
    },
    BLOOD_GROUP_TEST_RESULTS: {
      row: `
        <tr>
                        <td>Code</td>
                        <td>Blood group</td>
                    </tr>
                    <tr ID="bloodgroup">
                        <td ID="bloodgroup_code">{{DATA.BLOOD_GROUP_CODE}}</td>
                        <td>{{DATA.BLOOD_GROUP}}</td>
                    </tr>
      `,
      entry: `
       <entry typeCode="DRIV">
            <observation classCode="OBS" moodCode="DEF">
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.56"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
                <id root="CE1215CD-69EC-4C7B-805F-569233C5E1510"/>
                <code code="882-1" displayName="ABO and Rh group [Type] in Blood" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC"/>
                <text>
                    <reference value="#bloodgroup"/>
                </text>
                <statusCode code="completed"/>
                <effectiveTime value="{{DATA.CURRENT_DATETIME}}"/>
                <value xsi:type="CD" code="{{DATA.BLOOD_GROUP_CODE}}" displayName="{{DATA.BLOOD_GROUP}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
                    <originalText>
                        <reference value="#bloodgroup_code"/>
                    </originalText>
                </value>
            </observation>
        </entry>
      `,
    },
    LIST_OF_SURGERIES: {
      row: `
       <tr ID="listofsurgery-{{DATA.INDEX}}">
                        <td ID="listofsurgery-{{DATA.INDEX}}_procedure">{{DATA.DESCRIPTION}}</td>
                        <td>{{DATA.PLANED_DATE_FORMATTED}}</td>
                        <td>{{DATA.PLANED_DATE_FORMATTED}}</td>
                        <td>Completed</td>
                    </tr>
      `,
      entry: `
       <entry typeCode="DRIV">
            <procedure classCode="PROC" moodCode="EVN">
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.53"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.19"/>
                <templateId root="2.16.840.1.113883.10.20.1.29"/>
                <id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
                <code code="{{DATA.ACHI_CODE}}" displayName="{{DATA.ACHI_DESCRIPTION}}" codeSystem="2.16.840.1.113883.3.3731.50.2" codeSystemName="ACHI">
                    <originalText>
                        <reference value="#listofsurgery-{{DATA.INDEX}}_procedure"/>
                    </originalText>
                </code>
                <text>
                    <reference value="#listofsurgery-{{DATA.INDEX}}"/>
                </text>
                <statusCode code="completed"/>
                <effectiveTime>
                    <low value="{{DATA.PLANED_DATE_COMPACT}}"/>
                    <high value="{{DATA.PLANED_DATE_COMPACT}}"/>
                </effectiveTime>
            </procedure>
        </entry>
      `,
    },
    MEDICATIONS_ADMINISTERED: {
      row: `
      <table ID="medadministered-{{DATA.INDEX}}">
							<tbody>
								<tr>
									<td>Medication Item</td>
									<td>{{DATA.INDEX}}</td>
								</tr>
								<tr>
									<td>Medication ID</td>
									<td>{{DATA.MEDICATION_ID}}</td>
						
								</tr>
								<tr>
									<td>Medication Name</td>
									<td>{{DATA.MEDICATION_NAME}}</td>
								</tr>
								<tr>
									<td>Medication Code</td>
									<td>
										<content ID="medadministered-{{DATA.INDEX}}_prodcode">{{DATA.MED_CODE}}</content>
									</td>
								</tr>
								<tr>
									<td>Pharmaceutical Dose Form</td>
									<td>
										<content ID="medadministered-{{DATA.INDEX}}_doseform">{{DATA.DOSE_FORM}}</content>
									</td>
								</tr>
								<tr>
									<td>Start / End / Duration of treatment</td>
									<td>{{DATA.MED_DURATION}}</td>
								</tr>
								<tr>
									<td>Dose / Frequency</td>
									<td>
                            <content ID="medadministered-{{DATA.INDEX}}_dose">{{DATA.DOSE}}</content> / {{DATA.FREQUENCY}}
                        </td>
																		
							 
								</tr>
								<tr>
									<td>Route of Administration</td>
									 <td>
                    <!--TODO CHECK WALID-->
                            <content ID="medadministered-{{DATA.INDEX}}_route">{{DATA.ROUTE#-}}</content>
                        </td>
											  
			  
								</tr>
								<tr>
									<td>Approach Site</td>
                   <!--TODO CHECK WALID-->
									<td>{{DATA.APPROACH_SITE#-}}</td>
								</tr>
								<tr>
									<td>Patient Medication Instructions</td>
									<td>
                   <!--TODO CHECK WALID-->
										<content ID="medadministered-{{DATA.INDEX}}_pinstruct">{{DATA.INSTRUCTIONS#-}}</content>
									</td>
								</tr>
							</tbody>
						</table>
      `,
      entry: `
      <entry typeCode="DRIV">
						<!--
							===========================================================================
								Medication Item 1:

								EXODERIL CREAM 1%, non-structured dosing variants
							===========================================================================
						-->
						<substanceAdministration classCode="SBADM"
						                         moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.45"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7"/>
							<templateId root="2.16.840.1.113883.10.20.1.24"/>
							<!-- Medication Item ID -->
							<id root="CE1215CD-69EC-4C7B-805F-569233C5E151"/>
														   
														  
						  
							<text>
								<reference value="#medadministered-{{DATA.INDEX}}"/>
							</text>
							<statusCode code="completed"/>
							<!-- Medication -->
						
							  
					   
										
								  
												  
									  
									   
					   
						 
								
													 
											 
					  
												   
					   
				   
							  
							 
					 
					   
												   
						
					  
					  
							<consumable>
								<manufacturedProduct classCode="MANU">
									<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7.2"/>
									<templateId root="2.16.840.1.113883.10.20.1.53"/>
									<manufacturedMaterial classCode="MMAT"
									                      determinerCode="KIND">
										<code code="{{DATA.MED_CODE}}"
										      displayName="{{DATA.MEDICATION_NAME}}"
										      codeSystem="2.16.840.1.113883.3.3731.1.205.2"
										      codeSystemName="KSA Dispensation Pharmacy Item Name">
											<originalText>
												<reference value="#medadministered-{{DATA.INDEX}}_prodcode"/>
											</originalText>
										</code>
										<name>{{DATA.MEDICATION_NAME}}</name>
										<pharm:formCode code="{{DATA.DOSE_FORM_CODE}}"
										                displayName="{{DATA.DOSE_FORM}}"
										                codeSystem="2.16.840.1.113883.3.3731.1.205.8"
										                codeSystemName="KSA Medication Pharmaceutical Dose Form">
											<originalText>
												<reference value="#medadministered-{{DATA.INDEX}}_doseform"/>
											</originalText>
										</pharm:formCode>
										<pharm:ingredient classCode="ACTI">
											<pharm:quantity>
												<numerator xsi:type="PQ"
												           value="1"
												           unit="%"/>
												<denominator xsi:type="INT"
												             value="1"/>
											</pharm:quantity>
										</pharm:ingredient>
									</manufacturedMaterial>
								</manufacturedProduct>
							</consumable>
							<!-- Patient Medication Instructions -->
							<entryRelationship typeCode="SUBJ"
							                   inversionInd="true">
								<act classCode="ACT"
								     moodCode="INT">
									<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.3"/>
									<templateId root="2.16.840.1.113883.10.20.1.49"/>
									<code code="PINSTRUCT"
									      codeSystem="1.3.6.1.4.1.19376.1.5.3.2"
									      codeSystemName="IHEActCode"/>
									<text>
										<reference value="#medadministered-{{DATA.INDEX}}_pinstruct"/>
									</text>
									<statusCode code="completed"/>
								</act>
							</entryRelationship>
						</substanceAdministration>
					</entry>
      `,
    },
    IMMUNIZATIONS: {
      row: `
        <tr>
                        <td>Immunization Item</td>
                        <td>{{DATA.INDEX}}</td>
                    </tr>
                    <tr>
                        <td>Immunization ID</td>
                        <td>{{DATA.IMMUNIZATION_ID}}</td>
                    </tr>
                    <tr>
                        <td>Immunization Name</td>
                        <td>{{DATA.IMMUNIZATION_NAME}}</td>
                    </tr>
                    <tr>
                        <td>Immunization Code</td>
                        <td>
                            <content ID="immu-{{DATA.INDEX}}_vaccnamecode">{{DATA.IMMUNIZATION_CODE}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Date of administration</td>
                        <td>{{DATA.IMMUNIZATION_DATE}}</td>
                    </tr>
                    <tr>
                        <td>Dose</td>
                        <td ID="immu-{{DATA.INDEX}}_dose">{{DATA.IMMUNIZATION_DOSE}}</td>
                    </tr>
                    <tr>
                        <td>Route of Administration</td>
                        <td>
                         <!--TODO CHECK WALID-->
                            <content ID="immu-{{DATA.INDEX}}_route">{{DATA.IMMUNIZATION_ROUTE#-}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Approach Site</td>
                        <td>
                         <!--TODO CHECK WALID-->
                            <content ID="immu-{{DATA.INDEX}}_approach">{{DATA.IMMUNIZATION_SITE#-}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Reason</td>
                        <td>
                         <!--TODO CHECK WALID-->
                            <content ID="immu-{{DATA.INDEX}}_reason">{{DATA.IMMUNIZATION_REASON#-}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Vaccination Product Code and Name</td>
                        <td>
                         <!--TODO CHECK WALID-->
                            <content ID="immu-{{DATA.INDEX}}_vaccprodcode">{{DATA.IMMUNIZATION_PROD_CODE#-}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Pharmaceutical Dose Form</td>
                        <td>
                         <!--TODO CHECK WALID-->
                            <content ID="immu-{{DATA.INDEX}}_doseform">{{DATA.IMMUNIZATION_DOSE_FORM#-}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Lot Number</td>
                        <td>{{DATA.IMMUNIZATION_LOT}}</td>
                    </tr>
                    <tr>
                        <td>Manufacturer</td>
                        <td>
                         <!--TODO CHECK WALID-->
                            <content ID="immu-{{DATA.INDEX}}_manufacturer">{{DATA.IMMUNIZATION_MANUFACTURER#-}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Provider Administering the Vaccine</td>
                        <td>{{DATA.PROVIDER_NAME}}</td>
                    </tr>
                    <tr>
                        <td>Responsible Provider</td>
                        <td>{{DATA.RESPONSIBLE_PROVIDER}}</td>
                    </tr>
                    <tr>
                        <td>Informant</td>
                        <td>{{DATA.INFORMANT}}</td>
                    </tr>
                    <tr>
                        <td>Immunization Campaign</td>
                        <td>
                         <!--TODO CHECK WALID-->
                            <content ID="immu-{{DATA.INDEX}}_campaign">{{DATA.IMMUNIZATION_CAMPAIGN#-}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Adverse Immunization(s)</td>
                        <td>
                         <!--TODO CHECK WALID-->
                            <content ID="immu-{{DATA.INDEX}}_adverseimmuevent1">{{DATA.IMMUNIZATION_ADVERSE#-}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Dose Number</td>
                        <td>
                         <!--TODO CHECK WALID-->
                            <content ID="immu-{{DATA.INDEX}}_dosenumber">{{DATA.IMMUNIZATION_DOSE_NUMBER#-}}</content>
                        </td>
                    </tr>
      `,
      entry: `
        <entry typeCode="DRIV">
            <substanceAdministration classCode="SBADM" moodCode="EVN">
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.48"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.12"/>
                <templateId root="2.16.840.1.113883.10.20.1.24"/>
                <id root="{{DATA.IMMUNIZATION_ID}}"/>
                <code code="IMMUNIZ" codeSystem="2.16.840.1.113883.5.4"/>
                <text>
                    <reference value="#immu-{{DATA.INDEX}}"/>
                </text>
                <statusCode code="completed"/>
                <effectiveTime value="{{DATA.IMMUNIZATION_DATE}}"/>
                <routeCode code="{{DATA.IMMUNIZATION_ROUTE_CODE}}" displayName="{{DATA.IMMUNIZATION_ROUTE}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
                    <originalText>
                        <reference value="#immu-{{DATA.INDEX}}_route"/>
                    </originalText>
                </routeCode>
                <approachSiteCode code="{{DATA.IMMUNIZATION_SITE_CODE}}" displayName="{{DATA.IMMUNIZATION_SITE}}" codeSystem="2.16.840.1.113883.12.163" codeSystemName="HL7 Body Site">
                    <originalText>
                        <reference value="#immu-{{DATA.INDEX}}_approach"/>
                    </originalText>
                </approachSiteCode>
                <doseQuantity value="{{DATA.IMMUNIZATION_DOSE_VALUE}}" unit="{{DATA.IMMUNIZATION_DOSE_UNIT}}">
                    <translation>
                        <originalText>
                            <reference value="#immu-{{DATA.INDEX}}_dose"/>
                        </originalText>
                    </translation>
                </doseQuantity>
                <nphies:reasonCode code="{{DATA.IMMUNIZATION_REASON_CODE}}" displayName="{{DATA.IMMUNIZATION_REASON}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
                    <originalText>
                        <reference value="#immu-{{DATA.INDEX}}_reason"/>
                    </originalText>
                </nphies:reasonCode>
                <consumable>
                    <manufacturedProduct classCode="MANU">
                        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7.2"/>
                        <templateId root="2.16.840.1.113883.10.20.1.53"/>
                        <manufacturedMaterial classCode="MMAT" determinerCode="KIND">
                            <code code="{{DATA.IMMUNIZATION_CODE}}" displayName="{{DATA.IMMUNIZATION_NAME}}" codeSystem="2.16.840.1.113883.3.3731.1.205.1" codeSystemName="KSA Prescription Pharmacy Item Name">
                                <originalText>
                                    <reference value="#immu-{{DATA.INDEX}}_prodcode"/>
                                </originalText>
                            </code>
                            <name>{{DATA.IMMUNIZATION_NAME}}</name>
                            <pharm:formCode code="{{DATA.IMMUNIZATION_DOSE_FORM_CODE}}" displayName="{{DATA.IMMUNIZATION_DOSE_FORM}}" codeSystem="2.16.840.1.113883.3.3731.1.205.8" codeSystemName="KSA Medication Pharmaceutical Dose Form">
                                <originalText>
                                    <reference value="#immu-{{DATA.INDEX}}_doseform"/>
                                </originalText>
                            </pharm:formCode>
                            <lotNumberText>{{DATA.IMMUNIZATION_LOT}}</lotNumberText>
                            <pharm:expirationTime value="{{DATA.IMMUNIZATION_EXPIRY}}"/>
                            <pharm:asContent classCode="CONT">
                                <pharm:containerPackagedMedicine classCode="CONT" determinerCode="INSTANCE">
                                    <pharm:code code="{{DATA.IMMUNIZATION_PROD_CODE}}" displayName="{{DATA.IMMUNIZATION_PROD_NAME}}" codeSystem="2.16.840.1.113883.3.3731.1.205.2" codeSystemName="KSA Dispensation Pharmacy Item Name">
                                        <originalText>
                                            <reference value="#immu-{{DATA.INDEX}}_vaccprodcode"/>
                                        </originalText>
                                    </pharm:code>
                                </pharm:containerPackagedMedicine>
                            </pharm:asContent>
                            <pharm:ingredient classCode="ACTI">
                                <pharm:quantity>
                                    <numerator xsi:type="PQ" value="{{DATA.IMMUNIZATION_STRENGTH}}" unit="{{DATA.IMMUNIZATION_STRENGTH_UNIT}}"/>
                                    <denominator xsi:type="INT" value="1"/>
                                </pharm:quantity>
                            </pharm:ingredient>
                        </manufacturedMaterial>
                        <manufacturerOrganization>
                            <asOrganizationPartOf>
                                <code code="{{DATA.IMMUNIZATION_MANUFACTURER_CODE}}" displayName="{{DATA.IMMUNIZATION_MANUFACTURER}}" codeSystem="2.16.840.1.114222.4.11.826">
                                    <originalText>
                                        <reference value="#immu-{{DATA.INDEX}}_manufacturer"/>
                                    </originalText>
                                </code>
                            </asOrganizationPartOf>
                        </manufacturerOrganization>
                    </manufacturedProduct>
                </consumable>
                <performer>
                    <templateId root="2.16.840.1.113883.3.3731.1.203.28.7"/>
                    <assignedEntity>
                        <id extension="{{DATA.PROVIDER_ID}}" root="2.16.840.1.113883.3.3731.1.2.1"/>
                        <addr nullFlavor="NI"/>
                        <telecom nullFlavor="NI"/>
                        <assignedPerson>
                            <name>
                                <family>{{DATA.PROVIDER_LAST}}</family>
                                <given>{{DATA.PROVIDER_FIRST}}</given>
                            </name>
                        </assignedPerson>
                    </assignedEntity>
                </performer>
                <author>
                    <templateId root="2.16.840.1.113883.3.3731.1.203.28.3"/>
                    <time value="{{DATA.IMMUNIZATION_DATE}}"/>
                    <assignedAuthor>
                        <id extension="{{DATA.RESPONSIBLE_ID}}" root="2.16.840.1.113883.3.3731.1.2.1"/>
                        <addr nullFlavor="NI"/>
                        <telecom nullFlavor="NI"/>
                        <assignedPerson>
                            <name>
                                <family>{{DATA.RESPONSIBLE_LAST}}</family>
                                <given>{{DATA.RESPONSIBLE_FIRST}}</given>
                            </name>
                        </assignedPerson>
                    </assignedAuthor>
                </author>
                <informant>
                    <templateId root="2.16.840.1.113883.3.3731.1.203.28.10"/>
                    <assignedEntity>
                        <id nullFlavor="UNK"/>
                        <addr nullFlavor="UNK"/>
                        <telecom nullFlavor="UNK"/>
                        <assignedPerson>
                            <name>
                                <family>{{DATA.INFORMANT_LAST}}</family>
                                <given>{{DATA.INFORMANT_FIRST}}</given>
                            </name>
                        </assignedPerson>
                    </assignedEntity>
                </informant>
                <entryRelationship typeCode="REFR">
                    <act classCode="ACT" moodCode="DEF">
                        <templateId root="2.16.840.1.113883.3.3731.1.210.100.49"/>
                        <id root="2.16.840.1.113883.3.3731.1.2.2.200.100000000000000.100.1"/>
                        <code nullFlavor="NI"/>
                        <text>
                            <reference value="'#immu-{{DATA.INDEX}}_campaign"/>
                        </text>
                    </act>
                </entryRelationship>
                <entryRelationship typeCode="CAUS" inversionInd="false">
                    <observation classCode="OBS" moodCode="EVN">
                        <templateId root="2.16.840.1.113883.3.3731.1.210.100.50"/>
                        <code nullFlavor="NI"/>
                        <text>
                            <reference value="#immu-{{DATA.INDEX}}_adverseimmuevent1"/>
                        </text>
                    </observation>
                </entryRelationship>
                <entryRelationship typeCode="SUBJ">
                    <observation classCode="OBS" moodCode="EVN">
                        <templateId root="2.16.840.1.113883.10.20.1.46"/>
                        <code code="30973-2" displayName="Dose Number" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC"/>
                        <text>
                            <reference value="#immu-{{DATA.INDEX}}_dosenumber"/>
                        </text>
                        <statusCode code="completed"/>
                        <value xsi:type="INT" value="{{DATA.IMMUNIZATION_DOSE_NUMBER}}"/>
                    </observation>
                </entryRelationship>
            </substanceAdministration>
        </entry>
      `,
    },
    VITAL_SIGNS: {
      row: `
    
			<paragraph>Time of measurement: {{DATA.READING_DATE_FORMATTED}}</paragraph>
			
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Value</th>
						<th>Unit</th>
					</tr>
				</thead>
				<tbody>
					<tr ID="vitsig-1">
						<td ID="vitsig-1_type">Heart beat</td>
						<td>{{DATA.PULSE_RATE}}</td>
						<td>/min</td>
					</tr>
					<tr ID="vitsig-2">
						<td ID="vitsig-2_type">Blood Pressure Systolic</td>
						<td>{{DATA.HIGH_BLOOD_PRESSURE}}</td>
						<td>mm[Hg]</td>
					</tr>
					<tr ID="vitsig-3">
						<td ID="vitsig-3_type">Blood Pressure Diastolic</td>
						<td>{{DATA.LOW_BLOOD_PRESSURE}}</td>
						<td>mm[Hg]</td>
					</tr>
				</tbody>
			</table>
			 <paragraph>Time of measurement: {{DATA.READING_DATE_FORMATTED}}</paragraph>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Value</th>
						<th>Unit</th>
					</tr>
				</thead>
				<tbody>
					<tr ID="vitsig-4">
						<td ID="vitsig-4_type">Body Weight (Measured)</td>
						<td>{{DATA.WEIGHT}}</td>
						<td>kg</td>
					</tr>
					<tr ID="vitsig-5">
						<td ID="vitsig-5_type">Body Height (Measured)</td>
						<td>{{DATA.HEIGHT}}</td>
						<td>cm</td>
					</tr>
				</tbody>
			</table>
			
		
      `,
      entry: `
      
      <entry typeCode="DRIV">
			<organizer classCode="CLUSTER" moodCode="EVN">
				<templateId root="2.16.840.1.113883.3.3731.1.210.100.54"/>
				<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13.1"/>
				<templateId root="2.16.840.1.113883.10.20.1.32"/>
				<templateId root="2.16.840.1.113883.10.20.1.35"/>
				<id nullFlavor="NI"/>
				<code code="46680005" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT" displayName="Vital signs"/>
				<statusCode code="completed"/>
				<effectiveTime value="{{DATA.READING_DATE_COMPACT}}"/>
				<component>
					<observation classCode="OBS" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.55"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13.2"/>
						<templateId root="2.16.840.1.113883.10.20.1.31"/>
						<id root="E6F45742-BA20-7224-15A0-6D8836E96123"/>
						<code code="8867-4" displayName="Heart Beat" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC">
							<originalText>
								<reference value="#vitsig-1_type"/>
							</originalText>
						</code>
						<text>
							<reference value="#vitsig-1"/>
						</text>
						<statusCode code="completed"/>
						<value xsi:type="PQ" value="{{DATA.PULSE_RATE}}" unit="/min"/>
					</observation>
				</component>
				<component>
					<observation classCode="OBS" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.55"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13.2"/>
						<templateId root="2.16.840.1.113883.10.20.1.31"/>
						<id root="E6F45742-BA20-7224-15A0-6D8836E96456"/>
						<code code="8480-6" displayName="Blood Pressure Systolic" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC">
							<originalText>
								<reference value="#vitsig-2_type"/>
							</originalText>
						</code>
						<text>
							<reference value="#vitsig-2"/>
						</text>
						<statusCode code="completed"/>
						<value xsi:type="PQ" value="{{DATA.HIGH_BLOOD_PRESSURE}}" unit="mm[Hg]"/>
					</observation>
				</component>
				<component typeCode="COMP">
					<observation classCode="OBS" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.55"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13.2"/>
						<templateId root="2.16.840.1.113883.10.20.1.31"/>
						<id root="E6F45742-BA20-7224-15A0-6D8836E96789"/>
						<code code="8462-4" displayName="Blood Pressure Diastolic" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC">
							<originalText>
								<reference value="#vitsig-3_type"/>
							</originalText>
						</code>
						<text>
							<reference value="#vitsig-3"/>
						</text>
						<statusCode code="completed"/>
						<value xsi:type="PQ" value="{{DATA.LOW_BLOOD_PRESSURE}}" unit="mm[Hg]"/>
					</observation>
				</component>
			</organizer>
		</entry>
		<entry typeCode="DRIV">
			<organizer classCode="CLUSTER" moodCode="EVN">
				<templateId root="2.16.840.1.113883.3.3731.1.210.100.54"/>
				<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13.1"/>
				<templateId root="2.16.840.1.113883.10.20.1.32"/>
				<templateId root="2.16.840.1.113883.10.20.1.35"/>
				<id nullFlavor="NI"/>
				<code code="46680005" displayName="Vital signs" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT"/>
				<statusCode code="completed"/>
				<effectiveTime value="{{DATA.READING_DATE_COMPACT}}"/>
				<component>
					<observation classCode="OBS" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.55"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13.2"/>
						<templateId root="2.16.840.1.113883.10.20.1.31"/>
						<id root="E6F45742-BA20-7224-15A0-6D8836E97901"/>
						<code code="3141-9" displayName="Body Weight (Measured)" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC">
							<originalText>
								<reference value="#vitsig-4_type"/>
							</originalText>
						</code>
						<text>
							<reference value="#vitsig-4"/>
						</text>
						<statusCode code="completed"/>
						<value xsi:type="PQ" value="{{DATA.WEIGHT}}" unit="kg"/>
					</observation>
				</component>
				<component>
					<observation classCode="OBS" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.55"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13.2"/>
						<templateId root="2.16.840.1.113883.10.20.1.31"/>
						<id root="E6F45742-BA20-7224-15A0-6D8836E98234"/>
						<code code="8302-2" displayName="Body Height (Measured)" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC">
							<originalText>
								<reference value="#vitsig-5_type"/>
							</originalText>
						</code>
						<text>
							<reference value="#vitsig-5"/>
						</text>
						<statusCode code="completed"/>
						<value xsi:type="PQ" value="{{DATA.HEIGHT}}" unit="cm"/>
					</observation>
				</component>
			</organizer>
		</entry>
		
      `,
    },
    HOSPITAL_DISCHARGE_MEDICATIONS: {
      row: `
      <tr ID="meddischarge-{{DATA.INDEX}}">
                        <td ID="meddischarge-{{DATA.INDEX}}_code">{{DATA.MED_CODE}}</td>
                        <td>{{DATA.DESCRIPTION}}</td>
                    </tr>
                    `,
      entry: `
      <entry typeCode="DRIV">
            <substanceAdministration classCode="SBADM" moodCode="EVN">
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.45"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7"/>
                <templateId root="2.16.840.1.113883.10.20.1.24"/>
                <id root="CE1215CD-69EC-4C7B-805F-569233C5E1510"/>
               
                <code code="{{DATA.MED_CODE}}" displayName="{{DATA.DESCRIPTION}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
                    <originalText>
                        <reference value="#meddischarge-{{DATA.INDEX}}_code"/>
                    </originalText>
                </code>
                <text>
                    <reference value="#meddischarge-{{DATA.INDEX}}"/>
                </text>
                <statusCode code="completed"/>
                <consumable>
                    <manufacturedProduct classCode="MANU">
                        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7.2"/>
                        <templateId root="2.16.840.1.113883.10.20.1.53"/>
                        <manufacturedMaterial classCode="MMAT" determinerCode="KIND"  nullFlavor="NI" />
                       
                                                 
                    </manufacturedProduct>
                </consumable>
            </substanceAdministration>
        </entry>
      `,
    },
    DISCHARGE_DIAGNOSIS: {
      row: ` <tr ID="disdiag-{{DATA.INDEX}}">
                        <td ID="disdiag-{{DATA.INDEX}}_diagnosis">{{DATA.ICD_CODE}}, {{DATA.DESCRIPTION}}</td>
                        <td>{{DATA.START_DATE_FORMATTED#-}}</td>
                        <td>{{DATA.END_DATE_FORMATTED#-}}</td>
                        <td>Completed</td>
                    </tr>`,
      entry: `
                     <entry typeCode="DRIV">
            <act classCode="ACT" moodCode="EVN">
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.43"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.1"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.2"/>
                <templateId root="2.16.840.1.113883.10.20.1.27"/>
                <id nullFlavor="NI"/>
                <code nullFlavor="NA"/>
                <statusCode code="completed"/>
                <effectiveTime nullFlavor="NA">
                    <low nullFlavor="UNK"/>
                    <high nullFlavor="UNK"/>
                </effectiveTime>
                <entryRelationship typeCode="SUBJ" inversionInd="false">
                    <observation classCode="OBS" moodCode="EVN">
                        <templateId root="2.16.840.1.113883.3.3731.1.210.100.44"/>
                        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5"/>
                        <templateId root="2.16.840.1.113883.10.20.1.28"/>
                        <id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
                        <code code="282291009" displayName="Diagnosis" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT"/>
                        <text>
                            <reference value="#disdiag-{{DATA.INDEX}}"/>
                        </text>
                        <statusCode code="completed"/>
                        <effectiveTime nullFlavor="NA">
                            <low nullFlavor="UNK"/>
                            <high nullFlavor="UNK"/>
                        </effectiveTime>
                        
                        <value xsi:type="CD" code="{{DATA.ICD_CODE}}" displayName="{{DATA.DESCRIPTION}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
                            <originalText>
                                <reference value="#disdiag-{{DATA.INDEX}}_diagnosis"/>
                            </originalText>
                        </value>
                    </observation>
                </entryRelationship>
            </act>
        </entry>
                    `,
    },
    REASON_FOR_REFERRAL: {
      row: `
        <tr ID="reasonref-{{DATA.INDEX}}">
						<td ID="reasonref-{{DATA.INDEX}}_diagnosis">{{DATA.ICD_CODE}}, {{DATA.DESCRIPTION}}</td>
						<td>{{DATA.DATE_RECORDED_FORMATTED}}</td>
						<td>{{DATA.END_DATE_FORMATTED}}</td>
						<td>{{DATA.STATUS}}</td>
					</tr>
        `,
      entry: `
        <entry typeCode="DRIV">
			<act classCode="ACT" moodCode="EVN">
				<templateId root="2.16.840.1.113883.3.3731.1.210.100.43"/>
				<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.1"/>
				<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5.2"/>
				<templateId root="2.16.840.1.113883.10.20.1.27"/>
				<id nullFlavor="NI"/>
				<code nullFlavor="NA"/>
				<statusCode code="active"/>
				<effectiveTime>
					<low value="20210123"/>
				</effectiveTime>
				<entryRelationship typeCode="SUBJ" inversionInd="false">
					<observation classCode="OBS" moodCode="EVN">
						<templateId root="2.16.840.1.113883.3.3731.1.210.100.44"/>
						<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.5"/>
						<templateId root="2.16.840.1.113883.10.20.1.28"/>
						<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
						<code code="282291009" displayName="Diagnosis" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT"/>
						<text>
							<reference value="#reasonref-{{DATA.INDEX}}"/>
						</text>
						<statusCode code="completed"/>
						<effectiveTime>
							<low value="{{DATA.DATE_RECORDED_COMPACT}}"/>
						</effectiveTime>
						<value xsi:type="CD" code="{{DATA.ICD_CODE}}" displayName="{{DATA.DESCRIPTION}}" codeSystem="2.16.840.1.113883.6.135" codeSystemName="ICD10-AM">
							<originalText>
								<reference value="#reasonref-{{DATA.INDEX}}_diagnosis"/>
							</originalText>
						</value>
					</observation>
				</entryRelationship>
			</act>
		</entry>
        `,
    },
    BLOOD_GROUP_CODED_RESULTS: {
      row: `
      	<tr>
						<td>Code</td>
						<td>Blood group</td>
					</tr>
					<tr ID="bloodgroup">
						<td ID="bloodgroup_code">278147001</td>
						<!--TODO CHECK WALID-->
						<td>Blood group O Rh(D) positive</td>
					</tr>
      `,
      entry: `
      
      <entry typeCode="DRIV">
			<observation classCode="OBS"
			             moodCode="DEF">
				<templateId root="2.16.840.1.113883.3.3731.1.210.100.56"/>
				<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
				<id root="CE1215CD-69EC-4C7B-805F-569233C5E1510"/>
				<code code="882-1"
				      displayName="ABO and Rh group [Type] in Blood"
				      codeSystem="2.16.840.1.113883.6.1"
				      codeSystemName="LOINC"/>
				<text>
					<reference value="#bloodgroup"/>
				</text>
				<statusCode code="completed"/>
				<effectiveTime value="20210730083000+0300"/>
				<value xsi:type="CD"
				       code="278147001"
				       displayName="Blood group O Rh(D) positive"
				       codeSystem="2.16.840.1.113883.6.96"
				       codeSystemName="SNOMED CT">
					<originalText>
						<reference value="#bloodgroup_code"/>
					</originalText>
				</value>
			</observation>
		</entry>
      `,
    },
    PREGNANCY_HISTORY: {
      row: `
      	<tr ID="preghist-{{DATA.INDEX}}">
									<td ID="preghist-{{DATA.INDEX}}_type">BIRTHS LIVE (REPORTED)</td>
									<td ID="preghist-{{DATA.INDEX}}_value">2</td>
									<td ID="preghist-{{DATA.INDEX}}_time">2021.06.02 08:00:00</td>
								</tr>
							
      `,
      entry: `
      <entry typeCode="DRIV">
						<observation classCode="OBS"
						             moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.58"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13.5"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
							<id root="E6F45742-BA20-7224-15A0-6D8836E96123"/>
							<code code="11636-8"
							      displayName="BIRTHS LIVE (REPORTED)"
							      codeSystem="2.16.840.1.113883.6.1"
							      codeSystemName="LOINC">
								<originalText>
									<reference value="#preghist-{{DATA.INDEX}}_type"/>
								</originalText>
							</code>
							<text>
								<reference value="#preghist-{{DATA.INDEX}}"/>
							</text>
							<statusCode code="completed"/>
							<effectiveTime value="20210602080000+0300"/>
							<value xsi:type="INT"
							       value="2"/>
						</observation>
					</entry>
      `,
    },
    LABOR_AND_DELIVERY_EVENTS: {
      row: `
      
      <tr ID="laboranddeliveryevents">
									<td ID="laboranddeliveryevents_procedure">Vaginal - non-instrumental</td>
									<td>2019.01.23, 10:00:00</td>
								</tr>
                `,
      entry: `
      <entry typeCode="DRIV">
						<procedure classCode="PROC"
						           moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.59"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.19"/>
							<templateId root="2.16.840.1.113883.10.20.1.29"/>
							<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
							<code code="1"
							      displayName="Vaginal - non-instrumental"
							      codeSystem="2.16.840.1.113883.3.3731.1.203.22"
							      codeSystemName="KSA Mode of Delivery">
								<originalText>
									<reference value="#laboranddeliveryevents_procedure"/>
								</originalText>
							</code>
							<text>
								<reference value="#laboranddeliveryevents"/>
							</text>
							<statusCode code="completed"/>
							<effectiveTime value="20190123100000+0300"/>
						</procedure>
					</entry>
      `,
    },
    DELIVERY_EVENT_OUTCOME: {
      row: `
      <tr ID="deloutcome{{DATA.INDEX}}">
									<td ID="deloutcome{{DATA.INDEX}}_procedure">Live Births</td>
									<td>1</td>
									<td>2021.06.02 08:00:00</td>
								</tr>
      `,
      entry: `
      <entry typeCode="DRIV">
						<observation classCode="OBS"
						             moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.60"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
							<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
							<code code="11636-8"
							      displayName="Live Births"
							      codeSystem="2.16.840.1.113883.6.1"
							      codeSystemName="LOINC">
								<originalText>
									<reference value="#deloutcome{{DATA.INDEX}}_procedure"/>
								</originalText>
							</code>
							<text>
								<reference value="#deloutcome{{DATA.INDEX}}"/>
							</text>
							<statusCode code="completed"/>
							<effectiveTime value="20210602080000+0300"/>
							<value xsi:type="INT"
							       value="1"/>
						</observation>

            
					</entry>

          <entry typeCode="DRIV">
						<observation classCode="OBS"
						             moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.61"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
							<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
							<code code="57062-2"
							      displayName="Stillborn Births"
							      codeSystem="2.16.840.1.113883.6.1"
							      codeSystemName="LOINC">
								<originalText>
									<reference value="#deloutcome2_code"/>
								</originalText>
							</code>
							<text>
								<reference value="#deloutcome2"/>
							</text>
							<statusCode code="completed"/>
							<effectiveTime value="20210602080000+0300"/>
							<value xsi:type="INT"
							       value="0"/>
						</observation>
					</entry>
          `,
    },
    NEWBORN_STATUS_AT_MATERNAL_DISCHARGE: {
      //    INDEX: 1,
      // STATUS_TYPE: "Gestational Age",
      // CODE: "49051-6",
      // CODE_SYSTEM: "2.16.840.1.113883.6.1",
      // CODE_SYSTEM_NAME: "LOINC",
      // VALUE: "8",
      // VALUE_TYPE: "PQ",
      // UNIT: "wk",
      // EFFECTIVE_TIME: "20210602080000+0300",
      row: `
      
      <tr ID="newbornstatus_gestage">
									<td>Gestational Age</td>
									<td>8 weeks</td>
								</tr>
								<tr ID="newbornstatus_apgar1">
									<td>Apgar after 1 min</td>
									<td>7</td>
								</tr>
								<tr ID="newbornstatus_apgar5">
									<td>Apgar after 5 min</td>
									<td>8</td>
								</tr>
								<tr ID="newbornstatus_apgar10">
									<td>Apgar after 10 min</td>
									<td>8</td>
								</tr>
                `,
      entry: `
      
      <entry typeCode="DRIV">
						<observation classCode="OBS"
						             moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.62"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
							<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
							<code code="49051-6"
							      displayName="Gestational Age"
							      codeSystem="2.16.840.1.113883.6.1"
							      codeSystemName="LOINC"/>
							<text>
								<reference value="#newbornstatus_gestage"/>
							</text>
							<statusCode code="completed"/>
							<effectiveTime value="20210602080000+0300"/>
							<value xsi:type="PQ"
							       value="8"
							       unit="wk"/>
						</observation>
					</entry>
					<entry typeCode="DRIV">
						<observation classCode="OBS"
						             moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.63"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
							<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
							<code code="9272-6"
							      displayName="Apgar after 1 min"
							      codeSystem="2.16.840.1.113883.6.1"
							      codeSystemName="LOINC"/>
							<text>
								<reference value="#newbornstatus_apgar1"/>
							</text>
							<statusCode code="completed"/>
							<effectiveTime value="20210602080000+0300"/>
							<value xsi:type="INT"
							       value="7"/>
						</observation>
					</entry>
					<entry typeCode="DRIV">
						<observation classCode="OBS"
						             moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.63"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
							<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
							<code code="9273-4"
							      displayName="Apgar after 5 min"
							      codeSystem="2.16.840.1.113883.6.1"
							      codeSystemName="LOINC"/>
							<text>
								<reference value="#newbornstatus_apgar5"/>
							</text>
							<statusCode code="completed"/>
							<effectiveTime value="20210602080000+0300"/>
							<value xsi:type="INT"
							       value="8"/>
						</observation>
					</entry>
					<entry typeCode="DRIV">
						<observation classCode="OBS"
						             moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.63"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
							<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
							<code code="9271-8"
							      displayName="Apgar after 10 min"
							      codeSystem="2.16.840.1.113883.6.1"
							      codeSystemName="LOINC"/>
							<text>
								<reference value="#newbornstatus_apgar10"/>
							</text>
							<statusCode code="completed"/>
							<effectiveTime value="20210602080000+0300"/>
							<value xsi:type="INT"
							       value="8"/>
						</observation>
					</entry>
      `,
    },
    NEWBORN_SCREENING_TEST_RESULTS: {
      row: `
      <tr ID="newbornscreen{{DATA.INDEX}}">
									<td ID="newbornscreen{{DATA.INDEX}}_code">{{DATA.TEST}}</td>
									<td>{{DATA.VALUE}}{{DATA.UNIT}}</td>
									<td>{{DATA.DATE_TIME}}</td>
								</tr>
      `,
      entry: `
      <entry typeCode="DRIV">
						<observation classCode="OBS"
						             moodCode="EVN">
							<templateId root="2.16.840.1.113883.3.3731.1.210.100.57"/>
							<templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.13"/>
							<id root="DBA414DE-6B92-4D74-30D1-46BC36770F79"/>
							<code code="{{DATA.CODE}}"
							      codeSystem="2.16.840.1.113883.6.1"
							      codeSystemName="LOINC"
							      displayName="{{DATA.TEST}}">
								<originalText>
									<reference value="#newbornscreen{{DATA.INDEX}}_code"/>
								</originalText>
							</code>
							<text>
								<reference value="#newbornscreen{{DATA.INDEX}}"/>
							</text>
							<statusCode code="completed"/>
							<effectiveTime value="{{DATA.EFFECTIVE_TIME}}"/>
							<value xsi:type="PQ"
							       value="{{DATA.VALUE}}"
							       unit="{{DATA.UNIT}}"/>
						</observation>
					</entry>
      `,
    },
  };

  const sectionsData = {};
  // clinicalDocSectionMapping.sql file (p_ext_type = masterRow.CLINICAL_NOTE_TITLE)
  let typeSections = [];

  try {
    CLINICAL_NOTES_LOGGER.debug(
      `💽 🗺️Fetching doc sections with masterRow.CLINICAL_NOTE_TITLE=${masterRow.CLINICAL_NOTE_TITLE}`,
    );

    const mappingResult = await executeSqlFile(
      connection,
      getRelativePath("queries/clinicalDocSection.sql"),
      {
        p_ext_type: masterRow.CLINICAL_NOTE_TITLE,
      },
    );
    typeSections = mappingResult?.rows || [];
  } catch (error) {
    CLINICAL_NOTES_LOGGER.error(
      "Error executing clinicalDocSection.sql:",
      error,
    );
  }

  CLINICAL_NOTES_LOGGER.debug(
    "existing sections:",
    typeSections.length,
    "section names",
    typeSections.map((s) => s.EXT_CODE),
  );

  let sectionPlaceholder = [];
  let templateName = "";
  let isNewbornEpisode = false;
  let isDeliveryEpisode = false;

  switch (masterRow.CLINICAL_NOTE_TITLE) {
    case "Operative Notes":
      templateName = "operativeNotesCdaSpecialSection.xml";
      sectionPlaceholder = operativeNotesSectionPlaceholders;
      break;
    case "Discharge Summary":
      templateName = "dischargeSummaryCdaSpecialSection.xml";
      sectionPlaceholder = dischargeSummarySectionPlaceholders;
      // !! need to run predefine_query IS_NEWBORN_EPISODE and IS_DELIVERY_EPISODE to see if additional sections should be included
      const result = await query(
        `SELECT pq.query_string, pq.* FROM predefined_query pq where pq.code = $1`,
        ["IS_NEWBORN_EPISODE"],
      );

      const result2 = await query(
        `SELECT pq.query_string, pq.* FROM predefined_query pq where pq.code = $1`,
        ["IS_DELIVERY_EPISODE"],
      );

      // console.log("*************" , result?.rows?.length , result2?.rows?.length ,{parentData} );
      // return;

      if (result?.rows?.length == 0) {
        await insertApiMessage({
          apiTransId: masterRow?.transactionId,
          errorMessage:
            "Cannot find a record for `IS_NEWBORN_EPISODE` in the `predefined_query` table.",
          errorId: NPHIES_FAIL_ID.PREDEFINED_QUERY,
        });
        break;
      }
      if (result2?.rows?.length == 0) {
        await insertApiMessage({
          apiTransId: masterRow?.transactionId,
          errorMessage:
            "Cannot find a record for `IS_DELIVERY_EPISODE` in the `predefined_query` table.",
          errorId: NPHIES_FAIL_ID.PREDEFINED_QUERY,
        });
        break;
      }

      const isNewbornEpisodeQueryString = result?.rows?.[0]?.query_string;
      const isDeliveryEpisodeQueryString = result2.rows?.[0]?.query_string;

      const preparedNewbornQuery = preparePredefineQuery(
        isNewbornEpisodeQueryString,
        masterRow,
      );
      CLINICAL_NOTES_LOGGER.verbose(
        `Prepared query for IS_NEWBORN_EPISODE: ${preparedNewbornQuery.text} \n with values  ${JSON.stringify(
          preparedNewbornQuery.values,
        )}`,
      );

      const preparedDeliveryQuery = preparePredefineQuery(
        isDeliveryEpisodeQueryString,
        masterRow,
      );
      CLINICAL_NOTES_LOGGER.verbose(
        `Prepared query for IS_DELIVERY_EPISODE: ${preparedDeliveryQuery.text} \n with values  ${JSON.stringify(
          preparedDeliveryQuery.values,
        )}`,
      );

      const queryResultNewborn = await connection.execute(
        preparedNewbornQuery.text.trim().endsWith(";")
          ? preparedNewbornQuery.text.trim().slice(0, -1)
          : preparedNewbornQuery.text,
        preparedNewbornQuery.values,
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        },
      );

      const queryResultDelivery = await connection.execute(
        preparedDeliveryQuery.text.trim().endsWith(";")
          ? preparedDeliveryQuery.text.trim().slice(0, -1)
          : preparedDeliveryQuery.text,
        preparedDeliveryQuery.values,
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        },
      );

      CLINICAL_NOTES_LOGGER.verbose(
        `Query result for IS_NEWBORN_EPISODE: ${JSON.stringify(queryResultNewborn.rows)}`,
      );
      CLINICAL_NOTES_LOGGER.verbose(
        `Query result for IS_DELIVERY_EPISODE: ${JSON.stringify(queryResultDelivery.rows)}`,
      );

      //! is newborn add born sections and maternal discharge summary sections
      //! and add the placeholders for the newborn sections and maternal discharge summary sections to the sectionPlaceholder array
      if (
        queryResultNewborn.rows.length > 0 &&
        queryResultNewborn.rows[0].IS_NEWBORN === "Y"
      ) {
        await query(
          "update api_transaction  set api_function = $1 where api_trans_id = $2",
          ["NEWBORN DISCHARGE SUMMARY", masterRow?.transactionId],
        );

        CLINICAL_NOTES_LOGGER.verbose(
          `isNewbornEpisode : Newborn episode detected for patient_id: ${masterRow.patient_id}, visit_no: ${masterRow.visit_no}, episode_no: ${masterRow.episode_no}`,
        );
        isNewbornEpisode = true;
        newTitle = "Newborn Discharge Summary";
        codeDisplay =
          "Neonatal perinatal medicine Discharge summary report for display or printing";
        newCode = "78418-1";
        // get the newborn episode sections and added them to the typeSections array
        const newbornSectionsResult = await executeSqlFile(
          connection,
          getRelativePath("queries/clinicalDocSection.sql"),
          { p_ext_type: "Newborn Discharge Summary" },
        );
        typeSections.push(...newbornSectionsResult.rows);

        dischargeSummarySectionPlaceholders.push(
          ...dischargeSummaryNewBornSectionPlaceholders,
        );

        const deliverySectionsResult = await executeSqlFile(
          connection,
          getRelativePath("queries/clinicalDocSection.sql"),
          { p_ext_type: "Maternal Discharge Summary" },
        );
        typeSections.push(...deliverySectionsResult.rows);
        dischargeSummarySectionPlaceholders.push(
          ...dischargeSummaryMaternalSectionPlaceholders,
        );

        CLINICAL_NOTES_LOGGER.verbose(
          `Newborn sections added: ${JSON.stringify(newbornSectionsResult.rows?.map((s) => s.EXT_CODE))}`,
        );
      }
      if (
        queryResultDelivery.rows.length > 0 &&
        queryResultDelivery.rows[0].IS_DELIVERY_EPISODE === "Y"
      ) {
        await query(
          "update api_transaction set api_function = $1 where api_trans_id = $2",
          ["MATERNAL DISCHARGE SUMMARY", masterRow?.transactionId],
        );

        CLINICAL_NOTES_LOGGER.verbose(
          `isDeliveryEpisode : Delivery episode detected for patient_id: ${masterRow.patient_id}, visit_no: ${masterRow.visit_no}, episode_no: ${masterRow.episode_no}`,
        );
        isDeliveryEpisode = true;
        newTitle = "Maternal Discharge Summary";
        newCode = "97702-5";
        codeDisplay = "Maternal and Fetal Medicine Discharge Summary";
        // get the delivery episode sections and added them to the typeSections array
        const deliverySectionsResult = await executeSqlFile(
          connection,
          getRelativePath("queries/clinicalDocSection.sql"),
          { p_ext_type: "Maternal Discharge Summary" },
        );
        typeSections.push(...deliverySectionsResult.rows);
        dischargeSummarySectionPlaceholders.push(
          ...dischargeSummaryMaternalSectionPlaceholders,
        );

        CLINICAL_NOTES_LOGGER.verbose(
          `Delivery sections added: ${JSON.stringify(deliverySectionsResult.rows?.map((s) => s.EXT_CODE))}`,
        );
      }

      break;
    case "Outpatient Encounter Summary":
      templateName = "OutpatientEncounterSummaryCdaSpecialSection.xml";
      sectionPlaceholder = outpatientEncounterSummarySectionPlaceholders;
      break;
    default:
      templateName = "operativeNotesCdaSpecialSection.xml";
  }

  // Loop over section mappings first
  for (const mapping of typeSections) {
    CLINICAL_NOTES_LOGGER.verbose(
      `start processing mapping for EXT_CODE(section name)=${mapping.EXT_CODE} with masterRow.CLINICAL_NOTE_TITLE=${masterRow.CLINICAL_NOTE_TITLE}`,
    );

    const sectionName = mapping.EXT_CODE;

    if (!sectionName) {
      CLINICAL_NOTES_LOGGER.debug(
        `Skipping mapping due to missing EXT_CODE: ${JSON.stringify(
          sectionName,
        )}`,
      );
      continue;
    }

    const extCodeToAddedToSectionData = sectionName
      .replaceAll(" ", "_")
      .toUpperCase();

    const result = await executeSqlFile(
      connection,
      getRelativePath("queries/clinicalDocSectionMapping.sql"),
      { p_ext_type: masterRow.CLINICAL_NOTE_TITLE, p_ext_code: sectionName },
    );

    const oasisCode = result?.rows?.[0]?.OASIS_CODE || null;

    const isRequired = mapping?.EXT_CODE1?.toLowerCase() == "required" || false;

    const shouldHaveData =
      mapping?.EXT_CODE1?.toLowerCase() == "default" || false;

    CLINICAL_NOTES_LOGGER.verbose(
      `sectionName=${sectionName}, oasisCode=${oasisCode}, isRequired=${isRequired}, shouldHaveData=${shouldHaveData}`,
    );

    const section = sectionPlaceholder.find((p) => p.title === sectionName);
    if (section) {
      CLINICAL_NOTES_LOGGER.verbose(
        `Setting isRequired=${isRequired} for section with title "${sectionName}"`,
      );
      section.isRequired = isRequired || shouldHaveData || section.isRequired;
    }

    if (shouldHaveData && sectionsHaveRowsEntry[extCodeToAddedToSectionData]) {
      const data = getDefaultValueForSection(sectionName);

      if (typeof data == "string") {
        sectionsData[`${extCodeToAddedToSectionData}`] = data;
      } else {
        const processedRow = processTemplate({
          template:
            sectionsHaveRowsEntry[extCodeToAddedToSectionData]?.DEFAULT?.row ||
            sectionsHaveRowsEntry[extCodeToAddedToSectionData]?.row,
          data: escapeXml(data),
        });
        const processedEntry = processTemplate({
          template:
            sectionsHaveRowsEntry[extCodeToAddedToSectionData]?.DEAULT?.entry ||
            sectionsHaveRowsEntry[extCodeToAddedToSectionData]?.entry,
          data: escapeXml(data),
        });

        sectionsData[`${extCodeToAddedToSectionData}_ROWS`] = processedRow;
        sectionsData[`${extCodeToAddedToSectionData}_ENTRIES`] = processedEntry;
      }
    } else if (shouldHaveData) {
      sectionsData[`${extCodeToAddedToSectionData}`] = `Not available`;
    }

    if (!oasisCode) {
      CLINICAL_NOTES_LOGGER.debug(
        `No OASIS_CODE found for EXT_CODE=${sectionName}. will be removed later.`,
      );
      continue;
    }

    const isTagSection =
      typeof oasisCode === "string" &&
      oasisCode.trim().startsWith("<") &&
      oasisCode.trim().endsWith(">");

    const isPreDefineQuerySection =
      typeof oasisCode === "string" &&
      oasisCode.trim().startsWith("{") &&
      oasisCode.trim().endsWith("}");

    CLINICAL_NOTES_LOGGER.verbose(
      `Processing mapping: EXT_CODE=${sectionName}, OASIS_CODE=${oasisCode}, isTagSection=${isTagSection}, isPreDefineQuerySection=${isPreDefineQuerySection}, isFreeTextSection=${!isTagSection && !isPreDefineQuerySection}`,
    );

    if (isTagSection) {
      const queryText = await getQueryForTag(oasisCode, connection);
      CLINICAL_NOTES_LOGGER.verbose(
        `Fetched query for tag ${oasisCode}: ${queryText ? "Found" : "Not Found"}`,
      );

      if (queryText) {
        let queryRows = await executeDynamicQuery(
          queryText,
          masterRow,
          connection,
        );

        CLINICAL_NOTES_LOGGER.verbose(
          `Query returned ${queryRows.length} rows for tag ${oasisCode}`,
        );

        let docText = "Not available";

        sectionsData[extCodeToAddedToSectionData] = queryRows[0].VALUE
          ? escapeXml(queryRows[0].VALUE)
          : "Not available";

        CLINICAL_NOTES_LOGGER.silly(
          `Section ${sectionName} populated with data from tag ${oasisCode}: ${sectionsData[extCodeToAddedToSectionData]}`,
        );
      } else {
        sectionsData[extCodeToAddedToSectionData] = "";
      }
    } else if (isPreDefineQuerySection) {
      // Handle pre-defined query case
      CLINICAL_NOTES_LOGGER.silly(
        `Fetching Section: ${sectionName} using pre-defined query for doc_section_type: ${oasisCode}`,
      );

      // -1 get the query from predefine_query table where code = OASIS_CODE
      const result = await query(
        `SELECT pq.query_string, pq.* FROM predefined_query pq where pq.code = $1`,
        [oasisCode?.slice(1, -1)],
      );
      let findData = true;

      if (result.rows.length == 0) {
        CLINICAL_NOTES_LOGGER.debug(
          `No pre-defined query found for code ${oasisCode}. Skipping section ${sectionName}.`,
        );
        findData = false;
        sectionsData[extCodeToAddedToSectionData] = "Not available";
      } else {
        const queryString = result.rows[0].query_string;
        // -2 preparePredefineQuery to convert named parameters to positional parameters and extract values from masterRow
        CLINICAL_NOTES_LOGGER.verbose(
          `Preparing pre-defined query for code ${oasisCode}`,
        );
        const preparedQuery = preparePredefineQuery(queryString, masterRow);
        CLINICAL_NOTES_LOGGER.verbose(
          `Prepared query for code ${oasisCode}: ${preparedQuery.text} \n with values  ${JSON.stringify(
            preparedQuery.values,
          )}`,
        );

        // -3 execute the query
        const queryResult = await connection.execute(
          preparedQuery.text.trim().endsWith(";")
            ? preparedQuery.text.trim().slice(0, -1)
            : preparedQuery.text,
          preparedQuery.values,
          {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
          },
        );

        if (queryResult.rows.length == 0) {
          CLINICAL_NOTES_LOGGER.debug(
            `No data found for pre-defined query with code ${oasisCode}. Skipping section ${sectionName}.`,
          );
          findData = false;
        }

        const rows = queryResult.rows;
        // ! for test
        // const rows = queryResult.rows?.[0]  ? [queryResult.rows[0]] : [];
        // console.log({rows , firstRow: queryResult.rows[0]});

        // -4 get the row and entry templates from the sectionsHaveRowsEntry mapping
        const template =
          sectionsHaveRowsEntry[extCodeToAddedToSectionData] || null;
        CLINICAL_NOTES_LOGGER.verbose(
          `Fetched template for section ${extCodeToAddedToSectionData}: ${template ? "Found" : "Not Found"}`,
        );
        // !5- if template if nul that mena it is free text
        if (!template) {
          CLINICAL_NOTES_LOGGER.debug(
            `No template found for section ${extCodeToAddedToSectionData}. Skipping row and entry generation.`,
          );
          sectionsData[extCodeToAddedToSectionData] = rows[0]?.[
            extCodeToAddedToSectionData
          ]
            ? escapeXml(rows[0]?.[extCodeToAddedToSectionData])
            : "Not available";
          continue;
        }
        // ! 6- if loop section, generate rows and entries using the template and the query result

        // if (loopSections.includes(extCodeToAddedToSectionData)) {
        CLINICAL_NOTES_LOGGER.verbose(
          `Generating rows and entries for loop section ${extCodeToAddedToSectionData} with ${rows.length} rows.`,
        );
        const generatedRows = [];
        const generatedEntries = [];

        let count = 0;
        for (let row of rows) {
          //
          count++;
          CLINICAL_NOTES_LOGGER.silly(
            `Processing row index ${count} for section ${extCodeToAddedToSectionData}., row data: ${JSON.stringify(row)}`,
          );
          row.INDEX = count;
          // !!! START MAPPING AOSIS CODE
          if (
            sectionName.toLowerCase().includes("medication") &&
            row.ORDER_LINE
          ) {
            const dosage = await fetchDosage({
              orderLine: row.ORDER_LINE,
              iosMain: row.IOS_MAIN,
              oracleConnection: connection,
            });

            CLINICAL_NOTES_LOGGER.silly(
              `💊💊 Dosage : ${JSON.stringify({ dosage })}`,
            );

            const routeOfAdmin = await getExtCode({
              oasis_code: dosage?.ROUTE,
              mapping_type: "CODES",
              mapping_sub_type: "375",
              source: "NPHIES CLINICAL",
              ext_type: "MED ROUTE OF ADMINISTRATION",
              dbConn: connection,
            });

            CLINICAL_NOTES_LOGGER.silly(
              `🛜MAPPINGⓂ️Ⓜ️:- Route of Administration : ${JSON.stringify({ routeOfAdmin })} for oasis_code ${dosage?.ROUTE} , ext_type "MED ROUTE OF ADMINISTRATION" , mapping_type "CODES" , mapping_sub_type "375"`,
            );

            const medApproachSite = await getExtCode({
              oasis_code: dosage?.ROUTE,
              mapping_type: "MED_APPROACH_SITE",
              source: "NPHIES CLINICAL",
              ext_type: "MEDICATION APPROACH SITE", // TODO CHECK WALID
              dbConn: connection,
            });

            CLINICAL_NOTES_LOGGER.silly(
              `🛜MAPPINGⓂ️Ⓜ️:- Medication Approach Site : ${JSON.stringify({ medApproachSite })} for oasis_code ${dosage?.ROUTE} , ext_type "MEDICATION APPROACH SITE" , mapping_type "MED_APPROACH_SITE"`,
            );

            const medQuantityUnit = await getExtCode({
              oasis_code: dosage?.UOM,
              mapping_type: "MED_QUANTITY_UNIT",
              source: "NPHIES CLINICAL",
              ext_type: "MED QUANTITY UNIT",
              dbConn: connection,
            });
            CLINICAL_NOTES_LOGGER.silly(
              `🛜MAPPINGⓂ️Ⓜ️:- Medication Quantity Unit : ${JSON.stringify({ medQuantityUnit })} for oasis_code ${dosage?.UOM} , ext_type "MED QUANTITY UNIT" , mapping_type "MED_QUANTITY_UNIT"`,
            );
            const MRID = await getExtCode({
              oasis_code: row ?.NATIONAL_DRUG_CODING || row?.SFDA,
              mapping_type: "DRUG_SFDA",
              source: "NPHIES CLINICAL",
              ext_type: "MRID_BRAND",
              dbConn: connection,
            });
            CLINICAL_NOTES_LOGGER.silly(
              `🛜MAPPINGⓂ️Ⓜ️:- MRID : ${JSON.stringify({ MRID })} for oasis_code ${row ?.NATIONAL_DRUG_CODING || row?.SFDA} , ext_type "MRID_BRAND" , mapping_type "DRUG_SFDA"`,
            );

            const medDoseForm = {};
            CLINICAL_NOTES_LOGGER.silly(
              `🛜MAPPINGⓂ️Ⓜ️:- Medication Dose Form : ${JSON.stringify({ medDoseForm })} for oasis code ${dosage?.DOSE_FORM} , ext_type "MED_DOSE_FORM" , mapping_type "CODES" , mapping_sub_type "375"`,
            );

            if (!medDoseForm?.ext_code) {
              CLINICAL_NOTES_LOGGER.silly(
                `medDoseForm.ext_code is null for order line ${row?.ORDER_LINE} and DOSE_FORM ${dosage?.DOSE_FORM}
                        get Dose Form 💊 from MRID ${MRID?.ext_code}`,
              );
              const res = await getExtDescription({
                ext_code: MRID?.ext_code?.split("-")[2],
                ext_type: "MED_DOSE_FORM",
                source: "NPHIES CLINICAL",
                dbConn: connection,
              });

              CLINICAL_NOTES_LOGGER.silly(
                `🛜MAPPINGⓂ️Ⓜ️:- Medication Dose Form from MRID : ${JSON.stringify({ res })} for oasis_code ${MRID?.ext_code?.split("-")[2]} , ext_type "MED_DOSE_FORM" , source "NPHIES CLINICAL"`,
              );
              medDoseForm.ext_desc = res?.ext_desc || null;
              medDoseForm.ext_code = MRID?.ext_code?.split("-")[2] || null;
            }

            if (!medDoseForm?.ext_desc) {
              CLINICAL_NOTES_LOGGER.error(
                `medDoseForm.ext_desc is null for order line ${row?.ORDER_LINE} Product Code ${row?.PRODUCT_CODE} - SFDA ${row?.SFDA} and DOSE_FORM ${dosage?.DOSE_FORM}`,
              );
              medDoseForm.ext_desc = "na";
              medDoseForm.ext_code = "9999";
            }

            // !!

            row.MEDICATION_ID = row.ORDER_LINE;
            row.MEDICATION_NAME = MRID?.ext_desc || row.DESCRIPTION;
            row.PRODUCT_CODE = row.PRODUCT_CODE || row.SFDA;
            row.DOSE_FORM = medDoseForm?.ext_desc;
            row.DOSE_FORM_CODE = medDoseForm?.ext_code;
            row.MED_DURATION = dosage?.NO_OF_DAYS;
            row.DOSE = dosage?.ADMIN_QTY;
            row.FREQUENCY = dosage?.PER_DESCRIPTION;
            row.ROUTE = routeOfAdmin?.ext_desc || routeOfAdmin?.ext_code;
            row.ROUTE_CODE = routeOfAdmin?.ext_code;
            row.APPROACH_SITE = medApproachSite?.ext_desc;
            row.INSTRUCTIONS = dosage?.NOTES;
            row.MED_DURATION_VALUE = dosage?.NO_OF_DAYS;
            row.MED_DURATION_UNIT = "day(s)";
            row.FREQUENCY_VALUE = dosage?.PER_DESCRIPTION;
            row.FREQUENCY_UNIT = dosage?.PER_DESCRIPTION;
            row.DOSE_VALUE = dosage?.ADMIN_QTY;
            row.DOSE_UNIT = medQuantityUnit?.ext_code;
            row.MED_CODE = MRID?.ext_code;
          }
          // !!! END MAPPING AOSIS CODE
          let getDefaultTemplate = false;
          if (
            sectionName.toLowerCase().includes("allergies") &&
            row.ALLERGYTYPE == "NKDA"
          ) {
            getDefaultTemplate = true;
            row = getDefaultValueForSection(sectionName, row);
          }

          const convertedRow = convertDateProperties(row);

          CLINICAL_NOTES_LOGGER.verbose(
            `after mapping 👌👌👌 => ${JSON.stringify(convertedRow)}`,
          );

          const processedRow = processTemplate({
            template: getDefaultTemplate
              ? template?.DEFAULT?.row || template.row
              : template.row,
            data: escapeXml(convertedRow),
          });
          const processedEntry = processTemplate({
            template: getDefaultTemplate
              ? template?.DEFAULT?.entry || template.entry
              : template.entry,
            data: escapeXml(convertedRow),
          });
          generatedRows.push(processedRow);
          generatedEntries.push(processedEntry);
        }

        CLINICAL_NOTES_LOGGER.verbose(
          `Generated ${generatedRows.length} rows and ${generatedEntries.length} entries for section ${extCodeToAddedToSectionData}.`,
        );
        sectionsData[`${extCodeToAddedToSectionData}_ROWS`] =
          generatedRows.join("\n");
        sectionsData[`${extCodeToAddedToSectionData}_ENTRIES`] =
          generatedEntries.join("\n");
      }

      if (!findData && shouldHaveData) {
        CLINICAL_NOTES_LOGGER.debug(
          `Required section ${extCodeToAddedToSectionData} has no data. add default data for this section`,
        );

        const data = getDefaultValueForSection(sectionName);

        if (typeof data == "string") {
          sectionsData[`${extCodeToAddedToSectionData}`] = data;
        } else {
          const processedRow = processTemplate({
            template:
              sectionsHaveRowsEntry[extCodeToAddedToSectionData]?.DEFAULT
                ?.row ||
              sectionsHaveRowsEntry[extCodeToAddedToSectionData]?.row,
            data: escapeXml(data),
          });
          const processedEntry = processTemplate({
            template:
              sectionsHaveRowsEntry[extCodeToAddedToSectionData]?.DEAULT
                ?.entry ||
              sectionsHaveRowsEntry[extCodeToAddedToSectionData]?.entry,
            data: escapeXml(data),
          });
          sectionsData[`${extCodeToAddedToSectionData}_ROWS`] = processedRow;
          sectionsData[`${extCodeToAddedToSectionData}_ENTRIES`] =
            processedEntry;
        }
      }
    } else {
      CLINICAL_NOTES_LOGGER.silly(
        `freeTextSection using OASIS_CODE=${oasisCode} as SUBJECT_TYPE and document_id=${masterRow.DOCUMENT_ID} to fetch DOC_TEXT DOC_TEXT which will be the section text.`,
      );

      let docText = "Not available";
      try {
        const result = await executeSqlFile(
          connection,
          getRelativePath("queries/clinicalDocFreeTextSection.sql"),
          { p_document_id: masterRow.DOCUMENT_ID, p_subject_type: oasisCode },
        );
        docText = result?.rows?.[0]?.DOC_TEXT || "Not available";
      } catch (error) {
        CLINICAL_NOTES_LOGGER.error(
          "Error executing clinicalDocFreeTextSection.sql:",
          error,
        );
      }

      sectionsData[extCodeToAddedToSectionData] = escapeXml(docText);
    }
  }

  CLINICAL_NOTES_LOGGER.silly(
    "Final sectionsData (slice for each key first 20char):",
    JSON.stringify(
      Object.fromEntries(
        Object.entries(sectionsData).map(([key, value]) => [
          key,
          typeof value === "string" ? value.slice(0, 20) : value,
        ]),
      ),
      null,
      2,
    ),
  );

  const data = {
    ...parentData,
    ...sectionsData,
    CREATION_DATE_FORMATTED: dayjs(masterRow.CREATION_DATE)
      .format("YYYYMMDDHHmmssZ")
      .replace(":", ""),
  };

  const cdaServiceEvent = "";

  CLINICAL_NOTES_LOGGER.debug(
    "Generating CDA body section using template:",
    templateName,
  );

  let cdaBodyTemplate = loadTemplate(templateName);

  if (isNewbornEpisode) {
    cdaBodyTemplate += loadTemplate(
      "dischargeSummaryNewBornCdaSpecialSection.xml",
    );
    cdaBodyTemplate += loadTemplate(
      "dischargeSummaryMaternalCdaSpecialSection.xml",
    );
  }
  if (isDeliveryEpisode) {
    cdaBodyTemplate += loadTemplate(
      "dischargeSummaryMaternalCdaSpecialSection.xml",
    );
  }

  let cdaBodySection = processTemplate({
    template: cdaBodyTemplate,
    data: data,
    templateName: templateName,
  });

  //   console.log(cdaBodySection);

  cdaBodySection = await removeEmptySections(
    cdaBodySection,
    sectionsData,
    sectionPlaceholder,
    masterRow.transactionId,
  );

  const performerTag = createPerformerTag(data);
  const legalAuthenticatorTag = createLegalAuthenticatorTag(data);

  return {
    cdaBodySection,
    cdaServiceEvent,
    legalAuthenticatorTag,
    performerTag,
    newTitle,
    newCode,
    codeDisplay,
  };
}

export async function generateClinicalNotesEnvelopeSpecialSection() {
  return "";
}

// ================ HELPER FUNCTIONS ====================
// ======================================================
/**
 * Converts a SQL query with named parameters to positional parameters ($1, $2, ...)
 * and extracts values from a data object
 *
 * @param {string} query - SQL query with named parameters (e.g., :p_patient_id)
 * @param {Object} data - Object containing parameter values
 * @returns {Object} { text: string, values: any[] } - Query with positional params and values array
 */
function preparePredefineQuery(query, data) {
  // Find all named parameters in the query (e.g., :p_patient_id, :p_episode_no)
  const paramRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const matches = [...query.matchAll(paramRegex)];

  // Get unique parameter names in order of appearance
  const paramNames = [];
  const paramSet = new Set();

  for (const match of matches) {
    const paramName = match[1]?.replace(/^[pP]_/, ""); // Remove leading 'p_' or 'P_' if present
    if (!paramSet.has(paramName)) {
      paramSet.add(paramName);
      paramNames.push(paramName);
    }
  }

  // Build values array from data object
  const values = paramNames.map((name) => {
    const value = data[name] ?? data[name.toUpperCase()] ?? null;
    if (value === null || value === undefined) {
      throw new Error(
        `Missing value for parameter: ${name}. Available keys in data: ${Object.keys(data).join(", ")}`,
      );
    }
    return value;
  });

  // Replace named parameters with positional parameters ($1, $2, ...)
  let preparedQuery = query;
  let paramIndex = 1;

  // Create a map of parameter name to its position
  const paramPositionMap = {};
  paramNames.forEach((name, index) => {
    paramPositionMap[name] = index + 1;
  });

  // Replace each named parameter with its positional counterpart
  // Using a more sophisticated replacement to handle cases where parameter names might be substrings of each other
  const sortedParams = [...paramNames].sort((a, b) => b.length - a.length);

  for (const name of sortedParams) {
    const position = paramPositionMap[name];
    // Use regex with word boundaries to avoid partial matches
    const regex = new RegExp(`:${name}(?![a-zA-Z0-9_])`, "g");
    preparedQuery = preparedQuery.replace(regex, `$${position}`);
  }

  return {
    text: preparedQuery,
    values: values,
  };
}

function convertDateProperties(obj) {
  // Handle null, undefined, or non-object values
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  // Handle Date objects - return them as-is (don't try to process them)
  if (obj instanceof Date) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => convertDateProperties(item));
  }

  // Create a new object to avoid mutating the original
  const result = { ...obj };

  // Iterate through all properties
  for (const key in result) {
    if (result.hasOwnProperty(key)) {
      const value = result[key];
      //   CLINICAL_NOTES_LOGGER.verbose(
      //     `Checking property: ${key} with value: ${value}`,
      //   );

      // Check if property name contains '_DATE'
      if (key.includes("_DATE") || key.includes("DATE_")) {
        // Handle string dates
        if (typeof value === "string") {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            const formattedDate = `${year}.${month}.${day}`;
            const formattedDateCompact = `${year}${month}${day}`;

            const baseName = key;
            result[`${baseName}_FORMATTED`] = formattedDate;
            result[`${baseName}_COMPACT`] = formattedDateCompact;
          }
        }
        // Handle Date objects
        else if (value instanceof Date && !isNaN(value.getTime())) {
          const year = value.getFullYear();
          const month = String(value.getMonth() + 1).padStart(2, "0");
          const day = String(value.getDate()).padStart(2, "0");
          const formattedDate = `${year}.${month}.${day}`;
          const formattedDateCompact = `${year}${month}${day}`;

          const baseName = key;
          result[`${baseName}_FORMATTED`] = formattedDate;
          result[`${baseName}_COMPACT`] = formattedDateCompact;
        }
      }

      // Recursively process nested objects (but skip Date objects)
      if (
        typeof value === "object" &&
        value !== null &&
        !(value instanceof Date)
      ) {
        result[key] = convertDateProperties(value);
      }
    }
  }

  return result;
}

// TODO CHECK WALID
function getDefaultValueForSection(sectionName) {
  switch (sectionName.replaceAll(" ", "").toLowerCase()) {
    case "medicationshistoryonadmission":
      return {
        INDEX: 1,
        DESCRIPTION: "No Drug Therapy Prescribed",
        MED_CODE: "182849000",
      };
      break;

    case "hospitaldischargemedications":
      return {
        INDEX: 1,
        DESCRIPTION: "No Drug Therapy Prescribed",
        MED_CODE: "182849000",
      };
      break;

    case "plannedprocedure":
      return [
        {
          INDEX: 1,
          PROC_CODE: "32123-00",
          PROC_DESC: "Anoplasty",
          PRIORITY: "Elective",
          DATE_TIME: "2019.01.23, 10:00:00",
          PROC_DATE_GREGORIAN: "20190123100000+0300",
          PRIORITY_CODE: "EL",
        },
      ];
      break;
    case "activeproblems":
      return {
        INDEX: 1,
        ICD_CODE: "160245001",
        DESCRIPTION: "No current problems or disability",
        START_DATE_FORMATTED: "-",
        END_DATE_FORMATTED: "-",
        STATUS: "Completed",
      };
      break;
    case "dischargediagnosis":
      return {
        INDEX: 1,
        ICD_CODE: "160245001",
        DESCRIPTION: "No current problems or disability",
        START_DATE_FORMATTED: "-",
        END_DATE_FORMATTED: "-",
      };
      break;
    case "pregnancyhistory":
      return [
        {
          INDEX: 1,
          TYPE: "BIRTHS LIVE (REPORTED)",
          CODE: "11636-8",
          CODE_SYSTEM: "2.16.840.1.113883.6.1",
          CODE_SYSTEM_NAME: "LOINC",
          VALUE: "2",
          VALUE_TYPE: "INT",
          UNIT: "",
          TIME_OF_MEASUREMENT: "2021.06.02 08:00:00",
          EFFECTIVE_TIME: "20210602080000+0300",
        },
      ];
      break;
    case "laboranddeliveryevents":
      return {
        INDEX: 1,
        PROCEDURE: "Vaginal - non-instrumental",
        PROCEDURE_CODE: "1",
        PROCEDURE_CODE_SYSTEM: "2.16.840.1.113883.3.3731.1.203.22",
        PROCEDURE_CODE_SYSTEM_NAME: "KSA Mode of Delivery",
        DATE_TIME: "2019.01.23, 10:00:00",
        EFFECTIVE_TIME: "20190123100000+0300",
        STATUS: "Completed",
      };
      break;
    case "deliveryeventoutcome":
      return [
        {
          INDEX: 1,
          PROCEDURE: "Live Births",
          CODE: "11636-8",
          CODE_SYSTEM: "2.16.840.1.113883.6.1",
          CODE_SYSTEM_NAME: "LOINC",
          VALUE: "1",
          VALUE_TYPE: "INT",
          DATE_TIME_OF_DELIVERY: "2021.06.02 08:00:00",
          EFFECTIVE_TIME: "20210602080000+0300",
        },
      ];
      break;
    case "newbornstatusatmaternaldischarge":
      return [
        {
          INDEX: 1,
          STATUS_TYPE: "Gestational Age",
          CODE: "49051-6",
          CODE_SYSTEM: "2.16.840.1.113883.6.1",
          CODE_SYSTEM_NAME: "LOINC",
          VALUE: "8",
          VALUE_TYPE: "PQ",
          UNIT: "wk",
          EFFECTIVE_TIME: "20210602080000+0300",
        },
      ];
      break;
    case "newbornscreeningcodedresults":
      return [
        {
          INDEX: 1,
          TEST: "Hemoglobin A1c/Hemoglobin.total in Blood",
          CODE: "4548-4",

          VALUE: "7",
          UNIT: "%",
          DATE_TIME: "2019.01.23, 10:00:00",
          EFFECTIVE_TIME: "20210602080000+0300",
        },
      ];
      break;
    case "allergiesandadversereactions":
      return {
        INDEX: 1,
        ALLERGYTYPE: "No known allergies",
        ALLERGYSUBTYPE: "No Known Allergy",
        ADDED_DATE_FORMATTED: "Unknown",
        REMOVED_DATE_FORMATTED: "-",
        ALLERGYCODE: "716186003",
        ALLERGYDESCRIPTION: "No known allergy (situation)",

        STATUS: "Completed",
      };
      break;
    default:
      return "Not available";
      break;
  }
}

async function getQueryForTag(tag, connection) {
  try {
    const result = await executeSqlFile(
      connection,
      getRelativePath("queries/clinicalDocTag.sql"),
      { p_tag: tag },
    );
    return result?.rows?.[0]?.QUERY || result?.rows?.[0]?.query || null;
  } catch (error) {
    CLINICAL_NOTES_LOGGER.error(`Error fetching query for tag ${tag}:`, error);
    return null;
  }
}

async function executeDynamicQuery(queryText, masterRow, connection) {
  const paramRegex = /:parameter\.(\w+)/g;
  const paramNames = [];
  let match;
  while ((match = paramRegex.exec(queryText)) !== null) {
    if (!paramNames.includes(match[1])) {
      paramNames.push(match[1]);
    }
  }

  const modifiedQuery = queryText.replace(/:parameter\.(\w+)/g, ":$1");
  const params = {};
  for (const name of paramNames) {
    switch (name) {
      case "patient_id":
        params[name] = masterRow.PATIENT_ID || masterRow.patient_id || null;
        break;
      case "episode_no":
        params[name] = masterRow.EPISODE_NO || masterRow.episode_no || null;
        break;
      case "encounter_id":
        params[name] = masterRow.ENCOUNTER_ID || masterRow.encounter_id || null;
        break;
      case "document_id":
        params[name] = masterRow.DOCUMENT_ID || masterRow.document_id || null;
        break;
      default:
        const possibleKeys = [
          `P_${name.toUpperCase()}`,
          `p_${name}`,
          name,
          name.toLowerCase(),
          name.toUpperCase(),
        ];
        let found = false;
        for (const key of possibleKeys) {
          if (masterRow[key] !== undefined && masterRow[key] !== null) {
            params[name] = masterRow[key];
            found = true;
            break;
          }
        }
        if (!found) {
          params[name] = null;
        }
        break;
    }
  }

  const result = await connection.execute(modifiedQuery, params, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });
  return result.rows || [];
}

function removeSectionByTitle(xml, sectionTitle) {
  const titlePattern = new RegExp(`<title>${sectionTitle}</title>`, "i");

  const titleMatch = xml.match(titlePattern);
  if (!titleMatch) {
    CLINICAL_NOTES_LOGGER.debug(
      `Section with title "${sectionTitle}" not found`,
    );
    return xml;
  }

  const titleIndex = titleMatch.index;
  let componentStart = xml.lastIndexOf("<component>", titleIndex);

  if (componentStart === -1) {
    CLINICAL_NOTES_LOGGER.debug(
      `No component found for section "${sectionTitle}"`,
    );
    return xml;
  }

  let componentEnd = xml.indexOf("</component>", componentStart);
  if (componentEnd === -1) {
    CLINICAL_NOTES_LOGGER.debug(
      `No closing </component> found for section "${sectionTitle}"`,
    );
    return xml;
  }

  componentEnd += "</component>".length;
  if (xml[componentEnd] === "\n") componentEnd++;

  CLINICAL_NOTES_LOGGER.verbose(
    `Removing section with title "${sectionTitle}"`,
  );

  return xml.slice(0, componentStart) + xml.slice(componentEnd);
}

async function removeEmptySections(
  cdaXml,
  sectionsData,
  sectionPlaceholders = operativeNotesSectionPlaceholders,
  apiTransId,
) {
  let result = cdaXml;

  // Iterate backwards so component indices remain stable during removal
  for (let i = sectionPlaceholders.length - 1; i >= 0; i--) {
    const item = sectionPlaceholders[i];
    let isFilled = false;
    if (item.isLoop) {
      const rows = sectionsData[`${item.key}_ROWS`];
      const entries = sectionsData[`${item.key}_ENTRIES`];
      isFilled =
        (rows && rows.trim() !== "") || (entries && entries.trim() !== "");
    } else {
      const val = sectionsData[item.key];
      isFilled =
        val !== undefined && val !== null && val.toString().trim() !== "";
    }

    if (!isFilled) {
      CLINICAL_NOTES_LOGGER.debug(
        `Placeholder ${item.key} is empty. Removing component section with title : (${item.title})`,
      );
      result = removeSectionByTitle(result, item.title);

      if (item.isRequired) {
        CLINICAL_NOTES_LOGGER.warn(`Required Section ${item.title} is empty.`);
        await insertApiMessage({
          apiTransId,
          errorMessage: `Required Section ,${item.title || "''"} : is empty.`,
          errorId : `CN_${item.title.replaceAll(' ' , '_').toUpperCase()}`
        });
      }
    }
  }

  return result;
}
