import OracleDB from "oracledb";

import net from "net";

import { CONST, initConstants } from "./util/constant.js";
// import { config } from "./config/app.js";
import {
  createORMMessage,
  createORUMessage,
  createRDEMessage,
} from "./lib/createOrderMessages.js";
import { clientLogger } from "./config/logger.js";
import { fetchChiefComplaints } from "./util/fetchChiefComplaints.js";
import { fetchDiagnosis } from "./util/fetchDiagnosis.js";
import { fetchSymptoms } from "./util/fetchSymptoms.js";
import { fetchPatientReadings } from "./util/fetchPatientReadings.js";
import { fetchEncounter } from "./util/fetchEncounter.js";
import { fetchInpatientEncounter } from "./util/fetchInpatientEncounter.js";
import { fetchEmergencyEncounter } from "./util/fetchEmergencyEncounter.js";
import { fetchOutpatientEncounter } from "./util/fetchOutpatientEncounter.js";
import {  getConfValue } from "./util/loadConf.js";
import { getOracleConnection } from "./config/oracle-dynamic.js";
import { query } from "./config/pgDB.js";
import { config } from "./config/index.js";

const sendHL7 = (message, callback) => {
  const socket = new net.Socket();
  const mllpWrapped = `\x0B${message}\x1C\x0D`;

  const host = config.hl7.host || "localhost";
  const port = config.hl7.receivePort;

  socket.connect(port, host, () => {
    socket.write(mllpWrapped);
  });

  socket.on("data", (data) => {
    const ack = data.toString();
    socket.destroy();
    callback(null, ack);
  });

  socket.on("error", (err) => {
    callback(err);
  });
};

/**
 * Retrieves patient identity information from the database
 * @param {number} patientId - The patient ID to look up
 * @param {oracledb.Connection} [connection] - Optional existing connection
 * @returns {Promise<PatientIdentityInfo>}
 */
const getPatientIdentityInfo = async (patientId, connection = null) => {
  let shouldCloseConnection = false;
  let conn = connection;

  try {
    const bindVars = {
      p_patient_id: {
        dir: OracleDB.BIND_IN,
        val: Number(patientId),
        type: OracleDB.NUMBER,
      },
      p_identity_no: {
        dir: OracleDB.BIND_OUT,
        type: OracleDB.STRING,
        maxSize: 32767,
      },
      p_identity_type: {
        dir: OracleDB.BIND_OUT,
        type: OracleDB.STRING,
        maxSize: 32767,
      },
      retval: {
        dir: OracleDB.BIND_OUT,
        type: OracleDB.NUMBER,
      },
    };

    const result = await conn.execute(
      `BEGIN
         :retval := DEVDBA.GET_PATIENT_IDENTITY_INFO(
           :p_patient_id,
           :p_identity_no,
           :p_identity_type
         );
       END;`,
      bindVars,
    );

    return {
      success: result.outBinds.retval === 0,
      patientId,
      identityNo: result.outBinds.p_identity_no,
      identityType: result.outBinds.p_identity_type,
      returnCode: result.outBinds.retval,
    };
  } catch (error) {
    console.error("Error in getPatientIdentityInfo:" + JSON.stringify(error));
    throw new Error(`fail to retrieve patient identity: ${error.message}`);
  } finally {
    if (conn && shouldCloseConnection) {
      try {
        await conn.close();
      } catch (err) {
        console.error("Error closing connection:" + JSON.stringify(err));
      }
    }
  }
};

/**
 * Gets patient file ID (MRN) from the database
 * @param {number} patientId - The patient ID to look up
 * @param {oracledb.Connection} [connection] - Optional existing connection
 * @returns {Promise<string>}
 */
const getPatientFileId = async (patientId, connection = null) => {
  let shouldCloseConnection = false;
  let conn = connection;

  try {
    const result = await conn.execute(
      `SELECT pat.get_patient_file_id(:patientId) AS mrn FROM DUAL`,
      { patientId },
    );

    if (!result.rows || result.rows.length === 0) {
      throw new Error("No patient file ID found");
    }

    return result.rows[0][0];
  } catch (error) {
    console.error("Error in getPatientFileId:" + JSON.stringify(error));
    throw new Error(`fail to retrieve patient file ID: ${error.message}`);
  } finally {
    if (conn && shouldCloseConnection) {
      try {
        await conn.close();
      } catch (err) {
        console.error("Error closing connection:" + JSON.stringify(err));
      }
    }
  }
};

/**
 * Gets external code mapping information
 * @param {GetExternalCodeParams} params
 * @param {oracledb.Connection} [connection] - Optional existing connection
 * @returns {Promise<ExternalCodeMapping>}
 */

const getExternalCodeMapping = async (
  { oasisCode, src = "NPHIES_CS", mappingType = "USER_CODE", extType = "ID" },
  connection = null,
) => {
  let shouldCloseConnection = false;
  let conn = connection;

  try {
    const bindVars = {
      p_oasis_code: {
        dir: OracleDB.BIND_IN,
        val: oasisCode,
        type: OracleDB.STRING,
      },
      p_src: {
        dir: OracleDB.BIND_IN,
        val: src,
        type: OracleDB.STRING,
      },
      p_mapping_type: {
        dir: OracleDB.BIND_IN,
        val: mappingType,
        type: OracleDB.STRING,
      },
      p_ext_type: {
        dir: OracleDB.BIND_IN,
        val: extType,
        type: OracleDB.STRING,
      },
      p_ext_code: {
        dir: OracleDB.BIND_OUT,
        type: OracleDB.STRING,
        maxSize: 32767,
      },
      p_ext_desc: {
        dir: OracleDB.BIND_OUT,
        type: OracleDB.STRING,
        maxSize: 32767,
      },
      retval: {
        dir: OracleDB.BIND_OUT,
        type: OracleDB.NUMBER,
      },
    };

    const result = await conn.execute(
      `BEGIN
         :retval := DEVDBA.INSURANCE_MNT.GET_EXT_CODE(
           :p_oasis_code,
           :p_src,
           :p_mapping_type,
           :p_ext_type,
           :p_ext_code,
           :p_ext_desc
         );
       END;`,
      bindVars,
    );

    return {
      success: result.outBinds.retval === 0,
      oasisCode,
      extCode: result.outBinds.p_ext_code,
      extDesc: result.outBinds.p_ext_desc,
      returnCode: result.outBinds.retval,
    };
  } catch (error) {
    console.error("Error in getExternalCodeMapping:" + JSON.stringify(error));
    throw new Error(
      `fail to retrieve external code mapping: ${error.message}`,
    );
  } finally {
    if (conn && shouldCloseConnection) {
      try {
        await conn.close();
      } catch (err) {
        console.error("Error closing connection:" + JSON.stringify(err));
      }
    }
  }
};

