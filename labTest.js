import OracleDB from "oracledb";
import { getOracleConnection } from "./config/oracle-dynamic.js";

// ============================================================
// Oracle connection configuration
// ============================================================
const connection = await getOracleConnection({
  facilityId: "7",
  poolScope: "test",
  userParam: "nphies",
  passwordParam: "nphies",
  connectStringParam: `172.20.80.36:1521/test`,
});

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
// 1. GET_PATIENT_CHECKLISTS (List of filled forms)
// ============================================================
export async function getPatientChecklists({
  patientId = 3713,
  episodeNo = null,
  status = "A",
  filter = "A",
} = {}) {
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
          v_clean_group VARCHAR2(4000);
          v_clean_desc VARCHAR2(4000);
        BEGIN
          v_clean_group := REPLACE(REPLACE(REPLACE(REPLACE(NVL(v_tab(v_idx).CHECK_LIST_GROUP_DESC, ''), '\\', '\\\\'), '"', '\\"'), CHR(10), ' '), CHR(13), '');
          v_clean_desc  := REPLACE(REPLACE(REPLACE(REPLACE(NVL(v_tab(v_idx).CHECKLIST_DESCRIPTION, ''), '\\', '\\\\'), '"', '\\"'), CHR(10), ' '), CHR(13), '');

          v_item := '{"answerSessionId":' || NVL(TO_CHAR(v_tab(v_idx).ANSWER_SESSION_ID), 'null')
                 || ',"answersMasterId":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_ANSWERS_MASTER_ID), 'null')
                 || ',"recordedAt":"' || TO_CHAR(v_tab(v_idx).RECORDED_AT, 'YYYY-MM-DD HH24:MI:SS') || '"'
                 || ',"groupId":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_GROUP_ID), '0')
                 || ',"groupDesc":"' || v_clean_group || '"'
                 || ',"checklistType":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_TYPE), '0')
                 || ',"checklistDesc":"' || v_clean_desc || '"'
                 || ',"episodeNo":"' || NVL(v_tab(v_idx).ENCOUNTER_ID_GROUP, '') || '"'
                 || ',"encounterId":"' || NVL(v_tab(v_idx).ENCOUNTER_ID, '') || '"'
                 || ',"checklistStatus":"' || NVL(v_tab(v_idx).CHECK_LIST_STATUS, '') || '"'
                 || ',"activeFlag":"' || NVL(v_tab(v_idx).ACTIVE_FLAG, '') || '"}';

          DBMS_LOB.WRITEAPPEND(v_json, LENGTH(v_item), v_item);
        END;

        v_idx := v_tab.NEXT(v_idx);
      END LOOP;

      DBMS_LOB.WRITEAPPEND(v_json, 1, ']');
      :p_rows_json := v_json;
    END;
  `;

  const binds = {
    p_patient_id: { dir: OracleDB.BIND_IN, val: patientId, type: OracleDB.NUMBER },
    p_episode_no: { dir: OracleDB.BIND_IN, val: episodeNo ? String(episodeNo) : null, type: OracleDB.STRING },
    p_filter:     { dir: OracleDB.BIND_IN, val: filter, type: OracleDB.STRING },
    p_status:     { dir: OracleDB.BIND_IN, val: status, type: OracleDB.STRING },
    p_rows_json:  { dir: OracleDB.BIND_OUT, type: OracleDB.CLOB },
  };

  const result = await connection.execute(plsql, binds, { autoCommit: false });
  const jsonStr = await lobToString(result.outBinds.p_rows_json);
  return JSON.parse(jsonStr || "[]");
}

// ============================================================
// 2. QUERY_PATIENT_CHECKLIST (Detailed questions & answers)
// ============================================================
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
  const plsql = `
    DECLARE
      v_query_tab         CHECK_LIST.CHECKLIST_QUERY_TAB;
      v_update_allowed    VARCHAR2(32767);
      v_complete_allowed  VARCHAR2(32767);
      v_json              CLOB;
      v_idx               PLS_INTEGER;
    BEGIN
      CHECK_LIST.QUERY_PATIENT_CHECKLIST(
        P_CHECKLIST_QUERY_TAB        => v_query_tab,
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

      DBMS_LOB.CREATETEMPORARY(v_json, TRUE);
      DBMS_LOB.WRITEAPPEND(v_json, 1, '[');

      v_idx := v_query_tab.FIRST;
      WHILE v_idx IS NOT NULL LOOP
        IF v_idx > v_query_tab.FIRST THEN
          DBMS_LOB.WRITEAPPEND(v_json, 1, ',');
        END IF;

        DECLARE
          v_item VARCHAR2(32767);
          v_clean_data VARCHAR2(32767);
        BEGIN
          v_clean_data := REPLACE(
                            REPLACE(
                              REPLACE(
                                REPLACE(NVL(v_query_tab(v_idx).FORMATTED_DATA, ''), '\\', '\\\\'),
                              '"', '\\"'),
                            CHR(10), '\\n'),
                          CHR(13), '');

          v_item := '{"RECORD_TYPE":"' || NVL(v_query_tab(v_idx).RECORD_TYPE, '') || '"'
                 || ',"REPLY_TYPE":"' || NVL(v_query_tab(v_idx).REPLY_TYPE, '') || '"'
                 || ',"RECORDED":"' || NVL(v_query_tab(v_idx).RECORDED, '') || '"'
                 || ',"CHECK_LIST_ANSWER_ID":' || NVL(TO_CHAR(v_query_tab(v_idx).CHECK_LIST_ANSWER_ID), 'null')
                 || ',"FORMATTED_DATA":"' || v_clean_data || '"}';

          DBMS_LOB.WRITEAPPEND(v_json, LENGTH(v_item), v_item);
        END;

        v_idx := v_query_tab.NEXT(v_idx);
      END LOOP;

      DBMS_LOB.WRITEAPPEND(v_json, 1, ']');
      :p_rows_json := v_json;
    END;
  `;

  const binds = {
    p_update_allowed:   { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },
    p_complete_allowed: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },
    p_rows_json:        { dir: OracleDB.BIND_OUT, type: OracleDB.CLOB },

    p_patient_id:                { dir: OracleDB.BIND_IN, val: patientId, type: OracleDB.NUMBER },
    p_episode_no:                { dir: OracleDB.BIND_IN, val: episodeNo, type: OracleDB.NUMBER },
    p_answer_session_id:         { dir: OracleDB.BIND_IN, val: answerSessionId, type: OracleDB.NUMBER },
    p_checklist_group_id:        { dir: OracleDB.BIND_IN, val: checklistGroupId, type: OracleDB.NUMBER },
    p_checklist_id:              { dir: OracleDB.BIND_IN, val: checklistId, type: OracleDB.NUMBER },
    p_chk_lst_answers_master_id: { dir: OracleDB.BIND_IN, val: answersMasterId, type: OracleDB.NUMBER },
    p_recorded_at:               { dir: OracleDB.BIND_IN, val: recordedAt, type: OracleDB.DATE },
    p_all_episodes:              { dir: OracleDB.BIND_IN, val: allEpisodes, type: OracleDB.STRING },
    p_order_by:                  { dir: OracleDB.BIND_IN, val: orderBy, type: OracleDB.STRING },
  };

  const result = await connection.execute(plsql, binds, { autoCommit: false });
  const out = result.outBinds;

  let jsonString = "";
  if (out.p_rows_json) {
    jsonString = typeof out.p_rows_json.getData === "function"
      ? await out.p_rows_json.getData()
      : out.p_rows_json;
  }

  const rows = JSON.parse(jsonString || "[]");

  return {
    updateAllowed: out.p_update_allowed ?? null,
    completeAllowed: out.p_complete_allowed ?? null,
    rows,
  };
}

// ============================================================
// Runner: Executes diagnostic and test against maternal cases
// ============================================================
(async () => {
  try {
    const candidateCases = [
      { patientId: 4136, episodeNo: 3 },
      { patientId: 5255, episodeNo: 1 },
      { patientId: 4244, episodeNo: 2 },
      { patientId: 3052, episodeNo: 3 },
      { patientId: 8587, episodeNo: 2 },
      { patientId: 3713, episodeNo: 1 },
    ];

    // 1. Check schema columns of EXTERNAL_CODES and CHECK_LIST_ANSWERS_MASTER
    console.log(`\n======================================================`);
    console.log(`1. Inspecting Table Columns`);
    console.log(`======================================================`);
    try {
      const extCols = await connection.execute(
        `SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'EXTERNAL_CODES'`,
        [],
        { outFormat: OracleDB.OUT_FORMAT_OBJECT }
      );
      console.log(`EXTERNAL_CODES columns:`, extCols.rows.map(r => r.COLUMN_NAME).join(", "));
    } catch (e) {
      console.warn("Could not inspect EXTERNAL_CODES columns:", e.message);
    }

    try {
      const chkCols = await connection.execute(
        `SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'CHECK_LIST_ANSWERS_MASTER'`,
        [],
        { outFormat: OracleDB.OUT_FORMAT_OBJECT }
      );
      console.log(`CHECK_LIST_ANSWERS_MASTER columns:`, chkCols.rows.map(r => r.COLUMN_NAME).join(", "));
    } catch (e) {
      console.warn("Could not inspect CHECK_LIST_ANSWERS_MASTER columns:", e.message);
    }

    // 2. Inspect PACKAGE BODY of CHECK_LIST for GET_PATIENT_CHECKLISTS definition
    console.log(`\n======================================================`);
    console.log(`2. Inspecting CHECK_LIST.GET_PATIENT_CHECKLISTS Source`);
    console.log(`======================================================`);
    try {
      const srcRes = await connection.execute(
        `SELECT LINE, TEXT FROM ALL_SOURCE 
         WHERE NAME = 'CHECK_LIST' AND TYPE = 'PACKAGE BODY' 
           AND LINE BETWEEN 
             (SELECT MIN(LINE) FROM ALL_SOURCE WHERE NAME = 'CHECK_LIST' AND TYPE = 'PACKAGE BODY' AND UPPER(TEXT) LIKE '%PROCEDURE GET_PATIENT_CHECKLISTS%')
             AND 
             (SELECT MIN(LINE) + 60 FROM ALL_SOURCE WHERE NAME = 'CHECK_LIST' AND TYPE = 'PACKAGE BODY' AND UPPER(TEXT) LIKE '%PROCEDURE GET_PATIENT_CHECKLISTS%')
         ORDER BY LINE`,
        [],
        { outFormat: OracleDB.OUT_FORMAT_OBJECT }
      );
      console.log(`Source lines found: ${srcRes.rows.length}`);
      srcRes.rows.forEach(r => process.stdout.write(r.TEXT));
    } catch (e) {
      console.warn("Could not read ALL_SOURCE for CHECK_LIST:", e.message);
    }

    // 3. Test QUERY_PATIENT_CHECKLIST directly with allEpisodes='A'
    console.log(`\n======================================================`);
    console.log(`3. Testing QUERY_PATIENT_CHECKLIST directly per patient`);
    console.log(`======================================================`);
    for (const c of candidateCases) {
      console.log(`\n--- Patient ${c.patientId} (Episode ${c.episodeNo}) ---`);
      
      // Try direct QUERY_PATIENT_CHECKLIST with null masterId
      try {
        const directDetails = await queryPatientChecklist({
          patientId: c.patientId,
          episodeNo: c.episodeNo,
          answersMasterId: null,
          allEpisodes: "A",
        });
        console.log(`Direct QUERY_PATIENT_CHECKLIST: rows=${directDetails.rows.length}`);
        if (directDetails.rows.length > 0) {
          console.log(`Sample rows:`);
          directDetails.rows.slice(0, 5).forEach((r, i) => {
            console.log(` [${i + 1}] [${r.RECORD_TYPE}] ${r.FORMATTED_DATA}`);
          });
        }
      } catch (err) {
        console.log(`Direct QUERY error: ${err.message}`);
      }

      // Try GET_PATIENT_CHECKLISTS with null filter & null status
      try {
        const listA = await getPatientChecklists({
          patientId: c.patientId,
          episodeNo: null,
          filter: null,
          status: null,
        });
        console.log(`GET_PATIENT_CHECKLISTS (null filter/status, null ep): count=${listA.length}`);
        listA.forEach(item => {
          console.log(` -> MasterID=${item.answersMasterId} | Title=${item.checklistDesc} | Group=${item.groupDesc} | Ep=${item.episodeNo}`);
        });
      } catch (err) {
        console.log(`GET_PATIENT_CHECKLISTS (null filter) error: ${err.message}`);
      }
    }

  } catch (err) {
    console.error("\n=== ERROR ===");
    console.error("code    :", err.code);
    console.error("message :", err.message);
    if (err.errorNum) console.error("oraNum  :", err.errorNum);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
    process.exit(0);
  }
})();
