import { processTemplate } from "../processTemplate.js";

export const createImmunizationEntry = (immData) => {
  const IMMUNIZATION_ENTRY_TEMPLATE = `
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
        </entry>`;

  return processTemplate({
    template: IMMUNIZATION_ENTRY_TEMPLATE,
    templateName: "IMMUNIZATION_ENTRY_TEMPLATE.xml",
    data: immData,
  });
};