//!!! condition at ORM and RDE
//!!! query so slow with ORU  (i want to get patientId ,  episode)
const HL7_PROCESSORS = {
  A04: {
    label: "A04",
    messageType: "ADT^A04",
    query: `SELECT 
              pmd.*, 
              p_id.* 
            FROM patient_master_data pmd 
            INNER JOIN patient_ids p_id ON pmd.PATIENT_ID = p_id.PATIENT_ID 
            WHERE pmd.CREATION_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
              AND pmd.CREATION_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
            ORDER BY pmd.CREATION_DATE`,
  },
  A08: {
    label: "A08",
    messageType: "ADT^A08",
    query: `SELECT 
              pmd.*, 
              p_id.* 
            FROM patient_master_data pmd 
            INNER JOIN patient_ids p_id ON pmd.PATIENT_ID = p_id.PATIENT_ID 
            WHERE pmd.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
              AND pmd.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
            ORDER BY pmd.AMEND_LAST_DATE`,
  },
  A01: {
    label: "A01",
    messageType: "ADT^A01",
    query: `SELECT 
              pe.*,
              pmd.*,
              p_id.*
            FROM patient_episodes pe
            JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID
            JOIN patient_ids p_id ON pe.PATIENT_ID = p_id.PATIENT_ID
            WHERE pe.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS')
              AND pe.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')`,
  },
  A03: {
    label: "A03",
    messageType: "ADT^A03",
    query: `SELECT 
              pe.*, 
              pmd.*, 
              p_id.* 
            FROM patient_episodes pe 
            JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID 
            JOIN patient_ids p_id ON pe.PATIENT_ID = p_id.PATIENT_ID 
            WHERE pe.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
              AND pe.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')`,
  },
  A011: {
    label: "A011",
    messageType: "ADT^A011",
    query: `SELECT
        pe.episode_no visit_no ,
        pg.ATTENDANCE_TYPE ,
        pe.start_date,
        pg.ELIGIBILITY_STATUS ,
        pg.*,
        pmd.*
  FROM patient_episodes pe
  JOIN OASIS.PATIENT_ELIGIBILITY pg ON
      pg.patient_id = pe.patient_id
      AND pg.EPISODE_NO = pe.EPISODE_NO
  JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID
  WHERE
      pg.ELIGIBILITY_STATUS = 'C'
      AND pg.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS')
      AND pg.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')`,
  },
  A013: {
    label: "A013",
    messageType: "ADT^A013",
    query: `SELECT
        pe.episode_no visit_no ,
        pg.ATTENDANCE_TYPE ,
        pe.start_date,
        pg.ELIGIBILITY_STATUS ,
        pg.*,
        pmd.*
  FROM patient_episodes pe
  JOIN OASIS.PATIENT_ELIGIBILITY pg ON
      pg.patient_id = pe.patient_id
      AND pg.EPISODE_NO = pe.EPISODE_NO
  JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID
  WHERE
      pg.ELIGIBILITY_STATUS = 'C'
      AND pg.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS')
      AND pg.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')`,
  },
  // !!!!!!! start ordering msgs
  O01: {
    label: "O01",
    messageType: "ORM^O01",

    query: `SELECT 
    om.status as OM_STATUS,
    patient_id,
    episode_no,
    ol.*,
    TO_CHAR(om.ORDER_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ORDER_DATE,
    om.MASTER_ORDER_NO,
    om.SERVICE_DEPT,
    om.ADMISSION_NO,
    im.IOS_MAIN
FROM OASIS.ORDERS_MASTER om
JOIN OASIS.ORDER_LINES ol ON ol.MASTER_ORDER_NO = om.MASTER_ORDER_NO
JOIN IOS_MASTER im ON im.IOS = ol.IOS
LEFT JOIN ios_master_data ims ON ims.ios = ol.ios
LEFT JOIN ios_main_data imn ON imn.ios_main = ims.ios_main
WHERE     ol.AMEND_LAST_DATE >= TO_DATE (:startDate, 'YYYY-MM-DD"T"HH24:MI:SS')
       AND ol.AMEND_LAST_DATE <= TO_DATE (:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')
       AND imn.service_type != 'MED'
       and  om.patient_id = 4 AND om.episode_no = 3 and ol.order_line = 27156883 --remove
  `,
  },
  O11: {
    label: "O11",
    messageType: "RDE^O11",

    query: ` 
    SELECT /*+all_rows*/
    patient_id,
    ol.*,
    TO_CHAR(om.ORDER_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ORDER_DATE,

    om.master_order_no,
    om.service_dept,
    om.admission_no,
    om.EPISODE_NO,
    ol.order_line as order_line_id,
    ROW_NUMBER() OVER (PARTITION BY om.patient_id, om.episode_no ORDER BY ol.order_line) as item_no,
    ROUND((NVL(ol.units_ordered, 0) * NVL(d.no_of_days, 0)) / NULLIF(d.times, 0), 2) as supply_period,
    ol.status,
    ROUND(d.admin_qty, 6) as unit,
    CASE 
        WHEN d.admin_type = 'M' THEN 'ML'
        WHEN d.admin_type = 'D' THEN 'DROPS'
        WHEN d.admin_type = 'U' THEN imn.sales_uom_code
        ELSE d.admin_type
    END as unit_type_raw,
    d.times as dosage_times,
    dc.description as per,
    dc.description as dosage,
    imn.scientific_code as prescribed_code,
    CASE 
        WHEN imn.drug_dispensing_type = 'B' THEN 'PAT_REQ'
        ELSE 'GENERIC'
    END as selection_reason_raw,
    COALESCE(ol.reason_for_ios, 'Standard dosage') as dosage_institution_text,
    d.dosage_start_datetime as repeat_start,
    dc.description as patient_instruction,
    d.dosage_start_datetime + d.no_of_days as repeat_end,
    REPLACE(TO_CHAR(d.no_of_days), ',', '.') as duration_value,
    'd' as duration_unit,
    d.no_of_periods as frequency,
    d.no_of_days as dosage_period,
    'd' as period_unit,
    d.admin_qty as dose_rate_value,
    CASE 
        WHEN d.admin_type = 'M' THEN 'ML'
        WHEN d.admin_type = 'D' THEN 'DROPS'
        WHEN d.admin_type = 'U' THEN imn.sales_uom_code
        ELSE d.admin_type
    END as dose_rate_code,
    d.route as route_raw,
    (SELECT m.strength || LOWER(m.measure) 
     FROM ph_ios_medicine m 
     WHERE m.ios_main = imn.ios_main 
       AND ROWNUM = 1) as strength,
    om.patient_id,
    om.episode_no,
    om.status AS OM_STATUS,
    imn.drug_dispensing_type,
    imn.sales_uom_code,
    ims.IOS_MAIN
FROM orders_master om
JOIN order_lines ol ON om.master_order_no = ol.master_order_no
JOIN ios_master_data ims ON ol.ios = ims.ios
JOIN ios_main_data imn ON imn.ios_main = ims.ios_main
JOIN ph_dosage_master d ON ol.order_line = d.order_line
JOIN dosage_codes dc ON d.dosage_code = dc.dosage_code
WHERE ol.status NOT IN ('D', 'C', 'P', 'Q')
    --AND imn.service_type = 'MED'
    --AND imn.scientific_code IS NOT NULL
    AND ol.AMEND_LAST_DATE BETWEEN TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
                    AND TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')
    --AND om.patient_id = NVL(:p_patient_id, om.patient_id)
    --AND om.episode_no = NVL(:p_episode_no, om.episode_no)
    --and  om.patient_id = 4 AND om.episode_no = 3 and ol.order_line = 27156883 --remove
ORDER BY om.patient_id, om.episode_no, ol.order_line
    
    
    
    `,
  },
  R01: {
    label: "R01",
    messageType: "ORU^R01",

    query: `
SELECT /*+all_rows*/ DISTINCT 
  ol.ORDER_LINE,
  om.MASTER_ORDER_NO,
  ol.IOS,
   ol.line_order_date,
  ol.STATUS,
  ol.URGENT_FLAG,
  ol.CREATION_DATE,
  ol.PACS_ORDER_STARTED_DATE,
  ol.PACS_ORDER_COMPLETED_DATE,
  ol.CONSULTANT_ID,
  ol.ORDER_BY_TYPE,
  ol.STAFF_ID,
  ol.DOSAGE_CODE,
  ol.REASON_FOR_IOS,
    ol.UNITS_ORDERED,
  om.SERVICE_DEPT,
  om.ADMISSION_NO,
  ol.LINE_EXPIRY_DATE,
  ol.FILLER_ORDER_MASTER,
  ol.OF_ORDER_NO,
  om.MASTER_ORDER_NO,
  om.STATUS AS OM_STATUS,
--  om.ORDER_DATE,
  TO_CHAR(ORDER_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ORDER_DATE,

  om.CONSULTANT_RELATED,
  om.ATTENDANCE_TYPE,
  om.ADMISSION_NO,
  om.HL7_VISIT_NO,
  om.ORDERER_STAFF_ID,
  om.EPISODE_NO,
  
    lt.MACHINE_NO,
  lt.HOSPITAL_ID,
   iol.IOS_MAIN,
   --iol.DESCRIPTION AS OBSERVATION_TEXT,
   --lr.LINE_TEXT AS OBSERVATION_TEXT,
   --lr.RESULT_NUM,
NVL(TO_CHAR(lr.RESULT_NUM), lr.LINE_TEXT) AS RESULT_NUM,
  --iol.BRAND_GENERIC_ID,
  iol.PRODUCT_CODE,
  ld.LAB_ID,
  ld.LAB_DEPT_NO,
  ld.STAFF_ID,
  ld.RELEASE_FLAG,
  ld.HOSPITAL_ID,
    lm.LAB_ID,
  lm.PATIENT_ID,
  lm.LAB_DATE,
  lm.HOSPITAL_ID,
  lr.RESULT_CODE,
  lr.START_NUMERIC_VALUE,
  lr.END_NUMERIC_VALUE,
  lr.HOSPITAL_ID,
  lr.LAB_RESULT AS HIS_LAB_ID, 
  om.status AS om_status,
  ilr.description AS OBSERVATION_TEXT,
  ilr.ios_main AS OBSERVATION_ID,
  ROWNUM "OBX1_set_id",
  CASE WHEN lr.result_num IS NOT NULL THEN 'NM' ELSE 'ST' END  AS VALUE_TYPE,
        u.description AS UNIT,
        c.description conclusion
FROM lab_test lt
        JOIN lab_department ld ON ld.lab_id = lt.lab_id
        JOIN lab_master lm ON lm.lab_id = lt.lab_id
        JOIN lab_results lr ON lr.order_line = lt.order_line
        JOIN order_lines ol ON ol.order_line = lt.order_line
        JOIN orders_master om ON ol.master_order_no = om.master_order_no
        JOIN ios_master iol ON iol.ios = ol.ios
        JOIN ios_master ilr ON ilr.ios = lr.ios

        JOIN lab_ios li ON li.ios = lr.ios
         LEFT OUTER JOIN codes_data u ON u.code_type = 409 AND li.unit_of_measure = u.code
         LEFT OUTER JOIN codes_data c ON c.code_type = 10048 AND lr.conclusion = c.code

 WHERE     lt.status = 'F'
       AND NVL (ld.release_flag, 'N') = 'Y'
       AND lm.lab_date BETWEEN TO_DATE (:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') AND TO_DATE (:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')
      -- and  om.patient_id = 4 AND om.episode_no = 3 and ol.order_line = 27156883 --remove
    `,
  },
};

