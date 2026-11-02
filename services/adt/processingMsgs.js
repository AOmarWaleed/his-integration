import OracleDB from "oracledb";
import { createADTMessage } from "../../lib/createADTMsg.js";

import { query as pgQuery, query } from "../../config/pgDB.js";
import { isAxiosError } from "axios";
import { MESSAGE_TYPES_REQUIRING_EPISODE } from "../../util/constant.js";
import { parseAck } from "../../util/parseLocalACK.js";
import { convertKeysToLowerCase } from "../../util/convertKeysToLowerCase.js";
import { insertErrors } from "../../util/insertErrors.js";
import { sendToNphies } from "../../util/sendNphies.js";
import { getCurrentDateWithRiyadh } from "../../lib/segments/datesFormate.js";
import { QUERIES } from "../../util/queries.js";
import { getOracleConnection } from "../../config/oracle-dynamic.js";
import { clientLogger } from "../../config/logger.js";
import { getConfValue } from "../../util/loadConf.js";
import dayjs from "dayjs";
import { sendHL7Message } from "../../util/sender.js";
import { STATUS } from "../../enums/job.enum.js";

//! FOR CRON JOP
/**
 * Process ADT messages for a single facility.
 * Expects an already-open Oracle connection and the facility row.
 *
 * @param {object} args
 * @param {object} args.connection - Oracle connection (owned by caller)
 * @param {object} args.facility - Facility row from PG
 * @param {AbortSignal} args.abortSignal
 * @param {object} args.params - { patientId, episodeNo, startDate, endDate }
 * @returns {Promise<void>}
 */
