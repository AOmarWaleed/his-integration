import { XMLParser } from "fast-xml-parser";
import { query } from "../config/pgDB.js";
import { clientLogger } from "../config/logger.js";

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
});

/**
 * Parses a NPHIES SOAP XML response and inserts any RegistryError entries
 * or SOAP Fault errors into the api_message table.
 *
 * Expected XML structures:
 * 1. RegistryResponse (success/error):
 * <env:Envelope>
 *   <env:Body>
 *     <rs:RegistryResponse status="...">
 *       <rs:RegistryErrorList>
 *         <rs:RegistryError codeContext="..." errorCode="..." location="..." severity="..." />
 *       </rs:RegistryErrorList>
 *     </rs:RegistryResponse>
 *   </env:Body>
 * </env:Envelope>
 *
 * 2. SOAP Fault (error):
 * <soapenv:Envelope>
 *   <soapenv:Body>
 *     <soapenv:Fault>
 *       <soapenv:Code>
 *         <soapenv:Value>soapenv:Sender</soapenv:Value>
 *         <soapenv:Subcode>
 *           <soapenv:Value>wsa:ActionNotSupported</soapenv:Value>
 *         </soapenv:Subcode>
 *       </soapenv:Code>
 *       <soapenv:Reason>
 *         <soapenv:Text xml:lang="en-US">...</soapenv:Text>
 *       </soapenv:Reason>
 *       <soapenv:Detail>
 *         <wsa:ProblemAction>
 *           <wsa:Action>...</wsa:Action>
 *         </wsa:ProblemAction>
 *       </soapenv:Detail>
 *     </soapenv:Fault>
 *   </soapenv:Body>
 * </soapenv:Envelope>
 *
 * @param {string} xmlResponse - Raw XML response string from NPHIES
 * @param {number} apiTransId - The api_trans_id to associate errors with
 * @returns {Promise<{ status: string|null, errors: Array }>}
 */
export async function parseAndInsertXmlErrors(xmlResponse, apiTransId) {
    if (!xmlResponse || typeof xmlResponse !== "string") {
        return { status: null, errors: [] };
    }

    const parsed = parser.parse(xmlResponse);

    // Check for SOAP Fault first
    const fault = parsed?.Envelope?.Body?.Fault;
    if (fault) {
        return await handleSoapFault(fault, apiTransId);
    }

    // Check for RegistryResponse
    const registryResponse = parsed?.Envelope?.Body?.RegistryResponse;
    if (!registryResponse) {
        return { status: null, errors: [] };
    }

    return await handleRegistryResponse(registryResponse, apiTransId);
}

/**
 * Handles SOAP Fault responses
 */
async function handleSoapFault(fault, apiTransId) {
    // Extract fault code
    let faultCode = fault?.Code?.Value || "";
    const subCode = fault?.Code?.Subcode?.Value || "";
    
    // Extract fault reason - handle both string and object cases
    let faultReason = "";
    if (fault?.Reason?.Text) {
        if (typeof fault.Reason.Text === 'string') {
            faultReason = fault.Reason.Text;
        } else if (typeof fault.Reason.Text === 'object') {
            // Handle case where Text has xml:lang attribute
            // The parser might return { "@_xml:lang": "en-US", "#text": "The [action]..." }
            // or just the text as a string in some cases
            if (fault.Reason.Text["#text"]) {
                faultReason = fault.Reason.Text["#text"];
            } else {
                // Try to get any text value from the object
                const textValues = Object.values(fault.Reason.Text).filter(val => typeof val === 'string');
                if (textValues.length > 0) {
                    faultReason = textValues[0];
                }
            }
        }
    }
    
    // Extract detail (ProblemAction)
    let detailInfo = "";
    if (fault?.Detail?.ProblemAction?.Action) {
        detailInfo = `Action: ${fault.Detail.ProblemAction.Action}`;
    }
    
    // Build error message
    let statusMessage = `SOAP Fault: ${faultCode}`;
    if (subCode) {
        statusMessage += ` - ${subCode}`;
    }
    if (faultReason) {
        statusMessage += ` - ${faultReason}`;
    }
    if (detailInfo) {
        statusMessage += ` (${detailInfo})`;
    }

    clientLogger.error(`SOAP Fault detected for api_trans_id ${apiTransId}: ${statusMessage}`, {
        faultCode,
        subCode,
        faultReason,
        detailInfo
    });


    // if (faultReason.includes('No running communication point')){
    //     faultCode = 'DOWN_ENDPOINT'
    // }

    // Insert into database
    await query(
        `INSERT INTO api_message (
            api_trans_id,
            error_element,
            nphies_message_id,
            nphies_message
        ) VALUES ($1, $2, $3, $4)`,
        [apiTransId, "SOAP:Fault", faultCode || "DOWN_ENDPOINT", statusMessage]
    );

    const errorObj = {
        errorCode: faultCode || "SOAP_ERROR",
        location: "SOAP:Fault",
        severity: "Error",
        message: statusMessage,
        subCode: subCode,
        faultReason: faultReason,
        detail: detailInfo
    };

    return { status: "fail", errors: [errorObj] };
}

/**
 * Handles RegistryResponse (existing logic)
 */
async function handleRegistryResponse(registryResponse, apiTransId) {
    const status = registryResponse["@_status"] || null;

    const errorList = registryResponse?.RegistryErrorList;
    if (!errorList) {
        // Some failures encode the error directly in the status attribute
        if (status && !status.endsWith("Success")) {
            const statusMessage = status.replace(
                /^urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:/,
                "",
            );
            await query(
                `INSERT INTO api_message (
                    api_trans_id,
                    error_element,
                    nphies_message_id,
                    nphies_message
                ) VALUES ($1, $2, $3, $4)`,
                [apiTransId, "", statusMessage?.includes('already exists') ?  'DUPLICATE': "DOWN_ENDPOINT", statusMessage]
            );
            return { 
                status, 
                errors: [{ 
                    errorCode: "", 
                    location: "", 
                    severity: "", 
                    message: statusMessage 
                }] 
            };
        }
        return { status, errors: [] };
    }

    // Normalize to array (single error comes as object, multiple as array)
    const rawErrors = Array.isArray(errorList.RegistryError)
        ? errorList.RegistryError
        : errorList.RegistryError
            ? [errorList.RegistryError]
            : [];

    const insertedErrors = [];

    for (const registryError of rawErrors) {
        const codeContext = registryError["@_codeContext"] || "";
        const errorCode = registryError["@_errorCode"] || "";
        const location = registryError["@_location"] || "";
        const severity = registryError["@_severity"] || "";

        // codeContext may contain multiple errors separated by semicolons
        const messages = codeContext
            .split(";")
            .map((msg) => msg.trim())
            .filter(Boolean);

        for (const message of messages) {
            await query(
                `INSERT INTO api_message (
                    api_trans_id,
                    error_element,
                    nphies_message_id,
                    nphies_message
                ) VALUES ($1, $2, $3, $4)`,
                [apiTransId, location, (message?.includes('already exists') ? 'DUPLICATE' : (errorCode || "DOWN_ENDPOINT")) , message]
            );

            insertedErrors.push({
                errorCode,
                location,
                severity,
                message,
            });
        }
    }

    return { status, errors: insertedErrors };
}