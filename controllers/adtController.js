import { processHL7MsgBatch } from "../services/adt/processingMsgs.js";

import { HL7_PROCESSORS, QUERIES } from "../util/queries.js";

import {  query } from "../config/pgDB.js";
import OracleDB from "oracledb";
import {
  ALLOWED_HL7_MESSAGE_TYPES,
  MESSAGE_TYPES_REQUIRING_EPISODE,
} from "../util/constant.js";
import { isAxiosError } from "axios";
import { processHL7Batch, processOrderMessages } from "../oldVersion.js";
import { getDefaultFacilityByUserId } from "../util/getDefaultFacilityByUserId.js";
import { clientLogger } from "../config/logger.js";
import { getOracleConnection } from "../config/oracle-dynamic.js";
import { getConfValue } from "../util/loadConf.js";

export const handleAdtMsg = async (req, res) => {

  const facility = req.facility;
  const facilityId = facility.facility_id;
  const connection = req.oracleConnection;
    const requestUrl = `${req.originalUrl}`;


  const {
    http = 1,
    messageType = "ALL",

    patientId,
    episodeNo,
    orderLine,
    status,
    startDate,
    endDate,
  } = req.query;

  if (
    !Object.keys(QUERIES).includes(messageType.toUpperCase()) &&
    messageType.toUpperCase() != "ALL"
  ) {
    return res.status(400).json({
      success: false,
      data: {
        msgId: -10002,
        description: `Invalid messageType '${messageType.toUpperCase()}'. Allowed values are: ${[
          ...ALLOWED_HL7_MESSAGE_TYPES,
        ].join(", ")} or ALL`,
      },
    });
  }

  const msgs = [];
  const results = [];
  const allApiTransIds = [];

  clientLogger.info(
    `Starting batch processing for message type ${messageType.toUpperCase()}`,
  );

  try {
    const messageTypesToProcess =
      messageType.toUpperCase() == "ALL"
        ? [...Object.keys(QUERIES)]
        : [messageType.toUpperCase()];

    clientLogger.debug(
      `Message types to process: ${messageTypesToProcess.join(", ")}`,
    );
    for (const msgType of messageTypesToProcess) {
      if (!QUERIES[msgType]) {
        clientLogger.warn(
          `No query configured for message type ${msgType}, skipping`,
        );
        continue;
      }

      clientLogger.info(`🚗🚗Processing batch for message type ${msgType}`);

      try {
  
         let nphiesCsOrgId = facility.nphies_cs_org_id;
      const NPHIES_CS_TEST_ORG_ID = await getConfValue({
        facilityId: facility.facility_id,
        key: "NPHIES_CS_TEST_ORG_ID",
      });
      if (NPHIES_CS_TEST_ORG_ID) {
        nphiesCsOrgId = NPHIES_CS_TEST_ORG_ID;
      }

        const batchResult = await processHL7MsgBatch({
          connection,
          configItem: QUERIES[msgType],
          requestUrl,
          msgs,
          sendLocal: !(http == 1),
          facilityId,
          nphiesCsOrgId:nphiesCsOrgId,
          filters: {
            patientId,
            episodeNo,
            orderLine,
            status,
            startDate,
            endDate,
          },
        });

        results.push({
          messageType: msgType,
          ...batchResult,
        });

        // Collect all API transaction IDs from child records
        if (batchResult.results) {
          for (const record of batchResult.results) {
            if (record.api_trans_id) {
              allApiTransIds.push(record.api_trans_id);
            }
          }
        }
      } catch (error) {
        clientLogger.error(
          `Error processing batch for ${msgType}:` +
            (error.response
              ? JSON.stringify(error.response.data)
              : error.message),
          error.stack,
        );

        results.push({
          messageType: msgType,
          error: error.message,
          processed: 0,
          successful: 0,
          fail: 0,
        });
      }
    }

    // Calculate totals
    const totalRecords = results.reduce(
      (sum, r) => sum + (r.processed || 0),
      0,
    );
    const successfulRecords = results.reduce(
      (sum, r) => sum + (r.successful || 0),
      0,
    );
    const failedRecords = results.reduce((sum, r) => sum + (r.fail || 0), 0);


    const summary = {
      total_records: totalRecords,
      successful_records: successfulRecords,
      failed_records: failedRecords,
      results: results.map((r) => ({
        message_type: r.messageType,
        processed: r.processed,
        successful: r.successful,
        fail: r.fail,
        batch_child_id: r.batch_child_id,
      })),
    };

    clientLogger.warn(
      `Batch processing completed: ${successfulRecords} successful, ${failedRecords} fail out of ${totalRecords} total records`,
    );

    return res.json({
      success: failedRecords === 0,
      data: {
        summary,
        // msgs: msgs,
        detail: results,
      },
    });
  } catch (error) {
    clientLogger.error("Batch processing error:" + JSON.stringify(error));

    if (isAxiosError(error)) {
      return res.status(400).json({
        success: false,
        data: {
          msgId: -10003,
          description: error.response?.statusText || error.message,
          detail: error.response?.data || error.message,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        data: {
          msgId: -10002,
          description: error.message,
        },
      });
    }
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        clientLogger.error("Connection close error:" + JSON.stringify(err));
      }
    }
  }
};

export const handleOldAdtVersion = async (req, res) => {
  const { startDate, endDate, messageType } = req.params;
  const facilityId = req.query?.facility_id;
  if (!messageType || !startDate || !endDate || !facilityId) {
    return res.status(400).json({
      success: false,
      error: `missingData (startDate , endDate , messageType, facilityId)`,
    });
  }
  const startDateFormated = startDate;
  const endDateFormated = endDate;
  const msgs = [];

  clientLogger.info(
    `Starting batch processing from ${startDateFormated} to ${endDateFormated}`,
  );
  msgs.push(
    `Starting batch processing from ${startDateFormated} to ${endDateFormated} , with msgTypes ${messageType}`,
  );

  let connection;
  try {
    const { rows: facilityRows } = await query(
      `SELECT * FROM facility WHERE facility_id = $1`,
      [facilityId],
    );
    const facility = facilityRows[0];
    if (!facility) {
      return res.status(400).json({
        success: false,
        data: {
          msgId: -10002,
          description: `No facility found for facility_id ${facilityId}`,
        },
      });
    }

    connection = await getOracleConnection({
      facilityId,
      poolScope: "api",
      userParam: facility.his_db_username,
      passwordParam: facility.his_db_password,
      connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
    });

    for (const key of ["A04", "A08", "A01", "A03", "A011"].filter(
      (k) => k === messageType || messageType.toLowerCase() === "all",
    )) {
      await processHL7Batch(
        connection,
        startDateFormated,
        HL7_PROCESSORS[key],
        endDateFormated,
        msgs,
        facilityId,
      );
    }

    for (const key of ["O01", "R01", "O11"].filter(
      (k) => k === messageType || messageType.toLowerCase() === "all",
    )) {
      await processOrderMessages(
        connection,
        startDateFormated,
        HL7_PROCESSORS[key],
        endDateFormated,
        msgs,
        facilityId,
      );
    }

    return res.json({
      success: true,
      data: { startDate: startDateFormated, endDate: endDateFormated, msgs },
      msg: "done",
    });
  } catch (error) {
    clientLogger.error("Batch processing error:" + JSON.stringify(error));
    return res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        clientLogger.error("Connection close error:" + JSON.stringify(err));
      }
    }
  }
};