export async function processADTMsgsForFacility({
  connection,
  facility,
  abortSignal,
  params,
}) {
  const facilityId = facility.facility_id;
  const facilityName = facility.name;

  clientLogger.info(
    `[ADT] Starting ADT processing for facility ${facilityName} (ID: ${facilityId})`,
  );

  let nphiesCsOrgId = facility.nphies_cs_org_id;
  const NPHIES_CS_TEST_ORG_ID = await getConfValue({
    facilityId,
    key: "NPHIES_CS_TEST_ORG_ID",
  });
  if (NPHIES_CS_TEST_ORG_ID) {
    nphiesCsOrgId = NPHIES_CS_TEST_ORG_ID;
  }

  const results = [];
  for (const queryKey of Object.keys(QUERIES)) {
    if (abortSignal?.aborted) {
      clientLogger.debug(
        `[ADT] STOPPING ❌❌❌ before query ${queryKey} for facility ${facilityName} (ID: ${facilityId})`,
      );
      break;
    }

    clientLogger.debug(`[ADT] Starting batch processing for query: ${queryKey}`);
    try {
      const result = await processHL7MsgBatch({
        connection,
        configItem: QUERIES[queryKey],
        sendLocal: false,
        nphiesCsOrgId,
        facilityId,
        abortSignal,
        filters: params,
      });
      clientLogger.debug(
        `[ADT] Completed batch processing for query: ${queryKey} - Processed: ${result.processed}, Successful: ${result.successful}, fail: ${result.fail}`,
      );
      results.push({
        message: `[ADT] query: ${queryKey} - Total Transactions: : ${result.processed} - FAIL:${result.count?.failCount},  SUCCESS:${result.count?.successCount} , ERROR:${result.count?.errorCount}.`,

        ...result,
      });
    } catch (queryError) {
      clientLogger.error(
        `[ADT] Error processing ${queryKey}: ${queryError.message}`,
        queryError,
      );
      // Continue with next query
    }
  }

  clientLogger.debug(
    `[ADT] All batch processing completed for ${Object.keys(QUERIES).length} queries for facility ${facilityName} (ID: ${facilityId})`,
  );

  const summary = results.reduce(
    (p, c) => {
      if (c.count?.failCount) {
        p.fail = p.fail
          ? Number(p.fail) + Number(c.count?.failCount)
          : c.count?.failCount;
      }
      if (c.count?.errorCount) {
        p.error = p.error
          ? Number(p.error) + Number(c.count?.errorCount)
          : c.count?.errorCount;
      }
      if (c.count?.successCount) {
        p.success = p.success
          ? Number(p.success) + Number(c.count?.successCount)
          : c.count?.successCount;
      }

      if (c.processed) {
        p.processed = p.processed
          ? Number(p.processed) + Number(c.processed)
          : c.processed;
      }
      
      return p;
    },
    { fail: 0, error: 0, success: 0, message: "", processed: 0 },
  );

  summary.message = `Total Transactions: : ${summary.processed} - FAIL:${summary.fail},  SUCCESS:${summary.success} , ERROR:${summary.error}.`;

  return summary;
}
export async function processADTMsgs(
  intervalMinutes,
  facility_id,
  abortSignal,
) {
  const startDate = new Date();
  const endDate = getCurrentDateWithRiyadh();
  startDate.setMinutes(startDate.getMinutes() - intervalMinutes);
  startDate.setHours(startDate.getHours() + 3);

  const startDateFormatted = startDate.toISOString().split(".")[0];
  clientLogger.debug(
    `Processing changes since ${startDateFormatted} to ${endDate} with interval ${intervalMinutes} minutes for facility_id ${facility_id || "ALL"}`,
  );

  try {
    const facilities = await query(`
      select 
        f.facility_id, 
        f.name, 
        f.vat_number, 
        f.crn, 
        f.street, 
        f.building_number, 
        f.plot_id, 
        f.district, 
        f.city, 
        f.postal_code,
        f.region,
        f.country_code,
        f.created_by,
        f.creation_date,
        f.modified_by,
        f.modification_date,
        f.logo,
        f.name_locale,
        f.street_locale,
        f.district_locale,
        f.city_locale,
        f.region_locale,
        f.phone,
        f.p_o_box,
        f.email,
        f.website,
        f.cchi_no,
        f.nphies_license,
        f.org_id,
        f.his_db_driver,
        f.his_db_host,
        f.his_db_port,
        f.his_db_name,
        f.his_db_username,
        f.his_db_password 
        ,f.NPHIES_CS_ORG_ID
      from facility f
  	join app_job aj on aj.facility_id  = f.facility_id
  	where aj.job_name  = 'NPHIES CS ADT messages'
    ${facility_id ? "and f.facility_id = " + facility_id : ""};
      `);

    if (!facilities.rows || facilities.rows.length === 0) {
      clientLogger.warn("No facilities found in the database");
      return;
    }

    clientLogger.debug(
      `Found ${facilities.rows.length} facilities to process ADT messages for`,
    );

    for (const facility of facilities.rows) {
      if (abortSignal?.aborted) {
        clientLogger.warn(
          `STOPPING ❌❌❌ ADT message processing for facility ${facility.name} (ID: ${facility.facility_id})`,
        );
        break;
      } else {
        clientLogger.debug(
          `Starting ✅✅✅ ADT message processing for facility ${facility.name} (ID: ${facility.facility_id})`,
        );
      }

      let nphiesCsOrgId = facility.nphies_cs_org_id;
      const NPHIES_CS_TEST_ORG_ID = await getConfValue({
        facilityId: facility.facility_id,
        key: "NPHIES_CS_TEST_ORG_ID",
      });
      if (NPHIES_CS_TEST_ORG_ID) {
        nphiesCsOrgId = NPHIES_CS_TEST_ORG_ID;
      }
      const facilityId = facility.facility_id;

      let connection;
      try {
        connection = await getOracleConnection({
          facilityId,
          poolScope: "job",
          userParam: facility.his_db_username,
          passwordParam: facility.his_db_password,
          connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
        });
        clientLogger.debug(
          `Oracle connection established for facility ${facility.name} (ID: ${facility.facility_id})`,
        );

        for (const query of Object.keys(QUERIES)) {
          // if (query != "A04_ER") continue; //! for test
          clientLogger.debug(`Starting batch processing for query: ${query}`);
          try {
            const result = await processHL7MsgBatch({
              connection,
              configItem: QUERIES[query],
              sendLocal: false,
              nphiesCsOrgId,
              facilityId,
              abortSignal,
            });
            clientLogger.debug(
              `Completed batch processing for query: ${query} - Processed: ${result.processed}, Successful: ${result.successful}, fail: ${result.fail}`,
            );
          } catch (queryError) {
            clientLogger.error(queryError);

            clientLogger.error(
              `Error processing ${query}:` + JSON.stringify(queryError),
            );
            // Continue with next query
          }
        }

        clientLogger.debug(
          `All batch processing completed for ${Object.keys(QUERIES).length} queries for facility ${facility.name} (ID: ${facility.facility_id})`,
        );
      } catch (error) {
        clientLogger.error(error);

        clientLogger.error(
          "Batch processing error for facility " +
            facility.name +
            " (ID: " +
            facility.facility_id +
            "):" +
            JSON.stringify(error),
        );
        // throw error;
      } finally {
        if (connection) {
          try {
            await connection.close();
          } catch (err) {
            clientLogger.error(
              "Connection close error for facility " +
                facility.name +
                " (ID: " +
                facility.facility_id +
                "):" +
                JSON.stringify(err),
            );
          }
        }
      }
    }
  } catch (error) {
    clientLogger.error({
      error,
    });

    clientLogger.error(
      "Unexpected error in processADTMsgs:" + JSON.stringify(error),
    );
  }
}

