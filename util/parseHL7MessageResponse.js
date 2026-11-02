
/**
 * Parses an HL7 ACK message to extract error information
 * @param {Object} params
 * @param {string} params.ackMsg - The HL7 ACK message
 * @param {string} params.originalMsg - The original HL7 message
 * @param {string} params.apiTrans - The API transaction ID
 * @returns {Array} An array of error objects
 */
export function parseHL7MessageResponse({ ackMsg, originalMsg, apiTrans }) {
  const errors = [];

  const ackLines = ackMsg.split(/\r/);
  const originalLines = originalMsg.split(/\r?\n/);

  function getElementValue(location) {
    if (!location) return null;
    const [seg, segSeq = "1", field, rep = "1", comp] = location?.split("^");
    let count = 0;

    for (const line of originalLines) {
      if (line.startsWith(seg + "|")) {
        count++;
        if (count === Number(segSeq)) {
          const fields = line.split("|");
          const fieldVal = fields[field] || "";
          const reps = fieldVal.split("~");
          const repVal = reps[Number(rep) - 1] || "";
          if (!comp) return repVal;
          return repVal.split("^")[Number(comp) - 1] || "";
        }
      }
    }
    return null;
  }

  ackLines.forEach((line) => {
    if (!line.startsWith("ERR|")) return;

    const parts = line.split("|");

    const error_location = parts[2];
    const hl7_error_code = parts[3];
    const severity = parts[4];
    const app_error = parts[5];
    const error_element = parts[6];

    errors.push({
      api_trans_id: apiTrans,
      error_location,
      msg: hl7_error_code,
      severity,
      nphies_message_id: app_error?.split("^")[0] || "",
      error_element: `${error_element || ""} - ${error_location || ""}`,
      element_value: getElementValue(error_location) || "",
      resource: line || "",
    });
  });

  return errors;
}
