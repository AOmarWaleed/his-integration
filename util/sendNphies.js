import {  getConfValue } from "./loadConf.js";
import axios, { isAxiosError } from "axios";
import https from "https";
import { parseHL7MessageResponse } from "./parseHL7MessageResponse.js";
import { clientLogger } from "../config/logger.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { query } from "../config/pgDB.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** * Sends the provided HL7 message to the NPHIES Clinical Services endpoint. This function constructs the target URL from configuration, sets up an HTTPS agent that ignores SSL certificate issues (use with caution in production), and makes a POST request with the HL7 message as plain text. The response from the NPHIES service is then parsed to extract any errors, which are returned along with the raw response.
 * @param {Object} params - parameters for sending the message
 * @param {String} params.hl7Message - the HL7 message to send
 * @param {String} params.apiTransId - the API transaction ID for logging and error tracking
 * @param {Array} [params.msgs] - optional array to which log messages will be appended
 * @param {Number} [params.facilityId] - optional facility ID for configuration retrieval
 * @return {Object} an object containing the raw response from NPHIES and any parsed errors
 */
export async function sendToNphies({
  hl7Message,
  apiTransId,
  msgs,
  facilityId = null,
}) {
  try {
    const NPHIES_CS_ADT_URL = await getConfValue({
      key: "NPHIES_CS_ADT_URL",
      facilityId,
    });
    // const NPHIES_CS_ADT_URL = 'https://integration.cs-ona.nphies.sa:2138/adt';

    msgs &&
      msgs.push(
        `send it to http to url ${NPHIES_CS_ADT_URL}, with api_trans_id ${apiTransId}`,
      );
    msgs && msgs.push(`${hl7Message}`);

    clientLogger.info(
      `Sending message to NPHIES CS at ${NPHIES_CS_ADT_URL} with api_trans_id ${apiTransId}`,
    );

    clientLogger.debug(`HL7 Message  : ${hl7Message}`);

    const segments = hl7Message.split("\r");

    segments.forEach((s, i) => {
      clientLogger.debug(`SEGMENT ${i}:` + s.substring(0, 20));
    });

    const isONA = NPHIES_CS_ADT_URL && NPHIES_CS_ADT_URL?.toLowerCase().includes("ona");

    let agent = null;
    if (!isONA) {
      // For (Stage OR Live): Use certificate with proper validation
      try {
        const certPath = path.join(
          __dirname,
          "../certs",
          "_.cs-stg.nphies.sa.crt",
        );
        const cert = fs.readFileSync(certPath);
        agent = new https.Agent({
          ca: cert,
          rejectUnauthorized: false,
        });
        clientLogger.debug(
          `Using (Stage OR Live) with certificate for URL: ${NPHIES_CS_ADT_URL}`,
        );
      } catch (error) {
        clientLogger.warn(
          `Certificate not found, using self-signed certificate acceptance for HTTPS: ${error.message}`,
        );
        agent = new https.Agent({ rejectUnauthorized: false });
      }
    } else {
      // For ONA: No agent needed (or use agent with rejectUnauthorized: false for development)
      agent = new https.Agent({ rejectUnauthorized: false });
      clientLogger.debug(
        `Using ONA (no certificate) for URL: ${NPHIES_CS_ADT_URL}`,
      );
    }

    // let agent = new https.Agent({
    //   rejectUnauthorized: false,
    // });

    await query(
      `UPDATE api_transaction SET dest_url = '${NPHIES_CS_ADT_URL}' WHERE api_trans_id = ${apiTransId}`,
    );
    const { data: response } = await axios.post(NPHIES_CS_ADT_URL , hl7Message, {
      headers: {
        "Content-Type": "text/plain",
      },
      httpsAgent: agent,
    });

    const errors = parseHL7MessageResponse({
      ackMsg: response,
      originalMsg: hl7Message,
      apiTrans: apiTransId,
    });

    clientLogger.info(
      `Received response from NPHIES CS for api_trans_id ${apiTransId}: ${response}`,
    );

    return { response, errors };
  } catch (error) {
    // console.error("Error sending message to NPHIES:", error);
    clientLogger.error(
      `Error sending message to NPHIES with api_trans_id ${apiTransId}: ${error.message}`,
    );
    if (isAxiosError(error)) {
      await query(
        `UPDATE api_transaction SET response = '${error.response?.data ? JSON.stringify(error.response.data) : error.message}' WHERE api_trans_id = ${apiTransId}`,
      );
      throw error;
    } else {
      throw new Error(error.message);
    }
  }
}
