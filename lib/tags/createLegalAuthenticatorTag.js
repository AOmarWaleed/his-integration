import { processTemplate } from "../processTemplate.js";

export const createLegalAuthenticatorTag = (data) => {
  const LEGAL_AUTHENTICATOR = `<legalAuthenticator>
		<templateId root="2.16.840.1.113883.3.3731.1.203.28.5" />
		<time value="{{DATA.CREATION_DATE_FORMATTED}}" />
		<signatureCode code="S" />
		<assignedEntity>
			<id extension="13KA0054149" root="2.16.840.1.113883.3.3731.1.2.1" />
			<!-- same address as for author, nullFlavor is used -->
			<addr nullFlavor="NI" />
			<!-- same telecom as for author, nullFlavor is used -->
			<telecom nullFlavor="NI" />
			<assignedPerson>
				<name use="L">
					<prefix>{{DATA.LEGAL_AUTH.TITLE}}</prefix>
					<family>{{DATA.LEGAL_AUTH.LAST_NAME}}</family>
					<given>{{DATA.LEGAL_AUTH.FIRST_NAME}}</given>
				</name>
			</assignedPerson>
		</assignedEntity>
	</legalAuthenticator>`;

  const processedTemplate = processTemplate({
    template: LEGAL_AUTHENTICATOR,
    templateName: "LEGAL_AUTHENTICATOR.xml",
    data: data,
  });

  return processedTemplate;
};
