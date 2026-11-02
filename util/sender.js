import net from 'net';
import { config } from '../config/index.js';



const sendHL7 = (message, callback) => {
  const socket = new net.Socket();
  const mllpWrapped = `\x0B${message}\x1C\x0D`;

  const host =  config.hl7.host || 'localhost';
  const port = config.hl7.receivePort;

  socket.connect(port, host, () => {
    socket.write(mllpWrapped);
  });

  socket.on('data', data => {
    const ack = data.toString();
    socket.destroy();
    callback(null, ack);
  });

  socket.on('error', err => {
    callback(err);
  });
};

/**
 *  Sends an HL7 message to the configured MLLP endpoint. This function wraps the HL7 message with the necessary MLLP start and end characters, establishes a TCP connection to the MLLP server, and handles the response or any errors that occur during transmission. The function returns a promise that resolves with the acknowledgment received from the MLLP server or rejects with an error if the transmission fails.
 * @param {*} hl7Message  this is the HL7 message string that you want to send to the MLLP endpoint. It should be properly formatted according to HL7 standards before being passed to this function.
 * @param {*} patientId  Just for logging purposes to identify which patient's message is being sent
 * @param {*} messageType Just for logging purposes to identify which type of message is being sent (e.g. ADT^A01)
 * @returns {Promise<string>} A promise that resolves with the acknowledgment received from the MLLP server or rejects with an error if the transmission fails.
 */
export const sendHL7Message = async (hl7Message, patientId, messageType) => {
  return await new Promise((resolve, reject) => {
    sendHL7(hl7Message, (err, ack) => {
      if (err) {
        clientLogger.error(
          `${messageType} HL7 send fail for ${patientId}: ${err}`,
        );
        reject(err);
      } else {
        clientLogger.debug(
          `Successfully processed ${messageType} for patient ${patientId}`,
        );
        resolve(ack);
      }
    });
  });
};