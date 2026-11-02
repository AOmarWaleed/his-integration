import { processTemplate } from "../processTemplate.js";

export const createMedAdmission = (data) => {
  const MED_ADMISSION_TEMPLATE = `
            <table ID="medadmission-{{DATA.INDEX}}">
                <tbody>
                    <tr>
                        <td>Medication Item</td>
                        <td>{{DATA.INDEX}}</td>
                    </tr>
                    <tr>
                        <td>Medication ID</td>
                        <td>CE1215CD-69EC-4C7B-805F-569233C5E159</td>
                    </tr>
                    <tr>
                        <td>Medication Name</td>
                        <td>{{DATA.MED_NAME}}</td>
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
                        <td>{{DATA.APPROACH_SITE}}</td>
                    </tr>
                    <tr>
                        <td>Patient Medication Instructions</td>
                        <td>
                            <content ID="medadmission-{{DATA.INDEX}}_pinstruct">{{DATA.INSTRUCTIONS}}</content>
                        </td>
                    </tr>
                </tbody>
            </table>`;

  const processedTemplate = processTemplate({
    template: MED_ADMISSION_TEMPLATE,
    templateName: "MED_ADMISSION_TEMPLATE.xml",
    data: data,
  });

  return processedTemplate;
};