//! FOR API END POINT
export const processHL7MsgBatch = async ({
  connection,
  configItem,
  msgs = [],
  sendLocal = true,
  nphiesCsOrgId,
  facilityId = null,
  filters = {},
  requestUrl,
  abortSignal,
}) => {
  const { label, messageType, query } = configItem;

  const NPHIES_CS_ROW_LIMIT = await getConfValue({
    key: "NPHIES_CS_ROW_LIMIT",
    facilityId,
  });

  const NPHIES_CS_ADT_START_SEND = await getConfValue({
    key: "NPHIES_CS_ADT_START_SEND",
    facilityId: facilityId,
  });

  const binds = {
    p_int_sent: filters?.status || null,
    p_patient_id: filters?.patientId || null,
    p_episode_no: filters?.episodeNo || null,
    rownum_max: NPHIES_CS_ROW_LIMIT || 50,
  };

  if (NPHIES_CS_ADT_START_SEND) {
    const date = dayjs(NPHIES_CS_ADT_START_SEND, "DD-MM-YYYY").toDate();
    if (!(date instanceof Date) || isNaN(date)) {
      throw new Error(
        `Invalid date format for NPHIES_CS_ADT_START_SEND: ${NPHIES_CS_ADT_START_SEND}`,
      );
    }
    binds.p_date = date;
  } else {
    throw new Error(
      `couldn't find this conf NPHIES_CS_ADT_START_SEND for the current facility ${facilityId}`,
    );
  }

  const startDate = new Date(filters.startDate);
  if (!(startDate instanceof Date) || isNaN(startDate)) {
    binds.startDate = null;
  } else {
    binds.startDate = startDate;
    binds.p_date = startDate;
  }

  const endDate = new Date(filters.endDate);
  if (!(endDate instanceof Date) || isNaN(endDate)) {
    binds.endDate = null;
  } else {
    binds.endDate = endDate;
  }

  if (!requestUrl) {
    requestUrl = `/api/v1/hl7/adt?facilityId=${facilityId || ""}&startDate=${dayjs(binds.p_date).format("DD-MM-YYYY") || ""}`;
  }

  const preprocessStart = process.hrtime.bigint();

  let rows;
  try {
    const result = await connection.execute(query, binds, {
      outFormat: OracleDB.OUT_FORMAT_OBJECT,
      fetchInfo: { START_DATE: { type: OracleDB.STRING } },
    });
    rows = result.rows;
  } catch (error) {
    clientLogger.error(`Error executing query for ${label}: ${error.message}`);
    throw error;
  }

  const preprocessEnd = process.hrtime.bigint();
  const preprocessTimeMs = Number(preprocessEnd - preprocessStart) / 1e6;

  // console.log({preprocessTimeMs} , "************");
  // return;

  const normalizedRows = convertKeysToLowerCase(rows);
  const count = {
    failCount: 0,
    successCount: 0,
    errorCount: 0,
  };

  if (!normalizedRows.length) {
    const msg = `No records found for ${label} processing`;
    clientLogger.debug(msg);
    msgs?.push(msg);
    return { processed: 0, successful: 0, fail: 0, results: [], count };
  }

  const msg = `Found ${normalizedRows.length} records for ${label} processing`;
  clientLogger.debug(msg);
  msgs?.push(msg);

  const results = [];

  for (const record of normalizedRows) {
    if (abortSignal?.aborted) {
      clientLogger.warn(`STOPPING ❌❌❌ ADT message processing`);
      break;
    } else {
      clientLogger.debug(`Starting ✅✅✅ ADT message processing `);
    }

    const recordStart = process.hrtime.bigint();

    let axiosMs = 0;
    let apiTransId = null;
    const generated_function_argument = record.generated_function_argument;

    const computeTimes = () => {
      const recordEnd = process.hrtime.bigint();
      const elapsedMs = Number(recordEnd - recordStart) / 1e6;
      const localMs = Math.max(elapsedMs  - axiosMs, 0);
      return {
        elapsedMs: Math.trunc(elapsedMs),
        localMs: Math.trunc(localMs),
        preprocessMs: Math.trunc(preprocessTimeMs),
        axiosMs: Math.trunc(axiosMs),
      };
    };

    try {
      clientLogger.debug(
        `Processing ${label} for patient_id: ${record.patient_id}, visit_no: ${record.visit_no}, episode_no: ${record.episode_no}`,
      );

      const insertResult = await pgQuery(
        `INSERT INTO api_transaction (
          api_name, patient_id, episode_no, status, api_function,
          api_provider, facility_id, url, preprocess_time_ms, trans_date
        ) VALUES ($1, $2, $3, 'FAIL', $4, 'NPHIES_CS', $5, $6, $7, $8)
        RETURNING api_trans_id`,
        [
          messageType.split("^")[0],
          record.patient_id,
          record.episode_no,
          label,
          facilityId,
          requestUrl,
          Math.trunc(preprocessTimeMs),
          record.trans_date,
        ],
      );
      apiTransId = insertResult.rows?.[0]?.api_trans_id;
      record.message_control_id = insertResult.rows[0].api_trans_id;

      const hl7Message = await createADTMessage(
        record,
        messageType,
        connection,
        nphiesCsOrgId,
        facilityId,
        apiTransId,
        label,
      );

      await pgQuery(
        `UPDATE api_transaction SET request = $1 WHERE api_trans_id = $2`,
        [hl7Message, apiTransId],
      );

      const { rows: systemErrors } = await pgQuery(
        `select * from api_message where api_trans_id = $1 `,
        [apiTransId],
      );

      if (systemErrors.length > 0) {
        clientLogger.warn(
          `Found ${systemErrors.length} system errors for API transaction ID ${apiTransId}. Skipping sending...`,
        );

        count.failCount++;
        results.push({
          status: STATUS.FAIL,
          patient_id: record.patient_id,
          visit_no: record.visit_no,
          episode_no: record.episode_no,
          api_trans_id: apiTransId,
          success: false,
          errors: systemErrors.map((err) => err.nphies_message),
          hl7_message: hl7Message,
        });

        if (configItem.generateAfterQuery && generated_function_argument) {
          const result = await connection.execute(
            configItem.generateAfterQuery(),
            { generated_function_argument, status: "E" },
          );
          await connection.commit();
          clientLogger.debug(
            `Executed after-send query for ${label} with argument ${generated_function_argument} and status E and result ${JSON.stringify(result)}`,
          );
        }

        const t = computeTimes();

        await pgQuery(
          `UPDATE api_transaction
             SET 
                 elapsed_time_ms  = $1,
                 local_api_time_ms = $2,
                 preprocess_time_ms = $3,
                 response_time_ms = $4
           WHERE api_trans_id = $5`,
          [t.elapsedMs, t.localMs, t.preprocessMs, t.axiosMs, apiTransId],
        );

        continue;
      }

      if (sendLocal) {
        const res = await sendHL7Message(hl7Message, record.patient_id, label);
        const ack = parseAck(res);

        await pgQuery(
          `UPDATE api_transaction
             SET status = 'SUCCESS', response = $1
           WHERE api_trans_id = $2`,
          [JSON.stringify(ack), apiTransId],
        );

        results.push({
          patient_id: record.patient_id,
          visit_no: record.visit_no,
          episode_no: record.episode_no,
          api_trans_id: apiTransId,
          success: true,
          ack,
          hl7_message: hl7Message,
        });

        const t = computeTimes();

        await pgQuery(
          `UPDATE api_transaction
             SET elapsed_time_ms  = $1,
                 local_api_time_ms = $2,
                 preprocess_time_ms = $3,
                 response_time_ms   = $4
           WHERE api_trans_id = $5`,
          [t.elapsedMs, t.localMs, t.preprocessMs, t.axiosMs, apiTransId],
        );

        clientLogger.debug(
          `Successfully processed ${label} for patient ${record.patient_id} via socket`,
        );
      } else {
        const axiosStart = process.hrtime.bigint();

        try {
          const { response, errors } = await sendToNphies({
            hl7Message,
            apiTransId,
            msgs,
            facilityId,
          });
          axiosMs = Number(process.hrtime.bigint() - axiosStart) / 1e6;

          await insertErrors(errors);

          const status = errors.length > 0 ? "ERROR" : "SUCCESS";

          await pgQuery(
            `UPDATE api_transaction
               SET status = $1, response = $2, response_time_ms = $3
             WHERE api_trans_id = $4`,
            [status, response, Math.trunc(axiosMs), apiTransId],
          );

          if (errors.length) {
            count.errorCount++;
          } else {
            count.successCount++;
          }

          results.push({
            patient_id: record.patient_id,
            visit_no: record.visit_no,
            episode_no: record.episode_no,
            api_trans_id: apiTransId,
            success: errors.length === 0,
            status: errors.length == 0 ? STATUS.ERROR : STATUS.ERROR,
            errors,
            response_time_ms: axiosMs,
            hl7_message: hl7Message,
            response,
          });

          if (configItem.generateAfterQuery) {
            let oracleStatus = "E";
            if (status === "SUCCESS") oracleStatus = "S";

            const result = await connection.execute(
              configItem.generateAfterQuery(),
              { generated_function_argument, status: oracleStatus },
            );
            await connection.commit();
            clientLogger.debug(
              `Executed after-send query for ${label} with argument ${generated_function_argument} and status ${oracleStatus} and result ${JSON.stringify(result)}`,
            );
          }

          clientLogger.debug(
            `Successfully sent ${label} for patient ${record.patient_id}, response time: ${axiosMs}ms`,
          );

          await connection.commit();
        } catch (axiosError) {
          axiosMs = Number(process.hrtime.bigint() - axiosStart) / 1e6;

          clientLogger.error(
            `HTTP error sending ${label} for patient ${record.patient_id}: ${axiosError.message}`,
          );

          await pgQuery(
            `UPDATE api_transaction
               SET status = 'ERROR', error_message = $1, response = $2
             WHERE api_trans_id = $3`,
            [axiosError.message, axiosError, apiTransId],
          );

          if (configItem.generateAfterQuery && generated_function_argument) {
            const result = await connection.execute(
              configItem.generateAfterQuery(),
              { generated_function_argument, status: "E" },
            );
            await connection.commit();
            clientLogger.debug(
              `Executed after-send query for ${label} with argument ${generated_function_argument} and status E and result ${JSON.stringify(result)}`,
            );
          }

          count.errorCount++;

          results.push({
            patient_id: record.patient_id,
            visit_no: record.visit_no,
            episode_no: record.episode_no,
            api_trans_id: apiTransId,
            success: false,
            status: STATUS.ERROR,
            error: axiosError.message,
            hl7_message: hl7Message,
          });
        }

        const t = computeTimes();

        await pgQuery(
          `UPDATE api_transaction
             SET elapsed_time_ms  = $1,
                 local_api_time_ms = $2,
                 preprocess_time_ms = $3,
                 response_time_ms = $4
           WHERE api_trans_id = $5`,
          [t.elapsedMs, t.localMs, t.preprocessMs, t.axiosMs, apiTransId],
        );
      }
    } catch (err) {
      clientLogger.error(
        `fail processing ${label} for patient ${record?.patient_id}: ${err.message}`,
      );

      if (generated_function_argument && configItem.generateAfterQuery) {
        try {
          const result = await connection.execute(
            configItem.generateAfterQuery(),
            { generated_function_argument, status: "E" },
          );
          await connection.commit();
          clientLogger.debug(
            `Executed after-send query for ${label} with argument ${generated_function_argument} and status E and result ${JSON.stringify(result)}`,
          );
        } catch (oracleErr) {
          clientLogger.error(
            `Also failed executing after-send query for ${label}: ${oracleErr.message}`,
          );
        }
      }

      const t = computeTimes();

      if (apiTransId) {
        try {
          await pgQuery(
            `UPDATE api_transaction
               SET status = 'FAIL',
                   error_message = $1,
                   elapsed_time_ms = $2,
                   local_api_time_ms = $3,
                   response_time_ms = $4,
                   preprocess_time_ms = $5
             WHERE api_trans_id = $6`,
            [
              err.message,
              t.elapsedMs,
              t.localMs,
              t.axiosMs,
              t.preprocessMs,
              apiTransId,
            ],
          );
        } catch (pgErr) {
          clientLogger.error(
            `Failed updating api_transaction for ${label} (id=${apiTransId}): ${pgErr.message}`,
          );
        }
      }

      count.failCount++;
      results.push({
        patient_id: record?.patient_id,
        visit_no: record?.visit_no,
        episode_no: record?.episode_no,
        api_trans_id: apiTransId || null,
        success: false,
        status: STATUS.FAIL,
        error: err.message,
        stack: err.stack,
      });
    }
  }

  const successful = results.filter((r) => r.success).length;
  const fail = results.filter((r) => !r.success).length;

  clientLogger.debug(
    `Batch processing completed for ${label}: ${successful} successful, ${fail} fail out of ${results.length} total`,
  );

  msgs?.push(
    `Batch processing completed: ${successful} successful, ${fail} fail out of ${results.length} total`,
  );

  return {
    processed: results.length,
    successful,
    fail,
    results,
    messageType,
    label,
    count: count,
  };
};
