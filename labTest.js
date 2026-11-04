import OracleDB from "oracledb";
import { getOracleConnection } from "./config/oracle-dynamic.js";

// ============================================================
// Facility / Connection configuration
// ============================================================
const facilityConfig = {
  facilityId: "7",
  poolScope: "test",
  userParam: "nphies",
  passwordParam: "nphies",
  connectStringParam: `172.20.80.36:1521/test`,
};

/**
 * Helper to convert outBind CLOB/String to JS string.
 */
async function lobToString(bindVal) {
  if (!bindVal) return "";
  if (typeof bindVal === "string") return bindVal;
  if (typeof bindVal.getData === "function") {
    return await bindVal.getData();
  }
  return String(bindVal);
}

// ============================================================
// 1. QUERY_PATIENT_CHECKLIST
// ============================================================
/**
 * Calls CHECK_LIST.QUERY_PATIENT_CHECKLIST as-is and returns questions & answers.
 *
 * @param {object} [params]
 * @param {number} [params.patientId=3713]
 * @param {number} [params.episodeNo=1]
 * @param {number|null} [params.answersMasterId=null]
 * @param {number|null} [params.checklistGroupId=null]
 * @param {number|null} [params.checklistId=null]
 * @param {number|null} [params.answerSessionId=null]
 * @param {Date|null} [params.recordedAt=null]
 * @param {string} [params.allEpisodes="A"]
 * @param {string} [params.orderBy="C"]
 * @returns {Promise<{ updateAllowed: string, completeAllowed: string, rows: Array }>}
 */
