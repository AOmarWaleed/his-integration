import { processTemplate } from "../processTemplate.js";

export const createCurrentMedAdmissionEntry = (medData) => {
  const CURRENT_MED_ADMISSION_ENTRY_TEMPLATE = `
        <entry typeCode="DRIV">
            <substanceAdministration classCode="SBADM" moodCode="EVN">
                <templateId root="2.16.840.1.113883.3.3731.1.210.100.45"/>
                <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7"/>
                <templateId root="2.16.840.1.113883.10.20.1.24"/>
                <id root="{{DATA.ID}}"/>
                <text>
                    <reference value="#medadministered-{{DATA.INDEX}}"/>
                </text>
                <statusCode code="completed"/>
                <routeCode displayName="{{DATA.ROUTE}}" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT">
                    <originalText>
                        <reference value="#medadministered-{{DATA.INDEX}}_route"/>
                    </originalText>
                </routeCode>
                <doseQuantity value="{{DATA.DOSE}}">
                    <translation>
                        <originalText>
                            <reference value="#medadministered-{{DATA.INDEX}}_dose"/>
                        </originalText>
                    </translation>
                </doseQuantity>
                <consumable>
                    <manufacturedProduct classCode="MANU">
                        <templateId root="1.3.6.1.4.1.19376.1.5.3.1.4.7.2"/>
                        <templateId root="2.16.840.1.113883.10.20.1.53"/>
                        <manufacturedMaterial classCode="MMAT" determinerCode="KIND">
                            <code displayName="{{DATA.MED_NAME}}" codeSystem="2.16.840.1.113883.3.3731.1.205.2" codeSystemName="KSA Dispensation Pharmacy Item Name">
                                <originalText>
                                    <reference value="#medadministered-{{DATA.INDEX}}_prodcode"/>
                                </originalText>
                            </code>
                            <name>{{DATA.MED_NAME}}</name>
                        </manufacturedMaterial>
                    </manufacturedProduct>
                </consumable>
            </substanceAdministration>
        </entry>`;

  return processTemplate({
    template: CURRENT_MED_ADMISSION_ENTRY_TEMPLATE,
    templateName: "CURRENT_MED_ADMISSION_ENTRY_TEMPLATE.xml",
    data: medData,
  });
};