function getEndDate() {
  const options = { timeZone: "Asia/Riyadh", hour12: false };
  const now = new Date().toLocaleString("en-GB", options);
  const [datePart, timePart] = now.split(", ");
  const [day, month, year] = datePart.split("/");
  const formatted = `${year}-${month}-${day}T${timePart}`;
  return formatted;
}
//! JOP
export async function processPatientChanges(
  intervalMinutes,
  facilityId = null,
) {
  const startDate = new Date();
  const endDate = getEndDate();
  startDate.setMinutes(startDate.getMinutes() - intervalMinutes);
  startDate.setHours(startDate.getHours() + 3);

  const startDateFormatted = startDate.toISOString().split(".")[0];
  clientLogger.info(
    `Processing changes since ${startDateFormatted} to ${endDate}`,
  );

  let connection;
  try {
    let queryText = `
            select 
              facility_id, 
              name, 
              vat_number, 
              crn, 
              street, 
              building_number, 
              plot_id, 
              district, 
              city, 
              postal_code,
              region,
              country_code,
              created_by,
              creation_date,
              modified_by,
              modification_date,
              logo,
              name_locale,
              street_locale,
              district_locale,
              city_locale,
              region_locale,
              phone,
              p_o_box,
              email,
              website,
              cchi_no,
              nphies_license,
              org_id,
              his_db_driver,
              his_db_host,
              his_db_port,
              his_db_name,
              his_db_username,
              his_db_password ,
              nphies_cs_org_id
            from facility 
            where facility_id = ${facilityId || null}
          `;

    const facilities = await query(queryText);

    if (!facilities.rows || facilities.rows.length === 0) {
      clientLogger.warn("No facilities found in the database");
      return;
    }

    const facility = facilities.rows[0];

    connection = await getOracleConnection({
      facilityId,
      poolScope: "job",
      userParam: facility.his_db_username,
      passwordParam: facility.his_db_password,
      connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
    });

    // for prod
    for (const key of ["A04", "A08", "A01", "A03", "A011"]) {
      await processHL7Batch(
        connection,
        startDateFormatted,
        HL7_PROCESSORS[key],
        endDate,
        [],
        facilityId,
      );
    }
    for (const key of ["O01", "R01", "O11"]) {
      await processOrderMessages(
        connection,
        startDateFormatted,
        HL7_PROCESSORS[key],
        endDate,
        [],
        facilityId,
      );
    }

    // for testing
    // for (const key of ["O01"]) {
    //   await processOrderMessages(
    //     connection,
    //     "2000-06-01T00:00:00",
    //     HL7_PROCESSORS[key],
    //     "2026-06-30T23:59:59",
    //   );
    // }
  } catch (error) {
    clientLogger.error("Batch processing error:" + JSON.stringify(error));
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        clientLogger.error("Connection close error:" + JSON.stringify(err));
      }
    }
  }
}