export async function queryPatientChecklist({
  patientId = 3713,
  episodeNo = 1,
  answersMasterId = null,
  checklistGroupId = null,
  checklistId = null,
  answerSessionId = null,
  recordedAt = null,
  allEpisodes = "A",
  orderBy = "C",
} = {}) {
  let connection;
  try {
    connection = await getOracleConnection(facilityConfig);

    const plsql = `
      DECLARE
        v_tab               CHECK_LIST.CHECKLIST_QUERY_TAB;
        v_update_allowed    VARCHAR2(10);
        v_complete_allowed  VARCHAR2(10);
        v_json              CLOB;
        v_idx               PLS_INTEGER;
      BEGIN
        -- استدعاء البروسيدجر كما هي من الباكدج
        CHECK_LIST.QUERY_PATIENT_CHECKLIST(
          P_CHECKLIST_QUERY_TAB        => v_tab,
          P_UPDATE_ALLOWED             => v_update_allowed,
          P_COMPLETE_ALLOWED           => v_complete_allowed,
          P_PATIENT_ID                 => :p_patient_id,
          P_EPISODE_NO                 => :p_episode_no,
          P_ANSWER_SESSION_ID          => :p_answer_session_id,
          P_CHECKLIST_GROUP_ID         => :p_checklist_group_id,
          P_CHECKLIST_ID               => :p_checklist_id,
          P_CHK_LST_ANSWERS_MASTER_ID  => :p_chk_lst_answers_master_id,
          P_RECORDED_AT                => :p_recorded_at,
          P_ALL_EPISODES               => :p_all_episodes,
          P_ORDER_BY                   => :p_order_by
        );

        :p_update_allowed   := v_update_allowed;
        :p_complete_allowed := v_complete_allowed;

        -- تجميع الـ Table of Records في JSON لـ Node.js
        DBMS_LOB.CREATETEMPORARY(v_json, TRUE);
        DBMS_LOB.WRITEAPPEND(v_json, 1, '[');

        v_idx := v_tab.FIRST;
        WHILE v_idx IS NOT NULL LOOP
          IF v_idx > v_tab.FIRST THEN
            DBMS_LOB.WRITEAPPEND(v_json, 1, ',');
          END IF;

          DECLARE
            v_item VARCHAR2(32767);
            v_clean_data VARCHAR2(32767);
          BEGIN
            v_clean_data := REPLACE(
                              REPLACE(
                                REPLACE(
                                  REPLACE(NVL(v_tab(v_idx).FORMATTED_DATA, ''), '\\', '\\\\'),
                                '"', '\\"'),
                              CHR(10), '\\n'),
                            CHR(13), '');

            v_item := '{"recordType":"' || NVL(v_tab(v_idx).RECORD_TYPE, '') || '"'
                   || ',"replyType":"' || NVL(v_tab(v_idx).REPLY_TYPE, '') || '"'
                   || ',"recorded":"' || NVL(v_tab(v_idx).RECORDED, '') || '"'
                   || ',"answerId":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_ANSWER_ID), 'null')
                   || ',"formattedData":"' || v_clean_data || '"}';

            DBMS_LOB.WRITEAPPEND(v_json, LENGTH(v_item), v_item);
          END;

          v_idx := v_tab.NEXT(v_idx);
        END LOOP;

        DBMS_LOB.WRITEAPPEND(v_json, 1, ']');
        :p_json_out := v_json;
      END;
    `;

    const binds = {
      p_patient_id:                { dir: OracleDB.BIND_IN, val: patientId, type: OracleDB.NUMBER },
      p_episode_no:                { dir: OracleDB.BIND_IN, val: episodeNo, type: OracleDB.NUMBER },
      p_answer_session_id:         { dir: OracleDB.BIND_IN, val: answerSessionId, type: OracleDB.NUMBER },
      p_checklist_group_id:        { dir: OracleDB.BIND_IN, val: checklistGroupId, type: OracleDB.NUMBER },
      p_checklist_id:              { dir: OracleDB.BIND_IN, val: checklistId, type: OracleDB.NUMBER },
      p_chk_lst_answers_master_id: { dir: OracleDB.BIND_IN, val: answersMasterId, type: OracleDB.NUMBER },
      p_recorded_at:               { dir: OracleDB.BIND_IN, val: recordedAt, type: OracleDB.DATE },
      p_all_episodes:              { dir: OracleDB.BIND_IN, val: allEpisodes, type: OracleDB.STRING },
      p_order_by:                  { dir: OracleDB.BIND_IN, val: orderBy, type: OracleDB.STRING },

      p_update_allowed:   { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 10 },
      p_complete_allowed: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 10 },
      p_json_out:         { dir: OracleDB.BIND_OUT, type: OracleDB.CLOB },
    };

    const result = await connection.execute(plsql, binds);
    const jsonStr = await lobToString(result.outBinds.p_json_out);
    const rows = JSON.parse(jsonStr || "[]");

    return {
      updateAllowed: result.outBinds.p_update_allowed ?? null,
      completeAllowed: result.outBinds.p_complete_allowed ?? null,
      rows,
    };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

// ============================================================
// 2. GET_PATIENT_CHECKLISTS
// ============================================================
/**
 * Calls CHECK_LIST.GET_PATIENT_CHECKLISTS as-is and returns patient's checklists list.
 *
 * @param {object} [params]
 * @param {number} [params.patientId=3713]
 * @param {string|number|null} [params.episodeNo=null]
 * @param {string} [params.status="A"]
 * @param {string} [params.filter="A"]
 * @returns {Promise<Array>}
 */
export async function getPatientChecklists({
  patientId = 3713,
  episodeNo = null,
  status = "A",
  filter = "A",
} = {}) {
  let connection;
  try {
    connection = await getOracleConnection(facilityConfig);

    const plsql = `
      DECLARE
        v_tab        CHECK_LIST.PATIENT_CHECKLIST_TAB;
        v_json       CLOB;
        v_idx        PLS_INTEGER;
      BEGIN
        CHECK_LIST.GET_PATIENT_CHECKLISTS (
          P_PAT_CHECKLIST_TAB     => v_tab,
          P_PATIENT_ID            => :p_patient_id,
          P_CHECK_LIST_GROUP_ID   => NULL,
          P_CHECK_LIST_TYPE_ID    => NULL,
          P_ENCOUNTER_ID_GROUP    => :p_episode_no,
          P_FILTER                => :p_filter,
          P_SERVICE_DEPT          => -1,
          P_STATUS                => :p_status,
          P_START_DATE            => NULL,
          P_END_DATE              => NULL
        );

        DBMS_LOB.CREATETEMPORARY(v_json, TRUE);
        DBMS_LOB.WRITEAPPEND(v_json, 1, '[');

        v_idx := v_tab.FIRST;
        WHILE v_idx IS NOT NULL LOOP
          IF v_idx > v_tab.FIRST THEN
            DBMS_LOB.WRITEAPPEND(v_json, 1, ',');
          END IF;

          DECLARE
            v_item VARCHAR2(4000);
          BEGIN
            v_item := '{"answerSessionId":' || NVL(TO_CHAR(v_tab(v_idx).ANSWER_SESSION_ID), 'null')
                   || ',"answersMasterId":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_ANSWERS_MASTER_ID), 'null')
                   || ',"recordedAt":"' || TO_CHAR(v_tab(v_idx).RECORDED_AT, 'YYYY-MM-DD HH24:MI:SS') || '"'
                   || ',"groupId":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_GROUP_ID), '0')
                   || ',"groupDesc":"' || REPLACE(REPLACE(NVL(v_tab(v_idx).CHECK_LIST_GROUP_DESC, ''), '\\\\', '\\\\\\\\'), '"', '\\\\"') || '"'
                   || ',"checklistType":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_TYPE), '0')
                   || ',"checklistDesc":"' || REPLACE(REPLACE(NVL(v_tab(v_idx).CHECKLIST_DESCRIPTION, ''), '\\\\', '\\\\\\\\'), '"', '\\\\"') || '"'
                   || ',"episodeNo":"' || NVL(v_tab(v_idx).ENCOUNTER_ID_GROUP, '') || '"'
                   || ',"encounterId":"' || NVL(v_tab(v_idx).ENCOUNTER_ID, '') || '"'
                   || ',"checklistStatus":"' || NVL(v_tab(v_idx).CHECK_LIST_STATUS, '') || '"'
                   || ',"activeFlag":"' || NVL(v_tab(v_idx).ACTIVE_FLAG, '') || '"}';

            DBMS_LOB.WRITEAPPEND(v_json, LENGTH(v_item), v_item);
          END;

          v_idx := v_tab.NEXT(v_idx);
        END LOOP;

        DBMS_LOB.WRITEAPPEND(v_json, 1, ']');
        :p_json_out := v_json;
      END;
    `;

    const binds = {
      p_patient_id: { dir: OracleDB.BIND_IN, val: patientId, type: OracleDB.NUMBER },
      p_episode_no: { dir: OracleDB.BIND_IN, val: episodeNo ? String(episodeNo) : null, type: OracleDB.STRING },
      p_filter:     { dir: OracleDB.BIND_IN, val: filter, type: OracleDB.STRING },
      p_status:     { dir: OracleDB.BIND_IN, val: status, type: OracleDB.STRING },
      p_json_out:   { dir: OracleDB.BIND_OUT, type: OracleDB.CLOB },
    };

    const result = await connection.execute(plsql, binds);
    const jsonStr = await lobToString(result.outBinds.p_json_out);
    return JSON.parse(jsonStr || "[]");
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

// ============================================================
// Runner / Test Execution
// ============================================================
(async () => {
  try {
    console.log("Calling CHECK_LIST.QUERY_PATIENT_CHECKLIST via PL/SQL bridge...\n");

    const result = await queryPatientChecklist({
      patientId: 3713,
      episodeNo: 1,
    });

    console.log("=== QUERY_PATIENT_CHECKLIST RESULT ===");
    console.log("updateAllowed   :", result.updateAllowed);
    console.log("completeAllowed :", result.completeAllowed);
    console.log("rows count      :", result.rows.length);
    console.log("--------------------------------------");

    result.rows.slice(0, 15).forEach((row, i) => {
      console.log(
        `[${i + 1}] type=${row.recordType} | reply=${row.replyType || "-"} | data=${row.formattedData}`
      );
    });

    if (result.rows.length > 15) {
      console.log(`... and ${result.rows.length - 15} more rows.`);
    }

  } catch (err) {
    console.error("\n=== ERROR ===");
    console.error("code    :", err.code);
    console.error("message :", err.message);
    if (err.errorNum) console.error("oraNum  :", err.errorNum);
  } finally {
    process.exit(0);
  }
})();
