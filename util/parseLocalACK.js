/**
 * Parses a local ACK message to extract relevant information
 * @param {string} ack - The raw ACK message string
 * @returns {Object} An object containing the parsed ACK information
 */
export const parseAck = (ack) => {
  const clean = ack.replace(/^\x0B/, "").replace(/\x1C\r?$/, "");

  const segments = clean.split("\r");

  const msa = segments.find((s) => s.startsWith("MSA|"));
  const [, ackCode, originalMsgId, ackText] = msa.split("|");

  const ztd = segments.find((s) => s.startsWith("ZTD|"));
  let transactionId, status;

  if (ztd) {
    [, transactionId, status] = ztd.split("|");
  }

  return { ackCode, ackText, originalMsgId, transactionId, status };
};