//! WITH END POINT WITH START AND END DATES
export const processHL7Batch = async (
  connection,
  startDate,
  configItem,
  endDate,
  msgs,
  facilityId = null,
) => {
  const { label, messageType, query } = configItem;
  const t1 = new Date();
  clientLogger.info(`Fetching ${label} records since ${startDate} `);

  const { rows } = await connection.execute(
    query,
    { startDate: startDate, endDate: endDate },
    {
      outFormat: OracleDB.OUT_FORMAT_OBJECT,
      fetchInfo: { START_DATE: { type: OracleDB.STRING } },
    },
  );
  const t2 = new Date();
  clientLogger.warn(
    `Elapsed Time for ${messageType}  ${(t2 - t1) / 1000} Sec.`,
  ); //TODO
  if (!rows.length) {
    clientLogger.info(`No records found for ${label}`);
    msgs && msgs.push(`No records found for ${label}`);
    return;
  }

  clientLogger.info(`Found ${rows.length} records for ${label} processing`);
  msgs && msgs.push(`Found ${rows.length} records for ${label} processing`);

  for (const record of rows) {
    try {
      clientLogger.info(
        `start records for ${label} processing with patient_id with patient_id ${record.PATIENT_ID}`,
      );
      const data = await getdata(record.PATIENT_ID, connection);
      const visitData = await getVisitData(data, connection, record.EPISODE_NO);
      clientLogger.debug("Visit Data " + JSON.stringify(visitData));

      const diagnosis = await getDiagnoses(
        data.PATIENT_ID,
        visitData?.VISIT_NO,
        connection,
      );

      clientLogger.debug("diagnosis " + JSON.stringify(diagnosis));

      const hl7Message = await createHL7Message(
        messageType,
        data,
        visitData,
        {},
        diagnosis,
        facilityId,
      );
      await sendHL7Message(hl7Message, record.PATIENT_ID, label);
    } catch (err) {
      console.log(err);

      clientLogger.error(
        `fail processing ${label} for patient ${record.PATIENT_ID}: ${err.message}`,
      );
    }
  }
};

