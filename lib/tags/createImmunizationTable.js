import { processTemplate } from "../processTemplate.js";

export const createImmunizationTable = (immData) => {
  const IMMUNIZATION_TEMPLATE = `
            <table ID="immu-{{DATA.INDEX}}">
                <tbody>
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
                            <content ID="immu-{{DATA.INDEX}}_route">{{DATA.IMMUNIZATION_ROUTE}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Approach Site</td>
                        <td>
                            <content ID="immu-{{DATA.INDEX}}_approach">{{DATA.IMMUNIZATION_SITE}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Reason</td>
                        <td>
                            <content ID="immu-{{DATA.INDEX}}_reason">{{DATA.IMMUNIZATION_REASON}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Vaccination Product Code and Name</td>
                        <td>
                            <content ID="immu-{{DATA.INDEX}}_vaccprodcode">{{DATA.IMMUNIZATION_PROD_CODE}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Pharmaceutical Dose Form</td>
                        <td>
                            <content ID="immu-{{DATA.INDEX}}_doseform">{{DATA.IMMUNIZATION_DOSE_FORM}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Lot Number</td>
                        <td>{{DATA.IMMUNIZATION_LOT}}</td>
                    </tr>
                    <tr>
                        <td>Manufacturer</td>
                        <td>
                            <content ID="immu-{{DATA.INDEX}}_manufacturer">{{DATA.IMMUNIZATION_MANUFACTURER}}</content>
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
                            <content ID="immu-{{DATA.INDEX}}_campaign">{{DATA.IMMUNIZATION_CAMPAIGN}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Adverse Immunization(s)</td>
                        <td>
                            <content ID="immu-{{DATA.INDEX}}_adverseimmuevent1">{{DATA.IMMUNIZATION_ADVERSE}}</content>
                        </td>
                    </tr>
                    <tr>
                        <td>Dose Number</td>
                        <td>
                            <content ID="immu-{{DATA.INDEX}}_dosenumber">{{DATA.IMMUNIZATION_DOSE_NUMBER}}</content>
                        </td>
                    </tr>
                </tbody>
            </table>`;

  return processTemplate({
    template: IMMUNIZATION_TEMPLATE,
    templateName: "IMMUNIZATION_TEMPLATE.xml",
    data: immData,
  });
};
