import { processTemplate } from "../processTemplate.js";

export const createMedAdmissionEntry = (medData) => {
  const MED_ADMISSION_ENTRY_TEMPLATE = `
        <entry typeCode="DRIV">
            <substanceAdministration classCode="SBADM" moodCode="INT">
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.45"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7"/>
                <templateId root="2.16.840.1.113883.10.20.1.24"/>
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.46"/>
                <templateId root="1.3.6.1.4.1.19376.1.9.1.3.6"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7.1"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.21"/>
                <id root="{{DATA.ID}}"/>
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
                            <code code="{{DATA.MED_CODE}}" displayName="{{DATA.MED_NAME}}" codeSystem="2.16.840.1.113883.3.3731.1.205.2" codeSystemName="KSA Dispensation Pharmacy Item Name">
                                <originalText>
                                    <reference value="#medadmission-{{DATA.INDEX}}_prodcode"/>
                                </originalText>
                            </code>
                            <name>{{DATA.MED_NAME}}</name>
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
        </entry>`;

  return processTemplate({
    template: MED_ADMISSION_ENTRY_TEMPLATE,
    templateName: "MED_ADMISSION_ENTRY_TEMPLATE.xml",
    data: medData,
  });
};