import { processTemplate } from "../processTemplate.js";

export const createInFulfillmentOF = (data) => {
  const IN_FULFILLMENT_OF_TEMPLATE = `<inFulfillmentOf>
		<templateId root="2.16.840.1.113883.3.3731.1.{{DATA.placer_order_template_id}}" />
		<order>
			
					<!-- FILLER Order Number -->
					{{DATA.ORDER_LINE_BLOCK}}
					<!--
							Accession Number(s)
							
							Note: This is the semantical link to the manifests (KOS objects) related to this report.
							Example: 10523475		
							
					-->


					<!-- PLACER Order Number
			
							Explanation of the example:

							*) Order Placer Identifier issued by the order placer: 1234567
							*) Order placer unique "root" OID assigend by nphies: 2.16.840.1.113883.3.3731.1.2.2.10000000003538
								Note: 10000000003538 is the id of the organization of the ordering provider
								including the sub-branch of ".1.2.3" for identifying "Order Placer Numbers" (example - per local configuration) 
						
						-->
					{{DATA.PLACER_ORDER_BLOCK}}


					{{DATA.ACCESSION_BLOCK}}

			</order>
	</inFulfillmentOf>`;

  const processedTemplate = processTemplate({
    template: IN_FULFILLMENT_OF_TEMPLATE,
    templateName: "IN_FULFILLMENT_OF_TEMPLATE.xml",
    data: data,
  });

  return processedTemplate;
};