const sendHL7Message = async (hl7Message, patientId, messageType) => {
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

export const processOrderMessages = async (
  connection,
  startDate,
  configItem,
  endDate,
  msgs,
  facilityId = null,
) => {
  const { label, messageType, query } = configItem;

  clientLogger.info(`Fetching ${messageType} records since ${startDate} `);

  const t1 = new Date();
  let { rows } = await connection.execute(
    query,
    { endDate: endDate, startDate: startDate },
    { outFormat: OracleDB.OUT_FORMAT_OBJECT },
  );
  const t2 = new Date();
  clientLogger.warn(
    `Elapsed Time for ${messageType}  ${(t2 - t1) / 1000} Sec.`,
  ); //TODO
  if (!rows.length) {
    clientLogger.info(`No records found for ${label}`);
    msgs && msgs.push(`No records found for ${label}`);
    return;
  }

  // return;
  clientLogger.info(`Found ${rows.length} records for ${label} processing`);
  msgs && msgs.push(`Found ${rows.length} records for ${label} processing`);

  for (const record of rows) {
    clientLogger.debug(
      `result_num: ${record.RESULT_NUM}, status: ${record.OM_STATUS}, and date ${record.ORDER_DATE}`,
    );

    clientLogger.verbose(JSON.stringify(record));

    try {
      const patientId = record.PATIENT_ID;
      const episodeNo = record.EPISODE_NO;
      clientLogger.debug(
        `patient_id : ${patientId} , episode_no : ${episodeNo} `,
      );

      //!!!!
      const data = await getdata(patientId, connection);
      const visitData = await getVisitData(data, connection, episodeNo);
      // const diagnosis = await getDiagnoses(patientId, episodeNo, connection);
      const deliveryData = await getDeliveryData(
        connection,
        episodeNo,
        patientId,
        record.ORDER_LINE,
      );
      const chiefComplaint = await fetchChiefComplaints({
        patientId,
        episodeNo,
        oracleConnection: connection,
      });

      const symptoms = await fetchSymptoms({
        episodeNo,
        patientId,
        oracleConnection: connection,
      });

      const diagnosis = await fetchDiagnosis({
        patientId,
        episodeNo,
        oracleConnection: connection,
      });

      const vitalSigns = await fetchPatientReadings({
        connection,
        patientId,
        episodeNo,
      });

      const encounter = await fetchEncounter({
        patientId,
        episodeNo,
        oracleConnection: connection,
      });

      const encounterType = encounter?.ENCOUNTER_TYPE;

      let encounterInfo = null;
      switch (visitData.ATTENDANCE_TYPE) {
        case "I":
        case "i":
          encounterInfo = await fetchInpatientEncounter({
            patientId,
            episodeNo,
            connection,
          });
          break;
        case "E":
        case "e":
          encounterInfo = await fetchEmergencyEncounter({
            patientId,
            episodeNo,
            connection,
          });
          break;
        case "O":
        case "o":
          encounterInfo = await fetchOutpatientEncounter({
            patientId,
            episodeNo,
            connection,
          });
          break;

        default:
          break;
      }

      clientLogger.debug(`visitData : ${JSON.stringify(visitData)}`);
      clientLogger.debug(`deliveryData : ${JSON.stringify(deliveryData)}`);
      clientLogger.debug(`chiefComplaint : ${JSON.stringify(chiefComplaint)}`);
      clientLogger.debug(`diagnosis : ${JSON.stringify(diagnosis)}`);
      clientLogger.debug(`symptoms : ${JSON.stringify(symptoms)}`);
      clientLogger.debug(`vitalSigns : ${JSON.stringify(vitalSigns)}`);
      clientLogger.debug(`encounterInfo : ${JSON.stringify(encounterInfo)}`);
      clientLogger.debug(`encounterType : ${JSON.stringify(encounterType)}`);
      // return;

      let hl7Message;
      switch (label) {
        case "O01":
          hl7Message = await createORMMessage(
            data,
            visitData,
            record,
            {},
            diagnosis,
            deliveryData,
            facilityId,
          );
          break;
        case "R01":
          hl7Message = await createORUMessage(
            data,
            visitData,
            record,
            {},
            diagnosis,
            deliveryData,
            facilityId,
          );
          break;
        case "O11":
          hl7Message = await createRDEMessage(
            data,
            visitData,
            record,
            {},
            diagnosis,
            deliveryData,
            facilityId,
          );
          break;

        default:
          break;
      }
      const res = await sendHL7Message(hl7Message, record.PATIENT_ID, label);
      clientLogger.debug(`HL7 message sent: ${JSON.stringify(res)}`);
    } catch (err) {
      console.log(err);

      clientLogger.error(
        `fail processing ${label} for patient ${record.PATIENT_ID}: ${err.message}`,
      );
    }
  }
};

async function getdata(patientId, connection) {
  const {
    rows: [dataRecord],
  } = await connection.execute(
    `SELECT 
              pmd.*,
              --pmd.ambiguously, 
              p_id.* 
            FROM patient_master_data pmd 
             INNER JOIN patient_ids p_id ON pmd.PATIENT_ID = p_id.PATIENT_ID
            where pmd.PATIENT_ID  = :patientId`,
    [patientId],
    { outFormat: OracleDB.OUT_FORMAT_OBJECT },
  );

  const identity = await getPatientIdentityInfo(
    dataRecord.PATIENT_ID,
    connection,
  );
  const mrn = await getPatientFileId(dataRecord.PATIENT_ID, connection);
  const mapping = await getExternalCodeMapping(
    { oasisCode: identity.identityType },
    connection,
  );

  const data = {
    ...dataRecord,
    mrn,
    identityNo: identity.identityNo,
    idType: mapping.extCode || "unknown",
  };

  return data;
}

async function getVisitData(data, connection, episodeNo) {
  let visitDataGlobal;

  if (episodeNo) {
    const {
      rows: [visitData],
    } = await connection.execute(
      `SELECT
            pe.episode_no AS visit_no,
            pg.attendance_type,
            pe.start_date,
            pg.*
          FROM patient_episodes pe
          JOIN oasis.patient_eligibility pg
            ON pg.patient_id = pe.patient_id AND pg.episode_no = pe.episode_no
          WHERE pe.patient_id = :id
          and pe.episode_no = :episode_no
          ORDER BY pe.start_date DESC`,
      [data.PATIENT_ID, episodeNo],
      { outFormat: OracleDB.OUT_FORMAT_OBJECT },
    );

    visitDataGlobal = visitData;
  } else {
    const {
      rows: [visitData],
    } = await connection.execute(
      `SELECT
            pe.episode_no AS visit_no,
            pg.attendance_type,
            pe.start_date,
            pg.*
          FROM patient_episodes pe
          JOIN oasis.patient_eligibility pg
            ON pg.patient_id = pe.patient_id AND pg.episode_no = pe.episode_no
          WHERE pe.patient_id = :id
          ORDER BY pe.start_date DESC`,
      [data.PATIENT_ID],
      { outFormat: OracleDB.OUT_FORMAT_OBJECT },
    );
    visitDataGlobal = visitData;
  }

  return visitDataGlobal;
}
async function getDeliveryData(connection, episodeNo, patientId, orderLine) {
  clientLogger.debug(
    `Fetching delivery data for patient_id ${patientId}, episode_no ${episodeNo}, order_line ${orderLine}`,
  );
  const { rows } = await connection.execute(
    `SELECT  
  		  md.MASTER_DELIVERY_NO, md.MASTER_ORDER_NO, md.DELIVERY_DATE, md.AMEND_BY_USER, md.AMEND_LAST_DATE, 
          md.DELIVERY_WORK_ENTITY, md.HOSPITAL_ID,
          dl.DELIVERY_LINE, dl.MASTER_DELIVERY_NO, dl.ORDER_LINE, dl.UNITS_DELIVERED, dl.UNIT_PRICE, 
          dl.PRODUCT_CODE, dl.BATCH_NO, dl.IOS, dl.STATUS, dl.DOSAGE_CODE, dl.DOSAGE_NARRATIVE, 
          dl.REC_LINE_ID, dl.C_ID, DELIVERED_FLAG, dl.AMEND_BY_USER, dl.AMEND_LAST_DATE, dl.RECEIVED_BY, 
          dl.RECEIVED_DATE, dl.ALTERNATIVE_FLAG, dl.EXTRA_DOSE_QTY, dl.UNITS_ADMINISTERED, dl.UNITS_LOST, 
          dl.ORIG_UNITS_DELIVERED, dl.DRIVING_DELIVERY_LINE, dl.HL7_SENT, dl.ORIGINAL_UNIT_PRICE, 
          dl.DHS_TRANSACTION_NO, dl.HOSPITAL_ID
    FROM delivery_lines dl
         JOIN ios_master im ON im.ios = dl.ios
         JOIN order_lines ol ON ol.order_line = dl.order_line
         JOIN orders_master om ON om.master_order_no = ol.master_order_no
         JOIN master_deliveries md ON md.master_delivery_no = dl.master_delivery_no
   WHERE om.patient_id = :patientId AND om.episode_no = :episodeNo and dl.ORDER_LINE = :p_order_line
   and nvl(dl.UNITS_DELIVERED,0) > 0  
ORDER BY md.delivery_date`,
    { patientId, episodeNo, p_order_line: orderLine },
    { outFormat: OracleDB.OUT_FORMAT_OBJECT },
  );

  function mapHisToDeliveryFormat(queryResult) {
    const deliveries = new Map();
    const deliveryDetails = [];

    for (const row of queryResult.rows) {
      if (!deliveries.has(row.MASTER_DELIVERY_NO)) {
        deliveries.set(row.MASTER_DELIVERY_NO, {
          delivery_date: row.DELIVERY_DATE || "",
          location_id: row.HOSPITAL_ID || row.DELIVERY_WORK_ENTITY || "",
          status: "DELIVERED",
          created_by: row.AMEND_BY_USER || "",
          creation_date: row.AMEND_LAST_DATE || "",
          modified_by: row.AMEND_BY_USER || "",
          modification_date: row.AMEND_LAST_DATE || "",
          his_delivery_id: row.MASTER_DELIVERY_NO || "",
        });
      }

      deliveryDetails.push({
        alt_item_id: row.IOS || row.PRODUCT_CODE || "",
        qty_delivered: row.UNITS_DELIVERED || "",
        unit_price: row.UNIT_PRICE || "",
        status: row.STATUS || "",
        created_by: row.AMEND_BY_USER || "",
        creation_date: row.AMEND_LAST_DATE || "",
        modified_by: row.AMEND_BY_USER || "",
        modification_date: row.AMEND_LAST_DATE || "",
        delivery_date: row.DELIVERY_DATE || "",
        delivery_detail_id: row.DELIVERY_LINE || "",
        his_delivery_id: row.MASTER_DELIVERY_NO || "",
        his_delivery_detail_id: row.DELIVERY_LINE || "",
        his_order_detail_id: row.ORDER_LINE || "",
        claim_req_id: row.DHS_TRANSACTION_NO || "",
        // package_delivery_detail_id: row.DRIVING_DELIVERY_LINE || '',
      });
    }

    return {
      deliveries: Array.from(deliveries.values()),
      deliveryDetails: deliveryDetails,
    };
  }

  return mapHisToDeliveryFormat({ rows });
}

async function getDiagnoses(patientId, episodeNo, connection) {
  const { rows } = await connection.execute(
    `
    SELECT 
      d.REQ_ID,
      d.SEQ,
      d.DIAGNOSIS_CODE,
      d.DIAGNOSIS_DESC,
      d.DIAGNOSIS_TYPE,
      d.ON_ADMISSION,
      d.CONDITION_ONSET
    FROM diagnosis d
    JOIN service_request sr ON sr.req_id = d.req_id
    WHERE sr.patient_id = :patientId
      AND sr.episode_no = :episodeNo
    ORDER BY d.seq
    `,
    [patientId, episodeNo],
    { outFormat: OracleDB.OUT_FORMAT_OBJECT },
  );

  return rows;
}

export const createMSHSegment = (data = {}) => {
  const { messageType = "" } = data;

  const messageId = generateMsgId();

  if (!/^[A-Z]{2,4}\^[A-Z][A-Z0-9]{0,3}$/i.test(messageType)) {
    clientLogger.error(messageType);
    throw new Error(
      "Invalid message type format. Expected format: ABC^A01 or similar",
    );
  }

  return [
    "MSH",
    String.raw`^~\&`,
    CONST.SENDING_APP, // Sending Application Ex.:2.16.840.1.113883.3.3731.XXXX.Y
    CONST.SENDING_FACILITY, //
    "", //CONST.RECEIVING_APP, //Receiving Application ex 2.16.840.1.113883.3.3731.1.2.2
    CONST.RECEIVING_FACILITY, //Receiving Facility
    formatDateTimeWithTimezone(new Date()),
    "", // Security I
    messageType,
    messageId,
    "P", // Processing ID (P=Production) I //! todo conf
    CONST.NPHIES_CS_ADT_HL7_VERSION,
    "", // Sequence number
    "", // Continuation pointer
    "", // Accept acknowledgment type
    "", // Application acknowledgment type
    "", // Country code USA
    "", // Character set ex UTF-8
    "", // Principal language
    "", // Alternate character set handling
    "", // Message profile identifier
  ].join("|");
};

export const createEVNSegment = (data = {}) => {
  const {
    eventType = "",
    recordedDateTime = new Date(),
    operatorId = "",
    eventOccurred = new Date(),
  } = data;

  if (!eventType) {
    throw new Error("Event type must be 3 characters");
  }

  return [
    "EVN",
    eventType,
    formatDateTimeWithTimezone(recordedDateTime),
    "",
    "",
    operatorId,
    formatDateTimeWithTimezone(eventOccurred),
    "", //CONST.SENDING_FACILITY,
  ].join("|");
};

export const createPIDSegment = (
  patient,
  identityNo,
  mrn,
  idType,
  sequence = 1,
) => {
  clientLogger.debug(JSON.stringify({ identityNo, mrn, idType }));

  // !
  if (!identityNo) {
    throw new Error("Invalid Saudi National ID/Iqama ");
  }
  // !
  if (!mrn) throw new Error("Medical Record Number is required");
  if (!patient.DATE_OF_BIRTH) throw new Error("DATE_OF_BIRTH is required");

  // console.log({identityNo , conf :  `${identityNo || ""}^^^${CONST.NPHIES_ID_AUTHORITY}^${idType}`});
  identityNo = "30511223344557"; //todo healthid

  const idMap = "1"; //todo get mapping of idtype from mapping table
  const identifierList = [
    `${identityNo || ""}^^^NPHIES&${CONST.NPHIES_ID_AUTHORITY}.${idMap}&ISO^NI`,
    //`9988776655^^^NPHIES&2.16.840.1.113883.3.2000.1&ISO^NI`
    // `${mrn}^^^${CONST.SENDING_FACILITY_OID}^${CONST.NPHIES_ID_AUTHORITY}.1`,
  ].join("");

  const arabicName = [
    patient.SCND_PAT_NAME_FAMILY || "", // Family (Arabic)
    patient.SCND_PAT_NAME_1 || "", // First (Arabic)
    patient.SCND_PAT_NAME_2 || "", // Father (Arabic)
    "", // Grandfather
    "", // Suffix
    patient.PAT_FAMILY_PREFIX || "", // Prefix
    "", // Name type (Legal)
  ].join("^");

  const englishName = [
    patient.PAT_NAME_FAMILY || "", // Family (English)
    patient.PAT_NAME_1 || "", // First (English)
    patient.PAT_NAME_2 || "", // Father (English)
    patient.PAT_NAME_3 || "", // Grandfather
    "", // Suffix
    patient.PAT_FAMILY_PREFIX || "", // Prefix
    "", // Name type
  ].join("^");

  return [
    "PID", //1
    sequence, //2 Set ID Q: what
    patient.PATIENT_ID, //3 (Deprecated) I
    identifierList, //4 Patient Identifier List
    "", //5 Alternate ID I
    `${englishName}`.substring(0, 250), //6 Bilingual name
    patient.MAIDEN_NAME || "", //7 Mother's maiden name I
    formatDateTimeWithTimezone(patient.DATE_OF_BIRTH), //8 DOB (YYYYMMDD)
    patient.SEX, //9 Sex
    "", //10 Alias
    "", //11 Race
    "", //12 Address
    patient.COUNTRY_CODE ? patient.COUNTRY_CODE : "", //13 County
    patient.MOBILE_NO || "", //14 Phone
    "", //15 Business phone
    "", //16 Primary language
    // 'ar^Arabic^2.16.840.1.113883.6.96',  // Primary language
    patient.MARITAL_CODE ? patient.MARITAL_CODE : "", //17 Marital status
    patient.RELIGION_CODE ? patient.RELIGION_CODE : "", //18 Religion
    mrn || "", //19 Account number
    "", //20 SSN
    "", //21 Driver's license
    "", //22 Mother's ID
    "", //23 Ethnic group
    "", //24 Birth place
    "", //patient.OCCUPATION_CODE ? patient.OCCUPATION_CODE : "", //25 Multiple birth
    "", //26 Birth order
    "", //27 Citizenship
    "", //28 Veteran status
    "", //patient.NATIONALITY_CODE || "", //29 Nationality
    // "SA^Saudi Arabia^2.16.840.1.113883.6.96",
    "", //30 Patient Death Date and Time
    "", //31 Patient Death Indicator
    "", //32 Identity Unknown Indicator
    "", //33 Identity Reliability Code
    "", //34 Last Update Date Time
    "", //35 Last Update Facility
    "", //36 Species Code
    "", //37 Breed Code
    "", //38 Strain
    "", //39 Production Class Code
    "", //40 Tribal Citizenship
  ].join("|");
};

export const createPV1Segment = (visitData, sequence = 1) => {
  const formatProvider = (providerId) => {
    if (!providerId) return "";
    return [
      providerId, // ID Number
      "", // Family Name
      "", // Given Name
      "", // Middle Name
      "", // Suffix
      "", // Prefix
      "", // Degree
      "", // Source Table
      "", // Assigning Authority (Fixed OID)
    ].join("^");
  };

  if (!visitData.ATTENDANCE_TYPE) {
    throw new Error("ATTENDANCE_TYPE is required in visit data");
  }

  if (!visitData.visit_no) {
    throw new Error("visit_no is required in visit data");
  }

  //! todo
  const patientClass =
    visitData.ATTENDANCE_TYPE === "I"
      ? "I"
      : visitData.ATTENDANCE_TYPE === "O"
        ? "O"
        : visitData.ATTENDANCE_TYPE === "E"
          ? "E"
          : "O";

  // Format location information
  const formatLocation = (location) => {
    if (!location) return "";
    return [
      location.pointOfCare?.substring(0, 50) || "", // Point of Care
      location.room?.substring(0, 50) || "", // Room
      location.bed?.substring(0, 50) || "", // Bed
      "", // Facility
      "", // Facility Universal ID
      location.building || "", // Building
      location.floor || "", // Floor
      location.description || "", // Location Description
    ].join("^");
  };

  // Build PV1 segment according to specifications
  return [
    "PV1", // PV1.1 - Segment Name
    sequence, // PV1.2 - Set ID
    patientClass, // PV1.3 - Patient Class (R)
    formatLocation(visitData.assignedLocation), // PV1.4 - Assigned Location (O)
    "88", //visitData.ATTENDANCE_TYPE, // PV1.5 - Admission Type (R)
    "", // PV1.6 - Preadmit Number (O)
    "", // PV1.7 - Prior Location (I)
    "1599999970^Al-Harthi^Khalid^Mahmood^^DR^^^&2.16.840.1.113883.3.3731.1.2.1&ISO^^^^112247003", //todo
    //formatProvider(visitData.CONSULTANT_ID), // PV1.8 - Attending Doctor (O)
    "", // PV1.9 - Referring Doctor (O)
    "", // PV1.10 - Consulting Doctor (O)
    visitData.hospitalService || "", // PV1.11 - Hospital Service (O)
    "", // PV1.12 - Temporary Location (I)
    "", // PV1.13 - Preadmit Indicator (I)
    "", // PV1.14 - Re-admission Indicator (I)
    visitData.admitSource || "", // PV1.15 - Admit Source (O)
    "", // PV1.16 - Ambulatory Status (I)
    "", // PV1.17 - VIP Indicator (I)
    formatProvider(visitData.admittingDoctor), // PV1.18 - Admitting Doctor (I)
    "", // PV1.19 - Patient Type (I)
    //`${visitData.visit_no}^^^VISNo&2.16.840.1.113883.3.3731.6.73.15000000112242&ISO`, // PV1.20 - Visit Number (R)
    `${visitData.visit_no}^^^VISNo&${CONST.VISIT_NO_AUTHORITY}&ISO`, // PV1.20 - Visit Number (R)
    //43405543^^^VISNo&2.16.840.1.113883.3.3731.1.2.2.XXXX.Y&ISO
    "", // PV1.21 - Financial Class (I)
    "", // PV1.22 - Charge Price Indicator (I)
    "", // PV1.23 - Courtesy Code (I)
    "", // PV1.24 - Credit Rating (I)
    "", // PV1.25 - Contract Code (I)
    "", // PV1.26 - Contract Date (I)
    "", // PV1.27 - Contract Amount (I)
    "", // PV1.28 - Contract Period (I)
    "", // PV1.29 - Interest Code (I)
    "", // PV1.30 - Transfer to Bad Debt (I)
    "", // PV1.31 - Transfer to Bad Debt Date (I)
    "", // PV1.32 - Bad Debt Agency Code (I)
    "", // PV1.33 - Bad Debt Transfer Amount (I)
    "", // PV1.34 - Bad Debt Recovery Amount (I)
    "", // PV1.35 - Delete Account Indicator (I)
    "", // PV1.36 - Delete Account Date (I)
    visitData.dischargeDisposition || "", // PV1.37 - Discharge Disposition (O)
    "", // PV1.38 - Discharged to Location (O)
    "", // PV1.39 - Diet Type (I)
    "", // PV1.40 - Servicing Facility (I)
    "", // PV1.41 - Bed Status (I)
    "", // PV1.42 - Account Status (I)
    "", // PV1.43 - Pending Location (I)
    "", // PV1.44 - Prior Temporary Location (I)
    visitData.START_DATE ? formatDateTime(visitData.START_DATE) : "", // PV1.45 - Admit Date/Time (O)
    visitData.ELIGIBILITY_END ? formatDateTime(visitData.ELIGIBILITY_END) : "", // PV1.46 - Discharge Date/Time (O)
    "", // PV1.47 - Current Patient Balance (I)
    "", // PV1.48 - Total Charges (I)
    "", // PV1.49 - Total Adjustments (I)
    "", // PV1.50 - Total Payments (I)
    "", // PV1.51 - Alternate Visit ID (I)
    "", // PV1.52 - Visit Indicator (I)
    "", // PV1.53 - Other Healthcare Provider (I)
  ].join("|");
};

export const createPV2Segment = (visit, sequence = 1) => {
  return [
    "PV2",
    sequence,
    visit.priorPendingLocation || "",
    visit.accommodationCode || "",
    visit.admitReason || "",
    visit.transferReason || "",
    visit.patientValuables || "",
    visit.patientValuablesLocation || "",
    visit.visitUserCode || "",
    visit.expectedAdmitDate
      ? formatDateTimeWithTimezone(visit.expectedAdmitDate)
      : "",
    visit.expectedDischargeDate
      ? formatDateTimeWithTimezone(visit.expectedDischargeDate)
      : "",
    visit.estimatedLengthOfStay || "",
    visit.actualLengthOfStay || "",
    visit.visitDescription || "",
    visit.referralSourceCode || "",
    visit.previousServiceDate
      ? formatDateTimeWithTimezone(visit.previousServiceDate)
      : "",
    visit.illnessRelatedIndicator || "",
    visit.pupStatusCode || "",
    visit.pupStatusDate ? formatDateTimeWithTimezone(visit.pupStatusDate) : "",
    visit.specialProgramCode || "",
    visit.retentionIndicator || "",
    visit.expectedInsurancePlans || "",
    visit.visitPublicityCode || "",
    visit.visitProtectionIndicator || "",
    visit.clinicOrganizationName || "",
    visit.patientStatusCode || "",
    visit.visitPriorityCode || "",
    visit.previousTreatmentDate
      ? formatDateTimeWithTimezone(visit.previousTreatmentDate)
      : "",
    visit.expectedDischargeDisposition || "",
    visit.signatureOnFileDate
      ? formatDateTimeWithTimezone(visit.signatureOnFileDate)
      : "",
    visit.firstSimilarIllnessDate
      ? formatDateTimeWithTimezone(visit.firstSimilarIllnessDate)
      : "",
    visit.patientChargeAdjustmentCode || "",
    visit.recurringServiceCode || "",
    visit.billingMediaCode || "",
    visit.expectedSurgeryDate
      ? formatDateTimeWithTimezone(visit.expectedSurgeryDate)
      : "",
    visit.militaryPartnershipCode || "",
    visit.militaryNonAvailabilityCode || "",
    visit.newbornBabyIndicator || "",
    visit.babyDetainedIndicator || "",
    visit.modeOfArrivalCode || "",
    visit.recreationalDrugUseCode || "",
    visit.admissionLevelOfCareCode || "",
    visit.precautionCode || "",
    visit.patientConditionCode || "",
    visit.livingWillCode || "",
    visit.organDonorCode || "",
    visit.advanceDirectiveCode || "",
    visit.patientStatusEffectiveDate
      ? formatDateTimeWithTimezone(visit.patientStatusEffectiveDate)
      : "",
    visit.expectedLOAReturnDate
      ? formatDateTimeWithTimezone(visit.expectedLOAReturnDate)
      : "",
    visit.expectedPreAdmissionTestingDate
      ? formatDateTimeWithTimezone(visit.expectedPreAdmissionTestingDate)
      : "",
    visit.notifyClergyCode || "",
  ].join("|");
};

export function buildDG1Segments(rows = []) {
  return rows.map((row, index) => {
    const setId = index + 1;

    // Diagnosis Code as CE datatype: <code>^<text>^<coding system>
    // Coding system example: xxxx
    const diagnosisCodeCE = row.DIAGNOSIS_CODE
      ? `${row.DIAGNOSIS_CODE}^${row.DIAGNOSIS_DESC || ""}^xxxx` //!  todo conf
      : "";

    const diagnosisType = row.DIAGNOSIS_TYPE || "";
    const onAdmission = row.ON_ADMISSION || "";
    const reqId = row.REQ_ID || "";

    return [
      "DG1",
      setId, // DG1-1 Set ID
      "", // DG1-2 Diagnosis Coding Method (optional)
      diagnosisCodeCE, // DG1-3 Diagnosis Code (CE)
      row.DIAGNOSIS_DESC || "", // DG1-4 Diagnosis Description
      "", // DG1-5 Diagnosis Date/Time (optional)
      diagnosisType, // DG1-6 Diagnosis Type
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      onAdmission, // DG1-15 Diagnosis Priority / On Admission
      reqId, // DG1-16 Req ID (custom usage)
      "",
      "",
      "",
    ].join("|");
  });
}

// ==================== MESSAGE GENERATORS ====================
async function createHL7Message(
  messageType,
  patient,
  visit = {},
  event = {},
  diagnoses = [],
  facilityId = null,
) {
  const NPHIES_CS_TEST_ORG_ID = await getConfValue({
    facilityId,
    key: "NPHIES_CS_TEST_ORG_ID",
  });
  await initConstants(NPHIES_CS_TEST_ORG_ID, facilityId);

  const dg1Segments = buildDG1Segments(diagnoses);
  const msg = [
    createMSHSegment({
      messageType,
    }),
    createEVNSegment({
      eventType: messageType.split("^")[1],
      operatorId: visit.attendingDoctor?.id || "",
      ...event,
    }),
    createPIDSegment(patient, patient.identityNo, patient.mrn, patient.idType),
    createPV1Segment({
      ...visit,

      patientClass: visit.ATTENDANCE_TYPE || "O",
      ATTENDANCE_TYPE: visit.ATTENDANCE_TYPE || "O",
      visit_no: visit.VISIT_NO || Date.now().toString().slice(0, 5),
      admitDate: visit.START_DATE || new Date(), //! adminDate
    }),
    visit.additionalVisitInfo
      ? createPV2Segment(visit.additionalVisitInfo)
      : "",

    ...dg1Segments,
  ]
    .filter(Boolean)
    .join("\r\n");
  return msg;
}

// ==================== HELPER FUNCTIONS ====================

const generateMsgId = (facilityCode = "") => {
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return facilityCode ? `${facilityCode}-${random}` : random;
};

const formatDateTime = (
  dateInput,
  includeTime = true,
  includeTimezone = true,
) => {
  try {
    if (!dateInput) return "";

    // If input is already a valid HL7 datetime string (YYYYMMDDHHMMSS)
    if (typeof dateInput === "string" && /^\d{14}$/.test(dateInput)) {
      return dateInput;
    }

    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    if (!includeTime) {
      return `${year}${month}${day}`;
    }

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    let result = `${year}${month}${day}${hours}${minutes}${seconds}`;

    if (includeTimezone) {
      const timezoneOffset = date.getTimezoneOffset();
      const sign = timezoneOffset <= 0 ? "+" : "-";
      const offsetHours = Math.abs(Math.floor(timezoneOffset / 60));
      const offsetMinutes = Math.abs(timezoneOffset % 60);
      result += `${sign}${String(offsetHours).padStart(2, "0")}${String(
        offsetMinutes,
      ).padStart(2, "0")}`;
    }

    return result;
  } catch (e) {
    console.error(
      "Error formatting date:" +
        JSON.stringify(e) +
        ", dateInput:" +
        JSON.stringify(dateInput),
    );
    return "";
  }
};

const formatDateOnly = (dateInput) => formatDateTime(dateInput, false, false);

const formatDateTimeWithTimezone = (dateInput) => {
  return formatDateTime(dateInput, true, true);
};

const formatDateTimeWithoutTimezone = (dateInput) => {
  return formatDateTime(dateInput, true, false);
};

//  ==================== CONFIG ====================

/**
 * @typedef {Object} PatientIdentityInfo
 * @property {boolean} success - Whether the operation was successful
 * @property {number} patientId - The patient ID
 * @property {string} identityNo - The identity number
 * @property {string} identityType - The identity type
 * @property {number} returnCode - The return code from the procedure
 */

/**
 * @typedef {Object} ExternalCodeMapping
 * @property {boolean} success - Whether the operation was successful
 * @property {string} oasisCode - The original OASIS code
 * @property {string} extCode - The mapped external code
 * @property {string} extDesc - The external code description
 * @property {number} returnCode - The return code from the procedure
 */

/**
 * @typedef {Object} GetExternalCodeParams
 * @property {string} oasisCode - The OASIS code to map
 * @property {string} [src] - Source system (default: 'NPHIES_CS')
 * @property {string} [mappingType] - Mapping type (default: 'USER_CODE')
 * @property {string} [extType] - External type (default: 'ID')
 */
