

    import { processTemplate } from "../processTemplate.js";
    
    export const createPerformerTag = (data) => {
      const PERFORMER_TAG_TEMPLATE = `
           <documentationOf>
		<serviceEvent>
			<performer typeCode="PRF">
				<templateId root="2.16.840.1.113883.3.3731.1.203.28.7"/>
				<time value="20210602123500+0300"/>
				<assignedEntity>
					<id extension="17JP0032773" root="2.16.840.1.113883.3.3731.1.2.1"/>
					<!-- same address as for author, nullFlavor is used -->
					<addr nullFlavor="NI"/>
					<!-- same telecom as for author, nullFlavor is used -->
					<telecom nullFlavor="NI"/>
					<assignedPerson>
						<name>
							<family>PARAMEDIC</family>
							<given>Osama</given>
						</name>
					</assignedPerson>
				</assignedEntity>
			</performer>
		</serviceEvent>
	</documentationOf>`;
    
      return processTemplate({
        template: PERFORMER_TAG_TEMPLATE,
        templateName: "PERFORMER_TAG_TEMPLATE.xml",
        data: data,
      });
    };